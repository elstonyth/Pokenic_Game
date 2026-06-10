# Motion Fidelity Spec — measured from LIVE phygitals.com (2026-06-10, rAF-resolution)

Source data: `docs/research/openpack-live/{DIGEST.md, reveal-track.json, reveal2-track.json,
overlay-entrance.json, cylinder-*.json, shot-*.png, reveal2-*.png}` and
`docs/research/motion-live/{hero-curve2.json, home-hover.json, claw-hover.json}`.
Captured with `scripts/recon-motion-live{,2}.mjs` (in-page requestAnimationFrame recorder),
digested by `scripts/analyze-motion-recon{,2}.mjs`. Live = GSAP + Framer Motion; we rebuild
with the `motion` package (Framer Motion v12, `motion/react`).

## Shared easing vocabulary (exact, from live CSS animations)

| Token | Value | Used by (live) |
|---|---|---|
| `EASE_EXIT` | `cubic-bezier(0.55, 0, 0.85, 0.4)` | pack-carousel-exit (packs drop on select) |
| `EASE_RISE` | `cubic-bezier(0.16, 1, 0.3, 1)` | swipe-card-back-first (slab rise), swipe-card-flip |
| `EASE_BACK` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | swipe-suspense-label/value, swipe-rarity-pill (overshoot) |
| `EASE_TW` | `cubic-bezier(0.4, 0, 0.2, 1)` | UI fades, claw hover zoom, machine carousel (0.7s) |
| `easeOut` | CSS `ease-out` | summary-fade-in, hero slide, caption rise |

## 1. Pack-opening overlay (`src/app/claw/[slug]/PackOpenOverlay.tsx`)

### Stage 1 — packs (3D cylinder)
- Geometry (unchanged, previously measured): 6 slots × 60°, drag ≈ **0.33°/px**, release snaps to nearest 60°.
- **Idle float (ADD)**: each pack bobs y ±2.1px, `pack-carousel-float 4.4s ease-in-out infinite`.
- **Select exit (ADD)**: on tap, packs **drop +~430px and fade to ~0.4**, `0.48s EASE_EXIT`;
  surrounding UI (caption/shuffle) fades out `0.18s EASE_TW`. Slab stage begins as the drop ends
  (slab anim start ≈ +460ms after exit start).
- Snap/shuffle: animate rotation with a spring (settle ≈0.5–0.6s, minimal overshoot) via FM
  imperative `animate()` — keep pointer logic imperative (no re-render per move).

### Stage 2 — slab (face-down graded holder)
- **Entrance is a RISE, not a flip**: `y 200→0` + `opacity 0→1`, **0.6s EASE_RISE**
  (live `swipe-card-back-first`; measured 534ms outQuint fit + 334ms opacity outCubic fit).
- "1 of 1" + "● TAP TO REVEAL" label: fade-in `0.4s ease-out` (summary-fade-in).
- **Celestial shimmer (ADD)**: a diagonal sheen sweeps the slab face, `6.5s ease-in-out infinite`
  (`revealv4-celestial-sweep`, opacity 0→1→0 cycle; a second "-back" layer offset later, peak ~0.55).

### Stage 3 — metadata (the suspense screen — on live it IS a `<button>`; tap skips ✓)
- Rows (label over value), rising with **overshoot** (EASE_BACK):
  - label: `y 16→0`, `0.25s EASE_BACK`, delays **0.2s / 0.9s / 1.6s** (row 1/2/3)
  - value: `y 12→0`, `0.2s EASE_BACK`, delays **0.3s / 1.0s / 1.7s** (always +0.1s after its label)
  - value fontSize on live: 42px (`text-[42px]`).
