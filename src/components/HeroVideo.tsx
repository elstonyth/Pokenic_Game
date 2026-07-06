'use client';

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/lib/use-reveal';

// Demo video with a pause affordance (WCAG 2.2.2): native controls always on,
// autoplay skipped for reduced-motion users (poster + controls only).
export default function HeroVideo({
  src,
  poster,
  label,
  className,
}: {
  src: string;
  poster: string;
  label: string;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLVideoElement>(null);
  // The hydration pass renders the server snapshot (reduced=false), so the
  // video may already be playing by the time the real preference lands —
  // pause it explicitly.
  useEffect(() => {
    if (reduced) ref.current?.pause();
  }, [reduced]);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster}
      autoPlay={!reduced}
      loop
      muted
      playsInline
      controls
      preload="metadata"
      aria-label={label}
      className={className}
    />
  );
}
