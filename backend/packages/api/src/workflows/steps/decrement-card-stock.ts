import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { findCardInventoryTarget } from "../../modules/packs/card-stock";

export type DecrementCardStockInput = {
  card_id: string; // = Card.handle (=== Product.handle)
};

// What was adjusted, so compensation can put the unit back.
type CompensateData =
  | { inventoryItemId: string; locationId: string }
  | undefined;

// decrement-card-stock — earmark one physical unit for the pull that just won
// this card. STOCK IS A COUNTER, NOT A GATE: pulls must NEVER fail because of
// inventory (a 0-stock pull is simply buyback-only fulfillment), so this step
// is best-effort — untracked products, empty stock, and even lookup errors all
// resolve to "nothing adjusted" with at most a warning. When the buyback flow
// lands, a customer choosing buyback re-credits the unit (+1).
//
// Known small race: stock is read then adjusted (two calls), so two concurrent
// pulls of the same near-empty card can both decrement. Worst case the counter
// floors a unit early/late by one — acceptable for an operator-facing counter.
export const decrementCardStockStep = createStep(
  "decrement-card-stock",
  async (input: DecrementCardStockInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    let compensate: CompensateData;
    let adjusted = false;

    try {
      const target = await findCardInventoryTarget(container, input.card_id);
      // Untracked (null) or already at 0 — nothing to earmark; the pull is
      // fulfilled via buyback if the customer wants no/own physical card.
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
        `decrement-card-stock: could not adjust stock for '${input.card_id}' — pull continues (buyback-only). ${
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

export default decrementCardStockStep;
