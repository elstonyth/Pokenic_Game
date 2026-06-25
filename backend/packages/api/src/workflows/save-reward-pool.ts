import {
  createStep,
  StepResponse,
  createWorkflow,
  WorkflowResponse,
} from '@medusajs/framework/workflows-sdk';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../modules/packs';
import type PacksModuleService from '../modules/packs/service';
import type { RewardPoolEntry } from '../modules/packs/reward-pool-validate';

export type SaveRewardPoolInput = {
  /** VIP box_tier key, e.g. 'c'. The reward_box Pack slug = 'reward-box-<tier>'. */
  tier: string;
  entries: RewardPoolEntry[];
  draws_per_day: number;
  pool_enabled: boolean;
  /** Server-derived admin actor id — never from the request body. */
  admin_id: string;
};

export type SaveRewardPoolResult = {
  pack_slug: string;
  entries_count: number;
  draws_per_day: number;
  pool_enabled: boolean;
};

// save-reward-pool-step — thin caller of packs.replaceRewardPool, which does
// EVERYTHING in one injected transaction: resolve/create the tier's reward_box
// Pack (rejecting a non-reward_box slug squatter), replace-all its reward
// PackOdds rows, update the pool config, and write the admin_action_audit row.
//
// No compensation: the whole operation is atomic, so a partial failure rolls
// itself back. There are no downstream steps after this one, so a rollback
// function would never fire.
const saveRewardPoolStep = createStep(
  'save-reward-pool',
  async (input: SaveRewardPoolInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const result: SaveRewardPoolResult = await packs.replaceRewardPool({
      tier: input.tier,
      newEntries: input.entries,
      pool_enabled: input.pool_enabled,
      draws_per_day: input.draws_per_day,
      admin_id: input.admin_id,
    });

    return new StepResponse(result);
  },
);

export const saveRewardPoolWorkflow = createWorkflow(
  'save-reward-pool',
  function (input: SaveRewardPoolInput) {
    const result = saveRewardPoolStep(input);
    return new WorkflowResponse(result);
  },
);

export default saveRewardPoolWorkflow;
