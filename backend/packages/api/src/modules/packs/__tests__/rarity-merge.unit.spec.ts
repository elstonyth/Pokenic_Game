import { computeOdds } from '@acme/odds-math';
import { mergeRarityUpdate } from '../rarity-merge';

// The Step-6 invariant: a rarity-only save must NEVER change a locked row's
// win rate — locks are set via the hidden manual seam and the UI cannot see
// them, so the server-side merge is the only thing standing between a rarity
// edit and a silently-clobbered locked win rate.
describe('mergeRarityUpdate', () => {
  const stored = [
    // Post-normalization weights (bps): locked chase at 95%, two fillers.
    { card_id: 'chase', weight: 9500, locked: true },
    { card_id: 'filler-a', weight: 300, locked: false },
    { card_id: 'filler-b', weight: 200, locked: false },
  ];

  it('preserves a locked row exactly through a rarity-only re-save', () => {
    const entries = mergeRarityUpdate(
      stored,
      new Map([
        ['chase', 'Immortal'],
        ['filler-a', 'Rare'], // rarity change — re-splits the unlocked share
        ['filler-b', 'Common'],
      ]),
    );
    const { computed, error } = computeOdds(entries);
    expect(error).toBeNull();
    const byId = new Map(computed.map((c) => [c.card_id, c]));
    expect(byId.get('chase')).toMatchObject({ locked: true, pct: 95 });
    // Unlocked rows re-split the remaining 5% proportionally to rarity weight
    // — Common (most common tier) takes a LARGER share than Rare.
    expect(byId.get('filler-b')!.pct).toBeGreaterThan(
      byId.get('filler-a')!.pct,
    );
    expect(computed.reduce((s, c) => s + c.weight, 0)).toBe(10000);
  });

  it('carries lock state per row and derives pct from the live share', () => {
    const entries = mergeRarityUpdate(
      [
        { card_id: 'a', weight: 50, locked: true }, // pre-normalization weights
        { card_id: 'b', weight: 50, locked: false },
      ],
      new Map([
        ['a', 'Rare'],
        ['b', 'Common'],
      ]),
    );
    expect(entries).toEqual([
      { card_id: 'a', locked: true, pct: 50, rarity: 'Rare' },
      { card_id: 'b', locked: false, pct: 0, rarity: 'Common' },
    ]);
  });
});
