import { model } from '@medusajs/framework/utils';

// rewards_settings — singleton globals for the commission engine, admin-editable
// (forward-only; edits affect opens after the edit). One row; the service reads
// the first row and falls back to defaults when absent.
export const RewardsSettings = model.define('rewards_settings', {
  id: model.id().primaryKey(),
  // Days a commission stays locked before it matures to available. 3 in prod;
  // 0 for the internal demo so the recruit→sponsor→wallet loop completes live.
  commission_cooldown_days: model.number().default(3),
  // Team override rate (Phase 2b): each ancestor earns this fraction of the
  // generation below. Stored as a decimal (0.20 = 20%).
  team_override_pct: model.bigNumber().default(0.2),
  // Defensive anti-runaway cap on override generations (Phase 2b).
  override_generation_cap: model.number().default(100),
});

export default RewardsSettings;
