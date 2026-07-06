import type { Metadata } from 'next';
import LeaderboardClient from './LeaderboardClient';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { getOwnProfileHandle } from '@/lib/data/profiles';
import { getAvatarFrames } from '@/lib/data/avatar-frames';

// Live leaderboard, aggregated from the gacha Pull ledger. Fetched server-side
// (the storefront origin can reach the backend; the browser is CORS-blocked) and
// rendered per-request so it always reflects the current ledger.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Leaderboard',
};

export default async function LeaderboardPage() {
  // All four fetches run concurrently — getLeaderboard awaits the catalog
  // promise internally, only for post-fetch frame enrichment.
  const framesPromise = getAvatarFrames();
  const [ownHandle, weekly, alltime] = await Promise.all([
    // null when logged out — the client hides the "your rank" card then.
    getOwnProfileHandle().catch(() => null),
    getLeaderboard('weekly', framesPromise),
    getLeaderboard('alltime', framesPromise),
  ]);

  return (
    <LeaderboardClient
      weekly={weekly}
      alltime={alltime}
      ownHandle={ownHandle}
    />
  );
}
