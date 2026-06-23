import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { VIP_LEVELS } from '../../src/scripts/vip-levels.data';

jest.setTimeout(180 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  env: { COMMISSION_COOLDOWN_DAYS: '0' }, // immediate maturity, same as direct-commission.spec
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

    describe('reverseCommission', () => {
      it(
        'claws only commissions for the open, leaves the recruit charge, freezes a spent beneficiary, idempotent',
        async () => {
          const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
          await seedLadder(packs);

          // Arrange: recruit with sponsor; an external-funded open pays the sponsor a
          // matured commission (cooldown=0 via COMMISSION_COOLDOWN_DAYS=0 in env).
          const recruit = 'cust_rc_recruit';
          const sponsor = 'cust_rc_sponsor';
          await packs.mutateCreditAtomic({
            customerId: recruit,
            amount: 100,
            reason: 'topup',
          });
          await packs.linkSponsor({ recruitId: recruit, sponsorId: sponsor });
          const open = 'open_rc_1';
          const settled = await packs.settleOpen({
            customerId: recruit,
            amount: -50,
            sourceTransactionId: open,
          });
          expect(settled.commissions.length).toBeGreaterThan(0);

          // Sponsor spends the matured commission down so a reversal goes negative.
          const paid = await packs.availableBalance(sponsor);
          await packs.mutateCreditAtomic({
            customerId: sponsor,
            amount: -paid,
            reason: 'cashout',
          });

          const [comm] = await packs.listCommissions(
            { source_transaction_id: open, beneficiary: sponsor },
            { take: 1 },
          );
          expect(comm).toBeDefined();
          if (!comm) throw new Error('Expected a commission for the seeded open.');

          // Act
          const r1 = await packs.reverseCommission({
            commissionId: comm.id,
            adminId: 'admin_x',
            reason: 'fraud',
          });

          // Assert: commission reversed, recruit's pack_open charge untouched,
          // sponsor frozen (auto), audit written.
          expect(r1.reversed).toBeGreaterThan(0);
          expect(r1.froze).toContain(sponsor);

          const [reloaded] = await packs.listCommissions(
            { id: comm.id },
            { take: 1 },
          );
          expect(reloaded.status).toBe('reversed');

          // Recruit's balance: 100 topup − 50 open = 50, NOT refunded.
          const recruitLedger = await packs.creditSummary(recruit);
          expect(recruitLedger.balance).toBeCloseTo(50);

          // Sponsor must be frozen (auto-freeze due to negative balance after clawback).
          const [frozenState] = await packs.listCustomerAccountStates(
            { customer_id: sponsor, frozen: true },
            { take: 1 },
          );
          expect(!!frozenState).toBe(true);

          // Audit row must exist.
          const [audit] = await packs.listAdminActionAudits(
            { entity_id: comm.id, action: 'reverse_commission' },
            { take: 1 },
          );
          expect(audit?.admin_id).toBe('admin_x');

          // Idempotent: a second reverse adds nothing.
          const r2 = await packs.reverseCommission({
            commissionId: comm.id,
            adminId: 'admin_x',
            reason: 'fraud',
          });
          expect(r2.reversed).toBe(0);
        },
      );
    });
  },
});
