import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'admin-reward-pool-test-pw-1';
const ADMIN_EMAIL = 'admin-reward-pool@test.dev';
const TIER = 'c';
const PRODUCT_HANDLE = 'e1-test-card';

// E1 — admin reward-pool authoring (GET + POST /admin/reward-pools/:tier).
// Tests:
//   - auth guard (401 without token)
//   - GET on a non-existent pool → { pool: null, entries: [] }
//   - POST a valid pool (1 product + 1 credit + 1 nothing) → 200
//   - GET after POST reflects the saved pool
//   - admin_action_audit row written with entity_type='reward_pool'
//   - POST malformed entry (kind='credit' + product_handle) → 400
//   - POST missing draws_per_day → 400
//   - POST negative draws_per_day → 400
//   - POST credit entry with credit_amount <= 0 → 400

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('GET + POST /admin/reward-pools/:tier (E1)', () => {
      let adminToken: string;

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);

        // Seed a product so the product_handle reference is resolvable if
        // the route ever queries PRODUCT module — we just need a handle present
        // in the PackOdds row for the integration check.
        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createCards([
          {
            handle: PRODUCT_HANDLE,
            name: 'E1 Test Prize Card',
            set: 'Test',
            grader: 'PSA',
            grade: '9',
            market_value: 10,
            image: '/cdn/e1.webp',
          },
        ]);
      });

      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      const VALID_BODY = {
        entries: [
          { kind: 'product', product_handle: PRODUCT_HANDLE, weight: 10 },
          { kind: 'credit', credit_amount: 5, weight: 20 },
          { kind: 'nothing', weight: 70 },
        ],
        draws_per_day: 3,
        pool_enabled: true,
      };

      // ---------------------------------------------------------------- auth guard

      it('GET /admin/reward-pools/:tier → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.get(`/admin/reward-pools/${TIER}`),
        );
        expect(res.status).toBe(401);
      });

      it('POST /admin/reward-pools/:tier → 401 without auth', async () => {
        const res = await unwrapResponse(
          api.post(`/admin/reward-pools/${TIER}`, VALID_BODY),
        );
        expect(res.status).toBe(401);
      });

      // ---------------------------------------------------------------- GET before POST

      it('GET on non-existent pool → 200 with pool:null and entries:[]', async () => {
        const res = await unwrapResponse(
          api.get(`/admin/reward-pools/${TIER}`, { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data.pool).toBeNull();
        expect(res.data.entries).toEqual([]);
      });

      // ---------------------------------------------------------------- POST happy path

      it('POST valid pool → 200; GET reflects new entries; audit row written', async () => {
        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);

        const postRes = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            VALID_BODY,
            { headers: adminHeaders() },
          ),
        );
        expect(postRes.status).toBe(200);
        expect(postRes.data.pool).toMatchObject({
          pack_slug: `reward-box-${TIER}`,
          pool_enabled: true,
          draws_per_day: 3,
          entries_count: 3,
        });

        // GET must now return the saved pool.
        const getRes = await unwrapResponse(
          api.get(`/admin/reward-pools/${TIER}`, { headers: adminHeaders() }),
        );
        expect(getRes.status).toBe(200);
        expect(getRes.data.pool).toMatchObject({
          slug: `reward-box-${TIER}`,
          pool_enabled: true,
          draws_per_day: 3,
        });
        expect(getRes.data.entries).toHaveLength(3);

        const kinds = (getRes.data.entries as { kind: string }[]).map(
          (e) => e.kind,
        );
        expect(kinds).toContain('product');
        expect(kinds).toContain('credit');
        expect(kinds).toContain('nothing');

        const creditEntry = (
          getRes.data.entries as { kind: string; credit_amount: number }[]
        ).find((e) => e.kind === 'credit');
        expect(creditEntry?.credit_amount).toBeCloseTo(5);

        // Audit row must exist with entity_type='reward_pool'.
        const audits = await packs.listAdminActionAudits(
          {
            entity_type: 'reward_pool',
            action: 'edit_reward_pool',
          },
          { take: 1 },
        );
        expect(audits.length).toBeGreaterThan(0);
        const aud = audits[0];
        expect(aud.entity_id).toBe(`reward-box-${TIER}`);
        expect(typeof aud.admin_id).toBe('string');
        expect(aud.admin_id.length).toBeGreaterThan(0);
      });

      // replace-all: second POST replaces the first set of entries
      it('second POST replaces entries (replace-all)', async () => {
        // First POST
        await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            VALID_BODY,
            { headers: adminHeaders() },
          ),
        );

        // Second POST — only 1 entry
        const res2 = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'nothing', weight: 100 }],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res2.status).toBe(200);
        expect(res2.data.pool.entries_count).toBe(1);

        // GET should reflect only the new single entry.
        const getRes = await unwrapResponse(
          api.get(`/admin/reward-pools/${TIER}`, { headers: adminHeaders() }),
        );
        expect(getRes.data.entries).toHaveLength(1);
        expect(getRes.data.entries[0].kind).toBe('nothing');
        expect(getRes.data.pool.pool_enabled).toBe(false);
      });

      // ---------------------------------------------------------------- POST validation → 400

      it('POST malformed: kind=credit + product_handle set → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [
                {
                  kind: 'credit',
                  credit_amount: 5,
                  product_handle: 'some-handle',
                  weight: 1,
                },
              ],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: kind=product without product_handle → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'product', weight: 1 }],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: kind=credit with credit_amount=0 → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'credit', credit_amount: 0, weight: 1 }],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: negative draws_per_day → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'nothing', weight: 1 }],
              draws_per_day: -1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: missing draws_per_day → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'nothing', weight: 1 }],
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: empty entries array → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            { entries: [], draws_per_day: 1, pool_enabled: false },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: non-positive weight → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'nothing', weight: 0 }],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });

      it('POST malformed: kind=nothing with credit_amount → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            `/admin/reward-pools/${TIER}`,
            {
              entries: [{ kind: 'nothing', credit_amount: 5, weight: 1 }],
              draws_per_day: 1,
              pool_enabled: false,
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
      });
    });
  },
});
