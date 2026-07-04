import { model } from '@medusajs/framework/utils';

// RewardDraw — one row per daily draw for a customer (spec §5.2).
// The partial-unique index UQ_reward_draw_customer_day_ordinal (hand-written,
// db:generate can't emit partial-expression indexes) is the daily-cap backstop
// under the credit: advisory lock. draw_day is a plain text YYYY-MM-DD —
// exact-equality key avoids ::date expression-index ambiguity.
export const RewardDraw = model
  .define('reward_draw', {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    tier: model.text(),
    // YYYY-MM-DD — the daily-window key. Both the cap COUNT and the idem key
    // (B6) key on this; no dateTime column needed.
    draw_day: model.text(),
    draw_ordinal: model.number(),
    prize_kind: model.enum(['product', 'credit', 'voucher', 'nothing']),
    // prize_snapshot holds {product_handle,title,image} | {amount_myr,currency} | {}
    prize_snapshot: model.json(),
    // Full computed odds table at draw time ({tier, computed:[{kind,weight,locked}...]}).
    // Audit-only: never returned by store routes — odds stay hidden from the frontend.
    odds_snapshot: model.json().nullable(),
    vault_pull_id: model.text().nullable(),
    credit_txn_id: model.text().nullable(),
    status: model.enum(['drawn', 'voided']).default('drawn'),
  })
  .indexes([
    // Fast daily-cap COUNT: COUNT WHERE customer_id AND draw_day = today
    {
      name: 'IDX_reward_draw_customer_day',
      on: ['customer_id', 'draw_day'],
      where: 'deleted_at IS NULL',
    },
  ]);

export default RewardDraw;
