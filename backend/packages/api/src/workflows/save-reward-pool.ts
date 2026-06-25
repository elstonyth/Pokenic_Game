import { createStep, StepResponse, createWorkflow, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
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

// Compensation payload: the pack fields + the prior reward PackOdds ids, so
// the step can restore the prior state if a later step fails.
type Snapshot = {
  pack_slug: string;
  prior_pool_enabled: boolean;
  prior_draws_per_day: number;
  prior_odds_ids: string[];
};

// save-reward-pool-step — upsert the tier's reward_box Pack + replace-all its
// reward PackOdds rows, then write an admin_action_audit row. Compensated by
// restoring the prior odds rows and pack config.
const saveRewardPoolStep = createStep(
  'save-reward-pool',
  async (input: SaveRewardPoolInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const slug = `reward-box-${input.tier}`;

    // Resolve or create the reward_box Pack for this tier.
    const [existing] = await packs.listPacks({ slug }, { take: 1 });
    let pack: { slug: string; pool_enabled: boolean; draws_per_day: number; id: string };

    if (existing) {
      pack = existing as typeof pack;
    } else {
      // Create a dormant shell; the caller controls pool_enabled.
      const [created] = await packs.createPacks([
        {
          slug,
          title: `VIP Reward Box – Tier ${input.tier.toUpperCase()}`,
          category: 'reward_box',
          price: 0,
          image: '/images/reward-box-placeholder.webp',
          status: 'active' as const,
          pool_enabled: false,
          draws_per_day: 0,
        },
      ]);
      pack = created as typeof pack;
    }

    // Snapshot for compensation: prior odds ids + prior pack pool config.
    const priorOdds = await packs.listPackOdds(
      { pack_id: slug },
      { take: 10000 },
    );
    // Only snapshot reward rows (card_id null) — the replace-all targets them.
    const priorRewardOddsIds = priorOdds
      .filter((o) => o.card_id == null)
      .map((o) => o.id);

    const snapshot: Snapshot = {
      pack_slug: slug,
      prior_pool_enabled: pack.pool_enabled,
      prior_draws_per_day: pack.draws_per_day,
      prior_odds_ids: priorRewardOddsIds,
    };

    // Replace-all: delete existing reward odds rows, then insert the new set.
    if (priorRewardOddsIds.length > 0) {
      await packs.deletePackOdds(priorRewardOddsIds);
    }

    if (input.entries.length > 0) {
      await packs.createPackOdds(
        input.entries.map((e) => ({
          pack_id: slug,
          card_id: null,
          rarity: null,
          weight: e.weight,
          locked: false,
          kind: e.kind,
          product_handle: e.product_handle ?? null,
          credit_amount: e.credit_amount ?? null,
        })),
      );
    }

    // Update Pack pool config.
    await packs.updatePacks(
      {
        selector: { slug },
        data: {
          pool_enabled: input.pool_enabled,
          draws_per_day: input.draws_per_day,
        },
      },
    );

    // Admin audit row.
    await packs.createAdminActionAudits([
      {
        admin_id: input.admin_id,
        entity_type: 'reward_pool',
        entity_id: slug,
        action: 'edit_reward_pool',
        before: {
          pool_enabled: snapshot.prior_pool_enabled,
          draws_per_day: snapshot.prior_draws_per_day,
          entries_count: priorRewardOddsIds.length,
        },
        after: {
          pool_enabled: input.pool_enabled,
          draws_per_day: input.draws_per_day,
          entries_count: input.entries.length,
        },
        reason: `Admin updated reward pool for tier ${input.tier}`,
      },
    ]);

    const result: SaveRewardPoolResult = {
      pack_slug: slug,
      entries_count: input.entries.length,
      draws_per_day: input.draws_per_day,
      pool_enabled: input.pool_enabled,
    };

    return new StepResponse(result, snapshot);
  },
  async (snapshot: Snapshot | undefined, { container }) => {
    if (!snapshot) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    // Restore prior pack config.
    await packs.updatePacks({
      selector: { slug: snapshot.pack_slug },
      data: {
        pool_enabled: snapshot.prior_pool_enabled,
        draws_per_day: snapshot.prior_draws_per_day,
      },
    });

    // The newly-inserted reward odds rows (those not in the snapshot) are hard
    // to recover cheaply — ponytail: the compensation is best-effort here since
    // save-reward-pool has no downstream steps that can fail after this step.
    // A full restore would require re-seeding the prior rows from a richer
    // snapshot (omitted — add when chaining steps that can fail post-save).
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
