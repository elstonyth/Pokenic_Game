import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { VIP_LEVELS } from '../../src/scripts/vip-levels.data';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'admin-commission-routes-test-pw-1';
const ADMIN_EMAIL = 'admin-commission-routes@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  env: { COMMISSION_COOLDOWN_DAYS: '0' }, // immediate maturity so settle + reverse works
  testSuite: ({ api, getContainer }) => {
    describe('admin commission routes: reverse / suspend / unsuspend', () => {
      let adminToken: string;

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);
      });

      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      // --------------------------------------------------------- seed helpers

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

      /**
       * Creates a commission row by running the full recruit→sponsor→settleOpen
       * path (COMMISSION_COOLDOWN_DAYS=0 so it matures immediately).
       * Returns the commission id.
       */
      async function seedCommission(
        packs: PacksModuleService,
        suffix: string,
      ): Promise<string> {
        await seedLadder(packs);
        const sponsor = `cus_cr_sponsor_${suffix}`;
        const recruit = `cus_cr_recruit_${suffix}`;
        const openId = `open_cr_${suffix}`;

        await packs.linkSponsor({ recruitId: recruit, sponsorId: sponsor });
        await packs.mutateCreditAtomic({
          customerId: recruit,
          amount: 200,
          reason: 'topup',
          reference: `topup_cr_${suffix}`,
        });
        await packs.settleOpen({
          customerId: recruit,
          amount: -100,
          sourceTransactionId: openId,
        });

        const [comm] = await packs.listCommissions(
          { source_transaction_id: openId },
          { take: 1 },
        );
        if (!comm) throw new Error('seedCommission: no commission row after settleOpen');
        return comm.id;
      }

      // --------------------------------------------------------- 401 unauth

      it('POST /admin/commissions/:id/suspend → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post('/admin/commissions/comm_fake/suspend', { reason: 'test' }),
        );
        expect(res.status).toBe(401);
      });

      it('POST /admin/commissions/:id/unsuspend → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post('/admin/commissions/comm_fake/unsuspend', { reason: 'test' }),
        );
        expect(res.status).toBe(401);
      });

      it('POST /admin/commissions/:id/reverse → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post('/admin/commissions/comm_fake/reverse', { reason: 'test' }),
        );
        expect(res.status).toBe(401);
      });

      // --------------------------------------------------------- 400 validation

      it('POST /admin/commissions/:id/suspend → 400 when reason is missing', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/commissions/comm_fake/suspend',
            {},
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST /admin/commissions/:id/suspend → 400 when reason is blank', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/commissions/comm_fake/suspend',
            { reason: '   ' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST /admin/commissions/:id/suspend → 400 when reason exceeds 500 chars', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/commissions/comm_fake/suspend',
            { reason: 'x'.repeat(501) },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST /admin/commissions/:id/reverse → 400 when reason is missing', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/commissions/comm_fake/reverse',
            {},
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      // --------------------------------------------------------- suspend + audit

      it('POST /admin/commissions/:id/suspend → 200 + commission suspended; admin_id from session NOT body', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const commId = await seedCommission(packs, 'susp1');

        const res = await unwrapResponse(
          api.post(
            `/admin/commissions/${commId}/suspend`,
            { reason: 'fraud review', admin_id: 'HACKER' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data.status).toBe('suspended');

        const [aud] = await packs.listAdminActionAudits(
          { entity_id: commId, action: 'suspend_commission' },
          { take: 1 },
        );
        expect(aud).toBeTruthy();
        expect(aud.admin_id).not.toBe('HACKER'); // session-derived, not forged
        expect(aud.admin_id).toBeTruthy();
        expect(aud.reason).toBe('fraud review');
      });

      // --------------------------------------------------------- unsuspend

      it('POST /admin/commissions/:id/unsuspend → 200 + commission status restored', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const commId = await seedCommission(packs, 'unsusp1');

        // Suspend first via service so unsuspend has something to undo.
        await packs.suspendCommission({ commissionId: commId, adminId: 'admin_setup', reason: 'setup' });

        const res = await unwrapResponse(
          api.post(
            `/admin/commissions/${commId}/unsuspend`,
            { reason: 'cleared for payout' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        // cooldown=0 → matured immediately → unsuspend brings it back to available
        expect(['pending', 'available']).toContain(res.data.status);

        const [aud] = await packs.listAdminActionAudits(
          { entity_id: commId, action: 'unsuspend_commission' },
          { take: 1 },
        );
        expect(aud).toBeTruthy();
        expect(aud.admin_id).toBeTruthy();
      });

      // --------------------------------------------------------- reverse

      it('POST /admin/commissions/:id/reverse → 200 + reversed > 0', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const commId = await seedCommission(packs, 'rev1');

        const res = await unwrapResponse(
          api.post(
            `/admin/commissions/${commId}/reverse`,
            { reason: 'clawback test' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(typeof res.data.reversed).toBe('number');
        expect(res.data.reversed).toBeGreaterThan(0);

        const [aud] = await packs.listAdminActionAudits(
          { entity_id: commId, action: 'reverse_commission' },
          { take: 1 },
        );
        expect(aud).toBeTruthy();
        expect(aud.admin_id).toBeTruthy();
        expect(aud.reason).toBe('clawback test');
      });
    });
  },
});
