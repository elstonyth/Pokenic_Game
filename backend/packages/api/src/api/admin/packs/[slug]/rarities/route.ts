import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';
import { RARITIES } from '@acme/odds-math';
import PacksModuleService from '../../../../../modules/packs/service';
import { PACKS_MODULE } from '../../../../../modules/packs';
import { mergeRarityUpdate } from '../../../../../modules/packs/rarity-merge';
import { savePackOddsWorkflow } from '../../../../../workflows/save-pack-odds';

// POST /admin/packs/:slug/rarities — the admin UI's rarity-only save.
//
// 🔒 Locked wins stay HIDDEN: the UI neither receives nor sends win-rate
// weights. This route merges the incoming rarities with the STORED lock
// state server-side (mergeRarityUpdate), so a rarity edit can never move a
// locked card's win rate. Setting/clearing locks remains the separate,
// manual POST /admin/packs/:slug/odds seam (never called from the UI).
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const { slug } = req.params;

  const body = (req.body ?? {}) as { entries?: unknown };
  if (!Array.isArray(body.entries)) {
    res.status(400).json({ message: 'Body must include an `entries` array.' });
    return;
  }
  const rarityByCard = new Map<string, string>();
  for (const raw of body.entries) {
    const e = raw as Record<string, unknown> | null;
    if (
      !e ||
      typeof e.card_id !== 'string' ||
      typeof e.rarity !== 'string' ||
      !(RARITIES as readonly string[]).includes(e.rarity)
    ) {
      res.status(400).json({
        message: `Each entry needs a string card_id and a rarity (one of: ${RARITIES.join(', ')}).`,
      });
      return;
    }
    rarityByCard.set(e.card_id, e.rarity);
  }

  const [pack] = await packs.listPacks({ slug }, { take: 1 });
  if (!pack) {
    res.status(404).json({ message: `Pack '${slug}' not found` });
    return;
  }

  const allOdds = await packs.listPackOdds({ pack_id: slug }, { take: 1000 });
  const stored = allOdds.filter(
    (o): o is typeof o & { card_id: string } => o.card_id != null,
  );

  // The UI always sends the complete row set — enforce exact set equality so
  // a stale form can't silently drop (or invent) pool members.
  const storedIds = new Set(stored.map((o) => o.card_id));
  if (
    storedIds.size !== rarityByCard.size ||
    [...rarityByCard.keys()].some((id) => !storedIds.has(id))
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Entries must cover exactly the cards currently in this pack — reload and retry.',
    );
  }

  const entries = mergeRarityUpdate(stored, rarityByCard);
  await savePackOddsWorkflow(req.scope).run({
    input: { pack_id: slug, entries },
  });

  // Sanitized response — no weights/locks leave this route.
  res.json({ saved: rarityByCard.size });
}
