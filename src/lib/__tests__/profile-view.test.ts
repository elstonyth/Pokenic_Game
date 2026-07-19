import { describe, it, expect } from 'vitest';
import { toProfileView } from '@/lib/profile-view';
import type { PublicProfile } from '@/lib/data/profiles';

describe('toProfileView — tolerates a missing recent array', () => {
  it('does not throw and yields empty activity when recent is absent', () => {
    // PublicProfileSchema is intentionally loose (handle + stats), so a
    // regressed/absent `recent` must degrade gracefully here (empty activity),
    // not crash the async server component with a `.map of undefined` 500.
    const profile = {
      name: 'Ash',
      seed: 1,
      joined_at: '2026-01-01T00:00:00Z',
      stats: { pulls: 0, volume: 0 },
      collection: [],
      // `recent` deliberately omitted
    } as unknown as PublicProfile;

    const view = toProfileView(profile);
    expect(view.activity).toEqual([]);
    expect(view.username).toBe('Ash');
  });

  it('does not throw when recent is present but NOT an array (loose-payload regression)', () => {
    const profile = {
      name: 'Ash',
      seed: 1,
      joined_at: '2026-01-01T00:00:00Z',
      stats: { pulls: 0, volume: 0 },
      collection: [],
      recent: {}, // regressed to a non-array — Array.isArray guard must catch it
    } as unknown as PublicProfile;

    const view = toProfileView(profile);
    expect(view.activity).toEqual([]);
  });
});

// Money-contract resilience (audit 2026-07-07 #11): market_value is raw USD
// and must never render behind an "RM" prefix — a collection/activity card
// without marketPriceMyr must map to price: null (ProfileClient shows "—"),
// not fall back to the raw USD number.
describe('toProfileView — never falls back to raw USD market_value', () => {
  it('maps price to null when a collection card has no marketPriceMyr', () => {
    const profile = {
      name: 'Ash',
      seed: 1,
      joined_at: '2026-01-01T00:00:00Z',
      stats: { pulls: 0, volume: 0 },
      collection: [
        {
          handle: 'x',
          name: 'X',
          grader: 'PSA',
          grade: '10',
          image: '/x.webp',
          market_value: 39.99, // raw USD, no marketPriceMyr
        },
      ],
      recent: [],
    } as unknown as PublicProfile;

    const view = toProfileView(profile);
    expect(view.collection[0]?.price).toBeNull();
  });

  it('uses marketPriceMyr when present', () => {
    const profile = {
      name: 'Ash',
      seed: 1,
      joined_at: '2026-01-01T00:00:00Z',
      stats: { pulls: 0, volume: 0 },
      collection: [
        {
          handle: 'x',
          name: 'X',
          grader: 'PSA',
          grade: '10',
          image: '/x.webp',
          market_value: 39.99,
          marketPriceMyr: 9.99,
        },
      ],
      recent: [],
    } as unknown as PublicProfile;

    const view = toProfileView(profile);
    expect(view.collection[0]?.price).toBe(9.99);
  });
});

// Tier-frame contract: rarity drives the slab's tier frame, and a wrong-tier
// frame is worse than none — so an old backend that omits collection[].rarity
// (or a new one that nulls it on an odds-row miss) must map to null, never a
// guessed tier. SlabImage skips the frame for a falsy rarity.
describe('toProfileView — collection rarity degrades to null', () => {
  const base = {
    name: 'Ash',
    seed: 1,
    joined_at: '2026-01-01T00:00:00Z',
    stats: { pulls: 1, volume: 0 },
    recent: [],
  };
  const card = {
    handle: 'c1',
    name: 'Card',
    grader: 'PSA',
    grade: '10',
    image: '/x.webp',
    market_value: 1,
  };

  it('maps an omitted rarity (old backend) to null', () => {
    const view = toProfileView({
      ...base,
      collection: [card],
    } as unknown as PublicProfile);
    expect(view.collection[0]?.rarity).toBeNull();
  });

  it('passes a present rarity through', () => {
    const view = toProfileView({
      ...base,
      collection: [{ ...card, rarity: 'Legendary' }],
    } as unknown as PublicProfile);
    expect(view.collection[0]?.rarity).toBe('Legendary');
  });
});
