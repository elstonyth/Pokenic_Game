import { model } from "@medusajs/framework/utils";

// CreditTransaction — the customer's site-credit ledger. Balance = Σ(amount)
// per customer (append-only; no mutable balance column to drift). Today the
// only writer is the buyback workflow (+credit); the future payment phase adds
// negative rows when credit is spent on packs.
export const CreditTransaction = model.define("credit_transaction", {
  id: model.id().primaryKey(),
  customer_id: model.text(),
  // USD decimal (never cents). Positive = credit, negative = spend.
  amount: model.bigNumber(),
  reason: model.enum(["buyback"]),
  // The pull this credit came from. UNIQUE — the DB itself guarantees a pull
  // can never be credited twice, whatever races the API layer loses.
  pull_id: model.text().unique(),
});

export default CreditTransaction;
