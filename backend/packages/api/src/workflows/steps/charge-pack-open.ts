import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import { creditBalance } from "../../modules/packs/credit-balance";
import { hasEnoughCredit } from "../../modules/packs/pack-open-charge";

export type ChargePackOpenInput = {
  pack_id: string; // = Pack.slug
  customer_id: string; // from the authenticated token — NEVER the request body
};

export type ChargePackOpenResult = {
  /** USD debited (decimal, never cents) — the pack price. */
  price: number;
  /** The customer's balance AFTER the charge (Σ ledger). */
  balance: number;
};

type CompensateData = { creditTransactionId: string } | undefined;

// charge-pack-open — the PAYMENT SEAM made real (Task A2): debit the pack
// price from the credit ledger before the pull is recorded, so a failed
// charge aborts the open and a failure later in the chain deletes the charge
// row via compensation — no unpaid Pull, no paid non-Pull.
//
// RACE NOTE: balance check + ledger insert is read-then-write — two opens
// racing on the same balance can both pass the check and overspend (a
// negative balance, not free goods: the rows still record both debits).
// Accepted for the mock-money first pass (mirrors the stock-counter
// decision); a DB-level guard (SELECT ... FOR UPDATE, or a CHECK on the
// running balance) lands with the real gateway.
export const chargePackOpenStep = createStep(
  "charge-pack-open",
  async (input: ChargePackOpenInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    // rollPackStep already validated the pack exists and is active; this
    // re-read only fetches the price (steps stay independently safe).
    const [pack] = await packs.listPacks({ slug: input.pack_id }, { take: 1 });
    if (!pack) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pack '${input.pack_id}' is not available.`,
      );
    }
    // A charge must never be computed from a corrupt price — refuse rather
    // than debit NaN (the column is numeric NOT NULL; this only fires on real
    // data corruption).
    const price = Number(pack.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This pack has no valid price and cannot be opened.",
      );
    }

    const balance = await creditBalance(packs, input.customer_id);
    if (!hasEnoughCredit(balance, price)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Not enough credits to open this pack.",
      );
    }

    // A free pack debits nothing — skip the pointless -0 ledger row.
    if (price === 0) {
      return new StepResponse(
        { price, balance } satisfies ChargePackOpenResult,
        undefined as CompensateData,
      );
    }

    const [txn] = await packs.createCreditTransactions([
      {
        customer_id: input.customer_id,
        amount: -price,
        reason: "pack_open" as const,
        pull_id: null,
        reference: null,
      },
    ]);

    // New balance = paged Σ ledger (append-only; exact at any ledger size).
    const newBalance = await creditBalance(packs, input.customer_id);

    return new StepResponse(
      { price, balance: newBalance } satisfies ChargePackOpenResult,
      { creditTransactionId: txn.id } satisfies CompensateData,
    );
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    // The charge row is the only mutation — undo is a single delete (a failed
    // recordPull/later step refunds the customer exactly).
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deleteCreditTransactions([data.creditTransactionId]);
  },
);

export default chargePackOpenStep;