- **Rarity pill**: `0.3s EASE_BACK` at delay **2.6s**.
- **Auto-advance at ≈3.6s** after stage start (was 1.8s in the clone — too fast).
- **Content order on live: YEAR → CATEGORY → GRADE → rarity pill** ("YEAR 2016 CATEGORY Pokemon
  GRADE PSA 10 UNCOMMON"). Clone: parse YEAR (`\b(19|20)\d{2}\b`) from the card name like GRADE;
  fall back to the Value row when no year is present (never fabricate).

### Stage 4 — pull celebration (ribbon + shout) — **GATED BY RARITY**
- Observed: **Epic pull → red ribbon "EPIC PULL •" marquee + "EPIC!" shout; Uncommon pull → NO
  ribbon stage** (metadata went straight to card). Gate: play only for **Epic / Legendary**
  (the clone's top two tiers); Rare and below skip to the card.
- Ribbon visuals (flip frames): ~-8° diagonal, rarity-colored bg, repeating "<RARITY> PULL •",
  big white "<Rarity>!" shout over the still-visible slab. Existing clone keyframes
  (pullRibbonIn 0.5s / pullShout 0.55s overshoot / marquee) match the filmed shape — keep, recolor.

### Stage 5 — card reveal
- **Flip**: backface flip `rotateY 90→0`-equivalent, **0.6s EASE_RISE** (`swipe-card-flip`),
  card content crossfade `0.28s EASE_TW` (summary-fade-in variant).
- Caption/actions block: `y 24→0` + fade, `0.3s ease-out` at **+0.4s delay** (swipe-card-inner).
- **Glow SPINS (CHANGE)**: rotating gradient behind the card, `3.5s linear infinite`
  (`revealv4-glow-spin`, element inset -50%), instead of a static pulsing aura.
- **Presentation (measured 1440)**: the card image is shown **RAW — no holder/frame
  chrome, no border-radius** (IMG 330×569; clone renders 339×560). Below: name 13px/600
  capped ~300px → rarity pill (rarity-colored) + "Value: $…" (value bold) → **Continue
  300×48 r12 green** → ghost "Open another". Wrapping the photo in a white PSA-style
  holder double-frames it (the photo already shows a slab) — don't.
- **Card assets are SLAB-ONLY** (content convention): the display-stand pedestal (and its
  watermark) was cropped off all `public/cdn/cards/*` via `scripts/crop-card-pedestals.mjs`
  (live's reveal uses `-cropped` slab-only variants too), and admins upload slab-only
  images going forward. After editing public/ card sources, refresh the backend copies
  with `FORCE=1 node scripts/restore-backend-static.mjs`.

### Cylinder drag/shuffle feel (release behavior)
- **Release = FLING**: track drag velocity (deg/s, exponentially smoothed); project it
  `FLING_PROJECT≈0.22s` forward, snap the PROJECTED angle to the nearest 60°, and seed the
  release spring with the same velocity (FM `animate(..., { velocity })`). A snap to the
  nearest slot from the raw release angle kills momentum and reads as "drags then stops".
- **Shuffle = roulette deceleration**: a long tween (`1.2s EASE_RISE`), not a stiff spring —
  the spring brakes too abruptly over multi-revolution travel.

### Reduced motion
- Unchanged: jump straight to `card`, no timers, content visible instantly.

## 2. Hero carousel (`src/components/HeroSection.tsx`)
- Slot geometry confirmed: center scale 1 / sides **0.822** / back 0.70; opacity 1 / 0.6 / 0;
  side tilt ±8°; x-offset ±10% of the half-pane (±66px wrap translate at 1440w).
- **Transition: ~650ms, ease-OUT** (measured 620–694ms; best-fit ease-out, NOT ease-in-out).
- **Swap period: ≈4.5s** (transitions at t=2383 and t=6915 in a 9s rAF film) — clone's 2.8s is
  too fast. Set rotate interval to **4500ms**.
- Glow crossfade: same ~650ms ease-out window as the cards (clone had 700ms — fine, align to 650).

## 3. /claw catalog cards (`src/app/claw/ClawClient.tsx`)
- **Hover zoom (ADD)**: the pack ART img scales to **1.092** with `transform 0.7s EASE_TW`,
  clipped by the rounded card frame (overflow-hidden). Measured on live /claw card img.
- Rows: no scroll-snap / arrows observed at 1440 (rows don't overflow with current pack counts);
  keep the existing overflow-x-auto structure.

## 4. Scroll-entry (<Reveal>) — finding, NO change
- Live home sections do **not** animate on scroll-in (the only below-fold opacity-0 elements are
  hover gradient overlays with `opacity 0.3s`). The clone's sitewide fade-up `<Reveal>` is an
  accepted embellishment (core pattern per CLAUDE.md) — keeping as-is, documented here.

## 5. Home card hover (note, out of scope this pass)
- Live home cards crossfade between TWO stacked imgs over `opacity 1.2s ease-in-out` on hover.
  Clone cards have a single img (no back-art asset) — skipped; revisit if back-art is sourced.

## Verification
- Prod build on :4000 (NOT dev). Film the clone overlay with `scripts/film-clone-reveal.mjs`
  (rAF recorder, same digest pipeline) and compare segment tables against this spec.
- `scripts/verify-clone.mjs` at 390/768/1440/1920/2560/3840 — zero overflow, entry sane.
- Reduced-motion: overlay jumps to card; hero static; no infinite animations.
