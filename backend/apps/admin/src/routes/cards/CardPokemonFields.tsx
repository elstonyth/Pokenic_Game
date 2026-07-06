import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Button, Input, Label, Text, clx, toast } from '@medusajs/ui';
import { POKEDEX_NAMES, pokemonFromCard, spriteGif } from '@acme/pokemon';
import { useUploadImage } from '../../lib/queries';
import { validateImageFile } from '../../lib/image-validation';
import { resolveImageUrl } from '../../lib/image-url';

// The pixel-Pokémon assignment value for a card: an explicit national-dex number
// and/or a custom uploaded sprite. Both null → the card resolves via its name.
export type CardPokemonValue = {
  pokemon_dex: number | null;
  sprite_image: string | null;
};

type Props = {
  value: CardPokemonValue;
  onChange: (patch: Partial<CardPokemonValue>) => void;
  /** Card/product title used to compute the default name-derived suggestion. */
  suggestionName: string;
};

const PICKER_LIMIT = 60;

const CardPokemonFields = ({ value, onChange, suggestionName }: Props) => {
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadImg = useUploadImage();
  const uploading = uploadImg.isPending;

  const suggestion = useMemo(
    () => pokemonFromCard(suggestionName),
    [suggestionName],
  );

  // Effective dex shown in the preview: explicit wins, else the name suggestion.
  const effectiveDex = value.pokemon_dex ?? suggestion?.dex ?? null;
  const effectiveName =
    value.pokemon_dex !== null
      ? (POKEDEX_NAMES[value.pokemon_dex - 1] ?? null)
      : (suggestion?.name ?? null);

  const matches = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [] as { dex: number; name: string }[];
    const out: { dex: number; name: string }[] = [];
    for (
      let i = 0;
      i < POKEDEX_NAMES.length && out.length < PICKER_LIMIT;
      i++
    ) {
      if (POKEDEX_NAMES[i].toLowerCase().includes(q)) {
        out.push({ dex: i + 1, name: POKEDEX_NAMES[i] });
      }
    }
    return out;
  }, [filter]);

  const selectDex = (dex: number) => {
    onChange({ pokemon_dex: dex });
    setFilter('');
    setActiveIndex(0);
  };

  // Keyboard nav for the search combobox: focus stays on the input (roving via
  // aria-activedescendant), arrows move the active option, Enter assigns it,
  // Escape clears the search.
  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Consume Escape only when it clears the filter — otherwise it bubbles
      // to the enclosing FocusModal and closes the whole editor mid-edit.
      if (filter !== '') {
        e.preventDefault();
        e.stopPropagation();
        setFilter('');
        setActiveIndex(0);
      }
      return;
    }
    if (matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = matches[Math.min(activeIndex, matches.length - 1)];
      if (m) selectDex(m.dex);
    }
  };

  const handleSprite = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const problem = await validateImageFile(file, 'sprite');
    if (problem) {
      toast.error(problem);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    try {
      const url = await uploadImg.mutateAsync({ file, kind: 'sprite' });
      onChange({ sprite_image: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Preview: custom sprite wins, else the effective dex gif, else nothing.
  const previewSrc = value.sprite_image
    ? resolveImageUrl(value.sprite_image)
    : effectiveDex !== null
      ? spriteGif(effectiveDex)
      : null;

  return (
    <div className="bg-ui-bg-subtle flex flex-col gap-y-3 rounded-lg p-4">
      <Label size="small" weight="plus" htmlFor="card-pokemon-search">
        Pixel Pokémon
      </Label>

      <div className="flex items-center gap-4">
        {previewSrc ? (
          <img
            src={previewSrc}
            alt=""
            className="border-ui-border-base h-16 w-16 shrink-0 rounded border bg-white object-contain"
          />
        ) : (
          <div className="border-ui-border-base bg-ui-bg-base text-ui-fg-muted flex h-16 w-16 shrink-0 items-center justify-center rounded border text-xs">
            —
          </div>
        )}
        <div className="flex flex-col">
          <Text size="small" className="font-medium">
            {value.pokemon_dex !== null
              ? `#${value.pokemon_dex} ${effectiveName ?? ''}`
              : suggestion
                ? `Auto: #${suggestion.dex} ${suggestion.name}`
                : 'Unassigned'}
          </Text>
          <Text size="small" className="text-ui-fg-subtle">
            {value.sprite_image
              ? 'Custom sprite uploaded'
              : value.pokemon_dex !== null
                ? 'Showdown gif for the chosen dex'
                : 'Falls back to the card name'}
          </Text>
        </div>
      </div>

      {/* Dex picker — searchable combobox; arrow keys + Enter to assign */}
      <Input
        id="card-pokemon-search"
        placeholder="Search a Pokémon by name to assign…"
        aria-label="Search a Pokémon by name to assign"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="dex-picker-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          matches.length > 0
            ? `dex-opt-${matches[Math.min(activeIndex, matches.length - 1)].dex}`
            : undefined
        }
        value={filter}
        onChange={(e) => {
          setFilter(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={onSearchKeyDown}
      />
      {matches.length > 0 && (
        <div
          id="dex-picker-listbox"
          role="listbox"
          aria-label="Pokémon matches"
          className="max-h-44 divide-y overflow-y-auto rounded-lg border"
        >
          {matches.map((m, i) => {
            const active = i === Math.min(activeIndex, matches.length - 1);
            const selected = value.pokemon_dex === m.dex;
            return (
              <button
                key={m.dex}
                id={`dex-opt-${m.dex}`}
                role="option"
                aria-selected={selected}
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectDex(m.dex)}
                className={clx(
                  'flex w-full items-center gap-3 px-4 py-2 text-left',
                  active && 'bg-ui-bg-base-hover',
                  selected && 'bg-ui-bg-base-pressed',
                )}
              >
                <img
                  src={spriteGif(m.dex)}
                  alt=""
                  className="h-8 w-8 shrink-0 bg-white object-contain"
                />
                <span className="flex-1 truncate text-sm font-medium">
                  #{m.dex} {m.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {value.pokemon_dex !== null && (
          <Button
            size="small"
            variant="secondary"
            type="button"
            onClick={() => onChange({ pokemon_dex: null })}
          >
            Clear dex (use name)
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSprite}
        />
        <Button
          size="small"
          variant="secondary"
          type="button"
          onClick={() => fileRef.current?.click()}
          isLoading={uploading}
        >
          Upload custom sprite
        </Button>
        {value.sprite_image && (
          <Button
            size="small"
            variant="transparent"
            type="button"
            onClick={() => onChange({ sprite_image: null })}
          >
            Remove sprite
          </Button>
        )}
      </div>
    </div>
  );
};

export default CardPokemonFields;
