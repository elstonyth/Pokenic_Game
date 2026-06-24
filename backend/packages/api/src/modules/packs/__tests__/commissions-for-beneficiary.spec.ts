import path from 'path';
import { moduleIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../index';
import type PacksModuleService from '../service';
import { VIP_LEVELS } from '../../../scripts/vip-levels.data';
import Pack from '../models/pack';
import Card from '../models/card';
import PackOdds from '../models/pack-odds';
import Pull from '../models/pull';
import CreditTransaction from '../models/credit-transaction';
import DeliveryOrder from '../models/delivery-order';
import DeliveryOrderItem from '../models/delivery-order-item';
import VipLevel from '../models/vip-level';
import RewardsSettings from '../models/rewards-settings';
import ReferralRelationship from '../models/referral-relationship';
import Commission from '../models/commission';
import CustomerAccountState from '../models/customer-account-state';
import AdminActionAudit from '../models/admin-action-audit';
import VipMemberState from '../models/vip-member-state';

jest.setTimeout(300 * 1000);

moduleIntegrationTestRunner<PacksModuleService>({
  moduleName: PACKS_MODULE,
  resolve: path.resolve(__dirname, '../../..', 'modules/packs'),
  moduleModels: [
    Pack, Card, PackOdds, Pull, CreditTransaction, DeliveryOrder,
    DeliveryOrderItem, VipLevel, RewardsSettings, ReferralRelationship,
    Commission, CustomerAccountState, AdminActionAudit, VipMemberState,
  ],
  testSuite: ({ service }) => {
    async function seedLadder() {
      const existing = await service.listVipLevels({}, { take: 1 });
      if (existing.length === 0) {
        await service.createVipLevels(
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

    describe('commissionsForBeneficiary', () => {
      it('gen-1 direct: reversed open yields EXACTLY ONE row (amount<0 guard), status reversed', async () => {
        await seedLadder();                       // REQUIRED — else settleOpen throws "ladder is empty"
        await service.linkSponsor({ recruitId: 'cb_R', sponsorId: 'cb_S' });
        await service.mutateCreditAtomic({ customerId: 'cb_R', amount: 30, reason: 'topup' });
        await service.settleOpen({ customerId: 'cb_R', amount: -20, sourceTransactionId: 'cb_open_1' });

        const before = await service.commissionsForBeneficiary('cb_S', { limit: 50, offset: 0 });
        expect(before).toHaveLength(1);            // one direct commission, ONE row
        expect(before[0].kind).toBe('direct');
        expect(before[0].generation).toBe(1);
        expect(before[0].opener_customer_id).toBe('cb_R');  // gen-1 opener = direct recruit
        expect(Number(before[0].amount)).toBeGreaterThan(0);

        // reverse the open → the compensating POSITIVE pack_open shares source_transaction_id
        await service.reverseOpen('cb_open_1');
        const after = await service.commissionsForBeneficiary('cb_S', { limit: 50, offset: 0 });
        expect(after).toHaveLength(1);             // STILL one row — amount<0 guard prevents the 2-row fan-out
        expect(after[0].status).toBe('reversed');
        expect(after[0].reversal_transaction_id).not.toBeNull();
        expect(Number(after[0].amount)).toBeGreaterThan(0); // gross stays positive, marked reversed
      });

      it('gen-2 override: opener resolves to the DEEP downline opener, not the beneficiary\'s direct recruit', async () => {
        await seedLadder();
        // G (grand-sponsor) ← S (sponsor) ← R (recruit). When R opens, G earns an OVERRIDE (gen 2).
        await service.linkSponsor({ recruitId: 'ov_S', sponsorId: 'ov_G' });
        await service.linkSponsor({ recruitId: 'ov_R', sponsorId: 'ov_S' });
        await service.mutateCreditAtomic({ customerId: 'ov_R', amount: 30, reason: 'topup' });
        await service.settleOpen({ customerId: 'ov_R', amount: -20, sourceTransactionId: 'ov_open_1' });

        const rows = await service.commissionsForBeneficiary('ov_G', { limit: 50, offset: 0 });
        expect(rows.filter((r) => r.kind === 'override')).toHaveLength(1);
        const override = rows.find((r) => r.kind === 'override');
        expect(override).toBeDefined();
        expect(override!.generation).toBe(2);
        // the opener is R (who opened the pack), NOT G's direct recruit (ov_S) — guards spec §4 "opener ≠ recruit"
        expect(override!.opener_customer_id).toBe('ov_R');
      });
    });
  },
});
