import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import type { PackWriteInput } from "./create-pack";

// slug is immutable (it keys PackOdds / the /claw route); it selects the row.
export type UpdatePackInput = PackWriteInput;

type PackSnapshot = {
  id: string;
  title: string;
  category: string;
  price: number;
  image: string;
  buyback_percent: number;
  vault_buyback_percent: number;
  boost: boolean;
  rank: number;
  status: "active" | "draft";
};

// update-pack — patch a pack's listing fields (everything but slug).
export const updatePackStep = createStep(
  "update-pack",
  async (input: UpdatePackInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const [pack] = await packs.listPacks({ slug: input.slug }, { take: 1 });
    if (!pack) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pack '${input.slug}' not found.`
      );
    }

    const snapshot: PackSnapshot = {
      id: pack.id,
      title: pack.title,
      category: pack.category,
      price: pack.price,
      image: pack.image,
      buyback_percent: pack.buyback_percent,
      vault_buyback_percent: pack.vault_buyback_percent,
      boost: pack.boost,
      rank: pack.rank,
      status: pack.status,
    };

    await packs.updatePacks([
      {
        id: pack.id,
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

    return new StepResponse({ slug: pack.slug }, snapshot);
  },
  async (snapshot: PackSnapshot | undefined, { container }) => {
    if (!snapshot) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.updatePacks([snapshot]);
  }
);

export default updatePackStep;
