import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import PacksModuleService from "../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../modules/packs";

// GET /store/pulls/recent — the most recent pulls across all packs, for the
// "Recent Pulls" live feed on /claw/[slug]. A plain publishable-key-scoped store
// route (no customer auth): it is a PUBLIC feed, so it deliberately exposes only
// the won card + when it was rolled — NEVER customer_id (no PII leak). Each pull
// is joined to its Card by handle; orphaned rows (card removed) are dropped.
const RECENT_LIMIT = 12;

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);

  const pulls = await packs.listPulls(
    {},
    { order: { rolled_at: "DESC" }, take: RECENT_LIMIT }
  );

  const handles = [...new Set(pulls.map((p) => p.card_id))];
  const cards = handles.length
    ? await packs.listCards({ handle: handles }, { take: handles.length })
    : [];
  const cardByHandle = new Map(cards.map((c) => [c.handle, c]));

  const recent = pulls
    .map((p) => {
      const card = cardByHandle.get(p.card_id);
      if (!card) return null;
      return {
        handle: card.handle,
        name: card.name,
        rarity: card.rarity,
        // market_value is a BigNumber — normalize to a JSON number (USD decimal).
        market_value: Number(card.market_value),
        image: card.image,
        // pack the card came from (= Pack.slug) — for the feed's pack label.
        // Still NO customer_id: the feed stays PII-free.
        pack_id: p.pack_id,
        rolled_at: p.rolled_at,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  res.json({ pulls: recent });
}
