import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'site-settings-test-pw-1';
const ADMIN_EMAIL = 'site-settings@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('site-settings (slab frame)', () => {
      let adminToken: string;

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(
          container,
          api,
          ADMIN_EMAIL,
          PASSWORD,
        );
      });

      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      // ---------------------------------------------------------------- auth

      it('GET /admin/site-settings → 401 without auth', async () => {
        const res = await unwrapResponse(api.get('/admin/site-settings'));
        expect(res.status).toBe(401);
      });

      it('POST /admin/site-settings → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post('/admin/site-settings', {
            slab_frame_url: '/images/x.webp',
            reason: 'x',
          }),
        );
        expect(res.status).toBe(401);
      });

      // ---------------------------------------------------------------- reads

      it('GET /admin/site-settings → 200 with null default when no DB row', async () => {
        const res = await unwrapResponse(
          api.get('/admin/site-settings', { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ slab_frame_url: null });
      });

      // ----------------------------------------------------------- validation

      it('POST → 400 when reason is missing', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            { slab_frame_url: '/images/x.webp' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when slab_frame_url is not a path or http(s) URL', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            { slab_frame_url: 'javascript:alert(1)', reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 for a protocol-relative URL (//host/… is off-origin in disguise)', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            { slab_frame_url: '//evil.example/frame.webp', reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST → 400 when slab_frame_url is missing entirely', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            { reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      // ----------------------------------------------------------- happy path

      it('POST sets the URL, audit row written; null resets', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);

        const postRes = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            {
              slab_frame_url: 'https://cdn.test/frame.webp',
              reason: 'new frame',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(postRes.status).toBe(200);
        expect(postRes.data).toEqual({
          slab_frame_url: 'https://cdn.test/frame.webp',
          rebaked: { ok: expect.any(Number), failed: expect.any(Number) },
        });

        // Audit row with admin_id from the session token, not the body.
        const [aud] = await packs.listAdminActionAudits(
          { entity_type: 'site_settings', action: 'edit_site_settings' },
          { take: 1 },
        );
        expect(aud).toBeDefined();
        expect(aud.reason).toBe('new frame');
        expect(typeof aud.admin_id).toBe('string');
        expect(aud.admin_id.length).toBeGreaterThan(0);

        // null resets to the storefront default (upsert path, second audit).
        const resetRes = await unwrapResponse(
          api.post(
            '/admin/site-settings',
            { slab_frame_url: null, reason: 'back to default' },
            { headers: adminHeaders() },
          ),
        );
        expect(resetRes.status).toBe(200);
        expect(resetRes.data).toEqual({
          slab_frame_url: null,
          rebaked: { ok: expect.any(Number), failed: expect.any(Number) },
        });

        const rows = await packs.listAdminActionAudits(
          { entity_type: 'site_settings', action: 'edit_site_settings' },
          {},
        );
        expect(rows.length).toBeGreaterThanOrEqual(2);
      });
    });
  },
});
