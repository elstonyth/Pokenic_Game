import { coerceRegisterCardBody, coerceUpdateCardBody } from '../validate';

// Spec 2 §5: the card forms assign a Pokémon by a PixelPokemon library id (the
// picker), tri-state so the form can round-trip and only send it when changed —
// undefined = picker untouched (leave the link), null = cleared, string = link.
describe('coerceRegisterCardBody — pixel_pokemon_id', () => {
  const base = {
    product_id: 'prod_1',
    set: 'Base',
    grader: 'PSA',
    grade: '10',
    market_value: 100,
  };

  it('accepts a picked library id', () => {
    const out = coerceRegisterCardBody({ ...base, pixel_pokemon_id: 'pp_123' });
    expect(out.pixel_pokemon_id).toBe('pp_123');
  });

  it('is undefined when the field is omitted (picker untouched → inherit)', () => {
    const out = coerceRegisterCardBody(base);
    expect(out.pixel_pokemon_id).toBeUndefined();
  });

  it('is null on an explicit null or blank string (cleared)', () => {
    expect(
      coerceRegisterCardBody({ ...base, pixel_pokemon_id: null }).pixel_pokemon_id,
    ).toBeNull();
    expect(
      coerceRegisterCardBody({ ...base, pixel_pokemon_id: '   ' }).pixel_pokemon_id,
    ).toBeNull();
  });

  it('trims a padded id', () => {
    expect(
      coerceRegisterCardBody({ ...base, pixel_pokemon_id: '  pp_9 ' })
        .pixel_pokemon_id,
    ).toBe('pp_9');
  });

  it('rejects a non-string id with a clear message', () => {
    expect(() =>
      coerceRegisterCardBody({ ...base, pixel_pokemon_id: 123 }),
    ).toThrow(/'pixel_pokemon_id' must be a string/);
  });
});

describe('coerceUpdateCardBody — pixel_pokemon_id', () => {
  const base = {
    name: 'Charizard',
    set: 'Base',
    grader: 'PSA',
    grade: '10',
    market_value: 100,
    image: '/x.png',
    for_sale: true,
  };

  it('round-trips a picked id', () => {
    const out = coerceUpdateCardBody(
      { ...base, pixel_pokemon_id: 'pp_charizard' },
      'charizard',
    );
    expect(out.pixel_pokemon_id).toBe('pp_charizard');
  });

  it('undefined when omitted (a price-only save leaves the link untouched)', () => {
    expect(coerceUpdateCardBody(base, 'charizard').pixel_pokemon_id).toBeUndefined();
  });

  it('null on explicit null (unlink + clear the mirror)', () => {
    expect(
      coerceUpdateCardBody({ ...base, pixel_pokemon_id: null }, 'charizard')
        .pixel_pokemon_id,
    ).toBeNull();
  });
});
