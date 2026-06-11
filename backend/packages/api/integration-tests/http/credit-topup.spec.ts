import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { Modules } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";
import { unwrapResponse } from "./utils";

jest.setTimeout(240 * 1000);

const PASSWORD = "topup-test-password-1";

// Task A1 — mock top-up: a logged-in customer buys site credit through the
// fake gateway. The ledger (CreditTransaction) is the source of truth: an
// approved charge appends exactly one positive "topup" row; a declined or
// invalid request appends NOTHING.

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("credit top-up", () => {
      let storeHeaders: Record<string, string>;

      // The runner resets the database between `it` blocks, so the publishable
      // key and any customers are recreated per test.
      beforeEach(async () => {
        const container = getContainer();
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: "credit-topup-test",
          type: "publishable",
          created_by: "credit-topup-test",
        });
        storeHeaders = { "x-publishable-api-key": key.token };
      });

      const authed = (token: string): Record<string, string> => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });

      const registerCustomer = async (email: string): Promise<string> => {
        const reg = await api.post("/auth/customer/emailpass/register", {
          email,
          password: PASSWORD,
        });
        await api.post(
          "/store/customers",
          { email },
          {
            headers: {
              ...storeHeaders,
              authorization: `Bearer ${reg.data.token}`,
            },
          }
        );
        const login = await api.post("/auth/customer/emailpass", {
          email,
          password: PASSWORD,
        });
        return login.data.token;
      };

      const topUp = (amount: unknown, headers: Record<string, string>) =>
        unwrapResponse(
          api.post("/store/credits/topup", { amount }, { headers })
        );

      const ledgerRows = async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        return packs.listCreditTransactions({}, { take: 100 });
      };

      it("rejects an unauthenticated top-up with 401", async () => {
        expect((await topUp(25, storeHeaders)).status).toBe(401);
        expect(await ledgerRows()).toHaveLength(0);
      });

      it("credits the balance, records a topup ledger row, and sums across top-ups", async () => {
        const token = await registerCustomer("topup-customer-a@test.dev");

        // 1. First top-up: response carries the credited amount, a gateway
        //    reference, and the new balance.
        const first = await topUp(25, authed(token));
        expect(first.status).toBe(200);
        expect(first.data).toMatchObject({ amount: 25, balance: 25 });
        expect(first.data.reference).toMatch(/^mock_/);

        // 2. The ledger row is gateway-backed: reason topup, no pull.
        const [row] = await ledgerRows();
        expect(row).toMatchObject({
          reason: "topup",
          pull_id: null,
          reference: first.data.reference,
        });
        expect(Number(row.amount)).toBe(25);

        // 3. GET /store/credits reflects the same balance + transaction.
        const credits = await unwrapResponse(
          api.get("/store/credits", { headers: authed(token) })
        );
        expect(credits.status).toBe(200);
        expect(credits.data.balance).toBe(25);
        expect(credits.data.transactions).toHaveLength(1);
        expect(credits.data.transactions[0]).toMatchObject({
          amount: 25,
          reason: "topup",
        });

        // 4. A second top-up with cents sums exactly (integer-cents ledger).
        const second = await topUp(10.5, authed(token));
        expect(second.status).toBe(200);
        expect(second.data.balance).toBe(35.5);
      });

      it("declines amounts ending in .13 with a friendly 400 and writes nothing", async () => {
        const token = await registerCustomer("topup-customer-b@test.dev");

        const declined = await topUp(10.13, authed(token));
        expect(declined.status).toBe(400);
        expect(declined.data.message).toMatch(/declined/i);

        // No ledger row, balance untouched.
        expect(await ledgerRows()).toHaveLength(0);
        const credits = await unwrapResponse(
          api.get("/store/credits", { headers: authed(token) })
        );
        expect(credits.data.balance).toBe(0);
      });

      it("rejects invalid amounts with 400 and writes nothing", async () => {
        const token = await registerCustomer("topup-customer-c@test.dev");

        for (const amount of [0, -5, 10_000.01, 1.234, "50", null, undefined]) {
          const res = await topUp(amount, authed(token));
          expect(res.status).toBe(400);
        }
        expect(await ledgerRows()).toHaveLength(0);
      });
    });
  },
});
