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
    describe('referralTreeFor', () => {
      it('returns DESCENDANTS not ancestors, depth-capped, root separate', async () => {
        // X sponsors A (UP from A); A sponsors B; B sponsors C; C sponsors D (DOWN)
        await service.linkSponsor({ recruitId: 'rt_A', sponsorId: 'rt_X' });
        await service.linkSponsor({ recruitId: 'rt_B', sponsorId: 'rt_A' });
        await service.linkSponsor({ recruitId: 'rt_C', sponsorId: 'rt_B' });
        await service.linkSponsor({ recruitId: 'rt_D', sponsorId: 'rt_C' });

        const tree = await service.referralTreeFor('rt_A', 6);
        const ids = tree.nodes.map((n) => n.customer_id).sort();

        // descendants only — X (the ancestor) must NOT appear
        expect(ids).toEqual(['rt_B', 'rt_C', 'rt_D']);
        expect(tree.nodes.find((n) => n.customer_id === 'rt_X')).toBeUndefined();
        // root is separate and not in nodes
        expect(tree.root.customer_id).toBe('rt_A');
        expect(tree.root.depth).toBe(0);
        // depths
        expect(tree.nodes.find((n) => n.customer_id === 'rt_B')!.depth).toBe(1);
        expect(tree.nodes.find((n) => n.customer_id === 'rt_D')!.depth).toBe(3);
        // direct_recruit_count: A has 1 direct (B); B has 1 (C)
        expect(tree.root.direct_recruit_count).toBe(1);
        expect(tree.nodes.find((n) => n.customer_id === 'rt_B')!.direct_recruit_count).toBe(1);
        expect(tree.truncated).toBe(false);
      });

      it('depth cap returns exactly maxDepth generations and flags has_more_depth at the boundary', async () => {
        await service.linkSponsor({ recruitId: 'dc_B', sponsorId: 'dc_A' });
        await service.linkSponsor({ recruitId: 'dc_C', sponsorId: 'dc_B' });
        await service.linkSponsor({ recruitId: 'dc_D', sponsorId: 'dc_C' });

        const tree = await service.referralTreeFor('dc_A', 2);
        const ids = tree.nodes.map((n) => n.customer_id).sort();
        expect(ids).toEqual(['dc_B', 'dc_C']); // gens 1..2 only, dc_D excluded
        // dc_C is at depth 2 (= maxDepth) and HAS a child (dc_D) → has_more_depth
        expect(tree.nodes.find((n) => n.customer_id === 'dc_C')!.has_more_depth).toBe(true);
        expect(tree.nodes.find((n) => n.customer_id === 'dc_C')!.direct_recruit_count).toBe(1);
      });

      it('soft-deleted edge prunes its subtree', async () => {
        await service.linkSponsor({ recruitId: 'sd_B', sponsorId: 'sd_A' });
        const [bRel] = await service.listReferralRelationships({ customer_id: 'sd_B' }, { take: 1 });
        await service.linkSponsor({ recruitId: 'sd_C', sponsorId: 'sd_B' });
        // soft-delete the A→B edge; B and its subtree (C) must disappear from A's tree.
        // deleteReferralRelationships is the MedusaService-generated SOFT delete (sets deleted_at).
        await service.deleteReferralRelationships([bRel.id]);
        // confirm default list reads exclude the soft-deleted row → the CTE's `deleted_at IS NULL` prunes it
        expect(await service.listReferralRelationships({ customer_id: 'sd_B' }, { take: 1 })).toHaveLength(0);

        const tree = await service.referralTreeFor('sd_A', 6);
        expect(tree.nodes).toHaveLength(0);
      });

      it('empty tree: customer with no recruits', async () => {
        const tree = await service.referralTreeFor('rt_lonely', 6);
        expect(tree.nodes).toHaveLength(0);
        expect(tree.root.customer_id).toBe('rt_lonely');
        expect(tree.root.direct_recruit_count).toBe(0);
      });
    });
  },
});
