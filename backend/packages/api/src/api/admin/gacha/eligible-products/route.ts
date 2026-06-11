import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import PacksModuleService from "../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../modules/packs";

// GET /admin/gacha/eligible-products — inventory products that can be registered
// as gacha cards (i.e. catalog products whose handle is not already a Card).
// The "Add card" picker in the admin loads this list; the item must exist in the
// product catalog FIRST (inventory-first model). Drafts are included — a draft
// registers as a pack-only card (for_sale=false).
export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const productModule = req.scope.resolve(Modules.PRODUCT);

  const [products, cards] = await Promise.all([
    productModule.listProducts({}, { take: 1000 }),
    packs.listCards({}, { take: 1000 }),
  ]);

  const registered = new Set(cards.map((c) => c.handle));

  const eligible = products
    .filter((p) => p.handle && !registered.has(p.handle))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((p) => ({
      id: p.id,
      title: p.title,
      handle: p.handle,
      thumbnail: p.thumbnail ?? null,
      status: p.status,
    }));

  res.json({ products: eligible });
}
