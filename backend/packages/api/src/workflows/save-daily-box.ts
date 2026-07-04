import {
  createStep,
  StepResponse,
  createWorkflow,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk';
import { PACKS_MODULE } from '../modules/packs';
import type PacksModuleService from '../modules/packs/service';
import { validateDailyBox, computeBoxWeights } from '../modules/packs/daily-box';

export type SaveDailyBoxInput = {
  /** VIP box_tier key, e.g. 'c'. */
  tier: string;
  body: unknown;
  /** Server-derived admin actor id — never from the request body. */
  admin_id: string;
};

// save-daily-box-step — validate + fold odds OUTSIDE the transaction (pure,
// cheap to fail before touching the DB), then hand the computed weights to
// packs.saveDailyBox, which does the atomic replace-all (delete + create
// reward_box_prize rows, update the box row, write the audit row) — splits
// pure validation from the transactional service method.
const saveDailyBoxStep = createStep(
  'save-daily-box',
  async (input: SaveDailyBoxInput, { container }) => {
    const body = validateDailyBox(input.body);
    const weights = computeBoxWeights(body.prizes);

    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const result = await packs.saveDailyBox({
      tier: input.tier,
      body,
      weights,
      adminId: input.admin_id,
    });

    return new StepResponse(result);
  },
);

export const saveDailyBoxWorkflow = createWorkflow(
  'save-daily-box',
  function (input: SaveDailyBoxInput) {
    const result = saveDailyBoxStep(input);
    return new WorkflowResponse(result);
  },
);

export default saveDailyBoxWorkflow;
