// src/lib/price-tier.ts
export type Tier =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'mythical'
  | 'legendary'
  | 'immortal';

/**
 * Bucket a card's USD market value into one of six glow tiers (spec §3).
 * Upper-exclusive bands; non-finite / non-positive values fall back to `common`
 * so a NaN can never read as `immortal`. Tier is by PRICE, independent of the
 * card's `rarity` field.
 */
export function priceTier(value: number): Tier {
  if (!Number.isFinite(value) || value < 25) return 'common';
  if (value < 100) return 'uncommon';
  if (value < 500) return 'rare';
  if (value < 2000) return 'mythical';
  if (value < 10000) return 'legendary';
  return 'immortal';
}

/** Glow RGB (as "r, g, b") per tier — feed `rgba(${TIER_COLOR[t]}, a)`. */
export const TIER_COLOR: Record<Tier, string> = {
  common: '156, 163, 175', // #9ca3af gray
  uncommon: '125, 211, 252', // #7dd3fc light blue
  rare: '37, 99, 235', // #2563eb deep blue
  mythical: '168, 85, 247', // #a855f7 purple
  legendary: '244, 114, 182', // #f472b6 bright pink
  immortal: '251, 146, 60', // #fb923c orange
};
