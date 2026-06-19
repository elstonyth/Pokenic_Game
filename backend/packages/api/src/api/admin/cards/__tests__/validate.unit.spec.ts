import { coerceRegisterCardBody, coerceUpdateCardBody } from '../validate';

describe('coerceRegisterCardBody — pixel-pokemon fields', () => {
  const base = { product_id: 'prod_1', set: 'Base', grader: 'PSA', grade: '10', market_value: 100 };

  it('accepts a valid in-range dex and a sprite URL', () => {
    const out = coerceRegisterCardBody({ ...base, pokemon_dex: 6, sprite_image: '/static/x.png' });
    expect(out.pokemon_dex).toBe(6);
    expect(out.sprite_image).toBe('/static/x.png');
  });

  it('defaults both to null when omitted', () => {
    const out = coerceRegisterCardBody(base);
    expect(out.pokemon_dex).toBeNull();
    expect(out.sprite_image).toBeNull();
  });

  it('rejects an out-of-range dex', () => {
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 99999 })).toThrow();
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 0 })).toThrow();
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 5.5 })).toThrow();
  });
});

describe('coerceUpdateCardBody — pixel-pokemon fields', () => {
  const base = { name: 'Charizard', set: 'Base', grader: 'PSA', grade: '10', market_value: 100, image: '/x.png', for_sale: true };

  it('round-trips dex + sprite', () => {
    const out = coerceUpdateCardBody({ ...base, pokemon_dex: 151, sprite_image: 'https://cdn/x.png' }, 'charizard');
    expect(out.pokemon_dex).toBe(151);
    expect(out.sprite_image).toBe('https://cdn/x.png');
  });

  it('clears to null on empty/missing', () => {
    const out = coerceUpdateCardBody(base, 'charizard');
    expect(out.pokemon_dex).toBeNull();
    expect(out.sprite_image).toBeNull();
  });
});
