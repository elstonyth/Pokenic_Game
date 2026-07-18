// Client-side pre-validation for the Milestone Stages tab — mirrors the server
// challenge-validate invariants so the operator sees problems inline before
// POSTing (same pattern as daily-rewards/vip-levels-validate-client.ts).
// Returns every problem (never stops at the first). Contiguity is automatic
// (stage_number is index-derived); an empty list is valid (challenge off).
export interface ChallengeStageRow {
  thresholdInput: string;
  creditsInput: string;
}

// A blank field is NOT a valid 0 — Number('') coerces to 0 and Infinity
// JSON-serializes to null; both must fail here, not surprise the operator
// server-side.
const num = (s: string): number => (s.trim() === '' ? NaN : Number(s));

export function validateChallengeStagesClient(
  rows: ChallengeStageRow[],
): string[] {
  const errors: string[] = [];
  let prev = -1;
  rows.forEach((r, i) => {
    const stage = i + 1;
    const t = num(r.thresholdInput);
    if (!Number.isFinite(t) || t < 0) {
      errors.push(`Stage ${stage}: threshold must be ≥ 0.`);
    } else {
      if (i > 0 && !(t > prev))
        errors.push(`Stage ${stage}: threshold must exceed stage ${i}'s.`);
      prev = t;
    }
    const c = num(r.creditsInput);
    if (!Number.isFinite(c) || c < 0)
      errors.push(`Stage ${stage}: credits must be ≥ 0.`);
  });
  return errors;
}
