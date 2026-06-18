# Slot Machine v2 — Design Spec

**Status:** Approved design (brainstorming output) — ready for implementation planning
**Date:** 2026-06-18
**Branch:** `feat/slot-machine-v2` (off `master` @ 37626f6, which contains the shipped v1 x1 slot from PR #11)
**Supersedes/extends:** `docs/prd/slot-machine-conversion.md` (v1 PRD). v1 shipped a single inline `/slots/[slug]` page with a horizontal reel of rarity-tinted SVG balls. v2 redesigns the flow, assets, and reel orientation, and builds the deferred multiplier.

---

## 1. Goal

Turn the slot feature into a full **pack-pick → full-screen reveal → tap-to-peel → vertical-reel spin → win** experience, fixing two reported bugs, replacing the placeholder ball art with real Pokéball assets, and building the 1–3 pack multiplier. The win-rate lock stays server-authoritative and untouched.

## 2. Reported bugs (folded into the redesign — not patched on the old reel)

1. **Win shown mid-spin.** The "YOU WON — … · $value" label, win sound, and revealed price must appear **only after the reel has fully stopped**. In v2 this is satisfied by construction: the win banner/sound/price fire on the reel's settle (`onTransitionEnd` / final settle), never during the spin. (v1 already had a spoiler guard; v2's full-screen state machine makes the gate explicit.)
2. **Layout shift / footer expansion during play.** v2's reveal is a **fixed, immersive full-screen surface** — no site header/footer, no scroll, SPIN + all controls in fixed positions. No element reflows during the spin. Standard screen ratios; responsive down to mobile.

## 3. Routes

