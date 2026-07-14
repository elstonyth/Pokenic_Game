'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reveal';

/**
 * Decorative, autoplaying, muted, looping hero loop with a still poster — for
 * ambient scene motion (factory line, shop at night), not a playable video.
 * No controls: it is background atmosphere, so it carries no content a user
 * needs to pause/seek (that is what the controls-on `HeroVideo` demo player is
 * for). The poster is the clip's own first frame, so there is no pop on play,
 * and it doubles as the LCP image and the reduced-motion still — under
 * `prefers-reduced-motion` the clip never autoplays and the element just shows
 * the poster. `webm` (VP9) is offered first for smaller bytes; `mp4` (H.264) is
 * the universal fallback.
 */
export function AmbientVideo({
  mp4,
  webm,
  poster,
  label,
  className,
  fit = 'cover',
}: {
  mp4: string;
  webm?: string;
  poster: string;
  label: string;
  className?: string;
  fit?: 'cover' | 'contain';
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();

  // SSR renders reduced=false, so the clip may already be playing by the time
  // the real preference lands — enforce the decision explicitly on mount/change.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (reduced) {
      v.pause();
      v.currentTime = 0;
    } else {
      v.play().catch(() => {});
    }
  }, [reduced]);

  return (
    <video
      ref={ref}
      className={className}
      style={{ objectFit: fit }}
      poster={poster}
      autoPlay={!reduced}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={label}
    >
      {webm ? <source src={webm} type="video/webm" /> : null}
      <source src={mp4} type="video/mp4" />
    </video>
  );
}
