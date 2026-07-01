import { toMoney } from './money';
import type { CardLike } from './card-view';

// The admin Gacha-Cards DTO: the public card fields plus the operator-only
// `price` (raw stored sentinel — null = "use FMV", which the edit form
// preserves) and the `for_sale` flag. Distinct from toCardView (no rarity;
// carries price/for_sale instead) — adopted by the admin card list + detail
// routes. `stock` is deliberately NOT part of this shape: the list route
// spreads it on top, and the detail route never returns it.
export type AdminCardLike = CardLike & {
  price: unknown;
  for_sale: boolean;
  pokemon_dex: number | null;
  sprite_image: string | null;
  pc_product_id: string | null;
  pc_grade: string | null;
  market_multiplier: unknown;
  pc_synced_at: Date | string | null;
};

export function toAdminCardDto(card: AdminCardLike) {
  return {
    handle: card.handle,
    name: card.name,
    set: card.set,
    grader: card.grader,
    grade: card.grade,
    market_value: toMoney(card.market_value),
    image: card.image,
    price: card.price === null ? null : toMoney(card.price),
    for_sale: card.for_sale,
    pokemon_dex: card.pokemon_dex ?? null,
    sprite_image: card.sprite_image ?? null,
    pc_product_id: card.pc_product_id ?? null,
    pc_grade: card.pc_grade ?? null,
    market_multiplier: toMoney(card.market_multiplier ?? 1.2),
    pc_synced_at: card.pc_synced_at ?? null,
  };
}
