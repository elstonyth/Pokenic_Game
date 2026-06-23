import { model } from '@medusajs/framework/utils';

// customer_account_state — per-customer freeze flag (Phase 3a). One row per
// customer (lazy-created on first freeze). `frozen ⇒ availableBalance()=0`
// inside the money lock. `cause` distinguishes an auto (clawback-negative,
// auto-clears on repayment) freeze from a manual (admin, sticky) one.
export const CustomerAccountState = model
  .define('customer_account_state', {
    id: model.id().primaryKey(),
    customer_id: model.text().unique(), // one row per customer
    frozen: model.boolean().default(false),
    cause: model.enum(['auto', 'manual']).nullable(),
    frozen_reason: model.text().nullable(),
    frozen_by: model.text().nullable(), // admin_id; null for auto
    frozen_at: model.dateTime().nullable(),
    unfrozen_at: model.dateTime().nullable(),
    unfreeze_cause: model.enum(['repaid', 'admin']).nullable(),
  })
  .indexes([
    {
      name: 'IDX_customer_account_state_frozen',
      on: ['customer_id'],
      where: "frozen = true AND deleted_at IS NULL",
    },
  ]);

export default CustomerAccountState;
