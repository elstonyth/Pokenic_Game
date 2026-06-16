import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import {
  adjustAmountError,
  adjustNoteError,
} from "../../modules/packs/credit-adjust";

export type AdjustCreditsInput = {
  customer_id: string;
  /** Raw body values — validated HERE so the rules live with the money logic. */
  amount: unknown;
  note: unknown;
};

export type AdjustCreditsResult = {
  /** USD applied (decimal, signed: positive grant, negative deduction). */
  amount: number;
  /** The customer's new credit balance (Σ ledger). */
  balance: number;
};

// adjust-credits — operator grant/refund/clawback from the support view: one
// signed ledger row (reason "adjustment", note in "reference"). The balance
// floor is $0 — a deduction larger than the current balance is refused before
// anything is written. Same accepted read-then-write race as the pack-open
// charge (see charge-pack-open.ts); a DB-level guard lands with real payments.
export const adjustCreditsStep = createStep(
  "adjust-credits",
  async (input: AdjustCreditsInput, { container }) => {
    const invalidAmount = adjustAmountError(input.amount);
    if (invalidAmount) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, invalidAmount);
    }
    const invalidNote = adjustNoteError(input.note);
    if (invalidNote) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, invalidNote);
    }
    const amount = input.amount as number;
    const note = (input.note as string).trim();

    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const before = await packs.creditBalance(input.customer_id);
    if (amount < 0 && before + amount < -1e-6) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Deduction exceeds the customer's balance ($${before.toFixed(2)}) — the balance cannot go below $0.`,
      );
    }

    const [txn] = await packs.createCreditTransactions([
      {
        customer_id: input.customer_id,
        amount,
        reason: "adjustment" as const,
        pull_id: null,
        reference: note,
      },
    ]);

    const balance = await packs.creditBalance(input.customer_id);

    const result: AdjustCreditsResult = { amount, balance };
    return new StepResponse(result, { creditTransactionId: txn.id });
  },
  async (data: { creditTransactionId: string } | undefined, { container }) => {
    if (!data) return;
    // The ledger row is the only mutation, so undo is a single delete.
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deleteCreditTransactions([data.creditTransactionId]);
  },
);

export default adjustCreditsStep;
