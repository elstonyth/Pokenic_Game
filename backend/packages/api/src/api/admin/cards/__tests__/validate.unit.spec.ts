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

  it('rejects an out-of-range or non-integer dex with a clear message', () => {
    const msg = /must be an integer between 1 and 1025/;
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 99999 })).toThrow(msg);
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 1026 })).toThrow(msg); // first invalid above MAX_DEX
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 0 })).toThrow(msg);
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: -1 })).toThrow(msg);
    expect(() => coerceRegisterCardBody({ ...base, pokemon_dex: 5.5 })).toThrow(msg);
  });

  it('accepts the boundary dex values 1 and 1025', () => {
    expect(coerceRegisterCardBody({ ...base, pokemon_dex: 1 }).pokemon_dex).toBe(1);
    expect(coerceRegisterCardBody({ ...base, pokemon_dex: 1025 }).pokemon_dex).toBe(1025);
  });

  it('rejects a sprite_image with a bad scheme or non-string with a clear message', () => {
    const schemeMsg = /http\(s\) URL or a \/storefront path/;
    expect(() => coerceRegisterCardBody({ ...base, sprite_image: 'javascript:alert(1)' })).toThrow(schemeMsg);
    expect(() => coerceRegisterCardBody({ ...base, sprite_image: 'ftp://x/y.png' })).toThrow(schemeMsg);
    expect(() => coerceRegisterCardBody({ ...base, sprite_image: 123 })).toThrow(/must be a string URL/);
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
