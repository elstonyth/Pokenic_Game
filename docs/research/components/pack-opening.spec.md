# Pack-Opening Reveal — Spec (matched to LIVE phygitals)

**Target file:** `src/app/claw/[slug]/PackOpenOverlay.tsx` (REBUILD — the current burst
overlay is WRONG; the live flow is a tactile multi-tap sequence, captured below).
**Reference frames:** `docs/design-references/phygitals-open/{demo,reveal,flip}/*.png`
**Interaction model:** click/tap-driven, full-screen overlay (live uses `fixed inset-0 z-[80] bg-black`).
**How to observe (live):** `/claw/<slug>` → **"Try a free demo spin"** (free, no login). Real
"Open Pack" is login+credits-gated, but the demo runs the identical animation.

## The live flow (frame-verified)

1. **Open/demo → full-screen black overlay.** Top-left back arrow; top-right ⚡ + 🔊 icons.
2. **Stage 1 — 3D pack carousel** (`pack-carousel-cylinder`): several identical booster
   packs in a 3D coverflow (center pack forward + angled packs receding L/R, with floor
   reflections). Bottom: a pill **"⇄ SHUFFLE"** + caption **"TAP TO SELECT A PACK TO OPEN"**.
   (demo/spin-*.png)
3. **Stage 2 — face-down slab.** Tapping a pack swaps it for a centered **face-down graded
   slab** (black, "phygitals" wordmark + QR + embossed sport icons on the back). Top: **"1 of 1"**.
   Bottom: **"● TAP TO REVEAL"**. (reveal/r-*.png)
4. **Stage 3 — reveal** (tap the slab):
   - Metadata animates in on black, stacked + centered: **YEAR** `2004`, **CATEGORY** `Pokemon`,
     **GRADE** `BGS 8.5`, then a rounded **rarity pill** (`EPIC`, purple) — big bold white values,
     tiny grey labels above each. (flip/f-04.png)
   - Then the **graded card slab** scales in centered; below it: the card **name** (2 lines),
     a **rarity pill** (`EPIC` purple) + **`Value: $6,956.63`**, and a green **"Continue"** button.
     Top still shows **"1 of 1"**. (flip/f-10.png)

## Rarity pill colors (live)
Legendary=amber/gold, Epic=purple `#7c3aed`-ish, Rare=blue, Uncommon=green, Common=grey.
(Reuse the detail page RARITY rgb: Legendary 234,179,8 / Epic 217,70,239 / Rare 56,189,248 /
Uncommon 52,211,153 / Common 163,163,163.)

## Data available in the clone
`openPack()` returns a `PackCard` { id, name, image, value, rarity }. The backend RolledCard
also has set/grader/grade. Year/category aren't on PackCard → derive: CATEGORY from the active
pack's category name; GRADE from card grade if threaded through (else omit); YEAR not available
(omit or parse from name). Keep the metadata block to what we truly have (rarity + value always;
grade/category when available) — don't fabricate.

## Build plan (clone, faithful but pragmatic)
Full-screen overlay (`fixed inset-0 z-[70] bg-black`), reduced-motion → jump to reveal. Stages
as a state machine driven by TAP (click anywhere / a button):
- **packs**: the selected pack shown large center with a subtle 3D coverflow (center pack +
  2 dimmed siblings angled behind via rotateY/translateZ) + floor reflection; "⇄ Shuffle"
  (re-orders, cosmetic) + caption "Tap to open". Click → slab.
- **slab**: a face-down POKENIC-branded slab (reuse a generic back: dark rounded slab + pokenic
  mark + sport glyphs), "1 of 1" top, "Tap to reveal" bottom + pulse. Click → reveal.
- **reveal**: metadata stagger-fades in (rarity always; value; grade/category if present), then
  the won card slab scales in (rarity-glow border) + name + rarity pill + Value + green
  **Continue** (closes) / and an "Open another" path. Rarity drives pill + glow.
- Keep the existing free **demo** (random CARD_POOL card) + the real backend open both routing
  through this overlay (nonce-keyed remount).

## Verify
Prod `:4000`, `scripts/capture-pack-open-anim.mjs` (motion on) through all stages via the demo;
read frames; reduced-motion path; compare side-by-side to the live `flip/`+`reveal/` frames.
