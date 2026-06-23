import { MedusaError } from '@medusajs/framework/utils';

export type RewardsSettingsPatch = {
  commissionCooldownDays?: number;
  teamOverridePct?: number;
  overrideGenerationCap?: number;
};

export type RewardsSettingsView = {
  commissionCooldownDays: number;
  teamOverridePct: number;
  overrideGenerationCap: number;
};

const bad = (m: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, m);
};

// Validate an admin rewards-settings patch. The runtime strict-decay guard in
// teamOverrideSchedule remains the authoritative anti-runaway; this rejects the
// obviously-broken config before write: explode (>=1) / non-positive, fractional
// percent (effective_pct is INTEGER whole-percent), and bad cooldown/cap.
export function validateRewardsPatch(raw: unknown): RewardsSettingsPatch {
  if (!raw || typeof raw !== 'object') bad('Body must be an object.');
  const b = raw as Record<string, unknown>;
  const out: RewardsSettingsPatch = {};

  if (b.teamOverridePct !== undefined) {
    if (typeof b.teamOverridePct !== 'number')
      bad('teamOverridePct must be between 0 and 1 (exclusive).');
    const v = b.teamOverridePct as number;
    if (!Number.isFinite(v) || v <= 0 || v >= 1)
      bad('teamOverridePct must be between 0 and 1 (exclusive).');
    if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-9)
      bad('teamOverridePct must be a whole percent (e.g. 0.20, not 0.205).');
    out.teamOverridePct = v;
  }
  if (b.commissionCooldownDays !== undefined) {
    if (typeof b.commissionCooldownDays !== 'number')
      bad('commissionCooldownDays must be an integer >= 0.');
    const v = b.commissionCooldownDays as number;
    if (!Number.isSafeInteger(v) || v < 0)
      bad('commissionCooldownDays must be an integer >= 0.');
    out.commissionCooldownDays = v;
  }
  if (b.overrideGenerationCap !== undefined) {
    if (typeof b.overrideGenerationCap !== 'number')
      bad('overrideGenerationCap must be an integer >= 1.');
    const v = b.overrideGenerationCap as number;
    if (!Number.isSafeInteger(v) || v < 1)
      bad('overrideGenerationCap must be an integer >= 1.');
    out.overrideGenerationCap = v;
  }
  if (Object.keys(out).length === 0) bad('No valid settings to update.');
  return out;
}
