import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { Modules } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { seedOf } from '../../src/utils/profile-handle';
import { clearLeaderboardCache } from '../../src/api/store/leaderboard/route';
import { myrDisplay as MYR, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

// The leaderboard is aggregated in the DB (GROUP BY + ORDER BY + LIMIT). These
// pin the two ranking contracts (Weekly Pulled Value Challenge standard,
// 2026-07-19):
//  - weekly  = the Weekly Pull Value board: ranked by pulled value (won cards'
//    MYR display value: market_value × multiplier × FX) over the CHALLENGE-
//    ANCHORED week (latest reset from challenge_settings; defaults Monday
//    00:00 Asia/Kuala_Lumpur). `points` mirrors `volume` on this period (the
//    wire shape requires a finite points field).
//  - alltime = REAL spend from the credit ledger's pack_open debits
//    (points = spend × 100) — NOT re-joined to the pack's CURRENT price.
// Also pinned: the weekly board ignores spend-side changes entirely, while
// all-time still nets pack_open reversals.

const PACK_A = 'lb-a'; // price 10
const PACK_B = 'lb-b'; // price 20
const CARD_X = 'lb-x'; // mv 50 USD
const CARD_Y = 'lb-y'; // mv 30 USD
const DAY_MS = 24 * 60 * 60 * 1000;

// No FxRate row is seeded and cards carry the model-default multiplier, so
// the MYR winnings column follows the shared myrDisplay helper (see utils).

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('leaderboard aggregation', () => {
      let storeHeaders: Record<string, string>;

      beforeEach(async () => {
        // The route's per-process 30s board cache outlives each test's
        // fixtures (one jest process = one module instance) — clear it so a
        // previous test's board is never served against this test's data.
        clearLeaderboardCache();

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
        const pulls = (
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
        // One pack_open debit per open — the same rows the charge step writes.
        const charges = (
          customer_id: string,
          price: number,
          created_at: Date,
          n: number,
        ) =>
          Array.from({ length: n }, () => ({
            customer_id,
            amount: -price,
            reason: 'pack_open' as const,
            created_at,
          }));

        await packs.createPulls([
          // C3: 3 × packB+cardX → spend 60 → points 6000; winnings 3×50 USD (recent)
          ...pulls('cus_lb_3', PACK_B, CARD_X, now, 3),
          // C1: 2 × packA+cardX → spend 20 → points 2000; winnings 100 USD (recent)
          ...pulls('cus_lb_1', PACK_A, CARD_X, now, 2),
          // C2: 1 × packB+cardY → spend 20 → points 2000; winnings 30 USD (recent)
          ...pulls('cus_lb_2', PACK_B, CARD_Y, now, 1),
          // C4: 5 × packB+cardX OLD → spend 100 (alltime #1, weekly excluded)
          ...pulls('cus_lb_4', PACK_B, CARD_X, old, 5),
        ]);
        await packs.createCreditTransactions([
          ...charges('cus_lb_3', 20, now, 3),
          ...charges('cus_lb_1', 10, now, 2),
          ...charges('cus_lb_2', 20, now, 1),
          ...charges('cus_lb_4', 20, old, 5),
        ] as Parameters<typeof packs.createCreditTransactions>[0]);
      });

      const board = (period?: string) =>
        unwrapResponse(
          api.get(`/store/leaderboard${period ? `?period=${period}` : ''}`, {
            headers: storeHeaders,
          }),
        ).then((r) => r.data.entries as Array<Record<string, number>>);

      it('ranks the weekly window by pulled value (points mirrors volume)', async () => {
        const entries = await board(); // default = weekly
        // C4's 8-day-old pulls predate ANY challenge-anchored week start (the
        // anchor is at most 7 days back), so they are excluded on every run day.
        expect(entries).toHaveLength(3);

        // Pulled value: C3 (3×50 USD) > C1 (2×50) > C2 (1×30) — spend never
        // enters this ranking (C1 outspends C2 but that is irrelevant here).
        expect(entries.map((e) => e.seed)).toEqual([
          seedOf('cus_lb_3'),
          seedOf('cus_lb_1'),
          seedOf('cus_lb_2'),
        ]);
        expect(entries[0]).toMatchObject({
          rank: 1,
          points: MYR(150),
          volume: MYR(150),
          pulls: 3,
        });
        expect(entries[1]).toMatchObject({
          rank: 2,
          points: MYR(100),
          volume: MYR(100),
          pulls: 2,
        });
        expect(entries[2]).toMatchObject({
          rank: 3,
          points: MYR(30),
          volume: MYR(30),
          pulls: 1,
        });
      });

      it('all-time includes the old spend and ranks it #1', async () => {
        const entries = await board('alltime');
        expect(entries).toHaveLength(4);
        expect(entries[0]).toMatchObject({
          seed: seedOf('cus_lb_4'),
          rank: 1,
          points: 10000,
          volume: MYR(250),
          pulls: 5,
        });
      });

      it('weekly ignores spend-side changes; all-time still nets reversals', async () => {
        const container = getContainer();
        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        // Repricing a pack never feeds pulled value (that is the CARDS' FMV),
        // so the weekly board must not move.
        const [packA] = await packs.listPacks({ slug: PACK_A }, { take: 1 });
        await packs.updatePacks([{ id: packA.id, price: 1000 }]);

        const entries = await board();
        expect(entries.map((e) => e.seed)).toEqual([
          seedOf('cus_lb_3'),
          seedOf('cus_lb_1'),
          seedOf('cus_lb_2'),
        ]);

        // A pack_open reversal (positive mirror row) changes SPEND only. The
        // weekly Pull Value board must not move — but all-time (spend-ranked)
        // still nets it: C1's points drop 2000 → 1000.
        await packs.createCreditTransactions([
          { customer_id: 'cus_lb_1', amount: 10, reason: 'pack_open' },
        ] as Parameters<typeof packs.createCreditTransactions>[0]);
        // The board is deliberately ≤30s stale (per-process cache) — these
        // tests pin the ranking METRIC, so read past the cache.
        clearLeaderboardCache();
        const weeklyAfter = await board();
        expect(weeklyAfter.map((e) => e.seed)).toEqual([
          seedOf('cus_lb_3'),
          seedOf('cus_lb_1'),
          seedOf('cus_lb_2'),
        ]);
        expect(weeklyAfter[1]).toMatchObject({ volume: MYR(100) });

        const alltimeAfter = await board('alltime');
        const c1 = alltimeAfter.find((e) => e.seed === seedOf('cus_lb_1'));
        expect(c1).toMatchObject({ points: 1000 });
      });
    });
  },
});
