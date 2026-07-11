/**
 * Tests for the open-batch roll-mapping logic.
 *
 * Strategy: `openBatch` itself lives behind the 'use server' boundary (Next.js
 * disallows non-async named exports there), so we unit-test the pure
 * `mapBatchRoll` helper extracted into `pack-batch-map.ts` instead. This
 * covers all three correctness requirements from the task brief:
 *   (a) `image` is read from the RAW card object, not from the parsed schema.
 *   (b) A malformed buyback yields `buyback: null` (never fails the roll).
 *   (c) A card that fails `WonCardSchema` causes `mapBatchRoll` to return null
 *       — callers (openBatch) treat that as a whole-batch failure.
 *
 * Count-clamping in `openBatch` is also exercised here via a lightweight
 * clamp-spec that mirrors the implementation exactly (Math.min/max/trunc).
 */
import { describe, it, expect } from 'vitest';
import { mapBatchRoll, clampCount } from '@/lib/actions/pack-batch-map';
import type { RawBatchRollItem } from '@/lib/actions/pack-batch-map';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid raw card accepted by WonCardSchema. */
const validRawCard = (overrides?: Partial<Record<string, unknown>>) => ({
  handle: 'pikachu-holo',
  name: 'Pikachu Holo',
  image: '/cards/pikachu-holo.webp',
  market_value: 39.99,
  rarity: 'Rare',
  pokemon_dex: 25,
  sprite_image: '/sprites/25.png',
  ...overrides,
});

/** Minimal valid raw buyback offer accepted by OpenBuybackSchema. */
const validRawBuyback = (overrides?: Partial<Record<string, unknown>>) => ({
  percent: 50,
  amount: 19.99,
  vault_percent: 30,
  vault_amount: 11.99,
  instant_deadline_ms: 1_750_000_000_000,
  ...overrides,
});

/** Build a complete raw roll item as the backend would return. */
const rawRoll = (
  cardOverrides?: Partial<Record<string, unknown>>,
  buybackOverrides?: Partial<Record<string, unknown>> | null,
) => ({
  pull: { id: 'pull-abc-123' },
  card: validRawCard(cardOverrides),
  buyback:
    buybackOverrides === null
      ? undefined
      : validRawBuyback(buybackOverrides ?? {}),
});

// ---------------------------------------------------------------------------
// (a) image comes from the RAW card, not the parsed schema
// ---------------------------------------------------------------------------

describe('mapBatchRoll — image sourced from raw card', () => {
  it('uses card.image from the raw roll, not the parsed schema field', () => {
    // WonCardSchema omits `image`. We verify the returned card.image is
    // exactly the raw string, not some undefined/null from the parsed object.
    const roll = rawRoll({ image: '/raw/override-image.webp' });
    const result = mapBatchRoll(roll);
    expect(result).not.toBeNull();
    expect(result!.card.image).toBe('/raw/override-image.webp');
  });

  it('still reads the correct image when other fields are zod-trimmed', () => {
    // looseObject passes extra keys through, but image isn't in WonCardSchema —
    // confirm we always pull from raw even with extra junk fields present.
    const roll = rawRoll({ image: '/sprites/exact.png', _junk: 'ignored' });
    const result = mapBatchRoll(roll);
    expect(result!.card.image).toBe('/sprites/exact.png');
  });

  it('reads slab_image from the RAW roll object (WonCardSchema omits it, like image)', () => {
    const roll: RawBatchRollItem = {
      pull: { id: 'p1' },
      card: {
        handle: 'h1',
        name: 'Card',
        image: '/raw/photo.webp',
        slab_image: '/raw/slab.webp',
        market_value: 10,
        rarity: 'Rare',
      },
      buyback: undefined,
    };
    const mapped = mapBatchRoll(roll);
    expect(mapped).not.toBeNull();
    expect(mapped!.card.slab_image).toBe('/raw/slab.webp');
  });
});

// ---------------------------------------------------------------------------
// (b) Malformed buyback → null, NOT a whole-roll failure
// ---------------------------------------------------------------------------

