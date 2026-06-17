import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { seedOf } from '../../src/utils/profile-handle';
import { unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

// #7 — the leaderboard is aggregated in the DB (GROUP BY + ORDER BY + LIMIT),
// not by ranking an unordered 20k slice in memory. These pin the contract the
// rewrite must hold: correct points/volume/pull totals, points-desc ordering
// with a deterministic tie-break, top-N truncation, and the weekly window.

const PACK_A = 'lb-a'; // price 10
const PACK_B = 'lb-b'; // price 20
const CARD_X = 'lb-x'; // mv 50
const CARD_Y = 'lb-y'; // mv 30
const DAY_MS = 24 * 60 * 60 * 1000;

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('leaderboard aggregation', () => {
      let storeHeaders: Record<string, string>;

      beforeEach(async () => {
        const container = getContainer();
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: 'leaderboard-test',
          type: 'publishable',
          created_by: 'leaderboard-test',
        });
        storeHeaders = { 'x-publishable-api-key': key.token };

        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createPacks([
          {
            slug: PACK_A,
            title: 'LB Pack A',
            category: 'pokemon',
            price: 10,
            image: '/x.webp',
          },
          {
            slug: PACK_B,
            title: 'LB Pack B',
            category: 'pokemon',
            price: 20,
            image: '/x.webp',
          },
        ]);
        await packs.createCards([
          {
            handle: CARD_X,
            name: 'X',
            set: 'S',
            grader: 'PSA',
            grade: '10',
            market_value: 50,
            image: '/x.webp',
          },
          {
            handle: CARD_Y,
            name: 'Y',
            set: 'S',
            grader: 'PSA',
            grade: '10',
            market_value: 30,
            image: '/x.webp',
          },
        ]);

        const now = new Date();
        const old = new Date(Date.now() - 8 * DAY_MS); // outside the 7-day window
        const make = (
          customer_id: string,
          pack_id: string,
          card_id: string,
          rolled_at: Date,
          n: number,
        ) =>
          Array.from({ length: n }, () => ({
            customer_id,
            pack_id,
            card_id,
            rolled_at,
          }));

        await packs.createPulls([
          // C3: 3 × packB+cardX → points 6000, volume 150, pulls 3 (recent)
          ...make('cus_lb_3', PACK_B, CARD_X, now, 3),
          // C1: 2 × packA+cardX → points 2000, volume 100, pulls 2 (recent)
          ...make('cus_lb_1', PACK_A, CARD_X, now, 2),
          // C2: 1 × packB+cardY → points 2000, volume 30, pulls 1 (recent)
          ...make('cus_lb_2', PACK_B, CARD_Y, now, 1),
          // C4: 5 × packB+cardX OLD → points 10000 (alltime #1, weekly excluded)
          ...make('cus_lb_4', PACK_B, CARD_X, old, 5),
        ]);
      });

      const board = (period?: string) =>
        unwrapResponse(
          api.get(`/store/leaderboard${period ? `?period=${period}` : ''}`, {
            headers: storeHeaders,
          }),
        ).then((r) => r.data.entries as Array<Record<string, number>>);

      it('ranks the weekly window by points with a deterministic tie-break', async () => {
        const entries = await board(); // default = weekly
        expect(entries).toHaveLength(3); // C4's old pulls are excluded

        // C3 (6000) > C1 (2000, 2 pulls) > C2 (2000, 1 pull) — the equal-points
        // pair is broken by pulls DESC, which the old in-memory sort lacked.
        expect(entries.map((e) => e.seed)).toEqual([
          seedOf('cus_lb_3'),
          seedOf('cus_lb_1'),
          seedOf('cus_lb_2'),
        ]);
        expect(entries[0]).toMatchObject({
          rank: 1,
          points: 6000,
          volume: 150,
          pulls: 3,
        });
        expect(entries[1]).toMatchObject({
          rank: 2,
          points: 2000,
          volume: 100,
          pulls: 2,
        });
        expect(entries[2]).toMatchObject({
          rank: 3,
          points: 2000,
          volume: 30,
          pulls: 1,
        });
      });

      it('all-time includes the old pulls and ranks them #1', async () => {
        const entries = await board('alltime');
        expect(entries).toHaveLength(4);
        expect(entries[0]).toMatchObject({
          seed: seedOf('cus_lb_4'),
          rank: 1,
          points: 10000,
          volume: 250,
          pulls: 5,
        });
      });
    });
  },
});
