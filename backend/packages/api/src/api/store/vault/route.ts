import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import PacksModuleService from "../../../modules/packs/service";
import { PACKS_MODULE } from "../../../modules/packs";
import { resolveBuybackRate } from "../../../modules/packs/buyback-rate";

// GET /store/vault — the authenticated customer's vault: every pull still held
// (status "vaulted"), newest first, with a LIVE buyback offer per item: current
// FMV × the rate that would apply RIGHT NOW (instant inside the post-pull
// window, the pack's vault rate after — resolveBuybackRate, the same logic the
// buyback workflow runs, so the quote always matches the credit).
//
// AUTH: matcher registered in src/api/middlewares.ts with authenticate(); the
// customer id comes ONLY from the verified token, so a caller can never read
// another customer's vault.
const VAULT_LIMIT = 500;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerId = req.auth_context.actor_id;

  const pulls = await packs.listPulls(
    { customer_id: customerId, status: "vaulted" },
    { order: { rolled_at: "DESC" }, take: VAULT_LIMIT }
  );

  const handles = [...new Set(pulls.map((p) => p.card_id))];
  const packIds = [...new Set(pulls.map((p) => p.pack_id))];

  const [cards, packRows, oddsRows] = await Promise.all([
    handles.length
      ? packs.listCards({ handle: handles }, { take: handles.length })
      : Promise.resolve([]),
    packIds.length
      ? packs.listPacks({ slug: packIds }, { take: packIds.length })
      : Promise.resolve([]),
    handles.length
      ? packs.listPackOdds({ card_id: handles }, { take: 1000 })
      : Promise.resolve([]),
  ]);

  const cardByHandle = new Map(cards.map((c) => [c.handle, c]));
  const packBySlug = new Map(packRows.map((p) => [p.slug, p]));
  // Rarity is per-pack (PackOdds) — join on the pull's (pack, card) pair.
  const rarityByPair = new Map(
    oddsRows.map((o) => [`${o.pack_id} ${o.card_id}`, o.rarity])
  );

  const items = pulls
    .map((p) => {
      const card = cardByHandle.get(p.card_id);
      if (!card) return null; // card unregistered since — cannot value/display
      const pack = packBySlug.get(p.pack_id);
      const { percent, rate_type } = resolveBuybackRate(pack, p.rolled_at);
      const marketValue = Number(card.market_value);

      return {
        pull_id: p.id,
        rolled_at: p.rolled_at,
        pack_id: p.pack_id,
        pack_title: pack?.title ?? p.pack_id,
        card: {
          handle: card.handle,
          name: card.name,
          set: card.set,
          grader: card.grader,
          grade: card.grade,
          rarity: rarityByPair.get(`${p.pack_id} ${p.card_id}`) ?? "Common",
          market_value: marketValue,
          image: card.image,
        },
        buyback: {
          percent,
          amount: round2((marketValue * percent) / 100),
          rate_type,
        },
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  res.json({ items });
}
