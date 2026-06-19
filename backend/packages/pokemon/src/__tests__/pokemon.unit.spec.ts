import { pokemonFromCard, POKEDEX_NAMES } from '../index';

describe('pokemonFromCard', () => {
  it('matches a plain Pokémon name to its dex', () => {
    expect(pokemonFromCard('Charizard')).toEqual({ dex: 6, name: 'Charizard' });
  });

  it('matches inside a fuller card title (longest substring)', () => {
    expect(pokemonFromCard('Pikachu V')).toEqual({ dex: 25, name: 'Pikachu' });
  });

  it('prefers the most specific match (mewtwo before mew)', () => {
    expect(pokemonFromCard('Mewtwo GX')).toEqual({ dex: 150, name: 'Mewtwo' });
    expect(pokemonFromCard('Mew')).toEqual({ dex: 151, name: 'Mew' });
  });

  it('returns null for a non-Pokémon card', () => {
    expect(pokemonFromCard('Double Colorless Energy')).toBeNull();
    expect(pokemonFromCard('')).toBeNull();
  });

  it('exports the full national dex in order', () => {
    expect(POKEDEX_NAMES[0]).toBe('Bulbasaur');
    expect(POKEDEX_NAMES.length).toBeGreaterThanOrEqual(1025);
  });
});
