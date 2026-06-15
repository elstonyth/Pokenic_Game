import { MedusaService } from "@medusajs/framework/utils";
import Pack from "./models/pack";
import Card from "./models/card";
import PackOdds from "./models/pack-odds";
import Pull from "./models/pull";
import CreditTransaction from "./models/credit-transaction";

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
  // Customer credit balance = Σ(amount) over the append-only ledger, paged so
  // the result is exact at any ledger size. Integer-cent sum avoids float drift.
  async creditBalance(customerId: string): Promise<number> {
    // Sum in INTEGER CENTS: amounts are 2dp decimals, so per-row conversion is
    // exact and the running total can never accumulate float drift the way a
    // running decimal sum can over a long ledger.
    let cents = 0;
    for (let skip = 0; ; skip += BALANCE_PAGE) {
      const page = await this.listCreditTransactions(
        { customer_id: customerId },
        { skip, take: BALANCE_PAGE, order: { created_at: "ASC" } }
      );
      for (const t of page) cents += Math.round(Number(t.amount) * 100);
      if (page.length < BALANCE_PAGE) break;
    }
    return cents / 100;
  }
}

export default PacksModuleService;
