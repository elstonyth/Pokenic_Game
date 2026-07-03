import type { OddsRow, RarityEntry } from './packs-api';

// One editable row in the pack pool editor: the immutable card facts plus the
// editable PER-PACK rarity and the Top Hit display flag. 🔒 No win-rate
// fields — weights/locks are secret; the UI never receives or sends them
// (rarity saves are merged with the stored locks server-side).
export type EditRow = {
  card_id: string;
  name: string;
  image: string;
  rarity: string;
  market_value: number;
  stock: number | null;
  /** Admin-picked Top Hit (storefront display only; saved per toggle). */
  topHit: boolean;
};

// Map a server odds snapshot into the editable row buffer. Used to seed the
// editor on load and to reseed after a membership change.
export const mapOddsToRows = (odds: OddsRow[]): EditRow[] =>
  odds.map((o) => ({
    card_id: o.card_id,
    name: o.name,
    image: o.image,
    rarity: o.rarity,
    market_value: o.market_value,
    stock: o.stock,
    topHit: o.top_hit,
  }));

// Map the editable rows to the rarity-only save payload.
export const rowsToRarityEntries = (rows: EditRow[]): RarityEntry[] =>
  rows.map((r) => ({ card_id: r.card_id, rarity: r.rarity }));
