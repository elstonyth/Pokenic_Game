import { model } from "@medusajs/framework/utils";

// Card — the gacha prize metadata referenced by PackOdds (weights) and Pull
// (results). In Phase 5a it carries its own display fields so the read-only
// catalog depth (Top Hits / Pull Odds) needs no cross-module join. Phase 5b
// links each Card to the Medusa Product whose variant carries inventory +
// checkout; `handle` is that product's handle (the future link key, and the
// stable id PackOdds/Pull reference).
export const Card = model.define("card", {
  id: model.id().primaryKey(),
  handle: model.text().unique(),
  name: model.text(),
  set: model.text(),
  grader: model.text(),
  grade: model.text(),
  // NOTE: rarity is NOT a card property — the same card can be Epic in one pack
  // and Rare in another. It lives on PackOdds (the pack↔card link).
  // USD fair-market value — a DECIMAL (e.g. 19.2), never cents. bigNumber maps to
  // a numeric column; model.number() would map to integer and truncate the cents.
  market_value: model.bigNumber(),
  image: model.text(),
  // Standalone sale price (USD decimal). The card's *intended* marketplace price,
  // kept here even while `for_sale` is off so toggling it back on has a price to
  // restore. On save the admin mirror writes this onto the matching Medusa Product
  // variant (the actual sellable entity). Nullable: pre-existing seeded cards had
  // no Card-level price (their price lived on the seeded Product) until first edit.
  price: model.bigNumber().nullable(),
  // Listed on the storefront marketplace. When true the admin mirror keeps a
  // PUBLISHED Medusa Product (handle === Card.handle); when false the Product is
  // set to draft. Defaults true so the 51 already-seeded cards (all published as
  // Products) keep matching their live marketplace listings.
  for_sale: model.boolean().default(true),
  // Pixel-Pokémon avatar (1:1 per card). national-dex number, 1-based. Nullable:
  // existing cards resolve via name-derivation (pokemonFromCard) until an admin
  // assigns one. model.number() (NOT bigNumber) — an integer dex, distinct from
  // the bigNumber money columns above.
  pokemon_dex: model.number().nullable(),
  // Optional custom uploaded pixel sprite URL; overrides the dex default gif.
  sprite_image: model.text().nullable(),
});

export default Card;
