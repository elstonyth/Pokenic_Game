import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";

export type SettleRewardDrawInput = {
  customer_id: string; // from the authenticated token — NEVER the request body
};

// settle-reward-draw — the one locked mutation in the draw-reward-box workflow:
// delegate to the service's @InjectTransactionManager settleRewardDraw, which
// does the whole daily-capped settlement (tier resolve → cap COUNT → drawPrize →
// payout → reward_draw INSERT) atomically under the per-customer credit: lock.
//
// NOT compensated: the draw is the durable commit point. The follow-on inventory
// earmark is best-effort and self-compensating; nothing after this needs to roll
// the draw back. The app container is threaded so drawPrize can resolve
// PRODUCT/INVENTORY for product prizes.
export const settleRewardDrawStep = createStep(
  "settle-reward-draw",
  async (input: SettleRewardDrawInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const result = await packs.settleRewardDraw(input.customer_id, container);
    return new StepResponse(result);
  }
);

export default settleRewardDrawStep;
