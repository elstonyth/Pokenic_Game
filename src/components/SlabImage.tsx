'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { rarityRgb } from '@/lib/rarity';

/**
 * Aspect ratio of the baked slab composite (= the frame asset it's baked
 * from — scripts/process-slabframe-v2.mjs prints it). Real PSA cases ≈ 0.62.
 */
export const SLAB_ASPECT = 1600 / 2867;

/** Bare trading-card stock (63×88mm ≈ 5:7) — the raw-card fallback. */
const CARD_ASPECT_RAW = 5 / 7;

/** Ring thickness of the tier frame, % of width. */
const FRAME_BAND = 5;

/**
 * Tier frame LOCKED IN 2026-07-17: the band itself is pre-rendered art —
 * public/images/slab-frames/<tier>.webp, one per gacha rarity (SnapGen
 * dark-glass master, geometry-guided via scripts/compose-frame-variant.mjs
 * --guide, hue-tinted per tier from ONE master so lighting is identical
 * across tiers). The webp already carries the transparent window cut to the
 * measured slab geometry, so no runtime masking of the band is needed; CSS
 * keeps only the breathing halo + the traveling light sweep (masked to the
 * band by RING_MASK). Deliberately NO refraction/displacement — an earlier
 * liquid-glass rim (src/lib/liquid-glass.ts) magnified the case edge and was
 * rejected.
 *
 * Uniform-thickness band: the outer box shares the slab's aspect, so a
 * frame at inset 0 would get 1/aspect≈1.67× thicker top/bottom bands. The
 * frame's outer edge is pulled inward vertically by BAND·(1−aspect) (of
 * height) instead; the slab itself never moves.
 *
 * Measured geometry (2026-07-17 alpha scan of the frame-v2 asset via
 * scripts/measure-slab-margins.mjs; also encoded in
 * scripts/compose-frame-variant.mjs which cut the webp assets): the slab's
 * CLEAR plastic outline edge sits at inset ~90-100 in frame units (asset
 * insets 17/22/16/11 px at 1600w, well 5%, mean ≈ 95) with a ~50px corner
 * radius. Band hole: inset 92, r48 (tucks under the plastic's AA edge);
 * outer corner r140 (= hole r + band + edge gap) keeps the band uniform at
 * corners.
 */
const FRAME_VB_W = 1600; // mask viewBox units = slab asset px
const FRAME_VB_H = Math.round(
  (FRAME_VB_W / SLAB_ASPECT) * (1 - 2 * (FRAME_BAND / 100) * (1 - SLAB_ASPECT)),
);
const OUTER_R = 140;
const HOLE_INSET = 92;
const HOLE_R = 48;

/** Rounded-rect SVG path (circular corners). */
function rrPath(x: number, y: number, w: number, h: number, r: number) {
  const x1 = x + w;
  const y1 = y + h;
  return (
    `M${x + r},${y}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y + r}V${y1 - r}` +
    `A${r},${r} 0 0 1 ${x1 - r},${y1}H${x + r}A${r},${r} 0 0 1 ${x},${y1 - r}` +
    `V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`
  );
}

/** Confines the light sweep to the band (the webp is already band-shaped). */
const RING_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${FRAME_VB_W} ${FRAME_VB_H}'>` +
    `<path fill='white' fill-rule='evenodd' d='${rrPath(0, 0, FRAME_VB_W, FRAME_VB_H, OUTER_R)} ${rrPath(HOLE_INSET, HOLE_INSET, FRAME_VB_W - 2 * HOLE_INSET, FRAME_VB_H - 2 * HOLE_INSET, HOLE_R)}'/></svg>`,
)}") center / 100% 100% no-repeat`;

/** Vertical inset that keeps the band uniform (see block comment above). */
const FRAME_INSET = `${(FRAME_BAND * (1 - SLAB_ASPECT)).toFixed(4)}% 0`;
/** Outer corner radius, matched to the frame art's outer rounded rect. */
const FRAME_RADIUS = `${((OUTER_R / FRAME_VB_W) * 100).toFixed(2)}% / ${((OUTER_R / FRAME_VB_H) * 100).toFixed(2)}%`;

