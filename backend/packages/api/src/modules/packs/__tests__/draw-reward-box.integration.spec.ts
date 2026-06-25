/**
 * settleRewardDraw (B6) — integration:modules
 *
 * Daily-capped reward-box draw under the per-customer `credit:` advisory lock, in
 * ONE transaction (same discipline as settleOpen / claimReward). Two-hop tier
 * resolution (vip_member_state.highest_level_ever → vip_level.box_tier), resolve
 * the reward_box Pack for that tier, pre-check pool_enabled + non-empty odds,
 * COUNT today's draws under the lock, drawPrize, settle the payout (credit →
 * mutateCreditAtomic reason 'reward_credit' ext=0; product → createPulls
 * source='reward'; nothing → no payout), INSERT reward_draw at ordinal count+1.
 *
 * Asserted contracts:
 *  - An enabled credit pool (draws_per_day:2) at the matching tier: the first two
 *    draws return 'drawn' and raise the balance by amount_myr each; the third
 *    returns 'capped'; exactly 2 reward_draw rows exist for today.
 *  - pool_enabled=false → 'unavailable' with NO ordinal consumed (COUNT today===0).
 *  - A tier whose reward_box Pack is missing → 'unavailable' (no 500).
 *  - Concurrency at the cap edge: draws_per_day+1 concurrent calls resolve to
 *    exactly draws_per_day × 'drawn' + 1 × 'capped' (the loser is a clean 'capped',
 *    NOT a raw 23505), and COUNT(reward_draw today)===draws_per_day.
 *
 * Test-runner caveat: moduleIntegrationTestRunner rebuilds schema from MODELS, so
 * the hand-written partial-unique UQ_reward_draw_customer_day_ordinal is ABSENT
 * here. The cap is therefore proven via the ADVISORY-LOCK serialization path
 * (lock + COUNT), which is the runtime invariant — exactly what the concurrency
 * test exercises.
 */

