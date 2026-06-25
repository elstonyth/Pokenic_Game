import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { findCardInventoryTarget } from "../../modules/packs/card-stock";

export type AdjustRewardInventoryInput = {
  // The won product handle for a 'product' prize; null/empty for credit/nothing.
  product_handle: string | null;
};

type CompensateData =
  | { inventoryItemId: string; locationId: string }
  | undefined;

// adjust-reward-inventory — best-effort earmark of one physical unit for a reward
// product prize. Runs in the workflow AFTER settleRewardDraw COMMITS (never inside
// the credit: lock — §8), so the draw is already durable and a slow/failing
// inventory call can never roll the prize back. Same counter-not-gate semantics as
// decrement-card-stock: untracked / 0-stock / lookup errors all resolve to
// "nothing adjusted" with at most a warning. credit/nothing prizes pass through
// (no handle) as a no-op.
export const adjustRewardInventoryStep = createStep(
  "adjust-reward-inventory",
  async (input: AdjustRewardInventoryInput, { container }) => {
    const handle = input.product_handle;
    let compensate: CompensateData;
    let adjusted = false;
    if (!handle) return new StepResponse({ adjusted }, compensate);

    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    try {
      const target = await findCardInventoryTarget(container, handle);
      if (target && target.stocked > 0) {
        const inventoryModule = container.resolve(Modules.INVENTORY);
        await inventoryModule.adjustInventory(
          target.inventoryItemId,
          target.locationId,
          -1
        );
        adjusted = true;
        compensate = {
          inventoryItemId: target.inventoryItemId,
          locationId: target.locationId,
        };
      }
    } catch (error) {
      logger.warn(
        `adjust-reward-inventory: could not adjust stock for '${handle}' — draw stands. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return new StepResponse({ adjusted }, compensate);
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const inventoryModule = container.resolve(Modules.INVENTORY);
    await inventoryModule.adjustInventory(
      data.inventoryItemId,
      data.locationId,
      1
    );
  }
);

export default adjustRewardInventoryStep;
