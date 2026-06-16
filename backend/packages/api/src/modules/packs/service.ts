import { MedusaService, MedusaError } from "@medusajs/framework/utils";
import Pack from "./models/pack";
import Card from "./models/card";
import PackOdds from "./models/pack-odds";
import Pull from "./models/pull";
import CreditTransaction from "./models/credit-transaction";
import {
  resolveBuybackRate,
  buybackAmount,
  instantDeadlineMs,
  type BuybackRate,
} from "./buyback-rate";
import {
  EMPTY_TOTALS,
  foldLedgerRow,
  totalsToUsd,
  type LedgerTotals,
} from "./credit-summary";

// Auto-generates CRUD for each model: list/retrieve/create/update/delete<Model>s
// (e.g. listPacks, listCards, listPackOdds, createPulls,
// listCreditTransactions). Card = prize metadata, PackOdds = the weighted
// table (+ per-pack rarity), Pull = the result ledger doubling as the vault,
// CreditTransaction = the site-credit ledger written by buybacks.

const BALANCE_PAGE = 1000;

class PacksModuleService extends MedusaService({
  Pack,
  Card,
  PackOdds,
  Pull,
  CreditTransaction,
}) {
  // The instant/flat sell-back offer for a pull, composed from the SAME pure
  // helpers the buyback workflow credits with — so the reveal quote, the vault
  // quote, and the credit can never disagree. Removes the listPacks +
  // resolveBuybackRate re-query the open route did inline.
  async quoteBuyback(
    packSlug: string,
    pull: { rolled_at: Date | string; revealed_at?: Date | string | null },
    marketValue: number,
    nowMs: number = Date.now()
  ): Promise<{ percent: number; amount: number; rate_type: BuybackRate["rate_type"] }> {
    const [pack] = await this.listPacks({ slug: packSlug }, { take: 1 });
    const { percent, rate_type } = resolveBuybackRate(pack, pull, nowMs);
    return { percent, amount: buybackAmount(marketValue, percent), rate_type };
  }

  // Lifetime ledger totals (balance + money-in/out), paged so the result is
  // exact at any ledger size. Reuses the pure fold so the arithmetic is
  // unit-tested. balance == Σ(amount); topupTotal == Σ top-ups; spendTotal == Σ
  // |negatives|.
  async creditSummary(customerId: string): Promise<{
    balance: number;
    topupTotal: number;
    spendTotal: number;
  }> {
    let totals: LedgerTotals = EMPTY_TOTALS;
    for (let skip = 0; ; skip += BALANCE_PAGE) {
      const page = await this.listCreditTransactions(
        { customer_id: customerId },
        { skip, take: BALANCE_PAGE, order: { created_at: "ASC" } }
      );
      for (const t of page) {
        totals = foldLedgerRow(totals, {
          amount: Number(t.amount),
          reason: t.reason,
        });
      }
      if (page.length < BALANCE_PAGE) break;
    }
    return totalsToUsd(totals);
  }

  // Customer credit balance = Σ(amount) over the append-only ledger. Kept as a
  // thin delegate so existing callers (pack detail affordability, etc.) are
  // unchanged.
  async creditBalance(customerId: string): Promise<number> {
    return (await this.creditSummary(customerId)).balance;
  }

  // Stamp the first-seen time for a pull so the 30s instant window counts from
  // the reveal, not the pull. Idempotent: only the first call writes revealed_at;
  // later calls return the same deadline. Ownership enforced (a foreign/unknown
  // pull 404s — same error, no existence leak). The grace cap in instantDeadlineMs
  // means a late first call can't extend the window.
  async revealPull(
    pullId: string,
    customerId: string,
    nowMs: number = Date.now()
  ): Promise<{ instant_deadline_ms: number }> {
    const [pull] = await this.listPulls({ id: pullId }, { take: 1 });
    if (!pull || pull.customer_id !== customerId) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pull '${pullId}' not found.`
      );
    }
    if (pull.revealed_at == null) {
      // First-write-wins under concurrent reveals: the FILTERED update only
      // stamps while revealed_at IS NULL (atomic at the DB), so racing calls
      // can't shift the anchor. Re-read to return whichever value persisted.
      await this.updatePulls({
        selector: { id: pull.id, revealed_at: null },
        data: { revealed_at: new Date(nowMs) },
      });
      const [fresh] = await this.listPulls({ id: pull.id }, { take: 1 });
      return {
        instant_deadline_ms: instantDeadlineMs(
          fresh.rolled_at,
          fresh.revealed_at,
        ),
      };
    }
    return {
      instant_deadline_ms: instantDeadlineMs(
        pull.rolled_at,
        pull.revealed_at,
      ),
    };
  }
}

export default PacksModuleService;
