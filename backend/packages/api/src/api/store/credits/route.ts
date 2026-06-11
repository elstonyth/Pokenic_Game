import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import PacksModuleService from "../../../modules/packs/service";
import { PACKS_MODULE } from "../../../modules/packs";

// GET /store/credits — the authenticated customer's site-credit balance
// (Σ over the append-only ledger) plus their most recent transactions.
// Spending credit on packs lands with the payment phase; until then the
// balance only grows via buybacks.
const RECENT_TRANSACTIONS = 50;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerId = req.auth_context.actor_id;

  const transactions = await packs.listCreditTransactions(
    { customer_id: customerId },
    { order: { created_at: "DESC" }, take: 10000 }
  );

  const balance = round2(
    transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  );

  res.json({
    balance,
    transactions: transactions.slice(0, RECENT_TRANSACTIONS).map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      reason: t.reason,
      pull_id: t.pull_id,
      created_at: t.created_at,
    })),
  });
}
