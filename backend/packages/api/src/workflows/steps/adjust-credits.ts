import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../modules/packs';
import type PacksModuleService from '../../modules/packs/service';
import {
  adjustAmountError,
  adjustNoteError,
} from '../../modules/packs/credit-adjust';

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
// anything is written. The check + write go through packs.mutateCreditAtomic,
// which serializes per-customer credit mutations under an advisory lock so a
// deduct racing another deduct or a pack-open can't breach the floor (#4).
export const adjustCreditsStep = createStep(
  'adjust-credits',
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

    // Serialized write: the $0-floor check + ledger insert happen under the same
    // per-customer lock as a pack-open, so two deducts (or a deduct racing an
    // open) can't both pass the floor and push the balance negative (#4).
    const { id, balance } = await packs.mutateCreditAtomic({
      customerId: input.customer_id,
      amount,
      reason: 'adjustment',
      reference: note,
      floor: 0,
    });

    const result: AdjustCreditsResult = { amount, balance };
    return new StepResponse(result, { creditTransactionId: id });
  },
  async (data: { creditTransactionId: string } | undefined, { container }) => {
    if (!data) return;
    // The ledger row is the only mutation, so undo is a single delete.
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deleteCreditTransactions([data.creditTransactionId]);
  },
);

export default adjustCreditsStep;
