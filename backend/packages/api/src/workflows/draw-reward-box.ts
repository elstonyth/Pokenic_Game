import {
  createWorkflow,
  WorkflowResponse,
  transform,
} from "@medusajs/framework/workflows-sdk";
import { settleRewardDrawStep } from "./steps/settle-reward-draw";
import { adjustRewardInventoryStep } from "./steps/adjust-reward-inventory";

export type DrawRewardBoxInput = {
  customer_id: string; // from the authenticated token — NEVER the request body
};

// draw-reward-box — the "open today's reward box" business process.
//
//   settle (locked: tier resolve → cap COUNT → drawPrize → payout → reward_draw)
//     → adjust inventory (best-effort, post-commit, product prizes only)
//
// The settle step is the durable commit point (the whole daily-capped draw is one
// transaction under the per-customer credit: lock). The inventory earmark runs
// AFTER it commits — never inside the lock (§8) — and is best-effort + self-
// compensating, so a slow/failing inventory call can never undo a won prize.
// credit/nothing prizes carry no product_handle, so the adjust step no-ops.
export const drawRewardBoxWorkflow = createWorkflow(
  "draw-reward-box",
  function (input: DrawRewardBoxInput) {
    const result = settleRewardDrawStep(input);

    // Derive the inventory-earmark handle: only a 'product' prize carries one.
    const inventoryInput = transform({ result }, (d) => ({
      product_handle:
        d.result.prize?.kind === "product"
          ? d.result.prize.product_handle
          : null,
    }));
    adjustRewardInventoryStep(inventoryInput);

    return new WorkflowResponse(result);
  }
);

export default drawRewardBoxWorkflow;
