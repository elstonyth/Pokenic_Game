import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../modules/packs';
import type PacksModuleService from '../../modules/packs/service';
import type { OddsRarity } from '@acme/odds-math';

export type SetPackMembersInput = {
  pack_id: string; // = Pack.slug
  card_ids: string[]; // the DESIRED full membership (Card.handle list)
};

// A freshly added member gets a positive relative weight so it can be rolled
// immediately (the roll is scale-invariant). The operator then fine-tunes the
// real percentages in the win-rate editor, which normalizes to basis points.
const NEW_MEMBER_WEIGHT = 100;

type RemovedRow = {
  pack_id: string;
  card_id: string;
  rarity: OddsRarity;
  weight: number;
  locked: boolean;
};
type CompensateData =
  | { createdIds: string[]; removed: RemovedRow[] }
  | undefined;

// set-pack-members — reconcile a pack's prize pool to a desired card set by
// DIFFING (add missing PackOdds rows, delete removed ones, leave shared rows —
// and their tuned weights — untouched). This is deliberately NOT save-pack-odds:
// that step rejects any change to the card set; this one IS the card-set change.
export const setPackMembersStep = createStep(
  'set-pack-members',
  async (input: SetPackMembersInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const [pack] = await packs.listPacks({ slug: input.pack_id }, { take: 1 });
    if (!pack) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pack '${input.pack_id}' not found.`,
      );
    }

    const desired = Array.from(new Set(input.card_ids));

    // Every desired member must be a real Card (no dangling odds rows).
    if (desired.length) {
      const cards = await packs.listCards(
        { handle: desired },
        { take: desired.length },
      );
      const found = new Set(cards.map((c) => c.handle));
      const missing = desired.filter((h) => !found.has(h));
      if (missing.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Unknown card handle(s): ${missing.join(', ')}.`,
        );
      }
    }

    const allExisting = await packs.listPackOdds(
      { pack_id: input.pack_id },
      { take: 1000 },
    );
    // Reconcile CARD membership only — reward rows (card_id null) are not cards
    // and must never be flagged for removal by a desired-card-set diff.
    // Membership is keyed on card_id ONLY — a card row with a null rarity (legacy)
    // must still reconcile, or it would be re-added as a duplicate. So the guard
    // narrows card_id (non-null) but NOT rarity; the rare null rarity is defaulted
    // where it's consumed (the RemovedRow compensation snapshot below).
    const existing = allExisting.filter(
      (o): o is typeof o & { card_id: string } => o.card_id != null,
    );
    const existingCards = new Set(existing.map((o) => o.card_id));
    const desiredSet = new Set(desired);

    const toAdd = desired.filter((h) => !existingCards.has(h));
    const toRemove = existing.filter((o) => !desiredSet.has(o.card_id));

    // An ACTIVE pack must keep a ROLLABLE pool — the resulting membership
    // needs at least one positive-weight card row or every storefront spin
    // would fail (roll-pack rejects an empty/zero-weight pool). This covers
    // both emptying the pool AND stripping it down to only zero-weight rows
    // (a card can sit at weight 0 when locked rates sum to 100). New members
    // join at NEW_MEMBER_WEIGHT (> 0), so only pure-removal edits can break
    // it. reward_box packs are internal draw pools (reward rows, card_id
    // null) whose card membership is legitimately empty.
    if (
      pack.status === 'active' &&
      pack.category !== 'reward_box' &&
      toAdd.length === 0
    ) {
      const keptRollable = existing.some(
        (o) => desiredSet.has(o.card_id) && o.weight > 0,
      );
      if (!keptRollable) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Pack '${input.pack_id}' is active — this change would leave its ` +
            'prize pool with no winnable cards. Set the pack to draft first.',
        );
      }
    }

    let createdIds: string[] = [];
    if (toAdd.length) {
      const created = await packs.createPackOdds(
        toAdd.map((card_id) => ({
          pack_id: input.pack_id,
          card_id,
          // New members join as Common; the operator picks the real per-pack
          // tier in the win-rate editor, which recomputes the weights from it.
          rarity: 'Common' as const,
          weight: NEW_MEMBER_WEIGHT,
          locked: false,
        })),
      );
      createdIds = created.map((c) => c.id);
    }
    if (toRemove.length) {
      await packs.deletePackOdds(toRemove.map((o) => o.id));
    }

    const removed: RemovedRow[] = toRemove.map((o) => ({
      pack_id: o.pack_id,
      card_id: o.card_id,
      // Card rows carry a per-pack tier; default a legacy null to 'Common' so the
      // compensation re-insert restores a valid, weight-able row.
      rarity: o.rarity ?? 'Common',
      weight: o.weight,
      locked: o.locked,
    }));

    return new StepResponse(
      {
        pack_id: input.pack_id,
        members: desired,
        added: toAdd.length,
        removed: toRemove.length,
      },
      { createdIds, removed } satisfies CompensateData,
    );
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    if (data.createdIds.length) {
      await packs.deletePackOdds(data.createdIds);
    }
    if (data.removed.length) {
      await packs.createPackOdds(data.removed);
    }
  },
);

export default setPackMembersStep;
