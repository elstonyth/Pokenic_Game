import {
  unlockedKeys,
  levelForXp,
  ACHIEVEMENT_XP_LADDER,
} from '../achievements-ladder';

describe('unlockedKeys', () => {
  const defs = [
    { key: 'spend_1000', metric: 'spend' as const, threshold: 1000 },
    { key: 'opens_25', metric: 'cases_opened' as const, threshold: 25 },
    { key: 'cards_100', metric: 'collection_size' as const, threshold: 100 },
  ];

  it('unlocks a count metric at exactly the threshold', () => {
    const keys = unlockedKeys(
      { spend: 0, cases_opened: 25, collection_size: 0 },
      defs,
    );
    expect(keys).toEqual(['opens_25']);
  });

  it('does not unlock just below the threshold', () => {
    const keys = unlockedKeys(
      { spend: 0, cases_opened: 24, collection_size: 99 },
      defs,
    );
    expect(keys).toEqual([]);
  });

  it('compares spend in sen (999.99 < 1000, 1000.00 >= 1000)', () => {
    expect(
      unlockedKeys({ spend: 999.99, cases_opened: 0, collection_size: 0 }, defs),
    ).toEqual([]);
    expect(
      unlockedKeys({ spend: 1000, cases_opened: 0, collection_size: 0 }, defs),
    ).toEqual(['spend_1000']);
  });
});

describe('levelForXp', () => {
  it('returns 1 at 0 xp', () => {
    expect(levelForXp(0)).toBe(1);
  });
  it('returns the highest rung whose threshold is met', () => {
    const top = ACHIEVEMENT_XP_LADDER[ACHIEVEMENT_XP_LADDER.length - 1];
    expect(levelForXp(top.xp_threshold)).toBe(top.level);
    expect(levelForXp(top.xp_threshold + 99999)).toBe(top.level);
  });
  it('does not advance just below a rung', () => {
    expect(levelForXp(499)).toBe(1);
    expect(levelForXp(500)).toBe(2);
  });
});
