import { model } from '@medusajs/framework/utils';

// challenge_settings — singleton (same pattern as site_settings: one row,
// create-on-first-edit, fixed id 'global' with a DB CHECK). Fixed-weekly
// cadence anchored at (timezone, reset_day, reset_hour); flat top-10 payout.
export const ChallengeSettings = model.define('challenge_settings', {
  id: model.id().primaryKey(),
  cadence: model.text().default('fixed_weekly'),
  timezone: model.text().default('Asia/Kuala_Lumpur'),
  reset_day: model.number().default(1),
  reset_hour: model.number().default(0),
  payout_credits: model.bigNumber().default(0),
  payout_card_ids: model.json(),
});

export default ChallengeSettings;