/** Tiers with a baked frame asset; anything unknown falls back to common. */
const FRAME_TIERS = new Set([
  'immortal',
  'legendary',
  'mythical',
  'rare',
  'uncommon',
  'common',
]);
function frameSrc(rarity: string): string {
  const key = rarity.toLowerCase();
  return `/images/slab-frames/${FRAME_TIERS.has(key) ? key : 'common'}.webp`;
}

/**
 * The traveling light: a huge square conic-gradient child rotated by the
 * slab-frame-spin keyframes (globals.css); the ring mask on the parent
 * confines it to the band. Sized to cover the frame's diagonal.
 */
function lightStyle(rgb: string): React.CSSProperties {
  return {
    left: '50%',
    top: '50%',
    width: '220%',
    aspectRatio: '1',
    transform: 'translate(-50%, -50%)',
    background: `conic-gradient(from 0deg,
      transparent 0deg,
      rgba(${rgb},0.9) 80deg,
      rgba(255,255,255,0.95) 100deg,
      rgba(${rgb},0.9) 120deg,
      transparent 200deg,
      rgba(255,255,255,0.5) 280deg,
      transparent 340deg)`,
  };
}

/** Breathing outer halo (slab-frame-pulse keyframes, globals.css). */
function glowStyle(rgb: string): React.CSSProperties {
  return {
    inset: FRAME_INSET,
    borderRadius: FRAME_RADIUS,
    boxShadow: `0 0 44px -2px rgba(${rgb},0.8), 0 0 90px -20px rgba(${rgb},0.6)`,
  };
}

/**
 * One card image. Graded cards pass `slabSrc` — the backend-baked
 * frame+photo composite — rendered as a single <Image>. Raw cards (and
 * graded cards whose bake failed) render the bare photo, letterboxed inside
 * the SAME SLAB_ASPECT box so mixed grids stay row-uniform and call sites
 * never branch on aspect. The corner rounding matches what the old runtime
 * clip applied (4.8% / 3.4%).
 *
 * Pass `rarity` (the admin-set gacha tier) to surround the slab with the
 * tier-colored glass frame (rarity.ts colors: Immortal orange, Legendary
 * pink, …). Graded (slabSrc) renders only — it's the slab's outer layer,
 * not a raw-card treatment.
 */
export function SlabImage({
  src,
  slabSrc,
  alt,
  sizes,
  className,
  priority = false,
  rarity,
}: {
  src: string;
  slabSrc?: string | null;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  rarity?: string | null;
}) {
  return (
    <span
      className={cn('relative block', className)}
      style={{ aspectRatio: String(SLAB_ASPECT) }}
    >
      {slabSrc ? (
        rarity ? (
          <>
            <span
              aria-hidden
              className="slab-frame-glow pointer-events-none absolute"
              style={glowStyle(rarityRgb(rarity))}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ inset: FRAME_INSET }}
            >
              <Image
                src={frameSrc(rarity)}
                alt=""
                fill
                sizes={sizes}
                priority={priority}
                className="object-fill"
              />
              <span
                aria-hidden
                className="absolute inset-0 overflow-hidden"
                style={{
                  borderRadius: FRAME_RADIUS,
                  WebkitMask: RING_MASK,
                  mask: RING_MASK,
                }}
              >
                <span
                  className="slab-frame-light absolute"
                  style={lightStyle(rarityRgb(rarity))}
                />
              </span>
            </span>
            <span className="absolute" style={{ inset: `${FRAME_BAND}%` }}>
              <Image
                src={slabSrc}
                alt={alt}
                fill
                sizes={sizes}
                priority={priority}
                className="object-contain"
              />
            </span>
          </>
        ) : (
          <Image
            src={slabSrc}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className="object-contain"
          />
        )
      ) : (
        <span
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 overflow-hidden"
          style={{
            aspectRatio: String(CARD_ASPECT_RAW),
            borderRadius: '4.8% / 3.4%',
          }}
        >
          <Image
            src={src}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className="object-cover"
          />
        </span>
      )}
    </span>
  );
}
