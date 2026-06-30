import {
  validateRewardPool,
  MAX_REWARD_CREDIT_MYR,
} from '../reward-pool-validate';

// Batch A item 3 — the admin reward-pool authoring validator must cap a credit
// prize's credit_amount. Without the ceiling, settleRewardDraw would pay an
// unbounded numeric straight to the ledger (a fat-fingered RM10,000,000 prize).
// Pure validator → unit-testable without a container.

const baseBody = (entries: unknown[]) => ({
  entries,
  draws_per_day: 1,
  pool_enabled: true,
});

describe('validateRewardPool — credit_amount ceiling', () => {
  test('accepts a credit entry exactly at the cap', () => {
    const out = validateRewardPool(
      baseBody([
        { kind: 'credit', credit_amount: MAX_REWARD_CREDIT_MYR, weight: 1 },
      ]),
    );
    expect(out.entries[0]?.credit_amount).toBe(MAX_REWARD_CREDIT_MYR);
  });

  test('rejects a credit entry above the cap', () => {
    expect(() =>
      validateRewardPool(
        baseBody([
          {
            kind: 'credit',
            credit_amount: MAX_REWARD_CREDIT_MYR + 1,
            weight: 1,
          },
        ]),
      ),
    ).toThrow(/at most/i);
    // The documented fat-finger: a 7-figure prize must not slip through.
    expect(() =>
      validateRewardPool(
        baseBody([{ kind: 'credit', credit_amount: 1_000_000, weight: 1 }]),
      ),
    ).toThrow(/at most/i);
  });

  test('still rejects a non-positive credit_amount (existing lower bound)', () => {
    expect(() =>
      validateRewardPool(
        baseBody([{ kind: 'credit', credit_amount: 0, weight: 1 }]),
      ),
    ).toThrow(/> 0/);
  });

  test('does not cap product or nothing entries', () => {
    const out = validateRewardPool(
      baseBody([
        { kind: 'product', product_handle: 'p-x', weight: 1 },
        { kind: 'nothing', weight: 1 },
      ]),
    );
    expect(out.entries).toHaveLength(2);
  });
});
