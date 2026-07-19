import { describe, it, expect, vi, beforeEach } from 'vitest';

// challenge.ts imports @/lib/medusa (sdk) and @/lib/logger — mock both. The real
// parseOne/ChallengeSchema, rm0, and avatarForSeed run, so schema validation +
// formatting are genuine.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@/lib/medusa', () => ({ sdk: { client: { fetch: fetchMock } } }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getChallenge, formatReset } from '@/lib/data/challenge';

describe('formatReset', () => {
  it('formats a Monday 00:00 Asia/Kuala_Lumpur reset', () => {
    expect(formatReset(1, 0, 'Asia/Kuala_Lumpur')).toBe(
      'Resets Mondays 00:00 (MYT)',
    );
  });

  it('pads the hour and maps Sunday=0..Saturday=6', () => {
    expect(formatReset(0, 9, 'UTC')).toBe('Resets Sundays 09:00 (UTC)');
    expect(formatReset(6, 23, 'UTC')).toBe('Resets Saturdays 23:00 (UTC)');
  });

  it('falls back to the raw IANA name for an unknown zone', () => {
    expect(formatReset(1, 0, 'America/New_York')).toBe(
      'Resets Mondays 00:00 (America/New_York)',
    );
  });
});

describe('getChallenge', () => {
  beforeEach(() => fetchMock.mockReset());

  const active = {
    active: true,
    progress: { pooledMyr: 750 },
    settings: {
      timezone: 'Asia/Kuala_Lumpur',
      resetDay: 1,
      resetHour: 0,
    },
    stages: [
      {
        stageNumber: 1,
        thresholdMyr: 500,
        rewardCredits: 50,
        rewardCardIds: ['c1'],
      },
      {
        stageNumber: 2,
        thresholdMyr: 1000,
        rewardCredits: 100,
        // Same featured card as stage 1 — the summary must dedupe it.
        rewardCardIds: ['c1'],
      },
      {
        stageNumber: 3,
        thresholdMyr: 2000,
        rewardCredits: 200,
        rewardCardIds: [],
      },
    ],
    cards: {
      c1: { name: 'Charizard', image: 'http://x/charizard.webp' },
      c2: { name: 'Pikachu', image: 'http://x/pikachu.webp' },
      c3: { name: 'Mewtwo', image: 'http://x/mewtwo.webp' },
      // Distinct id, SAME image as c1 — the summary must NOT collapse these.
      dup: { name: 'Alt Charizard', image: 'http://x/charizard.webp' },
    },
    top: [
      {
        rank: 1,
        name: 'Ash',
        handle: 'ash-1234',
        volumeMyr: 600,
        pulls: 4,
        seed: 42,
        avatar_url: null,
      },
      {
        rank: 2,
        name: 'Collector 99',
        handle: null,
        volumeMyr: 150,
        pulls: 1,
        seed: 99,
        avatar_url: 'http://x/avatar.png',
      },
    ],
  };

  it('maps an active challenge, formatting RM and resolving cards', async () => {
    fetchMock.mockResolvedValueOnce(active);
    const c = await getChallenge();
    expect(c).not.toBeNull();
    expect(c!.resetLabel).toBe('Resets Mondays 00:00 (MYT)');
    expect(c!.stages[0]).toMatchObject({
      threshold: 'RM 500',
      thresholdCompact: 'RM 500',
      reward: 'RM 50',
    });
    expect(c!.stages[0]!.rankCards).toEqual([
      { rank: 1, name: 'Charizard', image: 'http://x/charizard.webp' },
    ]);
  });

  it('derives pool stats and stage states from the real pool', async () => {
    // pool 750: stage 1 (500) complete, stage 2 (1000) active, stage 3 locked.
    fetchMock.mockResolvedValueOnce(active);
    const c = await getChallenge();
    expect(c!.pool).toEqual({
      pooled: 'RM 750',
      topThreshold: 'RM 2,000',
      overallPct: 37.5, // 750 / 2000
      next: { stageNumber: 2, threshold: 'RM 1,000', remaining: 'RM 250' },
    });
    expect(c!.stages.map((s) => s.state)).toEqual([
      'complete',
      'active',
      'locked',
    ]);
    // Marker positions: threshold / top threshold.
    expect(c!.stages.map((s) => s.pct)).toEqual([25, 50, 100]);
    expect(c!.stages[2]!.thresholdCompact).toBe('RM 2K');
  });

  it('accumulates the Rewards Summary from unlocked stages only', async () => {
    fetchMock.mockResolvedValueOnce(active);
    const c = await getChallenge();
    expect(c!.summary).toEqual({
      unlockedCount: 1,
      cards: [{ name: 'Charizard', image: 'http://x/charizard.webp' }],
      credits: 'RM 50',
    });
  });

  it('marks every stage complete and sums all credits when cleared', async () => {
    fetchMock.mockResolvedValueOnce({
      ...active,
      progress: { pooledMyr: 5000 },
    });
    const c = await getChallenge();
    expect(c!.pool).toMatchObject({ overallPct: 100, next: null });
    expect(c!.stages.every((s) => s.state === 'complete')).toBe(true);
    expect(c!.summary).toMatchObject({
      unlockedCount: 3,
      credits: 'RM 350', // 50 + 100 + 200
    });
    // c1 is featured by BOTH stage 1 and stage 2 — one thumb, not two.
    expect(c!.summary!.cards).toEqual([
      { name: 'Charizard', image: 'http://x/charizard.webp' },
    ]);
  });

  it('maps the Weekly Pull Value top list (avatar fallback + override)', async () => {
    fetchMock.mockResolvedValueOnce(active);
    const c = await getChallenge();
    expect(c!.top).toHaveLength(2);
    expect(c!.top[0]).toMatchObject({
      rank: 1,
      name: 'Ash',
      handle: 'ash-1234',
      volume: 'RM 600',
    });
    // seed-derived fallback when avatar_url is null; override wins otherwise.
    expect(typeof c!.top[0]!.avatar).toBe('string');
    expect(c!.top[0]!.avatar.length).toBeGreaterThan(0);
    expect(c!.top[1]!.avatar).toBe('http://x/avatar.png');
  });

  it('returns null pool/summary (and null states) when the backend sends no progress', async () => {
    const { progress: _progress, top: _top, ...rest } = active;
    fetchMock.mockResolvedValueOnce(rest);
    const c = await getChallenge();
    expect(c).not.toBeNull();
    expect(c!.pool).toBeNull();
    expect(c!.summary).toBeNull();
    expect(c!.top).toEqual([]);
    expect(c!.stages.every((s) => s.state === null)).toBe(true);
  });

  it('returns null when the challenge is off (active:false)', async () => {
    fetchMock.mockResolvedValueOnce({ ...active, active: false });
    expect(await getChallenge()).toBeNull();
  });

  it('returns null when the backend is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await getChallenge()).toBeNull();
  });

  it('preserves podium rank when a higher-rank card is unresolvable', async () => {
    // #1 id is missing → #2/#3 must keep ranks 2/3, NOT shift up to 1/2.
    fetchMock.mockResolvedValueOnce({
      ...active,
      stages: [
        { ...active.stages[0], rewardCardIds: ['missing', 'c2', 'c3'] },
        ...active.stages.slice(1),
      ],
    });
    const c = await getChallenge();
    expect(c!.stages[0]!.rankCards).toEqual([
      { rank: 2, name: 'Pikachu', image: 'http://x/pikachu.webp' },
      { rank: 3, name: 'Mewtwo', image: 'http://x/mewtwo.webp' },
    ]);
  });

  it('dedupes the summary by card id, not image', async () => {
    // Stage 1 features c1 and `dup` (distinct ids, identical image). Both are
    // real prizes, so the summary shows TWO cards — an image-keyed dedupe would
    // wrongly collapse them to one.
    fetchMock.mockResolvedValueOnce({
      ...active,
      progress: { pooledMyr: 5000 },
      stages: [
        { ...active.stages[0], rewardCardIds: ['c1', 'dup', 'c1'] },
        ...active.stages.slice(1),
      ],
    });
    const c = await getChallenge();
    // c1 (repeated) collapses to one; dup survives as its own card.
    expect(c!.summary!.cards).toEqual([
      { name: 'Charizard', image: 'http://x/charizard.webp' },
      { name: 'Alt Charizard', image: 'http://x/charizard.webp' },
    ]);
  });
});
