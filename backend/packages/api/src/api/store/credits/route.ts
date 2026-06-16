import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import PacksModuleService from "../../../modules/packs/service";
import { PACKS_MODULE } from "../../../modules/packs";

// GET /store/credits — the authenticated customer's site-credit balance
// (paged Σ over the append-only ledger — exact at any size) plus their most
// recent transactions. Spending credit on packs lands with the payment phase;
// until then the balance only grows via buybacks.
const RECENT_TRANSACTIONS = 50;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerId = req.auth_context.actor_id;

  const [balance, transactions] = await Promise.all([
    packs.creditBalance(customerId),
    packs.listCreditTransactions(
      { customer_id: customerId },
      { order: { created_at: "DESC" }, take: RECENT_TRANSACTIONS }
    ),
  ]);

  res.json({
    balance,
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      reason: t.reason,
      pull_id: t.pull_id,
      created_at: t.created_at,
    })),
  });
}
