import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

// Activation guard: an ACTIVE pack must always be openable. A pack with no
// rollable prize pool (no card odds rows, or an all-zero total weight) used to
// go live on the storefront and fail EVERY spin with an opaque error — the
// root cause behind "Could not open the pack. Please try again." on freshly
// authored packs. These specs pin the lifecycle: draft-first creation,
// activation only with a valid pool, and no emptying an active pool.

const ADMIN_EMAIL = 'pack-guard-admin@pokenic.test';
const PASSWORD = 'supersecret-test-pw';
const CARD_HANDLE = 'guard-test-card';

const PACK_BODY = {
  title: 'Guard Test Pack',
  category: 'pokemon',
  price: 10,
  image: '/cdn/test-pack.webp',
  buyback_percent: 90,
  boost: false,
  rank: 0,
};

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('pack activation guard', () => {
      let adminHeaders: Record<string, string>;
      let packs: PacksModuleService;

      beforeEach(async () => {
        const container = getContainer();
        const token = await mintSuperAdmin(
          container,
          api,
          ADMIN_EMAIL,
          PASSWORD,
        );
        adminHeaders = { Authorization: `Bearer ${token}` };
        packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createCards([
          {
            handle: CARD_HANDLE,
            name: 'Guard Test Card PSA 10',
            set: 'Test Set',
            grader: 'PSA',
            grade: '10',
            market_value: 100,
            image: '/cdn/test-card.webp',
          },
        ]);
      });

      it('enforces the draft → pool → activate lifecycle', async () => {
        // 1. Creating a pack as ACTIVE is rejected — its pool is empty by
        //    construction, so it could never be opened.
        const createActive = await unwrapResponse(
          api.post(
            '/admin/packs',
            { ...PACK_BODY, slug: 'guard-pack', status: 'active' },
            { headers: adminHeaders },
          ),
        );
        expect(createActive.status).toBe(400);
        expect(createActive.data.message).toMatch(/prize pool/i);

        // 2. Draft creation works.
        const createDraft = await unwrapResponse(
          api.post(
            '/admin/packs',
            { ...PACK_BODY, slug: 'guard-pack', status: 'draft' },
            { headers: adminHeaders },
          ),
        );
        expect(createDraft.status).toBe(201);

        // 3. Activating while the pool is still empty is rejected.
        const activateEmpty = await unwrapResponse(
          api.post(
            '/admin/packs/guard-pack',
            { ...PACK_BODY, status: 'active' },
            { headers: adminHeaders },
          ),
        );
        expect(activateEmpty.status).toBe(400);
        expect(activateEmpty.data.message).toMatch(/prize pool/i);

        // 4. Assign a card, then activation succeeds.
        const setMembers = await unwrapResponse(
          api.post(
            '/admin/packs/guard-pack/members',
            { card_ids: [CARD_HANDLE] },
            { headers: adminHeaders },
          ),
        );
        expect(setMembers.status).toBe(200);

        const activate = await unwrapResponse(
          api.post(
            '/admin/packs/guard-pack',
            { ...PACK_BODY, status: 'active' },
            { headers: adminHeaders },
          ),
        );
        expect(activate.status).toBe(200);

        // 5. Emptying the pool of an ACTIVE pack is rejected (would break
        //    every spin); demoting to draft first is the supported path.
        const clearMembers = await unwrapResponse(
          api.post(
            '/admin/packs/guard-pack/members',
            { card_ids: [] },
            { headers: adminHeaders },
          ),
        );
        expect(clearMembers.status).toBe(400);
        expect(clearMembers.data.message).toMatch(/draft/i);

        // 6. Missing status on a write defaults to DRAFT (fail-safe), never
        //    active.
        const createNoStatus = await unwrapResponse(
          api.post(
            '/admin/packs',
            { ...PACK_BODY, slug: 'guard-pack-2' },
            { headers: adminHeaders },
          ),
        );
        expect(createNoStatus.status).toBe(201);
        const [pack2] = await packs.listPacks(
          { slug: 'guard-pack-2' },
          { take: 1 },
        );
        expect(pack2.status).toBe('draft');
      });
    });
  },
});
