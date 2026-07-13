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

  // creditSummary already scans the full ledger; thread its scalars into
  // walletSummary so the wallet view reuses that one scan instead of issuing a
  // second identical SUM (balance/deposited/used are a strict subset). This
  // serializes walletSummary after creditSummary — intended; it still runs its
  // own lockedCommission/nextUnlock/isFrozen queries.
  const [summary, transactions] = await Promise.all([
    packs.creditSummary(customerId),
    packs.listCreditTransactions(
      { customer_id: customerId },
      { order: { created_at: "DESC" }, take: RECENT_TRANSACTIONS }
    ),
  ]);
  const wallet = await packs.walletSummary(customerId, {
    balance: summary.balance,
    depositedCents: Math.round(summary.depositedPlaythroughTotal * 100),
    usedCents: Math.round(summary.externalFundedSpendTotal * 100),
  });

  res.json({
    balance: summary.balance,
    topup_total: summary.topupTotal,
    spend_total: summary.spendTotal,
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      reason: t.reason,
      pull_id: t.pull_id,
      created_at: t.created_at,
    })),
    wallet: {
      balance: wallet.balance,
      available: wallet.available,
      locked: wallet.locked,
      is_frozen: wallet.isFrozen,
      next_unlock: wallet.nextUnlock
        ? { amount: wallet.nextUnlock.amount, date: wallet.nextUnlock.date }
        : null,
      // Playthrough gate (withdrawable.ts): deposits must be fully spent on
      // pack opens before balance can be withdrawn. withdrawable = 0 while
      // playthrough.remaining > 0; spending on packs is never restricted.
      withdrawable: wallet.withdrawable,
      playthrough: {
        deposited: wallet.playthrough.deposited,
        used: wallet.playthrough.used,
        remaining: wallet.playthrough.remaining,
      },
    },
  });
}
