// src/app/slots/[slug]/CardTile.tsx
'use client';

// A reel cell as a BARE pixel Pokémon sprite (spec decision #17, supersedes
// #11's white mini-card look): no white face/border/shadow chrome — the box
// stays CARD_ASPECT-shaped (same geometry VaultReelColumn measures for the
// morph) but renders transparent, and the sprite fills most of it. Landed
// glow is a sprite-hugging drop-shadow (a box-shadow here would draw a glowing
// rectangle around empty transparent space). Rarity glow appears ONLY when
// `landed` (after settle) — rarityRgb must be null before that (spoiler guard).
import { cn } from '@/lib/utils';
import { CARD_ASPECT } from '@/lib/vault-reel';
import { PokemonToken } from './PokemonToken';

export function CardTile({
  dex,
  name,
  size,
  landed,
  rarityRgb,
  reduced,
  eager,
  imageSrc,
}: {
  dex: number;
  name: string;
  size: number;
  landed: boolean;
  rarityRgb: string | null;
  reduced: boolean;
  eager: boolean;
  imageSrc?: string;
}) {
  // Same aspect as the slab — required for the shape-synced reveal morph.
  const cardH = size;
  const cardW = Math.round(cardH * CARD_ASPECT);
  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        !reduced && 'transition-transform duration-300 ease-out',
        landed && !reduced && 'scale-110',
      )}
      style={{
        width: `${cardW}px`,
        height: `${cardH}px`,
      }}
    >
      <PokemonToken
        dex={dex}
        name={name}
        tier="common"
        size={Math.round(size * 0.88)}
        landed={false}
        reduced={reduced}
        eager={eager}
        imageSrc={imageSrc}
        filter={
          landed && rarityRgb
            ? `drop-shadow(0 0 10px rgba(${rarityRgb}, 0.85)) drop-shadow(0 0 24px rgba(${rarityRgb}, 0.45))`
            : undefined
        }
      />
    </div>
  );
}
