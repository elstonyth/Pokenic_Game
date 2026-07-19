import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { BOX_TIERS, mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'daily-boxes-meta-test-pw-1';
const ADMIN_EMAIL = 'daily-boxes-meta-admin@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('GET /admin/daily-rewards/boxes — customer_count tier buckets', () => {
      let adminToken: string;
      const packs = () =>
        getContainer().resolve<PacksModuleService>(PACKS_MODULE);
      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      beforeEach(async () => {
        adminToken = await mintSuperAdmin(
          getContainer(),
          api,
          ADMIN_EMAIL,
          PASSWORD,
        );
        const svc = packs();
        // A 3-rung ladder (as if the admin shrank it): levels 1-2 → tier 'a',
        // top rung 3 → tier 'b'. Distinct top tier so the clamp is observable.
        if ((await svc.listVipLevels({}, { take: 1 })).length === 0) {
          await svc.createVipLevels([
            {
              level: 1,
              spend_threshold: 0,
              voucher_amount: 0,
              box_tier: 'a',
              frame_unlock: false,
              direct_referral_pct: 1,
            },
            {
              level: 2,
              spend_threshold: 100,
              voucher_amount: 5,
              box_tier: 'a',
              frame_unlock: false,
              direct_referral_pct: 1,
            },
            {
              level: 3,
              spend_threshold: 200,
              voucher_amount: 9,
              box_tier: 'b',
              frame_unlock: false,
              direct_referral_pct: 2,
            },
          ]);
        }
        const boxes = await svc.listRewardBoxes({}, { take: 100 });
        const have = new Set(boxes.map((b) => b.tier));
        const missing = BOX_TIERS.filter((t) => !have.has(t));
        if (missing.length > 0) {
          await svc.createRewardBoxes(
            missing.map((tier) => ({
              tier,
              name: '',
              enabled: false,
              draws_per_day: 1,
            })),
          );
        }
      });

      it('401s without an admin token', async () => {
        expect(
          (await unwrapResponse(api.get('/admin/daily-rewards/boxes'))).status,
        ).toBe(401);
      });

      it('counts an above-ladder peak in the top rung tier only; in-range peaks in their exact tier', async () => {
        await packs().createVipMemberStates([
          // Monotonic peak (50) above the 3-rung ladder — the tier-count join
          // clamps it to the ladder max (3) → tier 'b', mirroring resolveBoxTier.
          {
            customer_id: 'cus_meta_overpeak',
            lifetime_external_spend_sen: 0,
            highest_level_ever: 50,
            current_level: 3,
          },
          // In-range peak stays in its exact rung's tier ('a').
          {
            customer_id: 'cus_meta_inrange',
            lifetime_external_spend_sen: 0,
            highest_level_ever: 2,
            current_level: 2,
          },
        ]);

        const res = await unwrapResponse(
          api.get('/admin/daily-rewards/boxes', { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data.boxes).toHaveLength(BOX_TIERS.length);

        const byTier = new Map<
          string,
          {
            customer_count: number;
            level_from: number | null;
            level_to: number | null;
          }
        >(res.data.boxes.map((b: { tier: string }) => [b.tier, b]));
        expect(byTier.get('b')).toMatchObject({
          customer_count: 1,
          level_from: 3,
          level_to: 3,
        });
        expect(byTier.get('a')).toMatchObject({
          customer_count: 1,
          level_from: 1,
          level_to: 2,
        });
        // No member leaks into another bucket and none is double-counted: the
        // two seeded members are the ONLY counts across all 11 tiers, so with
        // a=1 and b=1 the remaining nine tiers are necessarily 0.
        const totalCounted = res.data.boxes.reduce(
          (sum: number, b: { customer_count: number }) =>
            sum + b.customer_count,
          0,
        );
        expect(totalCounted).toBe(2);
      });
    });
  },
});
