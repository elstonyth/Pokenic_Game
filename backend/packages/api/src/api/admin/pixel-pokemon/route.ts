import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { asPixelPokemonCrud } from '../../../modules/packs/pixel-pokemon-service';

// GET /admin/pixel-pokemon — the Pokédex library list for the admin dashboard.
// Returns every seeded/custom pixel-pokémon. Filters (q = name or dex, type,
// variant, custom) + pagination are applied server-side over the (≤ a couple
// thousand) rows, so a single ordered list query backs the whole page. The
// route is auto-protected by Medusa admin auth. Uses asPixelPokemonCrud because
// the pixel_pokemon runtime methods are singular ("pokemon" is uncountable).

type Row = {
  id: string;
  name: string;
  dex: number | null;
  variant: string;
  types: unknown;
  image_url: string | null;
  is_custom: boolean;
};

const asTypes = (t: unknown): string[] => (Array.isArray(t) ? (t as string[]) : []);

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const pixels = asPixelPokemonCrud(packs);

  const q = String(req.query.q ?? '').trim().toLowerCase();
  const typeF = String(req.query.type ?? '').trim().toLowerCase();
  const variantF = String(req.query.variant ?? '').trim().toLowerCase();
  const customF = req.query.custom; // 'true' | 'false' | undefined
  const limit = Math.min(Math.max(Number(req.query.limit ?? 60) || 60, 1), 200);
  const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

  const all = (await pixels.listPixelPokemon(
    {},
    { take: 2000, order: { dex: 'ASC' } },
  )) as unknown as Row[];

  const dexQ = /^\d+$/.test(q) ? Number(q) : null;
  const filtered = all.filter((p) => {
    const types = asTypes(p.types);
    if (
      q &&
      !(p.name.toLowerCase().includes(q) || (dexQ !== null && p.dex === dexQ))
    )
      return false;
    if (typeF && !types.some((t) => t.toLowerCase() === typeF)) return false;
    if (variantF && p.variant.toLowerCase() !== variantF) return false;
    if (customF === 'true' && !p.is_custom) return false;
    if (customF === 'false' && p.is_custom) return false;
    return true;
  });

  // Distinct types across the whole library — powers the filter chips.
  const typeSet = new Set<string>();
  for (const p of all) for (const t of asTypes(p.types)) typeSet.add(t);

  res.json({
    pixel_pokemon: filtered
      .slice(offset, offset + limit)
      .map((p) => ({ ...p, types: asTypes(p.types) })),
    total: filtered.length,
    limit,
    offset,
    all_types: [...typeSet].sort(),
  });
}
