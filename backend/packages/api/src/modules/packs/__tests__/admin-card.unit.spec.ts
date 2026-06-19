import { toAdminCardDto } from '../admin-card';

const card = {
  handle: 'pikachu-001',
  name: 'Pikachu',
  set: 'Base',
  grader: 'PSA',
  grade: '10',
  market_value: '0.15',
  image: '/p.png',
  price: '1.50',
  for_sale: true,
  pokemon_dex: null as number | null,
  sprite_image: null as string | null,
};

describe('toAdminCardDto', () => {
  it('shapes the admin card DTO with money-normalized FMV, price, and pixel-pokemon fields', () => {
    expect(toAdminCardDto(card)).toEqual({
      handle: 'pikachu-001',
      name: 'Pikachu',
      set: 'Base',
      grader: 'PSA',
      grade: '10',
      market_value: 0.15,
      image: '/p.png',
      price: 1.5,
      for_sale: true,
      pokemon_dex: null,
      sprite_image: null,
    });
  });

  it('preserves a null price sentinel (use-FMV) without coercing it to 0', () => {
    expect(toAdminCardDto({ ...card, price: null }).price).toBeNull();
  });

  // The admin list route appends `stock`; the detail route never returns it.
  // The seam must NOT emit `stock`, or the detail response gains a field it
  // never had (the behavior trap that kept this a base DTO + spread, not a
  // toAdminCardDto(card, stock?) with an optional param).
  it('does not emit a stock field', () => {
    expect(toAdminCardDto(card)).not.toHaveProperty('stock');
  });
});
