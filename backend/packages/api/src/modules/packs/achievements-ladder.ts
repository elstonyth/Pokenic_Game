import { toSen } from './money';

// Pure achievements derivation — no DB, unit-testable like vip-ladder.ts.
export type AchMetric = 'spend' | 'cases_opened' | 'collection_size';
export type AchMetrics = {
  spend: number;
  cases_opened: number;
  collection_size: number;
};
export type AchDefRow = { key: string; metric: AchMetric; threshold: number };

// Keys whose threshold is met. Spend compared in integer sen so sub-sen float
// noise can't cross a boundary; counts compared as integers.
export function unlockedKeys(metrics: AchMetrics, defs: AchDefRow[]): string[] {
  const out: string[] = [];
  for (const d of defs) {
    if (d.metric === 'spend') {
      if (toSen(metrics.spend) >= toSen(d.threshold)) out.push(d.key);
    } else {
      if (metrics[d.metric] >= d.threshold) out.push(d.key);
    }
  }
  return out;
}

// Collector Level ladder (fixed for v1; admin-tunable later). 10 rungs spanning
// 0..22,250 — the max attainable XP across the 16 seeded core achievements.
export const ACHIEVEMENT_XP_LADDER: { level: number; xp_threshold: number }[] = [
  { level: 1, xp_threshold: 0 },
  { level: 2, xp_threshold: 500 },
  { level: 3, xp_threshold: 1500 },
  { level: 4, xp_threshold: 3000 },
  { level: 5, xp_threshold: 5000 },
  { level: 6, xp_threshold: 8000 },
  { level: 7, xp_threshold: 11000 },
  { level: 8, xp_threshold: 15000 },
  { level: 9, xp_threshold: 19000 },
  { level: 10, xp_threshold: 22250 },
];

// Highest rung whose xp_threshold is met (mirrors levelForSpend).
export function levelForXp(xp: number): number {
  let best = ACHIEVEMENT_XP_LADDER[0].level;
  for (const r of ACHIEVEMENT_XP_LADDER) {
    if (xp >= r.xp_threshold && r.level > best) best = r.level;
  }
  return best;
}
