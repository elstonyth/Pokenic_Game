import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../modules/packs';
import type PacksModuleService from '../../modules/packs/service';

export type ChargePackBatchInput = {
  pack_id: string;
  customer_id: string;
  count: number;
  open_id: string; // one per batch — the single charge row's open id
};

export type ChargePackBatchResult = {
  /** USD price per pack (decimal, never cents). */
  price: number;
  /** Total debited = price × count. */
  total: number;
  /** Customer balance AFTER the charge. */
  balance: number;
};

// open_id is the authoritative key for compensation: reverseOpen(open_id) cascades
// the debit + every commission. (The debit row id is not needed here.)
type CompensateData = { open_id: string } | undefined;

export const chargePackBatchStep = createStep<
  ChargePackBatchInput,
  ChargePackBatchResult,
  CompensateData
>(
  'charge-pack-batch',
  async (input: ChargePackBatchInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const [pack] = await packs.listPacks({ slug: input.pack_id }, { take: 1 });
    if (!pack) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pack '${input.pack_id}' is not available.`,
      );
    }
    const price = Number(pack.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        'This pack has no valid price and cannot be opened.',
      );
    }
    const total = price * input.count;
    if (total === 0) {
      const balance = await packs.creditBalance(input.customer_id);
      return new StepResponse(
        { price, total, balance } satisfies ChargePackBatchResult,
        undefined as CompensateData,
      );
    }
    const { balance } = await packs.settleOpen({
      customerId: input.customer_id, amount: -total, sourceTransactionId: input.open_id,
    });
    return new StepResponse(
      { price, total, balance } satisfies ChargePackBatchResult,
      { open_id: input.open_id } satisfies CompensateData,
    );
  },
  async (data: CompensateData, { container }) => {
    if (!data) return; // free-batch wrote no debit -> nothing to reverse
    // The batch open is append-only: undo it with cascading compensating rows,
    // NOT a delete. reverseOpen reverses the recruit's debit AND claws back
    // every commission (direct + override) paid for this open_id, so a failure
    // after settleOpen committed can never leave the recruit refunded but
    // sponsors overpaid (Phase 2b go-live blocker).
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.reverseOpen(data.open_id);
  },
);

export default chargePackBatchStep;
