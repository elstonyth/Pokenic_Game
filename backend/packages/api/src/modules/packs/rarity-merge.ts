import type { OddsInput } from '@acme/odds-math';

// Build savePackOddsWorkflow entries for a RARITY-ONLY update.
//
// The admin UI edits rarity (and display flags) but never sees or sends the
// secret win-rate weights — those are set manually via the hidden
// POST /admin/packs/:slug/odds seam. So a rarity save must merge server-side:
// each stored row keeps its lock state, and a LOCKED row keeps its exact
// current win % (weight / Σweight × 100) so re-normalization reproduces it
// verbatim. Unlocked rows re-split the remainder by their (new) rarity — the
// same semantics as before, driven by the rarity change alone.
export function mergeRarityUpdate(
  stored: { card_id: string; weight: number; locked: boolean }[],
  rarityByCard: Map<string, string>,
): OddsInput[] {
  const total = stored.reduce((s, o) => s + o.weight, 0) || 1;
  return stored.map((o) => ({
    card_id: o.card_id,
    locked: o.locked,
    // pct is only honored for locked rows; unlocked rows are recomputed.
    pct: o.locked ? (o.weight / total) * 100 : 0,
    rarity: rarityByCard.get(o.card_id) ?? '',
  }));
}

export default mergeRarityUpdate;
