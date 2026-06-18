// src/lib/pokemon-from-card.ts
import { POKEDEX_NAMES } from './mock/pokedex-names';

export type CardPokemon = { dex: number; name: string };

/** Fold to comparison form: lowercase, drop every non-alphanumeric char. */
const normalize = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Build once: every dex name in normalized form, sorted LONGEST-FIRST so the
// first substring hit is the most specific Pokémon ("mewtwo" before "mew").
const INDEX: ReadonlyArray<{ dex: number; norm: string }> = POKEDEX_NAMES.map(
  (name, i) => ({ dex: i + 1, norm: normalize(name) }),
)
  .filter((e) => e.norm.length > 0)
  .sort((a, b) => b.norm.length - a.norm.length);

/**
 * Parse the Pokémon out of a card name (spec §2). Normalized longest-match
 * against the national Pokédex. Returns null for cards with no resolvable
 * Pokémon (trainer/energy, or a form-labeled dex entry whose form word the card
 * omits) — callers render the §2/G5 fallback (card image, no sprite).
 */
export function pokemonFromCard(cardName: string): CardPokemon | null {
  const hay = normalize(cardName);
  if (!hay) return null;
  for (const { dex, norm } of INDEX) {
    if (hay.includes(norm)) return { dex, name: POKEDEX_NAMES[dex - 1] };
  }
  return null;
}
