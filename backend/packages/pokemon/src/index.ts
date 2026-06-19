// Pokémon-from-card matcher — ported verbatim from the storefront
// (src/lib/pokemon-from-card.ts). Kept as an admin-monorepo copy because the
// storefront is a separate workspace and cannot share @acme/*. The dex name
// list (pokedex-names.ts) is duplicated here too; both copies are static
// national-dex data and must stay in sync if the match rules ever change.
import { POKEDEX_NAMES } from './pokedex-names';

export type CardPokemon = { dex: number; name: string };

/** Fold to comparison form: lowercase, drop every non-alphanumeric char. */
const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Sorted LONGEST-FIRST so the first substring hit is the most specific
// Pokémon ("mewtwo" before "mew").
const INDEX: ReadonlyArray<{ dex: number; norm: string }> = POKEDEX_NAMES.map(
  (name, i) => ({ dex: i + 1, norm: normalize(name) }),
)
  .filter((e) => e.norm.length > 0)
  .sort((a, b) => b.norm.length - a.norm.length);

/** Normalized longest-substring match against the national Pokédex. Returns
 *  null for cards with no resolvable Pokémon (trainer/energy). No fallback
 *  logic lives here — the caller routes null into the "Other" group. */
export function pokemonFromCard(cardName: string): CardPokemon | null {
  const hay = normalize(cardName);
  if (!hay) return null;
  for (const { dex, norm } of INDEX) {
    if (hay.includes(norm)) return { dex, name: POKEDEX_NAMES[dex - 1] };
  }
  return null;
}

export { POKEDEX_NAMES };
