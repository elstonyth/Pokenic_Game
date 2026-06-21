import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";

jest.setTimeout(120 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ getContainer }) => {
    describe("linkSponsor insert guards", () => {
      it("links a recruit to a sponsor once, immutably", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await packs.linkSponsor({ recruitId: "cus_b", sponsorId: "cus_a" });
        const [rel] = await packs.listReferralRelationships(
          { customer_id: "cus_b" }, { take: 1 },
        );
        expect(rel.sponsor_id).toBe("cus_a");
        // Immutable: re-linking the same recruit throws.
        await expect(
          packs.linkSponsor({ recruitId: "cus_b", sponsorId: "cus_x" }),
        ).rejects.toThrow();
      });

      it("rejects self-referral", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await expect(
          packs.linkSponsor({ recruitId: "cus_self", sponsorId: "cus_self" }),
        ).rejects.toThrow();
      });

      it("rejects a cycle (sponsor is already a downline of the recruit)", async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        // a -> b -> c, then trying c as sponsor of a would close a loop.
        await packs.linkSponsor({ recruitId: "cyc_b", sponsorId: "cyc_a" });
        await packs.linkSponsor({ recruitId: "cyc_c", sponsorId: "cyc_b" });
        await expect(
          packs.linkSponsor({ recruitId: "cyc_a", sponsorId: "cyc_c" }),
        ).rejects.toThrow();
      });
    });
  },
});
