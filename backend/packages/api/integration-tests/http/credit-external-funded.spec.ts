import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";

jest.setTimeout(240 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ getContainer }) => {
    describe("credit_transaction.external_funded_cents column", () => {
      it("persists and reads back the signed external-funded sen", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const [row] = await packs.createCreditTransactions([
          {
            customer_id: "cus_extfund_test",
            amount: 100,
            reason: "topup" as const,
            pull_id: null,
            reference: "mock_ext",
            external_funded_cents: 10000,
          } as Record<string, unknown>,
        ]);
        const [fetched] = await packs.listCreditTransactions(
          { id: row.id },
          { take: 1 },
        );
        expect(
          Number(
            (fetched as { external_funded_cents?: number | null })
              .external_funded_cents,
          ),
        ).toBe(10000);
      });

      it("defaults to null (treated as 0) when not supplied", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const [row] = await packs.createCreditTransactions([
          {
            customer_id: "cus_extfund_null",
            amount: 5,
            reason: "buyback" as const,
            pull_id: "pull_extfund_null",
            reference: null,
          },
        ]);
        const [fetched] = await packs.listCreditTransactions(
          { id: row.id },
          { take: 1 },
        );
        const ext = (fetched as { external_funded_cents?: number | null })
          .external_funded_cents;
        expect(ext == null ? 0 : Number(ext)).toBe(0);
      });
    });
  },
});
