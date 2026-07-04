import { model } from '@medusajs/framework/utils';

// One row per VIP box tier (vip_level.box_tier values: a–j, Z). Seeded disabled;
// admin authors prizes then enables. draws_per_day caps reward_draw rows per UTC day.
export const RewardBox = model
  .define('reward_box', {
    id: model.id().primaryKey(),
    tier: model.text().unique(),
    name: model.text().default(''),
    enabled: model.boolean().default(false),
    draws_per_day: model.number().default(1),
  })
  .indexes([
    { name: 'IDX_reward_box_tier', on: ['tier'], where: 'deleted_at IS NULL' },
  ]);
export default RewardBox;
