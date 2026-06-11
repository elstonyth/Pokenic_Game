import type PacksModuleService from "./service";

// Customer credit balance = Σ(amount) over the append-only ledger, paged so the
// result is exact at ANY ledger size (a single capped list call would silently
// truncate past its take and under-report a money value). Stable order keeps
// pages consistent while new rows append.
const PAGE = 1000;

export async function creditBalance(
  packs: PacksModuleService,
  customerId: string
): Promise<number> {
  // Sum in INTEGER CENTS: amounts are 2dp decimals, so per-row conversion is
  // exact and the running total can never accumulate float drift the way a
  // running decimal sum can over a long ledger.
  let cents = 0;
  for (let skip = 0; ; skip += PAGE) {
    const page = await packs.listCreditTransactions(
      { customer_id: customerId },
      { skip, take: PAGE, order: { created_at: "ASC" } }
    );
    for (const t of page) cents += Math.round(Number(t.amount) * 100);
    if (page.length < PAGE) break;
  }
  return cents / 100;
}
