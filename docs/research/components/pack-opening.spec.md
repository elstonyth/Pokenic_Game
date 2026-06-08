# Pack-Opening Reveal — Spec (FRAME-MEASURED vs LIVE phygitals, 2026-06-08)

**Target file:** `src/app/claw/[slug]/PackOpenOverlay.tsx`
**Reference frames:** `docs/research/openpack-live/*.png` (recon-live-openpack{,2}.mjs + recon-live-reveal.mjs)
**How to observe (live):** `/claw/<slug>` → **"Try a free demo spin"** (free, no login). The demo runs the
identical animation to a real open. The visible demo link is NOT the first DOM match — click the visible one.

## Interaction model — click/drag-driven full-screen overlay (`fixed inset-0 z-[80] bg-black`)

Top-left back arrow; top-right ⚡ + 🔊 icons. Five stages:

### 1. Carousel — a real 3D CYLINDER (measured)
Classes: `pack-carousel-cylinder` (preserve-3d) / `pack-carousel-slot` / `pack-carousel-reflection` / `pack-carousel-inner`.
- **6 identical packs, 60° apart**, on a cylinder of **radius 259.2px** (each slot = `rotateY(i*60deg) translateZ(259.2px)`), `--pc-local-angle: {0,60,120,180,240,300}deg`. Front pack slot ≈ **318×444**.
- **Floor reflection**: a mirrored copy per pack (`matrix3d` with `-1` on Y), faded.
- **DRAG/SWIPE ROTATES THE CYLINDER.** A 364px horizontal drag rotated the cylinder `rotateY(120°)` (2 slots) — i.e. ~`0.33°/px`. Release **snaps to the nearest 60°**.
- Bottom: **"⇄ SHUFFLE"** pill (spins to a random slot) + caption **"TAP TO SELECT A PACK TO OPEN"**.
- A click that isn't a drag → select the front pack → slab. (All packs are the same pack being opened, so selection is cosmetic.)

### 2. Slab — face-down graded holder
A realistic clear graded-card **holder** (PSA/BGS-style bezel) centered:
- Top label bar: **brand wordmark** (`▰ phygitals` → clone `pokenic`) + a **QR code** (top-right).
- Card back = black with **embossed category glyphs**: a large center **brand "P"** + sport/category emblems (one-piece skull, basketball, pokeball).
- Footer micro-text: **"PHYGITAL CERTIFICATION"**.
- Top label **"1 of 1"**; bottom **"● TAP TO REVEAL"** (pulse). Tap → reveal.

### 3. Metadata (stacked, centered, staggered fade-in, soft white glow on values)
Tiny grey uppercase labels over big bold white values:
- **YEAR** `2003` · **CATEGORY** `Pokemon` · **GRADE** `PSA 10` · then the **rarity** (its tier word).
- Holds ~1.8s → Pull. Clone data: CATEGORY = pack category; GRADE parsed from card name (`PSA/CGC/BGS/SGC \d+`);
  YEAR omitted unless present (don't fabricate); rarity from the card.

### 4. Pull celebration (~1s) — NEW STAGE the clone was missing
A **diagonal rarity-COLORED ribbon** sweeps across screen with a repeating marquee **"`<RARITY> PULL •`"**, and a
big white **"`<Rarity>!`"** shout centered over the (still-visible) slab. Ribbon color = rarity color
(Mythic→gold/yellow on live; clone maps to its rarity rgb).

### 5. Card reveal
The card inside a **PSA-style graded holder** (white border + top grade label), centered + scale-in with a
rarity glow. Below: **"1 of 1"**, the full **card name**, a **rarity chip** + **value** (`$2,606.69`), green
**Continue** (closes) + an **Open another** path.

## Rarity colors (clone RARITY_RGB) — reuse for pill + glow + ribbon
Legendary 234,179,8 · Epic 217,70,239 · Rare 56,189,248 · Uncommon 52,211,153 · Common 163,163,163.
(NB: live rarity tiers are Common/Uncommon/Rare/Epic/**Mythic**; the clone keeps its own Legendary→Common set.)

## Build notes
- Stage machine: `"packs" | "slab" | "metadata" | "pull" | "card"`; reduced-motion → jump to `card`.
- Cylinder: React `rotation` state; `transform: rotateY(rotation)`; 6 slots; pointer drag updates rotation,
  release snaps to nearest 60°; SHUFFLE animates to `round/60*60 + 60*rand`. Distinguish click (open) from drag.
- Demo (random CARD_POOL card) and the real backend open both route through this overlay (nonce-keyed remount).

## Verify
Prod `:4000`, `scripts/capture-pack-open-anim.mjs` (motion on) through all 5 stages via the demo; read frames;
reduced-motion path; compare to live `openpack-live/` frames.
