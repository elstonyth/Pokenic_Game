import {
  validateChallengeStages,
  validateChallengeSettingsPatch,
} from '../challenge-validate';

const stage = (over: Partial<Record<string, unknown>> = {}) => ({
  stage_number: 1,
  threshold_myr: 100,
  reward_credits: 10,
  reward_card_ids: [],
  ...over,
});

describe('validateChallengeStages', () => {
  it('accepts an empty stage list (challenge disabled)', () => {
    expect(validateChallengeStages({ stages: [] })).toEqual([]);
  });

  it('accepts contiguous stages with increasing thresholds', () => {
    const out = validateChallengeStages({
      stages: [
        stage(),
        stage({ stage_number: 2, threshold_myr: 200, reward_card_ids: ['card_1'] }),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[1].reward_card_ids).toEqual(['card_1']);
  });

  it('rejects a stage-number gap', () => {
    expect(() =>
      validateChallengeStages({ stages: [stage(), stage({ stage_number: 3, threshold_myr: 200 })] }),
    ).toThrow(/must be 2 \(contiguous/);
  });

  it('rejects non-increasing thresholds', () => {
    expect(() =>
      validateChallengeStages({ stages: [stage(), stage({ stage_number: 2, threshold_myr: 100 })] }),
    ).toThrow(/must exceed stage 1's/);
  });

  it('rejects negative reward_credits', () => {
    expect(() => validateChallengeStages({ stages: [stage({ reward_credits: -1 })] })).toThrow(
      /reward_credits must be >= 0/,
    );
  });

  it('rejects a malformed reward_card_ids array', () => {
    expect(() => validateChallengeStages({ stages: [stage({ reward_card_ids: [1] })] })).toThrow(
      /card id strings/,
    );
    expect(() => validateChallengeStages({ stages: [stage({ reward_card_ids: 'x' })] })).toThrow(
      /must be an array/,
    );
  });
});

describe('validateChallengeSettingsPatch', () => {
  it('accepts a partial patch of valid fields', () => {
    const out = validateChallengeSettingsPatch({
      patch: { timezone: 'Asia/Kuala_Lumpur', reset_day: 1, reset_hour: 0, payout_credits: 50 },
    });
    expect(out).toEqual({
      timezone: 'Asia/Kuala_Lumpur',
      reset_day: 1,
      reset_hour: 0,
      payout_credits: 50,
    });
  });

  it('rejects an invalid cadence', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { cadence: 'rolling' } })).toThrow(
      /cadence must be 'fixed_weekly'/,
    );
  });

  it('rejects a bad timezone', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { timezone: 'Mars/Olympus' } })).toThrow(
      /valid IANA time zone/,
    );
  });

  it('rejects out-of-range reset_day / reset_hour', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { reset_day: 7 } })).toThrow(
      /reset_day must be an integer 0.6/,
    );
    expect(() => validateChallengeSettingsPatch({ patch: { reset_hour: 24 } })).toThrow(
      /reset_hour must be an integer 0.23/,
    );
  });

  it('rejects negative payout_credits and an empty patch', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { payout_credits: -1 } })).toThrow(
      /payout_credits must be >= 0/,
    );
    expect(() => validateChallengeSettingsPatch({ patch: {} })).toThrow(
      /No valid settings/,
    );
  });
});
