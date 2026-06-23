import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'admin-rewards-settings-test-pw-1';
const ADMIN_EMAIL = 'admin-rewards-settings@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  env: { COMMISSION_COOLDOWN_DAYS: '3' }, // leave env at default so DB row drives tests
  testSuite: ({ api, getContainer }) => {
    describe('GET + POST /admin/rewards-settings', () => {
      let adminToken: string;

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);
      });

      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      // ------------------------------------------------------------------ auth guard

      it('GET /admin/rewards-settings → 401 without auth', async () => {
        const res = await unwrapResponse(api.get('/admin/rewards-settings'));
        expect(res.status).toBe(401);
      });

      it('POST /admin/rewards-settings → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post('/admin/rewards-settings', {
            teamOverridePct: 0.25,
            reason: 'tune',
          }),
        );
        expect(res.status).toBe(401);
      });

      // ------------------------------------------------------------------ GET

      it('GET /admin/rewards-settings → 200 with defaults when no DB row', async () => {
        const res = await unwrapResponse(
          api.get('/admin/rewards-settings', { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({
          teamOverridePct: expect.any(Number),
          overrideGenerationCap: expect.any(Number),
        });
      });

      // ------------------------------------------------------------------ POST validation

      it('POST → 400 when teamOverridePct is exactly 1 (explode guard)', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 1, reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when teamOverridePct is 0', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0, reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when teamOverridePct is fractional (0.205)', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0.205, reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when reason is missing', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0.25 },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when reason is blank', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0.25, reason: '   ' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when patch is empty (no recognised fields)', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { reason: 'tune' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      // ------------------------------------------------------------------ POST happy path

      it('POST valid patch → 200, view reflects new value, GET also reflects it, audit row written', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);

        const postRes = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0.25, reason: 'tune for test' },
            { headers: adminHeaders() },
          ),
        );
        expect(postRes.status).toBe(200);
        expect(postRes.data.teamOverridePct).toBeCloseTo(0.25);
        expect(postRes.data).toHaveProperty('commissionCooldownDays');
        expect(postRes.data).toHaveProperty('overrideGenerationCap');

        // GET must now reflect the new value
        const getRes = await unwrapResponse(
          api.get('/admin/rewards-settings', { headers: adminHeaders() }),
        );
        expect(getRes.status).toBe(200);
        expect(getRes.data.teamOverridePct).toBeCloseTo(0.25);

        // Audit row must exist with correct action + admin_id from session
        const [aud] = await packs.listAdminActionAudits(
          { entity_type: 'rewards_settings', action: 'edit_rewards_settings' },
          { take: 1 },
        );
        expect(aud).toBeDefined();
        expect(aud.reason).toBe('tune for test');
        // admin_id comes from the session token, not the body — must be non-empty
        expect(typeof aud.admin_id).toBe('string');
        expect(aud.admin_id.length).toBeGreaterThan(0);
      });

      it('POST a second patch (upsert) → values merge correctly, second audit row written', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);

        // First write
        await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { teamOverridePct: 0.3, commissionCooldownDays: 5, reason: 'first' },
            { headers: adminHeaders() },
          ),
        );

        // Second write — only override cap
        const res = await unwrapResponse(
          api.post(
            '/admin/rewards-settings',
            { overrideGenerationCap: 50, reason: 'second' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data.overrideGenerationCap).toBe(50);
        // Previously-set values preserved
        expect(res.data.teamOverridePct).toBeCloseTo(0.3);
        expect(res.data.commissionCooldownDays).toBe(5);

        // Two audit rows total
        const rows = await packs.listAdminActionAudits(
          { entity_type: 'rewards_settings', action: 'edit_rewards_settings' },
          {},
        );
        expect(rows.length).toBeGreaterThanOrEqual(2);
      });
    });
  },
});
