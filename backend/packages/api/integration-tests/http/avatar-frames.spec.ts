import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'avatar-frames-test-pw-1';
const ADMIN_EMAIL = 'avatar-frames@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('avatar-frame catalog routes', () => {
      let adminToken: string;
      let storeHeaders: Record<string, string>;

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(
          container,
          api,
          ADMIN_EMAIL,
          PASSWORD,
        );
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: 'avatar-frames-test',
          type: 'publishable',
          created_by: 'avatar-frames-test',
        });
        storeHeaders = { 'x-publishable-api-key': key.token };
      });

      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      it('admin writes the catalog; store reads it back', async () => {
        const saved = await unwrapResponse(
          api.post(
            '/admin/avatar-frames',
            {
              frames: {
                '10': '/static/frame-10.webp',
                '20': '/static/frame-20.webp',
              },
              reason: 'seed frames for test',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(saved.data.frames).toEqual({
          '10': '/static/frame-10.webp',
          '20': '/static/frame-20.webp',
        });

        const pub = await unwrapResponse(
          api.get('/store/avatar-frames', { headers: storeHeaders }),
        );
        expect(pub.data.frames['10']).toBe('/static/frame-10.webp');

        // Admin read path returns the same persisted catalog.
        const adminRead = await unwrapResponse(
          api.get('/admin/avatar-frames', { headers: adminHeaders() }),
        );
        expect(adminRead.data.frames).toEqual({
          '10': '/static/frame-10.webp',
          '20': '/static/frame-20.webp',
        });
      });

      it('null clears a milestone level from the catalog', async () => {
        await unwrapResponse(
          api.post(
            '/admin/avatar-frames',
            {
              frames: {
                '10': '/static/frame-10.webp',
                '20': '/static/frame-20.webp',
              },
              reason: 'seed before clearing',
            },
            { headers: adminHeaders() },
          ),
        );
        const cleared = await unwrapResponse(
          api.post(
            '/admin/avatar-frames',
            {
              frames: { '10': '/static/frame-10.webp', '20': null },
              reason: 'clear level 20',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(cleared.data.frames).toEqual({ '10': '/static/frame-10.webp' });

        const readBack = await unwrapResponse(
          api.get('/admin/avatar-frames', { headers: adminHeaders() }),
        );
        expect(readBack.data.frames['20']).toBeUndefined();
      });

      it('rejects non-milestone keys and a missing reason', async () => {
        const badKey = await unwrapResponse(
          api.post(
            '/admin/avatar-frames',
            { frames: { '15': '/f.webp' }, reason: 'x' },
            { headers: adminHeaders() },
          ),
        );
        expect(badKey.status).toBe(400);

        const noReason = await unwrapResponse(
          api.post(
            '/admin/avatar-frames',
            { frames: { '10': '/f.webp' } },
            { headers: adminHeaders() },
          ),
        );
        expect(noReason.status).toBe(400);
      });
    });
  },
});
