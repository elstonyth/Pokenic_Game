import type { Metadata } from 'next';
import LeaderboardClient from './LeaderboardClient';
import { WeeklyChallenge, ChallengeRules } from './WeeklyChallenge';
import { getLeaderboard } from '@/lib/data/leaderboard';
import { getChallenge } from '@/lib/data/challenge';
import { getOwnProfileHandle } from '@/lib/data/profiles';
import { getAvatarFrames } from '@/lib/data/avatar-frames';

// Live leaderboard + Weekly Pulled Value Challenge, aggregated from the gacha
// Pull ledger. Fetched server-side (the storefront origin can reach the backend;
// the browser is CORS-blocked) and rendered per-request so it always reflects
// the current ledger.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ranks',
  description:
    'Live standings and the Weekly Pulled Value Challenge on Polycards.',
};

export default async function LeaderboardPage() {
  // All fetches run concurrently — getLeaderboard awaits the catalog promise
  // internally, only for post-fetch frame enrichment.
  const framesPromise = getAvatarFrames();
  const [ownHandle, challenge, weekly, alltime] = await Promise.all([
    // null when logged out — the client hides the "your rank" card then.
    getOwnProfileHandle().catch(() => null),
    // null when the challenge is off or the backend hop fails — the standings
    // must still render.
    getChallenge().catch(() => null),
    getLeaderboard('weekly', framesPromise),
    getLeaderboard('alltime', framesPromise),
  ]);

  return (
    <>
      {challenge && <WeeklyChallenge challenge={challenge} />}
      <LeaderboardClient
        weekly={weekly}
        alltime={alltime}
        ownHandle={ownHandle}
      />
      {challenge && <ChallengeRules />}
    </>
  );
}
