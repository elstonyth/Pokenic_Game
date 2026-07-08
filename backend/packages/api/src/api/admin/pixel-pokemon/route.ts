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

  // Fetch the WHOLE library, paged — never cap. A fixed `take` would drop rows
  // past it, and since NULL-dex customs sort last under `dex ASC`, those custom
  // rows (the ones this page exists to manage) would be the first casualties —
  // silently corrupting total / all_types / the custom-only filter. (CodeRabbit)
  const all: Row[] = [];
  const PAGE = 1000;
  for (let skip = 0; ; skip += PAGE) {
    const batch = (await pixels.listPixelPokemon(
      {},
      { skip, take: PAGE, order: { dex: 'ASC' } },
    )) as unknown as Row[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }

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

// POST /admin/pixel-pokemon — add a custom pixel-pokémon to the library. The
// sprite is uploaded separately via POST /admin/media; the returned URL comes
// in as image_url. `dex` is optional (grouping only); `variant` defaults to
// 'custom' so it never collides with the seeded 'normal' rows (the partial
// unique index only constrains variant='normal'). is_custom is forced true.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const pixels = asPixelPokemonCrud(packs);
  const b = (req.body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) {
    res.status(400).json({ message: "'name' is required." });
    return;
  }
  const image_url = typeof b.image_url === 'string' ? b.image_url.trim() : '';
  // http(s):// or a single root-relative path — reject javascript:/data: (XSS in
  // the <img src> render) AND protocol-relative "//host" / "/\\host" (which would
  // load an arbitrary external host). Normal uploads return our own media URL.
  if (!image_url || !/^(https?:\/\/|\/(?![/\\]))/.test(image_url)) {
    res
      .status(400)
      .json({ message: "'image_url' must be an uploaded sprite URL." });
    return;
  }

  let dex: number | null = null;
  if (b.dex !== undefined && b.dex !== null && b.dex !== '') {
    const n = Number(b.dex);
    if (!Number.isInteger(n) || n < 1 || n > 1025) {
      res
        .status(400)
        .json({ message: "'dex' must be an integer 1–1025, or left blank." });
      return;
    }
    dex = n;
  }
  const variant =
    (typeof b.variant === 'string' && b.variant.trim()) || 'custom';
  const types = Array.isArray(b.types)
    ? (b.types as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const image_key =
    typeof b.image_key === 'string' && b.image_key.trim()
      ? b.image_key.trim()
      : null;

  try {
    const [created] = await pixels.createPixelPokemon([
      {
        name,
        dex,
        variant,
        types: types as unknown as Record<string, unknown>,
        image_url,
        image_key,
        is_custom: true,
      },
    ]);
    res.status(201).json({ pixel_pokemon: created });
  } catch (e) {
    // Partial unique index (dex, variant='normal') — a custom row named
    // 'normal' for a dex that already has one. Surface a clean 400.
    if ((e as { code?: string })?.code === '23505') {
      res
        .status(400)
        .json({ message: `A '${variant}' entry for dex ${dex} already exists.` });
      return;
    }
    throw e;
  }
}
