/**
 * View-model the profile page renders — one shape for BOTH sources: the real
 * public profile (`/store/profiles/:handle`) and the deterministic mock pool
 * (unknown handles / backend down), so `ProfileClient` stays purely
 * presentational and pixel-identical across the two.
 */
import type { MockUser } from '@/lib/mock/users';
import type { PublicProfile } from '@/lib/data/profiles';
import { relativeTime } from '@/lib/format';

export interface ProfileViewCard {
  id: string;
  name: string;
  image: string;
  grader: string;
  grade: string;
  price: number;
}

export interface ProfileViewActivity {
  verb: string;
  time: string;
  card: ProfileViewCard;
}

export interface ProfileViewUser {
  username: string;
  pfp: string;
  /** Global rank is a leaderboard concern — null (rendered "—") for real profiles. */
  rank: number | null;
  points: number;
  pulls: number;
  volume: number;
  joined: string;
  collection: ProfileViewCard[];
  /** Real pull activity (verb + relative time); absent → mock-style derived. */
  activity?: ProfileViewActivity[];
}

const PFP_COUNT = 81; // public/images/pfps/pfp-1..81.webp

/** Seed → avatar path — shared with the leaderboard seam so the same seed
 * always renders the same avatar on both surfaces. */
export const avatarForSeed = (seed: number): string =>
  `/images/pfps/pfp-${(Math.abs(Math.trunc(seed)) % PFP_COUNT) + 1}.webp`;

/** Join year for "Collecting since {year}" — "—" for an unparsable date. */
function joinedYear(iso: string): string {
  const year = new Date(iso).getFullYear();
  return Number.isFinite(year) ? String(year) : '—';
}

/** Real backend profile → the view the page renders. */
export function toProfileView(profile: PublicProfile): ProfileViewUser {
  const cards: ProfileViewCard[] = profile.recent.map((p) => ({
    id: p.card.handle,
    name: p.card.name,
    image: p.card.image,
    grader: p.card.grader,
    grade: p.card.grade,
    price: p.card.market_value,
  }));
  return {
    username: profile.name,
    pfp: avatarForSeed(profile.seed),
    rank: null,
    points: profile.stats.points,
    pulls: profile.stats.pulls,
    volume: profile.stats.volume,
    joined: joinedYear(profile.joined_at),
    collection: cards,
    activity: profile.recent.map((p, i) => ({
      verb: 'pulled',
      time: relativeTime(p.rolled_at),
      card: cards[i],
    })),
  };
}

/** Mock-pool user → the same view (fallback/skeleton path). */
export function mockProfileView(user: MockUser): ProfileViewUser {
  return {
    username: user.username,
    pfp: user.pfp,
    rank: user.rank,
    points: user.points,
    pulls: user.pulls,
    volume: user.volume,
    joined: user.joined,
    collection: user.collection,
  };
}
