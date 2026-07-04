import {
  createStep,
  StepResponse,
  createWorkflow,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk';
import { PACKS_MODULE } from '../modules/packs';
import type PacksModuleService from '../modules/packs/service';

export type DrawDailyBoxInput = {
  customer_id: string; // from the authenticated token — NEVER the request body
};

// draw-daily-box-step — thin caller of the service's @InjectTransactionManager
// drawDailyBox, which does the whole daily-capped settlement (tier resolve →
// enabled/cap checks → pick → payout → reward_draw INSERT) atomically under
// the per-customer credit: lock. The container is threaded so product prizes
// can resolve Modules.PRODUCT for title/thumbnail.
const drawDailyBoxStep = createStep(
  'draw-daily-box',
  async (input: DrawDailyBoxInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const result = await packs.drawDailyBox(input.customer_id, container);
    return new StepResponse(result);
  },
);

export const drawDailyBoxWorkflow = createWorkflow(
  'draw-daily-box',
  function (input: DrawDailyBoxInput) {
    const result = drawDailyBoxStep(input);
    return new WorkflowResponse(result);
  },
);

export default drawDailyBoxWorkflow;
