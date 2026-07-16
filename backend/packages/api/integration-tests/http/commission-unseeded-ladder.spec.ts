import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";

jest.setTimeout(180 * 1000);

// Regression: an unseeded vip_level ladder must NOT abort a recruit's paid open.
//
// Before hardening, settleOpen's commission fan-out called
// levelForSpend(sponsorLifetimeMyr, levelLadder) with an EMPTY ladder, which
// throws "levelForSpend: ladder is empty" INSIDE the atomic charge txn — so any
// recruit who has a sponsor could not open a pack at all if vip_level was never
// seeded (migrations-without-seed; the same root cause that strands VIP at L1).
//
// Desired (hardened) behaviour, asserted here: the open completes (debit
// applied), the commission fan-out is skipped, and no commission rows are
// written. The deliberate "throw on a MISSING SPECIFIC level row" invariant for
// a partially-seeded ladder is unchanged — this only covers the empty-ladder
// (system-unconfigured) case.
medusaIntegrationTestRunner({
  inApp: true,
  env: { COMMISSION_COOLDOWN_DAYS: "0" },
  testSuite: ({ getContainer }) => {
    describe("settleOpen with an unseeded vip_level ladder", () => {
      it("charges the recruit and skips commission instead of throwing", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);

        // Deliberately DO NOT seed the ladder. Guard against cross-test leakage
        // (suites share the DB) by clearing any rows a prior suite left behind.
        const existing = await packs.listVipLevels({}, { take: 1000 });
        if (existing.length > 0) {
          await packs.deleteVipLevels(existing.map((r) => r.id));
        }

        const sponsor = "cus_noladder_sponsor";
        const recruit = "cus_noladder_recruit";
        await packs.linkSponsor({ recruitId: recruit, sponsorId: sponsor });
        await packs.mutateCreditAtomic({
          customerId: recruit,
          amount: 100,
          reason: "topup",
          reference: "mock_noladder",
        });

        // The paid open must survive a missing ladder (no throw), pay no
        // commission, and still debit the recruit.
        const r = await packs.settleOpen({
          customerId: recruit,
          amount: -100,
          sourceTransactionId: "open_noladder_1",
        });
        expect(r.commissions).toEqual([]);

        expect(await packs.creditBalance(recruit)).toBe(0); // RM100 spent
        expect(await packs.creditBalance(sponsor)).toBe(0); // no commission
        const comms = await packs.listCommissions(
          { source_transaction_id: "open_noladder_1" },
          { take: 10 },
        );
        expect(comms).toHaveLength(0);
      });
    });
  },
});