import path from 'path';
import { moduleIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../index';
import type PacksModuleService from '../service';
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
import VipRewardGrant from '../models/vip-reward-grant';
import NotificationRead from '../models/notification-read';
import RewardDraw from '../models/reward-draw';

jest.setTimeout(300 * 1000);

const today = () => new Date().toISOString().slice(0, 10);

moduleIntegrationTestRunner<PacksModuleService>({
  moduleName: PACKS_MODULE,
  resolve: path.resolve(__dirname, '../../..', 'modules/packs'),
  moduleModels: [
    Pack,
    Card,
    PackOdds,
    Pull,
    CreditTransaction,
    DeliveryOrder,
    DeliveryOrderItem,
    VipLevel,
    RewardsSettings,
    ReferralRelationship,
    Commission,
    CustomerAccountState,
    AdminActionAudit,
    VipMemberState,
    VipRewardGrant,
    NotificationRead,
    RewardDraw,
  ],
  testSuite: ({ service }) => {
    // Seed one ladder rung at `level` mapping to box_tier, plus a reward_box Pack
    // (slug = `reward-box-<tier>`) carrying a single credit prize entry. Returns
    // the customer id wired to that level via vip_member_state.highest_level_ever.
    const seedTierPool = async (opts: {
      customerId: string;
      level: number;
      tier: string;
      poolEnabled: boolean;
      drawsPerDay: number;
      creditAmount: number;
    }) => {
      await service.createVipLevels([
        {
          level: opts.level,
          spend_threshold: 0,
          voucher_amount: 0,
          box_tier: opts.tier,
          frame_unlock: false,
          direct_referral_pct: 1,
        },
      ]);
      const slug = `reward-box-${opts.tier}-${opts.customerId}`;
      await service.createPacks([
        {
          slug,
          title: `Reward Box ${opts.tier}`,
          category: 'reward_box',
          price: 0,
          image: '',
          status: 'active',
          pool_enabled: opts.poolEnabled,
          draws_per_day: opts.drawsPerDay,
        },
      ]);
      await service.createPackOdds([
        {
          pack_id: slug,
          card_id: null,
          rarity: null,
          weight: 1,
          kind: 'credit',
          credit_amount: opts.creditAmount,
        },
      ]);
      await service.upsertVipMemberState({
        customerId: opts.customerId,
        lifetimeSen: 0,
        highestLevelEver: opts.level,
        currentLevel: opts.level,
      });
      return slug;
    };

    const drawsToday = (customerId: string) =>
      service.listRewardDraws(
        { customer_id: customerId, draw_day: today() },
        { take: 100 },
      );

    describe('settleRewardDraw', () => {
      it('draws up to the daily cap then caps, crediting amount_myr each draw', async () => {
        const customerId = 'cus_draw_cap';
        await seedTierPool({
          customerId,
          level: 7,
          tier: 'c',
          poolEnabled: true,
          drawsPerDay: 2,
          creditAmount: 5,
        });

        const first = await service.settleRewardDraw(customerId);
        expect(first.status).toBe('drawn');
        expect(first.draw_ordinal).toBe(1);
        expect(await service.creditBalance(customerId)).toBe(5);

        const second = await service.settleRewardDraw(customerId);
        expect(second.status).toBe('drawn');
        expect(second.draw_ordinal).toBe(2);
        expect(await service.creditBalance(customerId)).toBe(10);

        const third = await service.settleRewardDraw(customerId);
        expect(third.status).toBe('capped');
        expect(await service.creditBalance(customerId)).toBe(10);

        expect(await drawsToday(customerId)).toHaveLength(2);
      });

      it('returns unavailable with no ordinal consumed when the pool is disabled', async () => {
        const customerId = 'cus_draw_disabled';
        await seedTierPool({
          customerId,
          level: 8,
          tier: 'd',
          poolEnabled: false,
          drawsPerDay: 3,
          creditAmount: 5,
        });

        const res = await service.settleRewardDraw(customerId);
        expect(res.status).toBe('unavailable');
        expect(await drawsToday(customerId)).toHaveLength(0);
        expect(await service.creditBalance(customerId)).toBe(0);
      });

      it('returns unavailable (no 500) when the tier has no reward_box pack', async () => {
        const customerId = 'cus_draw_no_pack';
        // Ladder rung exists + state points at it, but NO reward_box Pack seeded.
        await service.createVipLevels([
          {
            level: 9,
            spend_threshold: 0,
            voucher_amount: 0,
            box_tier: 'z',
            frame_unlock: false,
            direct_referral_pct: 1,
          },
        ]);
        await service.upsertVipMemberState({
          customerId,
          lifetimeSen: 0,
          highestLevelEver: 9,
          currentLevel: 9,
        });

        const res = await service.settleRewardDraw(customerId);
        expect(res.status).toBe('unavailable');
        expect(await drawsToday(customerId)).toHaveLength(0);
      });

      it('serializes concurrent draws at the cap edge — exactly draws_per_day drawn + 1 capped', async () => {
        const customerId = 'cus_draw_concurrent';
        const drawsPerDay = 3;
        await seedTierPool({
          customerId,
          level: 11,
          tier: 'e',
          poolEnabled: true,
          drawsPerDay,
          creditAmount: 5,
        });

        const results = await Promise.all(
          Array.from({ length: drawsPerDay + 1 }, () =>
            service.settleRewardDraw(customerId),
          ),
        );
        const statuses = results.map((r) => r.status).sort();
        // Sorted: 'capped' < 'drawn' — so [capped, drawn, drawn, drawn].
        expect(statuses).toEqual([
          'capped',
          ...Array.from({ length: drawsPerDay }, () => 'drawn'),
        ]);
        // The loser is a clean 'capped', never a raw 23505 leaking out.
        expect(statuses.filter((s) => s === 'capped')).toHaveLength(1);
        expect(await drawsToday(customerId)).toHaveLength(drawsPerDay);
        expect(await service.creditBalance(customerId)).toBe(drawsPerDay * 5);
      });
    });
  },
});
