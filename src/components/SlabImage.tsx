'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useSlabFrame } from '@/components/SlabFrameProvider';
import { cn } from '@/lib/utils';

/**
 * Aspect ratio of the slab overlay (measured from the default frame asset —
 * scripts/process-slab-frame.mjs prints it). Real PSA cases are ≈ 0.62.
 */
export const SLAB_ASPECT = 1462 / 2446;

// Where the card window sits inside the frame, as % insets of the slab box
// (printed by scripts/process-slab-frame.mjs for the default asset).
// ponytail: admin-uploaded replacement frames must keep this same window
// geometry — insets are a build-time constant, not per-frame metadata.
const WINDOW: CSSProperties = {
  top: '28.33%',
  left: '10.47%',
  right: '10.47%',
  bottom: '6.66%',
};

/**
 * A card photo presented as a graded slab: the raw product image (e.g. the
 * PriceCharting pull) sits inside the frame's transparent card window, and
 * the PSA-style case overlay renders on top. One frame for every card —
 * admin-swappable via the Storefront settings page (context provides the URL).
 *
 * The wrapper is a block at SLAB_ASPECT; size it from the parent via width
 * classes (the height follows). The window ≈ 0.72 aspect, close enough to
 * card stock (5:7) that object-cover crops only slivers.
 */
export function SlabImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
}) {
  const frame = useSlabFrame();
  return (
    <span
      className={cn('relative block', className)}
      style={{ aspectRatio: String(SLAB_ASPECT) }}
    >
      {/* Real Pokémon cards have ~3mm corner rounding on a 63mm-wide card
          (≈4.8% of card width). Clipping here bakes that curve into EVERY
          pulled photo at render time — no per-image editing, ever. The y-radius
          compensates for the window's aspect so corners stay circular. */}
      <span
        className="absolute overflow-hidden"
        style={{ ...WINDOW, borderRadius: '4.8% / 3.4%' }}
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
      {/* Decorative case chrome. unoptimized: the URL is admin-configurable
          (any media host), and the asset is already a sized WebP — skipping
          the optimizer avoids remote-pattern config for arbitrary hosts. */}
      <Image
        src={frame}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        priority={priority}
        unoptimized
        className="pointer-events-none select-none object-contain"
      />
    </span>
  );
}
