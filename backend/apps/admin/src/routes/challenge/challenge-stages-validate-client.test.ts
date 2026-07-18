import { describe, expect, test } from 'vitest';
import {
  validateChallengeStagesClient,
  type ChallengeStageRow,
} from './challenge-stages-validate-client';

const row = (over: Partial<ChallengeStageRow> = {}): ChallengeStageRow => ({
  thresholdInput: '0',
  creditsInput: '0',
  ...over,
});

describe('validateChallengeStagesClient', () => {
  test('accepts an empty list (challenge off)', () => {
    expect(validateChallengeStagesClient([])).toEqual([]);
  });

  test('accepts strictly increasing thresholds', () => {
    expect(
      validateChallengeStagesClient([
        row(),
        row({ thresholdInput: '100', creditsInput: '5' }),
      ]),
    ).toEqual([]);
  });

  test('flags a non-increasing threshold', () => {
    const errs = validateChallengeStagesClient([
      row({ thresholdInput: '100' }),
      row({ thresholdInput: '100' }),
    ]);
    expect(errs.some((e) => /Stage 2: threshold must exceed/.test(e))).toBe(
      true,
    );
  });

  test('flags negative threshold / credits', () => {
    const errs = validateChallengeStagesClient([
      row({ thresholdInput: '-1', creditsInput: '-2' }),
    ]);
    expect(errs.some((e) => /Stage 1: threshold/.test(e))).toBe(true);
    expect(errs.some((e) => /Stage 1: credits/.test(e))).toBe(true);
  });

  test('flags blank inputs instead of coercing them to 0', () => {
    const errs = validateChallengeStagesClient([
      row(),
      row({ thresholdInput: '', creditsInput: ' ' }),
    ]);
    expect(errs.some((e) => /Stage 2: threshold/.test(e))).toBe(true);
    expect(errs.some((e) => /Stage 2: credits/.test(e))).toBe(true);
  });

  test('flags non-numeric input', () => {
    const errs = validateChallengeStagesClient([
      row({ thresholdInput: 'abc' }),
    ]);
    expect(errs.some((e) => /Stage 1: threshold/.test(e))).toBe(true);
  });

  test('a bad threshold does not also trip the monotonic check on the next row', () => {
    const errs = validateChallengeStagesClient([
      row({ thresholdInput: '50' }),
      row({ thresholdInput: '' }),
      row({ thresholdInput: '60' }),
    ]);
    expect(errs).toEqual(['Stage 2: threshold must be ≥ 0.']);
  });
});