describe('mapBatchRoll — buyback validation', () => {
  it('returns a valid roll with buyback=null when buyback is missing', () => {
    const roll = rawRoll(undefined, null); // no buyback key
    const result = mapBatchRoll(roll);
    expect(result).not.toBeNull();
    expect(result!.buyback).toBeNull();
  });

  it('returns buyback=null when buyback is missing required percent field', () => {
    // Pass a literal with NO percent — validRawBuyback defaults would carry it,
    // so we must bypass the helper and construct the raw roll directly.
    const roll = {
      pull: { id: 'pull-xyz' },
      card: validRawCard(),
      buyback: { amount: 10 }, // percent absent → OpenBuybackSchema rejects
    };
    const result = mapBatchRoll(roll);
    expect(result).not.toBeNull();
    expect(result!.buyback).toBeNull();
  });

  it('returns buyback=null when buyback amount is non-finite', () => {
    const roll = rawRoll(undefined, { percent: 50, amount: Infinity });
    const result = mapBatchRoll(roll);
    expect(result!.buyback).toBeNull();
  });

  it('maps optional vault fields to null when omitted', () => {
    // Older backends omit vault_percent / vault_amount / instant_deadline_ms.
    // Must bypass validRawBuyback (which includes vault defaults) and construct
    // a raw buyback literal with ONLY the two required fields.
    const roll = {
      pull: { id: 'pull-xyz' },
      card: validRawCard(),
      buyback: { percent: 50, amount: 19.99 }, // no vault_* or instant_deadline_ms
    };
    const result = mapBatchRoll(roll);
    expect(result!.buyback).not.toBeNull();
    expect(result!.buyback!.vaultPercent).toBeNull();
    expect(result!.buyback!.vaultAmount).toBeNull();
    expect(result!.buyback!.instantDeadlineMs).toBeNull();
  });

  it('maps a complete buyback offer correctly', () => {
    const roll = rawRoll();
    const result = mapBatchRoll(roll);
    expect(result!.buyback).toEqual({
      percent: 50,
      amount: 19.99,
      vaultPercent: 30,
      vaultAmount: 11.99,
      instantDeadlineMs: 1_750_000_000_000,
      // Absent from the raw offer = firm (older backend, pre-firmness).
      firm: true,
    });
  });

  it('passes firm:false through so the reveal can suppress the offer', () => {
    const roll = rawRoll(undefined, {
      percent: 50,
      amount: 19.99,
      firm: false,
    });
    const result = mapBatchRoll(roll);
    expect(result!.buyback!.firm).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) Bad WonCardSchema → null (whole-batch failure signal)
// ---------------------------------------------------------------------------

describe('mapBatchRoll — WonCardSchema failure → null', () => {
  it('returns null when rarity is unknown', () => {
    const roll = rawRoll({ rarity: 'UltraRare' }); // not a known Rarity
    expect(mapBatchRoll(roll)).toBeNull();
  });

  it('returns null when market_value is non-finite', () => {
    const roll = rawRoll({ market_value: NaN });
    expect(mapBatchRoll(roll)).toBeNull();
  });

  it('returns null when handle is missing', () => {
    const roll = rawRoll({ handle: undefined });
    expect(mapBatchRoll(roll)).toBeNull();
  });

  it('returns null when name is missing', () => {
    const roll = rawRoll({ name: undefined });
    expect(mapBatchRoll(roll)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Correct per-roll field mapping
// ---------------------------------------------------------------------------

describe('mapBatchRoll — field mapping', () => {
  it('maps pullId from pull.id string', () => {
    const roll = rawRoll();
    expect(mapBatchRoll(roll)!.pullId).toBe('pull-abc-123');
  });

  it('returns pullId=null when pull.id is not a string', () => {
    const roll = { ...rawRoll(), pull: { id: 42 } };
    expect(mapBatchRoll(roll)!.pullId).toBeNull();
  });

  it('returns pullId=null when pull is absent', () => {
    const { pull: _pull, ...rest } = rawRoll();
    void _pull;
    expect(
      mapBatchRoll(rest as Parameters<typeof mapBatchRoll>[0])!.pullId,
    ).toBeNull();
  });

  it('maps marketValue from parsed market_value', () => {
    const roll = rawRoll({ market_value: 99.5 });
    expect(mapBatchRoll(roll)!.marketValue).toBe(99.5);
  });

  it('maps card.value to a formatted RM string when marketPriceMyr is present', () => {
    const roll = rawRoll({ market_value: 39.99, marketPriceMyr: 9.99 });
    expect(mapBatchRoll(roll)!.card.value).toMatch(/RM 9\.99/);
  });

  // Audit 2026-07-07 #11 / money-contract resilience: market_value is raw USD
  // and must NEVER render behind an "RM" prefix — an older backend omitting
  // marketPriceMyr must show "—", not a fake RM price.
  it('maps card.value to "—" when marketPriceMyr is absent', () => {
    const roll = rawRoll({ market_value: 9.99 });
    expect(mapBatchRoll(roll)!.card.value).toBe('—');
  });

  it('maps pokemon_dex and sprite_image', () => {
    const roll = rawRoll({ pokemon_dex: 150, sprite_image: '/s/150.png' });
    const result = mapBatchRoll(roll)!;
    expect(result.card.pokemon_dex).toBe(150);
    expect(result.card.sprite_image).toBe('/s/150.png');
  });

  it('coerces absent pokemon_dex/sprite_image to null', () => {
    const roll = rawRoll({ pokemon_dex: undefined, sprite_image: undefined });
    const result = mapBatchRoll(roll)!;
    expect(result.card.pokemon_dex).toBeNull();
    expect(result.card.sprite_image).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Count-clamp spec (mirrors openBatch implementation: Math.min(3,max(1,trunc)))
// ---------------------------------------------------------------------------

describe('clampCount — real exported function', () => {
  it('clamps values above 3 to 3', () => {
    expect(clampCount(5)).toBe(3);
    expect(clampCount(100)).toBe(3);
    expect(clampCount(3.9)).toBe(3); // trunc → 3
  });

  it('clamps values below 1 to 1', () => {
    expect(clampCount(0)).toBe(1);
    expect(clampCount(-5)).toBe(1);
  });

  it('passes values 1, 2, 3 through unchanged', () => {
    expect(clampCount(1)).toBe(1);
    expect(clampCount(2)).toBe(2);
    expect(clampCount(3)).toBe(3);
  });

  it('truncates fractional values before clamping (Math.trunc)', () => {
    expect(clampCount(1.9)).toBe(1);
    expect(clampCount(2.5)).toBe(2);
  });
});
