'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { liquidGlass, type LiquidGlassOptions } from './liquid-glass';

/**
 * Tuned presets (see .claude/skills/liquid-glass). SUBTLE is for text-heavy
 * panels — sheets, modals, forms — where the interior must stay legible.
 * ACCENT is for small, short-content surfaces (toast, chips, banners) that
 * can afford the stronger rim bulge.
 */
export const GLASS_SUBTLE: LiquidGlassOptions = {
  scale: -60,
  chroma: 4,
  blur: 6,
  saturate: 1.4,
  fallbackBlur: 24,
};

export const GLASS_ACCENT: LiquidGlassOptions = {
  scale: -100,
  chroma: 6,
  blur: 4,
  saturate: 1.5,
  fallbackBlur: 20,
};

/**
 * Liquid-glass rim refraction on `ref`'s element while `enabled` is true
 * (pass the modal/sheet `open` flag so the map is built only when the panel
 * is actually mounted). Options are read when the effect (re)runs — they are
 * static per call site, not reactive. Safari/Firefox get the frosted-blur
 * fallback automatically; callers keep the CSS dressing (translucent tint,
 * border, inset highlights) so the fallback still reads as glass.
 */
export function useLiquidGlass(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
  opts: LiquidGlassOptions = GLASS_SUBTLE,
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    const handle = liquidGlass(el, optsRef.current);
    return () => handle.destroy();
  }, [ref, enabled]);
}
