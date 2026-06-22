import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";

jest.setTimeout(120 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ getContainer }) => {
    describe("settleOpen — locked debit, behavior-preserving", () => {
      it("debits exactly like mutateCreditAtomic and stamps the open id", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const cust = "cus_settle";
        await packs.mutateCreditAtomic({
          customerId: cust, amount: 100, reason: "topup", reference: "mock_se",
        });
        const r = await packs.settleOpen({
          customerId: cust, amount: -40, sourceTransactionId: "open_settle_1",
        });
        expect(r.balance).toBe(60);
        expect(r.commissions).toEqual([]);
        const summary = await packs.creditSummary(cust);
        expect(summary.balance).toBe(60);
        expect(summary.externalFundedSpendTotal).toBe(40); // external consumed
        const [row] = await packs.listCreditTransactions(
          { customer_id: cust, reason: "pack_open" }, { take: 1, order: { created_at: "DESC" } },
        );
        expect((row as { source_transaction_id?: string | null }).source_transaction_id)
          .toBe("open_settle_1");
      });

      it("rejects a non-negative settle amount (a settle is always a debit)", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await expect(
          packs.settleOpen({ customerId: "cus_bad", amount: 5, sourceTransactionId: "x" }),
        ).rejects.toThrow(/less than 0/);
      });

      it("enforces the floor (no overdraft)", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await expect(
          packs.settleOpen({ customerId: "cus_broke", amount: -10, sourceTransactionId: "y" }),
        ).rejects.toThrow(/Not enough credits/);
      });
    });
  },
});
