import { model } from '@medusajs/framework/utils';

// One earned reward per (customer, level, kind) — spec §5b. Unique index is the
// LADDER idempotency backstop (origin = 'ladder'); the high-water mark drives
// the happy path. Box-won grants (origin = 'box') are repeatable per
// (customer, level, kind) — a customer can win the same kind from a box more
// than once, so they fall outside this index by design. Grants are advisory +
// non-fungible until the gated fulfillment phase (§13).
export const VipRewardGrant = model
  .define('vip_reward_grant', {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    level: model.number(),
    kind: model.enum(['voucher', 'frame', 'box', 'prize']),
    payload: model.json(),
    status: model.enum(['granted', 'fulfilled', 'revoked']).default('granted'),
    source_open_id: model.text().nullable(),
    origin: model.enum(['ladder', 'box']).default('ladder'),
  })
  .indexes([
    {
      name: 'UQ_vip_reward_grant_customer_level_kind',
      on: ['customer_id', 'level', 'kind'],
      unique: true,
      where: "deleted_at IS NULL AND origin = 'ladder'",
    },
    {
      name: 'IDX_vip_reward_grant_customer',
      on: ['customer_id'],
      where: 'deleted_at IS NULL',
    },
  ]);
export default VipRewardGrant;
