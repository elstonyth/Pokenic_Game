import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { ledgerTotals, packTheoreticalRtp } from '../../../modules/packs/economy';
import { pageAll } from '../../utils/page-all';
import { toMoney } from '../../../modules/packs/money';
import {
  resolveFxRate,
  displayMarketPrice,
} from '../../../modules/packs/pricing';

// GET /admin/economy — the operator's money report: lifetime ledger totals
// (revenue / payouts / top-ups / adjustments / net), the outstanding vault
// liability (FMV of every vaulted pull), and a per-active-pack theoretical
// RTP table from the CURRENT odds × FMVs. Reads only; pure math lives in
// modules/packs/economy.ts.
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);

  // Lifetime ledger totals — one GROUP BY in SQL instead of paging the whole
  // ledger to Node (audit 2026-07-07 #5b). Synthetic per-reason rows keep
  // feeding the same unit-tested ledgerTotals fold (incl. its loud throw on an
  // unrecognized reason).
  const totals = ledgerTotals(await packs.ledgerReasonTotals());

  // Vault liability: FMV of every card customers still hold, summed in SQL
  // (audit 2026-07-07 #5b) instead of paging every vaulted pull into Node.
  const allCards = await pageAll((opts) => packs.listCards({}, opts));
  const fx = await resolveFxRate(packs);
  // Card FMV is stored in USD; the economy report shows MYR at the live FX rate
  // (multiplier 1 — markup lives on the sale price, not the FMV). Converting here
  // makes liability, EV, and RTP all MYR, so RTP compares like-for-like (MYR EV
  // ÷ MYR pack price) instead of the prior USD-FMV-vs-MYR-price mix.
  const valueByHandle = new Map(
    allCards.map((c) => [
      c.handle,
      displayMarketPrice(toMoney(c.market_value), fx, 1),
    ]),
  );
  const { count: liabilityCount, liability } =
    await packs.vaultLiabilityMyr(fx);

  // Outstanding voucher liability: sum of amount_myr across GRANTED, unfulfilled
  // voucher reward grants. Off-ledger obligation the economy report must surface.
  const outstanding_voucher_liability_myr =
    await packs.outstandingVoucherLiabilityMyr();

  // Per-pack theoretical RTP from current odds (active packs only — drafts
  // aren't sellable, so their RTP is operator-noise).
  const allPacks = await pageAll((opts) =>
    packs.listPacks({ status: 'active' }, opts),
  );
  const allOdds = await pageAll((opts) => packs.listPackOdds({}, opts));
  const oddsByPack = new Map<
    string,
    { weight: number; market_value: number }[]
  >();
  for (const o of allOdds) {
    if (o.card_id == null) continue; // reward row — not a card, no FMV
    const value = valueByHandle.get(o.card_id);
    if (value === undefined) continue; // orphaned odds row
    const list = oddsByPack.get(o.pack_id) ?? [];
    list.push({ weight: o.weight, market_value: value });
    oddsByPack.set(o.pack_id, list);
  }
  const packRows = allPacks
    .map((p) => {
      const rtp = packTheoreticalRtp(
        oddsByPack.get(p.slug) ?? [],
        toMoney(p.price),
      );
      return {
        slug: p.slug,
        title: p.title,
        category: p.category,
        price: toMoney(p.price),
        ev: rtp?.ev ?? null,
        rtp_pct: rtp?.rtp_pct ?? null,
      };
    })
    .sort((a, b) => (b.rtp_pct ?? -1) - (a.rtp_pct ?? -1));

  res.json({
    totals,
    liability: { count: liabilityCount, market_value: liability },
    outstanding_voucher_liability_myr,
    packs: packRows,
  });
}
