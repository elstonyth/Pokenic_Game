'use server';

/**
 * Achievements server action — reads the customer's collector level, total XP,
 * and full achievement list.
 *
 * Backend route: GET /store/achievements
 */
import { sdk } from '@/lib/medusa';
import { logger } from '@/lib/logger';
import { getAuthToken } from '@/lib/data/customer';
import { friendlyError, isAuthError, type ErrorRule } from '@/lib/errors';
import { parseOne, AchievementsSchema } from '@/lib/data/schemas';

export type Achievement = {
  key: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  xp: number;
  metric: string;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number };
};

export type AchievementsData = {
  collectorLevel: number;
  totalXp: number;
  highestLevelEver: number;
  next: { level: number; xpThreshold: number; remaining: number } | null;
  achievements: Achievement[];
};

export type AchievementsResult =
  | { ok: true; data: AchievementsData }
  | { ok: false; error: string; needsAuth?: boolean };

const RULES: ErrorRule[] = [
  [
    /too many|rate.?limit|429/i,
    'Too many requests — give it a moment and try again.',
  ],
  [
    /unauthorized|not authenticated|401/i,
    'Please log in to view your achievements.',
  ],
];
const FALLBACK = 'Something went wrong. Please try again.';

export async function getAchievements(): Promise<AchievementsResult> {
  const token = await getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: 'Please log in to view your achievements.',
      needsAuth: true,
    };
  }

  try {
    const raw = await sdk.client.fetch('/store/achievements', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });

    const a = parseOne(AchievementsSchema, raw);
    if (!a) {
      return {
        ok: false,
        error: 'Got an unexpected response. Please try again.',
      };
    }

    return {
      ok: true,
      data: {
        collectorLevel: a.collector_level,
        totalXp: a.total_xp,
        highestLevelEver: a.highest_level_ever,
        next: a.next_level
          ? {
              level: a.next_level.level,
              xpThreshold: a.next_level.xp_threshold,
              remaining: a.next_level.remaining,
            }
          : null,
        achievements: a.achievements.map((x) => ({
          key: x.key,
          name: x.name,
          description: x.description,
          category: x.category,
          rarity: x.rarity,
          xp: x.xp,
          metric: x.metric,
          unlocked: x.unlocked,
          unlockedAt: x.unlocked_at,
          progress: { current: x.progress.current, target: x.progress.target },
        })),
      },
    };
  } catch (error) {
    logger.error('[achievements] load failed:', error);
    return {
      ok: false,
      error: friendlyError(error, RULES, FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}
