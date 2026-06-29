import { ACHIEVEMENT_DEFS } from '../../../scripts/achievement-defs.data';
import { ACHIEVEMENT_XP_LADDER } from '../achievements-ladder';

describe('ACHIEVEMENT_DEFS', () => {
  it('has 16 core achievements', () => {
    expect(ACHIEVEMENT_DEFS).toHaveLength(16);
  });
  it('has unique keys', () => {
    const keys = ACHIEVEMENT_DEFS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it('only uses the three core metrics', () => {
    const metrics = new Set(ACHIEVEMENT_DEFS.map((d) => d.metric));
    expect([...metrics].sort()).toEqual([
      'cases_opened',
      'collection_size',
      'spend',
    ]);
  });
  it('total XP equals the top Collector Level rung (22,250)', () => {
    const total = ACHIEVEMENT_DEFS.reduce((s, d) => s + d.xp, 0);
    const top = ACHIEVEMENT_XP_LADDER[ACHIEVEMENT_XP_LADDER.length - 1];
    expect(total).toBe(top.xp_threshold);
    expect(total).toBe(22250);
  });
});
