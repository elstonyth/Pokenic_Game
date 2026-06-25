import { createStep, StepResponse } from '@medusajs/framework/workflows-sdk';
import { MedusaError } from '@medusajs/framework/utils';
import { PACKS_MODULE } from '../../modules/packs';
import type PacksModuleService from '../../modules/packs/service';

export type DeletePackInput = { slug: string };

// Snapshots ALL of a pack's odds rows for compensation, including reward rows
// (card_id null) — keep card_id nullable so they round-trip faithfully.
type OddsSnapshot = {
  pack_id: string;
  card_id: string | null;
  weight: number;
  locked: boolean;
};

type CompensateData =
  | {
      pack: {
        slug: string;
        title: string;
        category: string;
        price: number;
        image: string;
        boost: boolean;
        rank: number;
        status: 'active' | 'draft';
      };
      odds: OddsSnapshot[];
    }
  | undefined;

// delete-pack — remove a pack and its PackOdds (prize-pool membership). Cards and
// Pull history are kept (cards live independently; the ledger is permanent).
// Compensation recreates the pack and its odds rows.
export const deletePackStep = createStep(
  'delete-pack',
  async (input: DeletePackInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const [pack] = await packs.listPacks({ slug: input.slug }, { take: 1 });
    if (!pack) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pack '${input.slug}' not found.`,
      );
    }

    const oddsRows = await packs.listPackOdds(
      { pack_id: input.slug },
      { take: 1000 },
    );

    const snapshot: CompensateData = {
      pack: {
        slug: pack.slug,
        title: pack.title,
        category: pack.category,
        price: pack.price,
        image: pack.image,
        boost: pack.boost,
        rank: pack.rank,
        status: pack.status,
      },
      odds: oddsRows.map((o) => ({
        pack_id: o.pack_id,
        card_id: o.card_id,
        weight: o.weight,
        locked: o.locked,
      })),
    };

    if (oddsRows.length) {
      await packs.deletePackOdds(oddsRows.map((o) => o.id));
    }
    await packs.deletePacks([pack.id]);

    return new StepResponse({ slug: input.slug }, snapshot);
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.createPacks([data.pack]);
    if (data.odds.length) {
      await packs.createPackOdds(data.odds);
    }
  },
);

export default deletePackStep;
