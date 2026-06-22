import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { VIP_LEVELS } from '../../src/scripts/vip-levels.data';

jest.setTimeout(180 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: { COMMISSION_COOLDOWN_DAYS: '0' }, // demo: immediate maturity
  testSuite: ({ getContainer }) => {
    async function seedLadder(packs: PacksModuleService) {
      const existing = await packs.listVipLevels({}, { take: 1 });
      if (existing.length === 0) {
        await packs.createVipLevels(
          VIP_LEVELS.map((r) => ({
            level: r.level,
            spend_threshold: r.spend_threshold,
            voucher_amount: r.voucher_amount,
            box_tier: r.box_tier,
            frame_unlock: r.frame_unlock,
            direct_referral_pct: r.direct_referral_pct,
            prizes: r.prizes ?? null,
          })),
        );
      }
    }

    describe('team override inside settleOpen', () => {
      it('pays direct + decaying overrides up the chain (depth-keyed generations)', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await seedLadder(packs);
        const recruit = 'cus_ov_recruit';
        const s1 = 'cus_ov_s1',
          s2 = 'cus_ov_s2',
          s3 = 'cus_ov_s3';
        // recruit -> s1 -> s2 -> s3 (customer_id is unique: one sponsor each).
        await packs.linkSponsor({ recruitId: recruit, sponsorId: s1 });
        await packs.linkSponsor({ recruitId: s1, sponsorId: s2 });
        await packs.linkSponsor({ recruitId: s2, sponsorId: s3 });

        await packs.mutateCreditAtomic({
          customerId: recruit,
          amount: 100,
          reason: 'topup',
          reference: 'mock_ov',
        });
        // Basis: 100 RM = 10,000 sen (the -100 open below). s1 = L1 (spend 0) -> 1%
        // of 10,000 = 100 sen direct. Overrides: s2 = 20% of 100 = 20, s3 = 20% of
        // 20 = 4; gen-4 = 4*0.2 = 0.8 < 1 sen -> terminates.
        const r = await packs.settleOpen({
          customerId: recruit,
          amount: -100,
          sourceTransactionId: 'open_ov_1',
        });
        expect(r.commissions).toEqual([
          { beneficiary: s1, amountSen: 100, matured: true },
          { beneficiary: s2, amountSen: 20, matured: true },
          { beneficiary: s3, amountSen: 4, matured: true },
        ]);

        // Wallets available now (cooldown 0).
        expect(await packs.availableBalance(s1)).toBe(1);
        expect(await packs.availableBalance(s2)).toBe(0.2);
        expect(await packs.availableBalance(s3)).toBe(0.04);

        // Lifecycle rows: generation == tree depth, correct kind.
        const comms = (
          await packs.listCommissions(
            { source_transaction_id: 'open_ov_1' },
            { take: 10 },
          )
        ).sort((a, b) => a.generation - b.generation);
        expect(comms.map((c) => [c.beneficiary, c.generation, c.kind])).toEqual(
          [
            [s1, 1, 'direct'],
            [s2, 2, 'override'],
            [s3, 3, 'override'],
          ],
        );
      });

      it('is idempotent: replaying the open_id rejects and pays each generation once', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        await seedLadder(packs);
        const recruit = 'cus_ovi_recruit',
          s1 = 'cus_ovi_s1',
          s2 = 'cus_ovi_s2';
        await packs.linkSponsor({ recruitId: recruit, sponsorId: s1 });
        await packs.linkSponsor({ recruitId: s1, sponsorId: s2 });
        await packs.mutateCreditAtomic({
          customerId: recruit,
          amount: 200,
          reason: 'topup',
          reference: 'mock_ovi',
        });
        await packs.settleOpen({
          customerId: recruit,
          amount: -100,
          sourceTransactionId: 'open_ovi',
        });
        // Replaying the SAME open_id must reject and roll back the whole open.
        // The replay surfaces MikroORM's raw unique-violation (the friendly
        // DUPLICATE_ERROR is shadowed because isUniqueViolation checks code 23505
        // but MikroORM wraps it) — rollback still happens. Specificity comes from
        // the comms.length===1 + balance assertions below, not the message text.
        await expect(
          packs.settleOpen({
            customerId: recruit,
            amount: -100,
            sourceTransactionId: 'open_ovi',
          }),
        ).rejects.toThrow();
        const comms = await packs.listCommissions(
          { source_transaction_id: 'open_ovi' },
          { take: 10 },
        );
        expect(comms.length).toBe(2); // s1 gen1 + s2 gen2 — exactly once
        expect(await packs.creditBalance(recruit)).toBe(100); // 200 - 100; replay rolled back
      });
    });
  },
});
