import { model } from '@medusajs/framework/utils';

// One row per VIP rung (1..100). Admin-editable config; seeded from
// src/scripts/vip-levels.data.ts (canonical Workbook1.xlsx ladder). spend_threshold is
// cumulative MYR to REACH this level (strictly increasing, 0 at L1, 3,000,000 at L100).
// direct_referral_pct is the by-this-level direct referral rate (1..5, percent) — read
// later by the commission engine; carried now so the seed is the single source of truth.
export const VipLevel = model
  .define('vip_level', {
    id: model.id().primaryKey(),
    level: model.number().unique(),
    spend_threshold: model.bigNumber(),
    voucher_amount: model.bigNumber(),
    box_tier: model.text(),
    frame_unlock: model.boolean().default(false),
    direct_referral_pct: model.number(),
    prizes: model.json().nullable(),
  })
  .indexes([
    {
      name: 'IDX_vip_level_level',
      on: ['level'],
      where: 'deleted_at IS NULL',
    },
  ]);

export default VipLevel;
