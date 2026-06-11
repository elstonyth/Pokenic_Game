import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";

export type PackWriteInput = {
  slug: string;
  title: string;
  category: string;
  price: number;
  image: string;
  // Sell-back rates (0–100, % of FMV): instant = at the reveal (within the
  // post-pull window), vault = later sells from the vault.
  buyback_percent: number;
  vault_buyback_percent: number;
  boost: boolean;
  rank: number;
  status: "active" | "draft";
};

type CompensateData = { packId: string } | undefined;

// create-pack — create a gacha Pack listing. A new pack has an EMPTY prize pool
// (no PackOdds yet); cards are assigned via the membership editor. Compensation
// deletes the created pack.
export const createPackStep = createStep(
  "create-pack",
  async (input: PackWriteInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const [existing] = await packs.listPacks({ slug: input.slug }, { take: 1 });
    if (existing) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A pack with slug '${input.slug}' already exists.`
      );
    }

    const [pack] = await packs.createPacks([
      {
        slug: input.slug,
        title: input.title,
        category: input.category,
        price: input.price,
        image: input.image,
        buyback_percent: input.buyback_percent,
        vault_buyback_percent: input.vault_buyback_percent,
        boost: input.boost,
        rank: input.rank,
        status: input.status,
      },
    ]);

    return new StepResponse(
      { slug: pack.slug },
      { packId: pack.id } satisfies CompensateData
    );
  },
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deletePacks([data.packId]);
  }
);

export default createPackStep;
