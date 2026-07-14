import { priceNumber, type Pack } from '@/lib/packs-data';
import { priceTier, TIER_ORDER, type Tier } from '@/lib/price-tier';

export interface TierRack {
  tier: Tier;
  packs: Pack[];
}

/**
 * Group catalog packs into shelf racks by price tier, highest tier first
 * (drop-board order: the expensive rack leads). Pack order within a rack is
 * the catalog's own order. Empty tiers are omitted.
 */
export function groupPacksByTier(packs: Pack[]): TierRack[] {
  const byTier = new Map<Tier, Pack[]>();
  for (const pack of packs) {
    const tier = priceTier(priceNumber(pack.price));
    const rack = byTier.get(tier);
    if (rack) rack.push(pack);
    else byTier.set(tier, [pack]);
  }
  return [...TIER_ORDER]
    .reverse()
    .filter((tier) => byTier.has(tier))
    .map((tier) => ({ tier, packs: byTier.get(tier)! }));
}
