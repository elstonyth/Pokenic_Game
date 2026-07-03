import { describe, it, expect } from 'vitest';
import type { OddsRow } from './packs-api';
import { mapOddsToRows, rowsToRarityEntries, type EditRow } from './odds-rows';

const oddsRow = (over: Partial<OddsRow> = {}): OddsRow => ({
  card_id: 'card_1',
  name: 'Charizard',
  image: 'charizard.png',
  rarity: 'Rare',
  market_value: 100,
  stock: 10,
  top_hit: false,
  ...over,
});

const editRow = (over: Partial<EditRow> = {}): EditRow => ({
  card_id: 'card_1',
  name: 'Charizard',
  image: 'charizard.png',
  rarity: 'Rare',
  market_value: 100,
  stock: 10,
  topHit: false,
  ...over,
});

describe('mapOddsToRows', () => {
  it('copies card facts + rarity + top-hit into the editable row', () => {
    expect(mapOddsToRows([oddsRow({ top_hit: true })])).toEqual([
      editRow({ topHit: true }),
    ]);
  });
});

describe('rowsToRarityEntries', () => {
  it('maps rows to the rarity-only save payload — nothing else leaves', () => {
    expect(rowsToRarityEntries([editRow({ rarity: 'Mythical' })])).toEqual([
      { card_id: 'card_1', rarity: 'Mythical' },
    ]);
  });
});
