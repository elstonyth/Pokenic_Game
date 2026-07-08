import { useState } from 'react';
import { Container, Heading, Text, Input, Badge, clx } from '@medusajs/ui';
import { Photo } from '@medusajs/icons';
import type { RouteConfig } from '@mercurjs/dashboard-sdk';
import { usePixelPokemon } from '../../lib/queries';
import { resolveImageUrl } from '../../lib/image-url';
import { Pager } from '../../components/Pager';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

export const config: RouteConfig = {
  label: 'Pixel Pokédex',
  icon: Photo,
  rank: 5,
};

const PAGE_SIZE = 60;

// Admin Pokédex — browse every pixel-Pokémon in the library (the entries cards
// link to by id). Search by name/#dex, filter by type, and toggle custom-only.
// Server filters + paginates; this page is read-only (upload/edit is a follow-up).
const PixelPokedexPage = () => {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [custom, setCustom] = useState<'' | 'true'>('');
  const [page, setPage] = useState(0);

  const { data, isError } = usePixelPokemon({
    q,
    type,
    custom,
    page,
    limit: PAGE_SIZE,
  });

  // Any filter change resets to the first page (stale offsets show nothing).
  const setFilter = (fn: () => void) => {
    fn();
    setPage(0);
  };

  const chip = (active: boolean) =>
    clx(
      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
      active
        ? 'bg-ui-bg-base-pressed border-ui-border-strong'
        : 'bg-ui-bg-subtle border-ui-border-base hover:bg-ui-bg-base-hover',
    );

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-col gap-3 px-6 py-4">
          <div>
            <Heading level="h2">Pixel Pokédex</Heading>
            <Text className="text-ui-fg-subtle mt-1" size="small">
              Every pixel-Pokémon in the library
              {data ? ` — ${data.total.toLocaleString('en-US')} shown` : ''}. Cards
              link to these entries by id.
            </Text>
          </div>

          <Input
            placeholder="Search by name or #dex…"
            aria-label="Search pixel pokémon by name or dex"
            value={q}
            onChange={(e) => setFilter(() => setQ(e.target.value))}
          />

          {data && data.all_types.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={chip(type === '')}
                onClick={() => setFilter(() => setType(''))}
              >
                All types
              </button>
              {data.all_types.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chip(type === t)}
                  onClick={() => setFilter(() => setType(type === t ? '' : t))}
                >
                  {t}
                </button>
              ))}
              <span className="bg-ui-border-base mx-1 h-4 w-px" aria-hidden />
              <button
                type="button"
                className={chip(custom === 'true')}
                onClick={() =>
                  setFilter(() => setCustom(custom === 'true' ? '' : 'true'))
                }
              >
                Custom only
              </button>
            </div>
          )}
        </div>

        {isError ? (
          <div className="border-t px-6 py-8">
            <Text className="text-ui-fg-subtle">
              Couldn’t load the pixel-Pokémon library.
            </Text>
          </div>
        ) : !data ? (
          <div className="border-t px-6 py-8">
            <LoadingSkeleton />
          </div>
        ) : data.pixel_pokemon.length === 0 ? (
          <div className="border-t px-6 py-8">
            <Text className="text-ui-fg-subtle">No matches.</Text>
          </div>
        ) : (
          <div
            data-testid="pokedex-grid"
            className="grid grid-cols-2 gap-3 border-t p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
          >
            {data.pixel_pokemon.map((p) => (
              <div
                key={p.id}
                className="border-ui-border-base bg-ui-bg-subtle flex flex-col items-center gap-2 rounded-lg border p-3"
              >
                {p.image_url ? (
                  <img
                    src={resolveImageUrl(p.image_url)}
                    alt={p.name}
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded bg-white object-contain"
                  />
                ) : (
                  <div className="border-ui-border-base bg-ui-bg-base text-ui-fg-muted flex h-16 w-16 shrink-0 items-center justify-center rounded border text-xs">
                    —
                  </div>
                )}
                <div className="text-center">
                  <Text size="small" className="font-medium leading-tight">
                    {p.name}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {p.dex !== null ? `#${p.dex}` : 'custom'} · {p.variant}
                  </Text>
                </div>
                {p.types.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-1">
                    {p.types.map((t) => (
                      <Badge key={t} size="2xsmall">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {data && (
          <Pager
            page={page}
            onPage={setPage}
            pageSize={data.limit}
            count={data.pixel_pokemon.length}
            total={data.total}
          />
        )}
      </Container>
    </div>
  );
};

export default PixelPokedexPage;
