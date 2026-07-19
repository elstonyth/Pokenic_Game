import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { Modules } from '@medusajs/framework/utils';
import PacksModuleService from '../../../modules/packs/service';
import { PACKS_MODULE } from '../../../modules/packs';
import { HANDLE_RE, seedOf } from '../../../utils/profile-handle';

// GET /store/leaderboard?period=weekly|alltime — public leaderboard. A plain
// publishable-key store route (read-only, no workflow).
//
// 🔒 PII: this is PUBLIC, so it NEVER exposes a customer's email or raw id. Each
// entry carries only a display name (first_name, else an anonymous "Collector
// ####" handle) and a stable `seed` integer the storefront hashes into an avatar.
//
// Rankings (Weekly Pulled Value Challenge standard, 2026-07-19):
// - weekly  = the Weekly Pull Value board: ranked by pulled value over the
//   challenge-anchored week (challengeWeekTop) — the SAME board /task's top-10
//   shows, so the challenge payout and the leaderboard can never disagree.
// - alltime = REAL spend: points = Σ(pack_open ledger debits, RM) × 100 — see
//   PacksModuleService.leaderboardTop.
// `volume` = Σ won-card MYR display value; `pulls` = pull count (reward-box
// draws excluded on both paths).
const TOP_N = 10;

// Avatar seed = the shared `seedOf` (utils/profile-handle) so the leaderboard
// and the public profile page render the SAME avatar for the same customer.

// ponytail: per-process 30s cache — the board is a global aggregate whose cost
// grows with total pull history; upgrade to Redis if we ever run >1 instance.
const CACHE_TTL_MS = 30_000;
const boardCache = new Map<string, { expires: number; body: unknown }>();

/** Test seam: module state outlives a test's fixtures — the http suite runs in
 *  one process, so test A's cached board would be served to test B. */
export function clearLeaderboardCache(): void {
  boardCache.clear();
}

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerService = req.scope.resolve(Modules.CUSTOMER);

  const period = req.query.period === 'alltime' ? 'alltime' : 'weekly';

  const cached = boardCache.get(period);
  if (cached && cached.expires > Date.now()) {
    res.json(cached.body);
    return;
  }
  // Ranked top-N is aggregated in the DB (GROUP BY + ORDER BY + LIMIT) so it's
  // correct at any pull volume. weekly = pulled value over the challenge week;
  // alltime = spend. Weekly rows mirror `volume` into `points` only because the
  // wire shape requires a finite points field — the weekly UI renders volume.
  let ranked: {
    customer_id: string;
    pulls: number;
    points: number;
    volume: number;
  }[];
  if (period === 'weekly') {
    const s = await packs.challengeSettings();
    const rows = await packs.challengeWeekTop({
      timezone: s.timezone,
      resetDay: s.reset_day,
      resetHour: s.reset_hour,
      limit: TOP_N,
    });
    ranked = rows.map((r) => ({
      customer_id: r.customer_id,
      pulls: r.pulls,
      volume: r.volumeMyr,
      points: r.volumeMyr,
    }));
  } else {
    ranked = await packs.leaderboardTop({ sinceMs: null, limit: TOP_N });
  }
  if (ranked.length === 0) {
    const body = { period, entries: [] };
    boardCache.set(period, { expires: Date.now() + CACHE_TTL_MS, body });
    res.json(body);
    return;
  }

  // Names for the ranked customers only — first_name ONLY (never email).
  // The public profile handle (customer metadata.handle, PII-safe by design)
  // rides along so the storefront can link each row to /profile/<handle>.
  // Customers that predate handle assignment return null — NO mutation here
  // (handles are assigned by the ensure-profile-handle workflow, not a GET).
  const ids = ranked.map((r) => r.customer_id);
  const customers = ids.length
    ? await customerService.listCustomers({ id: ids }, { take: ids.length })
    : [];
  const firstNameById = new Map(
    customers.map((c) => [c.id, (c.first_name || '').trim()]),
  );
  const handleById = new Map(
    customers.map((c) => {
      const handle = (c.metadata ?? {})['handle'];
      return [
        c.id,
        typeof handle === 'string' && HANDLE_RE.test(handle) ? handle : null,
      ];
    }),
  );
  const metaById = new Map(
    customers.map((c) => [c.id, (c.metadata ?? {}) as Record<string, unknown>]),
  );

  const entries = ranked.map((r, i) => {
    const first = firstNameById.get(r.customer_id);
    const seed = seedOf(r.customer_id);
    return {
      rank: i + 1,
      name:
        first && first.length > 0
          ? first
          : `Collector ${String(seed).slice(0, 4)}`,
      handle: handleById.get(r.customer_id) ?? null,
      volume: r.volume,
      pulls: r.pulls,
      points: r.points,
      seed,
      avatar_url:
        typeof metaById.get(r.customer_id)?.avatar_url === 'string'
          ? (metaById.get(r.customer_id)!.avatar_url as string)
          : null,
      equipped_frame_level:
        typeof metaById.get(r.customer_id)?.equipped_frame_level === 'number'
          ? (metaById.get(r.customer_id)!.equipped_frame_level as number)
          : null,
    };
  });

  const body = { period, entries };
  boardCache.set(period, { expires: Date.now() + CACHE_TTL_MS, body });
  res.json(body);
}