| Route           | Role                                                                                                                                                                                                                      | Pattern                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/slots`        | **Configurator** — laid out like `/claw/[slug]` (`PackDetailClient`): category, pack-type tiles, **quantity 1–3**, Expected Value, demo spin, **Play** CTA. Picking a pack + N and pressing Play navigates to the reveal. | server `page.tsx` + `'use client'` `SlotsConfigClient.tsx` |
| `/slots/[slug]` | **Immersive full-screen reveal** — the chosen N packs → peel → vertical reels → win. No site chrome, fixed layout. `count` carried via query/state.                                                                       | server `page.tsx` + `'use client'` `SlotRevealClient.tsx`  |

`/claw/*` is untouched. The site header/footer are suppressed for `/slots/[slug]` only (a layout-level conditional or a route-group without the shell).

## 4. Reveal sequence (the core UX)

1. **Packs appear** — the chosen **N packs (1–3) front-facing**, no skew/perspective, same size, centered. Prompt: "tap to open".
2. **One tap opens all** — a single tap/click peels **all N packs** open (foil strip/peel animation). **No spin yet.**
3. **Reels revealed, idle** — each opened pack becomes one **vertical reel column**, sitting still.
4. **User taps SPIN** — all N reels start together, spin **top→bottom (↓)**, and **stop staggered left→right** (suspense). Single reel just stops once.
5. **Land + reveal** — each reel lands its backend-rolled winner ball on the **shared horizontal payline**. The win label + sound + price appear **only after full stop** (per-reel settle; the headline/big-win burst on final settle).
6. **Post-win** — a **"View card"** button opens a modal with the graded card slab; a **30s instant sell-back** offer per won card (focused column when N>1; per-column countdowns).

### Reel model

- N **vertical** reel columns side-by-side, one **shared horizontal payline** across their centers.
- Spin = `translateY` from top, ease-out to the winner cell centered on the payline. (v1's `reelTarget`/`buildStrip` math is reused, **adapted from X to Y**.)
- Staggered stop: each column gets a longer transition (`durationMs(k) = BASE + k*STAGGER`), so they settle L→R. Reduced motion: winners centered instantly, no spin.
- 5/3 visible cells per column responsive; side cells clipped.

## 5. Assets — Pokéball art (operator-supplied)

Source: the user's PNGs at `C:\Users\PC\Desktop\Pokeball` (12 high-res renders, white backgrounds).

**Rarity → ball mapping (confirmed):**

| Rarity    | Ball        | File                             |
| --------- | ----------- | -------------------------------- |
| Legendary | Master Ball | `Master_Ball_on_white…png`       |
| Epic      | Luxury Ball | `Luxury_ball_black_gold_red…png` |
| Rare      | Ultra Ball  | `Stylized_Ultra_Ball…png`        |
| Uncommon  | Great Ball  | `Stylized_Great_Ball…png`        |
| Common    | Poké Ball   | `Poké_Ball…png`                  |

**Decoy symbols** (non-winner reel cells, variety only): Premier, Timer, Dive, Nest, Friend, Love, Net.

**Processing (build task):** the PNGs have **white backgrounds** — they must be made **transparent** (the reel cells are dark `bg-neutral-950`). Approach: ImageMagick/`sharp` fuzz-based white→alpha, trim, export optimized WebP/PNG into `public/images/balls/` with clean names (`master.webp`, `luxury.webp`, …, `decoy-timer.webp`, …). `BallToken` swaps from the SVG placeholder to `next/image` of these assets, keyed by rarity (winner) or decoy pool (filler).

Balls remain **cosmetic, keyed by the backend-rolled card** — they decide nothing (lock §7). The graded card slab + value remain the real prize/sell-back basis.

## 6. Animation

- **Engine:** Motion (`motion/react`, already a dependency, used in `PackOpenOverlay`) for orchestration/springs/`AnimatePresence`; **CSS `clip-path`** for the foil peel; **CSS transforms** for the vertical reel. The `motion-framer` skill is installed (`~/.agents/skills/motion-framer`).
- **Peel = a swappable component** (`PackPeel`) with a clean interface (`onPeeled` callback) so a designer-authored **Rive/Lottie** peel can replace the CSS one later without touching the reveal flow. (Research: Remotion + HeyGen Hyperframes are _video_ renderers — wrong for an interactive, outcome-driven reel; Rive/Lottie are designer-authored and deferred.)
- **Reduced motion:** every surface degrades — packs open with a crossfade, reels land centered instantly, no peel/pulse/burst (reuse `usePrefersReducedMotion`).

## 7. Backend — `open-batch` (the multiplier)

`POST /store/packs/:slug/open-batch` with body `{ count: 1..3 }` (cap 3 for v2's pack layout; Zod-validated). **All-or-nothing**, per the v1 PRD §7.2:

- One batch workflow; acquire the per-customer advisory lock once; **one atomic debit of `count × price`** (one `credit_transactions` row); loop `rollPackStep → recordPullStep` N times in the same workflow.
- Affordability pre-checked: `balance < count×price` → reject the whole batch (`needsTopUp`), never partial.
- Saga rollback: a failure at roll k compensates prior steps (delete inserted pulls, refund the single debit). Either all N commit or none.
- Each roll is an independent server-side `Math.random()` draw → **win-rate lock preserved per roll**. No `weight`/`computeOdds` ever reaches the client.
- Returns `{ rolls: [{pull, card, buyback}], price, total_charged, balance }`. One request against the rate limiter.

UI hard-gates SPIN on `TOTAL ≤ balance`; the batch reject is the safety net.

## 8. Win-rate lock — unchanged

Identical guarantee to v1 PRD §8: outcomes are decided server-side over normalized `PackOdds.weight` before any UI mounts; the reel only _displays_ `res.card`. v2 adds nothing client-side that decides outcomes. The ball is resolved from the won card's rarity (cosmetic).

## 9. Sell-back & view-card

- **Sell-back:** reuse the already-extracted `SellBackPanel` (30s instant offer + countdown + confirm modal + server buyback). For N>1, a **focused column** model: Band shows one offer at a time, each column keeps its own wall-clock countdown; reveal ping fires per column at that column's settle.
- **View card:** a **"View card"** button per won column opens a modal showing the graded slab (`card.image`) + name/value (reuse the card-flip/`SellConfirmModal` modal patterns).

## 10. Full-screen, responsive, a11y

- Immersive: `/slots/[slug]` renders without `SiteHeader`/`SiteFooter`; body scroll locked during the reveal; fixed viewport (`100dvh`), no layout shift; SPIN + controls in fixed thumb-zone positions.
- A11y: single `role="status" aria-live="polite"` announcing the result once on final settle; `aria-busy` on the reel during spin; modals (View card, Sell confirm, Odds) get `role="dialog" aria-modal` + Escape + focus management; ≥48px targets; reduced-motion honored everywhere; audio/haptics never the sole indicator.

## 11. Reuse map (from `/claw` and v1)

| Reuse                                                                           | For                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `PackDetailClient` layout (`/claw/[slug]`)                                      | `/slots` configurator structure (tiles, qty, EV, Play) |
| `SellBackPanel` (extracted in v1)                                               | sell-back per won column                               |
| `reelTarget` / `buildStrip` (`src/lib/reel.ts`)                                 | reel landing math — **adapt X→Y (vertical)**           |
| `useSound` (`src/lib/use-sound.ts`)                                             | SFX + haptics + mute (v1)                              |
| `motion.ts` tokens + win-burst keyframes (`pullShout`/`revealFlash`/`shardFly`) | peel + win polish                                      |
| `openPack`/`revealPull`/`getCreditBalance`/`sellBackPull` server actions        | x1 path + sell-back; add `openBatch` action for N      |
| `usePrefersReducedMotion`, `RARITY_RGB`                                         | reduced motion + tint                                  |

## 12. Testing

- **Unit (vitest):** vertical reel math (`reelTargetY`), `buildStrip` (reused), `open-batch` request/response shaping, ball-for-rarity mapping.
- **Backend integration (jest):** `open-batch` — one `N×price` debit + N pulls on success; whole-batch reject + full rollback on shortfall/failure; lock honored per roll; `count` cap 3.
- **Playwright (prod build :4000):** configurator → Play → packs appear → tap opens all → SPIN → reels land staggered → win only after stop → COST debits `N×price` → sell-back → view-card modal; reduced-motion centered; full-screen no-layout-shift capture; win-rate-lock regression (admin odds edit doesn't change the storefront roll path).
- Asset check: balls render transparent on dark cells at desktop/mobile/4K.

## 13. Phased rollout

- **Phase A — Assets + configurator:** process the 12 balls → `public/images/balls/`; `BallToken` → real art; build `/slots` configurator (qty 1–3) reusing `PackDetailClient`.
- **Phase B — Full-screen reveal shell + vertical reel:** route + immersive layout (no chrome, no shift); adapt reel math to vertical; `SlotReelColumn` + `SlotReelStack` (N columns, shared payline, staggered L→R); win-after-stop.
- **Phase C — Packs + peel:** N front-facing packs; one-tap peel (`PackPeel`, Motion + CSS clip-path, swappable); idle→SPIN gate.
- **Phase D — Multiplier backend:** `open-batch` endpoint (all-or-nothing) + `openBatch` action; wire N reels to N rolls.
- **Phase E — Sell-back + view-card + polish:** focused-column sell-back, view-card modal, SFX, big-win burst, reduced-motion, a11y, Playwright sign-off.

## 14. Open items (non-blocking defaults)

1. Decoy count per column (default 7-symbol pool, reshuffled per spin).
2. Pack-peel exact choreography (CSS clip-path strip vs corner-peel) — Phase C visual tune.
3. Turbo timing for N=3 (reuse v1 stagger defaults).
4. Whether `/slots` keeps the demo spin (default: yes, reuse v1 demo path).

---

**Research note (animation tooling, 2026-06-18):** find-skills + web + last30days confirmed Remotion & HeyGen Hyperframes are HTML/React→MP4 _video_ engines (excellent for AI-generated video, wrong for an interactive outcome-driven reel); Rive has strong interactive momentum but is designer-authored (`.riv`); Motion + CSS is the Claude-authorable, interactive, installed choice. Hence: Motion + CSS clip-path core, peel swappable for a Rive/Lottie asset later.
