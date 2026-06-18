# PRD — Slot-Machine Pack Opening

**Status:** Draft for review
**Author:** Claude (research-driven)
**Date:** 2026-06-18
**Repo:** `Pokenic_Game` (phygitals.com clone — Next.js 16 / React 19 / TS strict storefront in `src/`, Medusa backend in `backend/`)

> Every factual claim below is cited to `file:line` verified against the current
> worktree. Where the original brief was inaccurate, the correction is called out
> in **§2.3 Corrections** and folded into the spec.

---

## 1. Overview

### 1.1 Problem

The current "open a pack" reveal (`PackOpenOverlay`) is an interactive 3-D cylinder
of packs that the user drags/taps to reveal a single graded card. It's bespoke,
input-heavy, and tied to the `/claw/[slug]` route. We want a **slot-machine mode**:
one or more horizontal reel rows that spin sideways, decelerate, and land a
glass-cased token on a central neon payline — *"whatever lands wins."* **x1 = a
single row; xN = N stacked rows** that share one payline (§4). A working
horizontal-reel mechanic already ships in `src/app/roulette/RouletteClient.tsx`
(translateX strip, fixed winner index, center-landing, reduced-motion) — this
feature **extends that engine**, it does not invent a new one (§6.5).

### 1.2 Goals

- A horizontal single-payline reel that **displays** the backend-rolled prize on a
  center payline, with idle / spinning / landed / big-win / error states.
- A multiplier control (`−` / `+`) that sets a **roll count** (one row = one roll =
  one pack price). xN stacks N reel rows that **all start together and stop in
  sequence** (real slot machine), sharing one payline.
- Per-pack pricing, a sell-back offer with a live countdown driven by the existing
  buyback timing, and a published rarity-odds readout that never leaks win rates.
- **Operator-managed reel art + items:** reel symbols are **admin-created Balls** (own art
  + name) that group a pack's items; the reel shows the won card's **assigned ball**. Admin
  manages balls, item→ball assignment, and slot config (price, odds, marketing win-rate %)
  via Slot Management — all additive, cosmetic-only, never touching the roll (§16).
- **Coexist** with the classic pack-open flow at a **new route**; `/claw/[slug]`
  stays exactly as-is.
- Reuse the existing server actions, the entire sell-back subsystem, the
  reduced-motion engine, and the `RouletteClient` reel mechanic. The only backend
  change is the **required** batch endpoint for multi-roll (§7.2).

### 1.3 Non-goals

- **No change to the win-rate lock or the roll RNG.** The reel never decides an
  outcome (§8).
- No 3-D / three.js / WebGL (CSS transforms + `motion/react` only).
- No provably-fair / pity / guarantee system (none exists today —
  `src/app/claw/[slug]/PackDetailClient.tsx:488-491`).
- No removal of the classic `/claw/[slug]` overlay (coexist).
- No "single larger bet at N× stake" — the odds model is one roll per open
  (`backend/packages/api/src/workflows/open-pack.ts:30-48`); a scaled single bet
  would change economics and is explicitly out of scope.
- **No autoplay / "spin until …" / auto-rebet.** The multiplier is a one-shot N-roll
  per SPIN press; turbo (§4.1) only compresses one run's animation, it does not loop.
  (A deliberate responsible-play boundary.)
- The "provably-fair" line in `RouletteClient.tsx:181-184` is demo placeholder copy,
  not a shipped system; this feature does not add one.

### 1.4 Resolved decisions (from open-questions review)

| # | Question | Decision |
|---|---|---|
| Q1 | Spin cost | **Per-pack `Pack.price`** (mockup's `$100` is a placeholder). Surface `price` from the open response. |
| Q2 | Multiplier `−`/`+` | Sets a **roll count** N. **One row = one roll = one pack price.** xN stacks N horizontal reel rows that **all start spinning together** and **stop in sequence** (staggered, like a real slot machine). Timing in §4. |
| Q3 | "ODDS 1:2.3-50" | Replace with a **published rarity-odds list** (per-rarity %). Never expose `weight` / `computeOdds`. |
| Q4 | Scope + route | **Coexist** as a new mode at a **new route** (`/slots/[slug]`). Classic `/claw/[slug]` untouched. |

---

## 2. Current vs. new mechanic + file map

### 2.1 Current mechanic (verified)

**Frontend**

| File | Role |
|---|---|
| `src/app/claw/[slug]/page.tsx` | Server component; `export const dynamic = 'force-dynamic'` (`:10`), `generateMetadata` (`:12-24`), fetches `Promise.all([getPackBySlug, getPackDetail, getRecentPulls])` (`:40-44`) → passes `pack` / `siblings` / `detail` / `recentPulls` to the client. |
| `src/app/claw/[slug]/PackDetailClient.tsx` | Controller. State: `active`, `qty` (1–99, **cosmetic** — `:488-491`), `opening`, `openError`, `needsTopUp`, `balance`, `recent`, `reveal` (overlay driver, `:120-135`). `handleOpenPack()` (`:186-232`) calls `openPack(active.id)`; `demoSpin()` (`:163-181`) is client-only theater. |
| `src/app/claw/[slug]/PackOpenOverlay.tsx` | Full-screen reveal. `type Stage = 'packs' \| 'slab' \| 'metadata' \| 'pull' \| 'card'` (`:59`). The `'packs'` stage (`:371-476`) is the 3-D cylinder + imperative spin engine. The `'card'` stage (`:585-746`) shows the won card + the **entire sell-back subsystem** (`:676-762`). Reduced motion jumps straight to `'card'` (`:117`). |
| `src/lib/demo-spin.ts` | Pure, client-safe weighted draw over **published** odds (`:47-74`). Logged-out theater only — must **not** drive a real reel. |
| `src/lib/actions/packs.ts` | `'use server'`. `openPack(slug)` (`:88`) POSTs `body: {}` to the backend, customer derived from the cookie token (`:94-113`); validates via `WonCardSchema` / `OpenBuybackSchema` (`:117-125`). `revealPull(pullId)` (`:174`) stamps the reveal anchor. |

**Backend**

| File | Role |
|---|---|
| `backend/packages/api/src/workflows/open-pack.ts` | `rollPackStep → chargePackOpenStep → recordPullStep → decrementCardStockStep → emitEventStep` (`:27-81`); returns `{ pull, card, balance, price }` (`:72-79`). |
| `…/steps/roll-pack.ts` | Authoritative RNG: `roll = Math.random() * totalWeight` over `PackOdds.weight` (`:60,71-79`); returns `RolledCard` (`:18-27,89-98`). |
| `…/steps/charge-pack-open.ts` | Cost = `Number(pack.price)` (`:34-45`), debited via `mutateCreditAtomic` per-customer advisory lock, `floor: 0` (`:63-75`). Free packs short-circuit (`:53-61`). |
| `…/steps/record-pull.ts` | Inserts one `Pull` row: `customer_id`, `pack_id`, `card_id`, `order_id: null`, `rolled_at` (`:22-30`). Pull model `…/models/pull.ts:11-41` (`status: 'vaulted'` default, `revealed_at` nullable, `showcased` default false). |
| `…/steps/decrement-card-stock.ts` | Best-effort counter, never gates a pull (`:19-28,36-58`). |
| `backend/packages/odds-math/src/index.ts` | `computeOdds()` → basis points, Σ=10000 (`:14,79-144`). `RARITY_WEIGHT` (`:30-36`). The lock math. |
| `…/modules/packs/models/pack-odds.ts` | `pack_id`, `card_id`, `rarity`, `weight`, `locked` (`:10-30`). |
| `…/modules/packs/buyback-rate.ts` | `FLAT_PERCENT = 90` (`:23`), `DEFAULT_WINDOW_MS = 30s` (`:26`), `DEFAULT_REVEAL_GRACE_MS = 5min` (`:30`), `instantDeadlineMs()` (`:53-66`), `resolveBuybackRate()` (`:80-95`), `buybackAmount()` (`:70-73`). |
| `backend/packages/api/src/api/store/packs/[slug]/open/route.ts` | `POST /store/packs/:slug/open`, bearer auth, no body; returns `{ pull, card, balance, price, buyback }` (`:60-78`). |

### 2.2 New mechanic (target)

- A new route `src/app/slots/[slug]/` (server `page.tsx` + `'use client'`
  `SlotMachineClient.tsx`) following the canonical split
  (`src/app/marketplace/page.tsx` + `MarketplaceClient.tsx`).
- A **reel engine** (`SlotReelRow` / `SlotReelStack`, §6.5) **generalized from the
  existing `src/app/roulette/RouletteClient.tsx`**: a `translateX` strip animated by a
  single CSS `transition-transform` with an ease-out cubic-bezier, landing the
  **backend-returned winning token** center under a vertical neon payline via
  `onTransitionEnd`. It is NOT a net-new mechanic — `RouletteClient` already has the
  strip, the center-landing formula (`:74`), the reduced-motion short-circuit
  (`:65-69`), the beam (`:115-116`), and the fuchsia→violet pill (`:175`).
- The reel **replaces only** the cylinder's job; the post-reveal sell-back
  subsystem, reduced-motion handling, demo-vs-real split, server actions, and the
  `buyback` prop construction are **reused as-is** from the classic flow.

### 2.3 Corrections to the original brief (verified)

1. **Cost is per-pack, not `$100`.** `chargePackOpenStep` debits `Number(pack.price)`
   (`charge-pack-open.ts:34-45`). `$100` is a mockup placeholder.
2. **Win-rate-lock framing.** `computeOdds` *is* the lock math, but it runs at
   **save** time (`save-pack-odds.ts:83`) and bakes the locked % into the persisted
   `PackOdds.weight`. The roll (`roll-pack.ts:71-79`) **never reads `locked` and
   never re-runs `computeOdds`** — it draws over stored weights. (§8.)
3. **Unlocked split is rarity-weighted, not even.** The `PackOdds` comment
   (`pack-odds.ts:28`) saying "evenly" is stale; the code splits the remainder
   proportionally by `RARITY_WEIGHT` with largest-remainder rounding
   (`odds-math/src/index.ts:104-136`).
4. **Animation lib is `motion` `^12.40`** (`import … from 'motion/react'`),
   not `framer-motion` (`package.json:46`; `PackOpenOverlay.tsx:12-17`).
5. **No neon-violet accent token exists.** It must be *introduced*. Closest
   precedent is the `from-fuchsia-500 to-violet-500` gradient (7 hits). Panels are
   `rounded-2xl border-white/10 bg-white/5` over `bg-neutral-900`; the home sections
   use no `bg-neutral-950` panel token. Primary CTA precedent is white
   (`CtaSection.tsx:1`).
6. **`canvas-confetti` is not installed.** Add it for the win burst, or reuse the
   existing CSS keyframes (`pullRibbonIn` / `revealFlash` / `shardFly`,
   `globals.css:229-334`).
7. **`price` is already in the HTTP response** (`open/route.ts:63`) but is **dropped
   by `openPack`'s reshape** (`OpenPackResult` has no `price`, `packs.ts:29-56`). To
   show COST in the reveal, add `price` to `OpenPackResult` — **client-only**, no
   backend change.
8. **No batch/quantity endpoint exists.** The synchronized multi-row model needs all N
   winners up front → a new `open-batch` endpoint is required for Phase 2 (§4.3, §7.2).
9. **Reel symbols are admin-created Balls, and none exist in the repo today.** The media
   pipeline `kind` is hardcoded `'pack' | 'card'` (`media/validate.ts:11`); there is no
   ball/token entity, no ball↔item grouping, and no slot-config entity anywhere. Balls are a
   **new admin-CRUD asset** (own art + name) grouping a pack's items via an additive
   `ball_id` on the odds row (§16); the won card's assigned ball is the reel symbol.

---

## 3. UX spec per band & state

Three bands at both breakpoints. Design tokens: body `bg-neutral-900 text-neutral-50`
(`layout.tsx:48`), panels `rounded-2xl border border-white/10 bg-white/5`, muted
`text-neutral-400`, headings `font-heading` (Nekst Black, condensed uppercase),
gutters `.px-fluid` (`clamp(1rem,1.6vw,4.5rem)`, `globals.css:353-356`), full-bleed
(no layout `max-w`). The **single neon-violet accent** is used ONLY on (a) the payline
beam glow and (b) the SPIN pill — introduced as a new token (§6.4).

### 3.1 Band 1 — Top status (quiet/secondary)

- **CREDIT** — the credit balance. Source: `getCreditBalance()` on mount
  (`PackDetailClient.tsx:98-110`). `null` (logged-out / read failure) renders nothing,
  never a wrong `$0`.
  - **SPOILER GUARD (critical):** the classic flow hard-swaps balance the instant the
    open resolves (`setBalance(res.balance)`, `:205`) — harmless there because the card
    reveals the same tick. In the slot the batch resolves balance **and all winners**
    *before* the multi-second spin, so showing the debited balance early lets a user
    infer wins while reels still turn. **Hold the displayed CREDIT at its pre-spin value
    and apply the batch `balance` only on final settle** (optionally animate a debit
    count-down that lands at settle). Same rule for the ticker below.
- **RECENT WINS** ticker — horizontal marquee from the live pull ledger
  (`recentPulls` from `getRecentPulls`, capped 12 — `PackDetailClient.tsx:114,218-228`).
  **Prepend each win at its row's settle, not at batch-resolve** (same spoiler guard).
  Reuse the existing reduced-motion-aware marquee keyframe `sp-scroll-x`
  (`CommunitySection.tsx:129-138`: `translate3d(0→-50%)` + a `prefers-reduced-motion`
  kill-switch that freezes it) rather than a new animation. Note the displayed "amount"
  is the card **FMV** (`RecentPull.value`, `data/packs.ts:226-237`), not a payout —
  label accordingly.
- **WINS** counter — quiet lifetime/recent count. MVP: render the recent-pulls feed
  length or a simple total (no backend change). A precise lifetime count needs a small
  count endpoint (§14 open item 1). Mockup's `3,200` is flavor.

### 3.2 Band 2 — Reel hero (dominant focal point)

- **x1:** a single horizontal strip of glass-cased tokens (**5 visible desktop / 3
  mobile**; side tokens clipped via `overflow-hidden`).
- **xN:** **N stacked horizontal reel rows** — one row per roll (one row = one pack
  price). All rows share **one vertical neon-violet payline beam** running down
  through every row's center cell. Each row lands its own backend winner at the
  payline. Row height shrinks as N grows to fit the viewport (§11).
- The center token of each row is brighter/glowing; the payline beam is the only
  neon-violet surface in the hero.
- A **"YOU WON — <ball name> · <value>"** banner sits just above the reel, connected to
  the center token (gradient underline tying banner→beam→center). The `<ball name>` is the
  won card's **assigned ball** name (the ball its `ball_id` points to, §16, e.g. "Master
  Ball"); `<value>` is the won card's market value (`wonCard.value`). Entrance via
  `pullShout` (`globals.css:318-334`) + `EASE_BACK` (reduced-motion: opacity only). For xN
  it surfaces the highest-value win; the full set is the N landed rows themselves.
- **Reel tokens are admin-created Balls, not card slabs (matches the mockup).** Each reel
  cell renders a ball's glass-cased art; the landed center token is the **won card's
  assigned ball** (resolved from its `ball_id`, §16). The ball is **cosmetic, keyed by the
  backend-rolled card** — it decides nothing (§8). The actual prize is the graded card slab
  (`card.image`) + value, which lands in the vault with the same 30 s offer and drives
  sell-back (§5); surface the slab via a **"view card"** affordance on the won row (and
  always in the vault). Ball art is operator-uploaded/managed (§16).

### 3.3 Band 3 — Control band (one cohesive bar; mobile = bottom thumb zone)

- **ODDS** info block → opens the **published rarity-odds list** (§3.7).
- **WIN-RATE %** (the mockup's `36%`): an **operator-set marketing number**, NOT derived
  from the secret odds. Rendered verbatim from a new admin-set `display_win_rate` field on
  the pack (§7.3) — decoupled from `PackOdds.weight` / `computeOdds`, which stay hidden and
  remain the real source of truth for outcomes (§8). Hidden when unset. It is NOT the
  per-rarity list (that's the ODDS sheet).
- Round **`−`** button, large **SPIN xN** neon pill, round **`+`** button. `−`/`+`
  adjust the **roll count** N: clamp `[1, cap]` (§11/§14), `−` disabled at 1, `+`
  disabled at cap, **both disabled during a spin**; N persists across spins. Touch
  targets ≥48px (§11).
- **SPIN gating:** disabled when logged-out routes to auth (§3.4); **hard-disabled when
  `TOTAL (price × N) > balance`** (affordability checked client-side from the known
  balance before any call). The backend's up-front affordability check (whole-batch
  reject, §7.2) is the safety net, not the primary UX path.
- Under SPIN: **`COST $X / SPIN · TOTAL $X`** — `$X` = pack price (per row), TOTAL
  = `price × N`, recomputed live as N changes.
- **SELL-BACK OFFER** with a live countdown (`Sell back: $X · 0:28`) and a thin
  **draining progress bar**: fill = `max(0, (deadlineMs − Date.now()) / 30000)`,
  anchored to the absolute `deadlineMs` (wall-clock, so it survives tab-throttle like
  the existing countdown). The bar is `aria-hidden` (decorative); the countdown text is
  the screen-reader source. Frozen/zero-width under reduced motion. See §5.
- A small **mute toggle** (repurposed `Volume2`/`VolumeX`) — sound/haptics ship in MVP
  (§3.9), persisted, default unmuted.

### 3.4 States

| State | Behavior |
|---|---|
| **idle** | Reel still, a representative token resting under the payline (decorative idle float, not a result). SPIN enabled when authed and `balance ≥ TOTAL` (§3.3). ODDS/cost reflect the active pack. |
| **resolving (pre-roll)** | SPIN pressed → the (batch) call is in flight but winners aren't back yet, so reels **cannot** start. Show "Opening…" on the pill (mirrors `PackDetailClient.tsx:455`) / a brief pre-spin on the decoys; SPIN + `−`/`+` disabled. On resolve → transition to spinning. |
| **spinning** | All rows start translating together (fast `translateX` → ease-out decel; **no motion-blur** — the proven `RouletteClient` mechanic has none, §6.5). Rows **stop in sequence** (top→bottom, staggered) landing each winner center. Banner reads "SPINNING…". The spin guard is held from SPIN-press **until all rows settle** (not merely until the call resolves — see §10 double-charge). Timing §4. |
| **landed / win** | All rows stopped with winners centered; "YOU WON — <name> · <value>" banner (highest value for xN, entrance via `pullShout`/`EASE_BACK`, §3.2); payline glow pulse; sell-back band activates for the focused row. |
| **big-win celebration** | For `rarity === 'Epic' \| 'Legendary'` (mirrors `PackOpenOverlay.tsx:194`): a confetti/shard burst + brighter beam + held banner. **For xN: fire ONE burst, on the highest-value win at final settle** — not one per qualifying row. Additive layer; never blocks keep/sell controls. Gated under reduced motion (§3.5). |
| **insufficient-funds** | `openPack` returns `needsTopUp` (regex `/not enough credits/i`, `packs.ts:155`). Reel does **not** spin; inline `role="alert"` message + "Add credits in your Vault" link (`PackDetailClient.tsx:469-487`). |
| **sell-back active** | Within the instant window: button "Sell back for $X (Y%) · Ns" + draining bar (§5). |
| **sell-back expired** | After the window: "Sell for $X (Z%)" at the flat 90% vault rate, no countdown. |
| **error** | Transport/HTTP failure → `friendlyError` (`packs.ts:152-163`); reel returns to idle, balance untouched, inline alert. Rate-limit (429) → "Too many… try again in Ns" (`packs.ts:79-81`). |
| **logged-out / demo** | If `!customer`, SPIN opens the auth modal (`PackDetailClient.tsx:188-190`). A **demo reel** may use `demoDraw` (client-only, no charge, no pull, no sell-back; `isReal:false`) — visually identical, watermarked "Demo". |

### 3.5 Reduced motion

Reuse `usePrefersReducedMotion` (`use-reveal.ts:18-24`); `RouletteClient.tsx:65-69`
already shows the pattern (skip the spin, set the winner, go to `done`). Under reduced
motion **every animated surface** must degrade, not just the reel translate:

| Surface | Reduced-motion behavior |
|---|---|
| Reel rows | No translate; winners centered immediately (crossfade), like `RouletteClient:65-69`. |
| Payline beam pulse | Static glow, no pulse. |
| "YOU WON" banner | Appears with no slide/overshoot (opacity only). |
| Big-win confetti/shard | Suppressed (note: `canvas-confetti` ignores `prefers-reduced-motion` by default — must be gated explicitly). |
| RECENT WINS ticker | Frozen (the `sp-scroll-x` media-query kill-switch already does this). |
| CREDIT count-up (if used) | Hard-swap, no animation. |

Multi-roll under reduced motion renders all N rows with winners already centered.

### 3.6 Sell-back UI reuse

The sell-back state machine, reveal-ping effect, countdown tick, `handleSellBack`,
`SellConfirmModal`, and the sign-up CTA (`PackOpenOverlay.tsx:119-190,676-762`) are
lifted into a shared component and rendered in Band 3 for the focused token.

### 3.7 ODDS readout (published rarity list)

The ODDS block (distinct from the WIN-RATE % datum, §3.3) expands to a **per-rarity
published-odds list** — the same shape as today's static `ODDS` Pull Odds list
(`PackDetailClient.tsx:527-540`) and the publicly-safe per-card view
(`store/packs/[slug]/route.ts:51-53`, `weight` omitted). It shows e.g.
`Legendary 0.5% · Epic 4% · …`. It must **never** render `PackOdds.weight`,
`computeOdds`, `RARITY_WEIGHT`, or any locked %. The cryptic "1:2.3-50" label is
dropped.

### 3.8 Focused row (xN sell-back focus)

For xN, multiple won tokens each carry their own `pullId` + countdown, but Band 3
shows **one** sell-back offer at a time — the **focused row**.

- **Default focus:** the highest-value won row, set on final settle.
- **Affordance:** the focused row is visually highlighted (e.g. brighter casing /
  payline tick); other rows show a compact per-row countdown chip.
- **Refocus:** click/tap a row, or arrow-key between rows (rows are keyboard-focusable
  `role="button"`); the previously-focused row keeps its **own** live countdown
  running (each row's timer is independent and wall-clock-anchored, §5.2).
- **Expired-on-refocus:** focusing a row whose 30 s instant window already lapsed shows
  the flat-90% vault offer (no countdown) — the server decides the rate at sell time
  regardless (`buyback-pull.ts:80-87`), so the UI just reflects state, never sets it.

### 3.9 Sound & haptics (MVP)

Audio + haptics ship in MVP (not deferred). The classic flow's decorative `Volume2`
button (`PackOpenOverlay.tsx:352`, no handler) becomes a **functional mute toggle**.

- **SFX cues:** spin-start (loop/whir while reels turn), per-row reel-stop click, win
  sting on settle, a louder big-win sting for Epic/Legendary, sell-back confirm. Short
  self-hosted assets in `public/` (preloaded); a small `useSound` hook (§6.2) wraps an
  `<audio>`/`AudioContext` pool.
- **Autoplay compliance:** audio is unlocked by the SPIN click (a user gesture), so no
  autoplay-policy violation. Nothing plays before the first interaction.
- **Mute:** a toggle in Band 3 (the repurposed `Volume2`/`VolumeX` icon); state persisted
  in `localStorage`. **Default = unmuted** (gesture-gated, so the first sound only follows
  a SPIN press) — re-confirmable.
- **Haptics:** `navigator.vibrate` on each reel-stop (short) and the win settle (longer
  pattern), mobile only; guarded with feature-detection (`'vibrate' in navigator`) and
  suppressed when muted.
- **Independence from reduced-motion:** sound/haptics are governed by the **mute toggle**,
  not `prefers-reduced-motion`; never the sole indicator of an outcome (the visual + ARIA
  text carry it — §11).

---

## 4. Multi-spin behavior (real-slot-machine model)

**Model:** `−`/`+` set a roll **count** `N` (range **[1, 5]** — backend hard-cap 5, UI cap
5 on all viewports; §7.2, §11).
**One row = one roll = one `Pack.price`.** xN renders N stacked horizontal reel rows
that behave like a real slot machine: **all rows start spinning at the same instant**,
then **stop in sequence** (top→bottom, staggered) — building anticipation as each
winner locks under the shared payline. Each roll is an independent authoritative open
(one charge, one `Math.random()` roll, one `Pull`); the lock applies per roll (§8).

> **Why all N winners are known before the spin starts:** because the rows start
> together and only the *stops* are staggered, every row already has its winner when
> the animation begins. So the N rolls must be resolved up front (one batch call —
> §4.3 / §7.2), not fired lazily as each row stops.

### 4.1 Animation timeline (grounded in `RouletteClient`)

The proven mechanic is **one CSS `transition-transform`** on the strip, not a
`motion/react` multi-phase chain. `RouletteClient.tsx:121-124` uses
`transition-transform duration-[4200ms] ease-[cubic-bezier(0.12,0.8,0.18,1)]` and a
single `translateX` from 0 → landing offset; the cubic-bezier's long tail **is** the
ease-out deceleration + anticipation slow-lock (no separate "hold" phase, no
motion-blur). Settle fires on `onTransitionEnd` (`:125-130`). We reuse this verbatim per
row.

- **Per-row spin:** one transition, `BASE_SPIN_MS ≈ 4200 ms` (tunable), ease
  `cubic-bezier(0.12,0.8,0.18,1)`. (Repo precedent so far is this CSS ease; the
  `motion.ts` `SHUFFLE_SPIN`/`EASE_RISE` tokens are the alternative if we move to
  `animate()` — pick one and promote to a named token, don't mix.)
- **Synchronized start, staggered stops — the mechanism:** all rows set their target
  offset on the **same frame** (so they start together), but row *k* gets a **longer
  transition duration**: `durationMs(k) = BASE_SPIN_MS + k * STOP_STAGGER_MS`. A longer
  transition over the same distance lands later → rows settle top→bottom one after
  another, with no wall-clock `animate()`-timestamp math. `STOP_STAGGER_MS ≈ 800`
  (default; your "~1 s"; research range 300–1000 ms — promote to a `motion.ts` token).
- **Settle + win flash:** on each row's `onTransitionEnd`, flash that row's payline,
  fire its reveal ping (§5.3), prepend its ticker entry (§3.1). Optional seat-overshoot
  via `EASE_BACK` (`motion.ts:11`) for slot "bounce" feel — Phase-3 polish, not required.

→ **Total run ≈ `BASE_SPIN_MS + (N−1) × STOP_STAGGER_MS`** (+ settle). **Turbo mode**
(large N) drops `BASE_SPIN_MS` to ~1500–2000 ms and `STOP_STAGGER_MS` to ~200–300 ms.
Turbo trigger (auto at N≥? / toggle) is a §14 open item.

### 4.2 How N rolls are rolled, charged, displayed

- **Each row = one authoritative backend open.** The win-rate lock applies per roll
  (§8). No "single bet at N× stake."
- **Charging:** **one atomic debit of `count × price`** (all-or-nothing, §7.2), resolved
  up front by the batch call (§4.3). If the customer can't afford all N the whole batch is
  rejected (`needsTopUp`) — never a partial run. On success there are always exactly N
  rows, each backed by a paid pull.
- **Display:** all rows spin together, stop staggered (§4.1). On final settle the hero
  holds the full N-row result; the banner shows the highest-value win; Band 3's
  sell-back reflects the **focused row** (§3.8). Each row's token keeps its own
  `pullId` + `instant_deadline_ms` (§5.3). **CREDIT + ticker update only at settle**, not
  at batch-resolve (spoiler guard, §3.1).

### 4.3 Rate-limit interaction & the backend requirement

Pack-open is rate-limited **5/10s burst + 20/60s sustained** per customer via
`createPackOpenRateLimit()` (`backend/packages/api/src/api/utils/rate-limit.ts:291-296`
`DEFAULTS`, wired `:414-416`; docstring confirms "default 5/10s"). The
synchronized-start model needs all N results *before* the animation begins, which rules
out lazy per-row calls:

- **N concurrent `openPack` calls — NOT viable for N>5.** Firing N opens at once to
  pre-resolve the rows trips the 5/10s burst immediately. Awaiting them one-by-one with
  spacing adds multi-second latency before the spin can start and still caps at ~5.
- **`POST /store/packs/:slug/open-batch { count }` — the recommended path.** Resolves
  all N rolls server-side in one call (loop `rollPackStep`→charge→record), under one
  rate-limit budget, returning the N winners + post-batch balance. The client then
  starts all rows together and staggers the stops. Each roll is still an independent
  server-side draw → lock preserved per roll (§7.2, §8).

**Decision:** Phase 1 ships **x1 only** (no multiplier) — a single `openPack`, zero
backend change. Phase 2 adds the multiplier and **requires the `open-batch` endpoint**
(the synchronized real-slot model can't be built cleanly on the per-open limiter). If
the backend work is deferred, the multiplier is held back rather than shipped on a
429-prone N-concurrent hack.

### 4.4 Repeat spins (the cap is per-spin, not per-session)

The **5 is the max rows in a single SPIN**, not a limit on how many times you can spin.
After a spin settles:

- The spin guard releases and the reel **resets** (re-spin reset via `nonce`, §6.5);
  CREDIT/ticker have updated to post-spin values (§3.1).
- **SPIN re-enables iff `balance ≥ TOTAL`** for the currently selected N (§3.3). The player
  may keep pressing SPIN — 1 row or up to 5 — **as long as credit covers each spin**;
  when it doesn't, SPIN hard-disables and the insufficient-funds / top-up path shows (§3.4).
- `−`/`+` and the chosen N **persist** across spins (§3.3) — a player can repeat the same
  multiplier without re-setting it.
- Repeats are **manual presses only** — there is **no autoplay / auto-rebet** (non-goal,
  §1.3). Rapid repeated spins are bounded by the sustained pack-open limiter (**20/60s**;
  each batch is **one** request, §4.3); a human pace never trips it, and the
  guard-until-settle + short cooldown (§10) prevents machine-gun double-charges.

---

## 5. Sell-back behavior

The sell-back subsystem is **reused as-is** from the classic flow — the reel only
changes *when* it activates (at reel-stop, not at open). Numbers, timing, and the
buyback call are unchanged.

### 5.1 Value computed from the won item (existing logic)

The reel never invents sell-back numbers — they come straight from the open
response's `buyback` block, computed server-side from the won card's FMV:

- Instant amount = `buybackAmount(market_value, max(pack.buyback_percent, 90))`
  (`buyback-rate.ts:70-73,90-91`) — the instant rate is **floored at the flat 90%**,
  so selling instantly never pays less than vaulting.
- Vault amount = `buybackAmount(market_value, 90)` (`open/route.ts:67-68`).
- The mockup's flat `$1,665,000` is a placeholder; real values render from
  `reveal.buybackAmount` / `vaultAmount` (`PackDetailClient.tsx:595-626`).

### 5.2 Countdown wired to `instant_deadline_ms`

`instant_deadline_ms` is an **absolute epoch-ms** target (compare to `Date.now()`),
not a duration. Two sources:

- **Authoritative:** the reveal ping `POST /store/pulls/:id/reveal` → `{ instant_deadline_ms }`
  (anchored to `revealed_at + 30s`, capped `rolled_at + 5min`; `service.ts:243-274`,
  action `packs.ts:174-195`).
- **Fallback:** the open response's `buyback.instant_deadline_ms` (anchored to
  `rolled_at + 30s`, since `revealed_at` is null at open; `open/route.ts:69-72`).

**Fire the reveal ping at reel-STOP** (when the token visually seats under the
payline), not at open — otherwise the spin animation eats the 30 s window. (For x1 this
is one ping at the single row's stop; for xN it is one ping per row at that row's stop —
§5.3.) The countdown + draining bar reuse `sellSecondsLeft` / `SELL_COUNTDOWN_SECS=30`
(`@/lib/sell-countdown`, `PackOpenOverlay.tsx:130-162`).

### 5.3 Multi-roll sell-back

Each roll has its own `pullId` + `revealed_at` + `instant_deadline_ms`. In an xN run,
**fire each row's reveal ping when that row stops**, so each token's 30 s window starts
when *that* row's winner is shown. Each row shows its own countdown; Band 3 reflects the
focused row (§3.8). Rows stop ~0.8 s apart, so the first/last reveal spread is small and
the shared `rolled_at + 5 min` grace bounds it.

**Reveal-ping rate limit (must account for it).** `POST /store/pulls/:id/reveal` has its
own limiter `createPullRevealRateLimit` = **burst 20/10s** + 60/60s per customer
(`rate-limit.ts:444-454`). N per-row pings within ~N×0.8 s stay well under 20/10s at any
sane viewport cap (§11), so the per-row pattern is safe. **But** if a ping is throttled
or fails, that row falls back to the open/batch `instant_deadline_ms` — which for a batch
is `rolled_at + 30 s` and may be **partly/fully consumed by the spin**, so the instant
window can arrive short or dead. Handle the reveal-429/failure path explicitly (§10), and
consider a future **batch-reveal** endpoint if N grows. Reveal pings, like CREDIT/ticker,
fire at each row's settle — never at batch-resolve.

### 5.4 Executing a sell-back

Unchanged: `POST /store/vault/:id/buyback` returns `{ pull_id, amount, percent, rate_type, balance }`
(`buyback-pull.ts` step `:22-32`), once-only via the UNIQUE `pull_id` credit row
(`:101-126`), rate decided server-side from `rolled_at`/`revealed_at` (`:80-87`).

---

## 6. Frontend changes

### 6.1 New route (coexist)

```
src/app/slots/[slug]/
  page.tsx              # server component, exports metadata, force-dynamic,
                        # fetches getPackBySlug + getPackDetail + getRecentPulls
  SlotMachineClient.tsx # 'use client' controller (state + server-action calls)
```

Mirror `marketplace/page.tsx` (`:1-22`) for the split. Optionally add `loading.tsx`.
Classic `/claw/[slug]` is **not** modified.

### 6.2 New components

| Component | Responsibility |
|---|---|
| `SlotReelRow` | One horizontal reel row = one roll (§6.5), generalized from `RouletteClient`. Props: `winner: WonCard` (carries its assigned `ball`), `ballSet: Ball[]` (the pack's distinct balls, for decoy cells, §16), `reduced: boolean`, `durationMs: number` (its transition length — longer = lands later), `onSettled: () => void`. Pure display; the winning cell = `winner.ball`; never picks the winner. |
| `SlotReelStack` | Arranges N `SlotReelRow`s (one per roll), starts them on the same frame, assigns each `durationMs(k) = BASE_SPIN_MS + k*STOP_STAGGER_MS` (top→bottom staggered stops, §4.1), and shrinks row height to fit the viewport. For x1 it renders a single row. |
| `ReelToken` | One glass-cased token rendering a **Ball** image (`ball.image`, §16) + casing chrome + center glow variant. |
| `PaylineBeam` | The single vertical neon-violet beam + center highlight, spanning all rows. Generalizes `RouletteClient.tsx:115-116` (static beam + pointer); adds an idle/win pulse (gated under reduced motion). |
| `SlotStatusBar` | Band 1 (CREDIT / RECENT WINS ticker / WINS). |
| `SlotControls` | Band 3 (`−`/SPIN xN/`+`, COST/TOTAL line, ODDS launcher). |
| `SellBackPanel` | Extracted from `PackOpenOverlay` sell-back subsystem (§3.6), reused by both flows. |
| `OddsSheet` | Published rarity-odds list (§3.7). |
| `useSound` (hook) | SFX pool + mute state (localStorage), gesture-unlocked; plays spin/stop/win/big-win/sell cues + `navigator.vibrate` haptics (§3.9). |

### 6.3 Shared logic to extract / add

- **Extract** the sell-back subsystem (state machine, reveal-ping effect, countdown
  tick, `handleSellBack`, `SellConfirmModal` wiring) from `PackOpenOverlay.tsx:119-190,676-762`
  into `SellBackPanel` so both the classic overlay and the slot reuse it.
- **Add `price` to `OpenPackResult`** (`packs.ts:29-56`) and map it from the response
  (`open/route.ts:63`) so COST renders from the real charge — client-only.
- Reuse `usePrefersReducedMotion`, `useInView`, `staggerDelay` (`use-reveal.ts`),
  `RARITY_RGB`, `money`/`formatValue` (`packs-format.ts`), `motion.ts` tokens.

### 6.4 New accent token

Use a single neon-violet accent — the ONLY places violet appears: the payline beam and
the SPIN pill. **Align with the established precedent rather than inventing a token:**
`RouletteClient.tsx:175` already uses `from-fuchsia-500 to-violet-500` for its spin pill;
reuse that exact treatment for SPIN. The payline beam can be `violet-500`
(`oklch(0.606 0.25 292.717)`) or the same gradient. Do **not** repurpose the neutral
`--accent` oklch token (it's gray and bypassed by the clone).

### 6.5 Reel engine (generalize `RouletteClient`, don't reinvent)

`RouletteClient.tsx` already implements the exact mechanic; extract it into reusable
`SlotReelRow` + `SlotReelStack`. The proven pattern, per row:

1. **Strip array** — a fixed-length strip with the **winner at a known high index** `W`.
   `RouletteClient` uses `strip.length = 48`, `WIN_INDEX = 36`, `ITEM_W = 124`
   (`:53-60,16-17`). 36 cells of pre-roll travel is what makes it *read* as a slot spin —
   so **no runtime wrap-looping is needed**; a long fixed strip is sufficient and is what
   ships today. Cells are filled by sampling the **pack's distinct Ball arts** (`ballSet`,
   §16) — a real slot has a small fixed symbol set, so no catalog fetch is needed for the
   reel. The **winner cell is the won card's assigned `ball`** (cosmetic, keyed by the
   backend-rolled card) and is fixed before any animation.
2. **Landing offset (verbatim formula, `:73-74`):** read the window width at spin time
   (`windowRef.current.clientWidth`, not a hardcoded constant) and compute
   `target = WIN_INDEX * ITEM_W + ITEM_W/2 - winWidth/2`, then translate to `-target`.
   This centers index `W` under the payline. Pure arithmetic over a fixed index → unit
   testable (§12).
3. **Animate** with a **single CSS `transition-transform`** (the proven approach,
   `:118-124`), `duration = durationMs(rowIndex)` (= `BASE_SPIN_MS + k*STOP_STAGGER_MS`,
   §4.1), ease `cubic-bezier(0.12,0.8,0.18,1)`. Set the target offset on a double-rAF so
   the transition actually runs (`:76-78`). **No `motion/react` timestamp math, no
   motion-blur.** Settle via `onTransitionEnd` (`:125-130`).
4. **Jitter decision:** `RouletteClient` adds `jitter = ±ITEM_W*0.18` (`:75`) so it
   doesn't stop dead-center. This PRD's banner says *"center token wins"* — so **drop the
   jitter and land dead-center** (or keep a tiny ±few-px jitter for life but ensure the
   winner is unambiguously the center cell). Confirm (§14). Round the final offset to
   device pixels to avoid sub-pixel blur.
5. On each row's `onTransitionEnd`: `onSettled(rowIndex)` → fire that row's reveal ping
   (§5.3), flash its payline, prepend its ticker entry, update CREDIT only on the **last**
   row (§3.1 spoiler guard).
6. **Reduced motion:** skip step 3, set the winner centered immediately
   (`RouletteClient.tsx:65-69` pattern).

`SlotReelStack` orchestration:

- For xN, mount N rows with their N winners (from the batch response, §7.2). Set all
  rows' target offsets on the **same frame** (synchronized start); the staggered
  `durationMs(k)` makes them settle top→bottom (§4.1). One shared `PaylineBeam` overlays
  all rows. Track outstanding rows so unmount/navigation can force-settle them (§10).
- Non-winner cells per row are sampled from the pack's distinct Ball arts (`ballSet`, §16);
  winners are fixed (the won card's assigned `ball`).
- **Re-spin reset:** a second SPIN must clear prior winners/decoys/glow/sell-back and
  rebuild strips — the classic flow remounts via a `nonce` key
  (`PackDetailClient.tsx:116,631`); the stack should do the same.

`canvas-confetti` (added, gated under reduced motion) or the existing CSS keyframes
(`revealFlash`/`revealRing`/`shardFly`, `globals.css:230-264`; `shardFly` needs per-shard
`--tx/--ty` JS wiring) power the big-win burst.

---

## 7. Backend changes (minimal)

### 7.1 Phase 1 (x1) — near-zero backend changes

The open endpoint already returns everything the reel needs for x1: the winner (`card`),
`pullId` (`pull.id`), display value (`card.value` + `marketValue`), post-charge
`balance`, `price`, and the full `buyback` block incl. `instant_deadline_ms`
(`open/route.ts:60-78`). Decoys come from the existing public catalog route; the reveal
ping and buyback routes are unchanged. **The only Phase-1 backend touch is the small,
optional `display_win_rate` field (§7.3)** — needed only if the WIN-RATE chip ships in
Phase 1; the reel itself needs no backend change.

### 7.2 Phase 2 (multiplier) — one required addition

`POST /store/packs/:slug/open-batch` with body `{ count: 1..5 }` (Zod-validated; **hard
cap 5** — §14.9). Required for the synchronized real-slot model (all N winners must exist
before the spin starts — §4.3). Returns:

```jsonc
{
  "rolls": [ { "pull": {…}, "card": RolledCard, "buyback": {…} }, … ],  // length === count
  "price":          100.00,  // per-roll Pack.price
  "total_charged":  500.00,  // count × price (one debit), so the client never infers it from balance deltas
  "balance":        1234.00  // post-batch credit balance
}
```

**Transaction model — ALL-OR-NOTHING (decided).** This is the industry "10-pull" pattern:

- **One batch workflow, one atomic debit of `count × price`.** Acquire the per-customer
  advisory lock used by `mutateCreditAtomic` (`charge-pack-open.ts:63-75`) **once**, debit
  the full `count × price` in a single guarded operation (one `credit_transactions` row),
  then loop `rollPackStep`→`recordPullStep` N times **inside the same workflow**.
- **Affordability pre-checked up front:** if `balance < count × price`, reject the whole
  batch with the existing `not enough credits` error (→ client `needsTopUp`) — **never** a
  partial roll. The UI already hard-gates SPIN on `TOTAL ≤ balance` (§3.3), so this is the
  safety net for raw-API callers; `rolls.length === count` always on success.
- **Atomic rollback via Medusa's saga:** because all N rolls live in **one** workflow, a
  failure at roll *k* triggers compensation for the prior steps automatically — delete the
  k−1 pulls already inserted and refund the single debit. Net effect: either all N pulls +
  one `N×price` charge commit, or nothing does. (Contrast: looping the per-run
  `openPackWorkflow` N times would give N independently-committed sagas with no outer
  rollback — do **not** do that; build the batch as one workflow.)
- Each roll is still an independent server-side `Math.random()` draw → **win-rate lock
  preserved per roll** (§8).
- Register with bearer auth + its own rate-limit budget in `middlewares.ts`; **the batch is
  one request against the limiter, not N.** Hard-cap `count` at 5 server-side.

### 7.3 WIN-RATE display field (small addition — admin-set, decoupled from the lock)

The control-band **WIN-RATE %** is an **operator-set marketing number**, NOT derived from
the secret odds. Add a nullable `display_win_rate` (percent, 0–100) field:

- **Model:** new optional column on the `Pack` model (or pack metadata). Independent of
  `PackOdds.weight` / `computeOdds` — **never** read from or written to the lock. The
  real win-rate lock stays hidden and remains the source of truth for outcomes (§8).
- **Admin:** an input in the admin pack editor sets it (sits beside, but separate from,
  the odds editor — saving it must not touch `PackOdds`).
- **Expose:** include `display_win_rate` in the public catalog (`GET /store/packs/:slug`)
  and/or the open/batch response; the storefront renders it verbatim in Band 3. If unset
  (`null`), the WIN-RATE chip is hidden.
- This is purely cosmetic copy; it has **zero** effect on rolls.

### 7.4 Reel ball assets + admin (new — see §16)

The reel symbols are operator-managed **Balls**. Backend additions (all additive): a new
media `kind: 'ball'` (`media/validate.ts:11,61-64`); a `Ball` model `{ id, name, image,
rank }`; an additive nullable **`ball_id` on `PackOdds`** (`models/pack-odds.ts`, not read
by `computeOdds`/roll math); `GET/POST /admin/balls` + `PUT/DELETE /admin/balls/:id`; and
the open/roll path attaches the won card's `ball` to the response (`roll-pack.ts` resolves
the won row's `ball_id`; `open/route.ts` adds `card.ball`). The ball is cosmetic, keyed by
the backend-rolled card (§8). Full spec in **§16**.

---

## 8. How the win-rate lock is preserved end-to-end

> **One-sentence guarantee:** The win-rate lock is enforced entirely server-side — a
> locked card's operator-set percentage is normalized into the persisted
> `PackOdds.weight` column at **save** time, and `rollPackStep` draws the winner over
> those weights with `Math.random()` **before any UI mounts** — so the slot reel
> receives an already-decided `RolledCard` and can only choose *where* on the strip to
> display it, never *what* it is.

End-to-end trace (each hop verified):

| # | Hop | file:line |
|---|---|---|
| 1 | Operator saves odds → `POST /admin/packs/:slug/odds` | `api/admin/packs/[slug]/odds/route.ts:99-147` |
| 2 | `savePackOddsStep` re-validates + calls `computeOdds`; throws on invalid lock config | `workflows/steps/save-pack-odds.ts:42-118` |
| 3 | Locked %→bps verbatim; unlocked split remainder by `RARITY_WEIGHT` (Σ=10000) | `odds-math/src/index.ts:87-136` |
| 4 | Persist computed bps as `weight` | `save-pack-odds.ts:94-108` |
| 5 | Stored: `weight`, `locked` | `models/pack-odds.ts:26,29` |
| 6 | Roll: `Math.random() * Σweight` cumulative walk — **never reads `locked`** | `roll-pack.ts:60,71-79` |
| 7 | Winner `RolledCard` (rarity from winning row) | `roll-pack.ts:89-98` |
| 8 | Workflow returns `{ pull, card, balance, price }` | `open-pack.ts:72-79` |
| 9 | API response — **no `weight` field** | `open/route.ts:60-78` |
| 10 | `openPack(slug)` POSTs `body:{}`, sends no id/odds/roll input | `packs.ts:88-151` |
| 11 | Reel/overlay display `res.card` only | `PackDetailClient.tsx:186-232` |

- Hop 8→9: the route layer **appends** `buyback` (via `quoteBuyback`) onto the
  workflow's `{pull, card, balance, price}` (`open/route.ts:49-77`); this is a post-roll
  economic quote and does not touch the roll or the lock.
- The reel's only choice is the **strip index** of the winner; the index→offset math
  (§6.5) is cosmetic.
- The **reel ball** is resolved *after* the roll from the won card's assigned `ball_id`
  (§16) — `ball_id` is metadata the roll/odds math never reads, so changing balls or their
  art can't change any outcome.
- `demoDraw` (client) is logged-out theater (`isReal:false`, no pull, no charge) and
  must **never** feed a real reel (`demo-spin.ts:1-11`).
- For multi-roll, every roll is its own server-side draw (§7.2) — the lock holds per
  roll.
- No secret weights ever reach the client (storefront has zero refs to
  `odds-math`/`computeOdds`/`RARITY_WEIGHT`; verified by grep).

---

## 9. API contract

### 9.1 Single open (existing — unchanged)

**Request:** `POST /store/packs/:slug/open` · bearer auth · no body · customer from
token (`open/route.ts:33`).

**Response (`:60-78`):**
```jsonc
{
  "pull":  { "id": "pull_…", "customer_id": "…", "pack_id": "<slug>", "card_id": "<handle>",
             "order_id": null, "rolled_at": "ISO", "revealed_at": null, "status": "vaulted",
             "stock_earmarked": false, "buyback_amount": null, "buyback_at": null, "showcased": false },
  "card":  { "handle": "…", "name": "…", "set": "…", "grader": "…", "grade": "…",
             "rarity": "Legendary|Epic|Rare|Uncommon|Common", "market_value": 39.80, "image": "…" },
  "balance": 9900.00,   // post-charge credit balance
  "price":   100.00,    // Pack.price debited (USD decimal)
  "buyback": { "percent": 90, "amount": 35.82, "rate_type": "instant",
               "vault_percent": 90, "vault_amount": 35.82, "instant_deadline_ms": 1718700000000 }
}
```
Client action `openPack` reshapes to `OpenPackResult` (`packs.ts:29-56`); **add
`price`** to it. No `weight` anywhere.

### 9.2 Reveal ping (existing — unchanged)

`POST /store/pulls/:id/reveal` · bearer · → `{ "instant_deadline_ms": 1718700000000 }`
(`service.ts:243-274`). Fire at reel-stop.

### 9.3 Buyback (existing — unchanged)

`POST /store/vault/:id/buyback` · bearer · →
`{ "pull_id", "amount", "percent", "rate_type", "balance" }` (`buyback-pull.ts:22-32`).

### 9.4 Reel symbols + pack meta (catalog)

`GET /store/packs/:slug` · anonymous · → `{ pack, odds: CardView[] }`, each `CardView`
= 8 fields, **`weight` omitted** (`store/packs/[slug]/route.ts:51-53`). **Additions:**
`pack.display_win_rate` (nullable %, the admin-set marketing number — §7.3) for the
WIN-RATE chip; each item's **`ball`** `{ id, name, image }` (its `ball_id` resolved) so the
reel can build its `ballSet`. The **open / batch response's `card` also carries its `ball`**
(attached at the roll/route layer, §7.4) so the winner's symbol is known. (No separate
rarity-balls endpoint; a `GET /store/balls` listing all balls is optional.)

### 9.5 Multi-spin (Phase 2 — new, required for the multiplier)

`POST /store/packs/:slug/open-batch` · bearer · body `{ "count": 1..5 }` →
`{ "rolls": [{ pull, card, buyback }], "price": number, "total_charged": number,
"balance": number }` — **all-or-nothing**: `rolls.length === count` on success, else the
whole batch is rejected (`needsTopUp` when `balance < count×price`); one atomic debit,
lock acquired once; counts as **one** request against the rate limiter (§7.2).

---

## 10. Edge cases & failure modes

| Case | Handling |
|---|---|
| Logged out | SPIN → auth modal (`PackDetailClient.tsx:188-190`); demo reel allowed (no charge/pull). |
| Insufficient credits | `needsTopUp` (`packs.ts:155`); reel doesn't spin; top-up link. |
| Rate-limited (429) | Friendly "try again in Ns" (`packs.ts:79-81`). A batch open counts as one request (§7.2), so a normal xN won't trip it; rapid repeated spins still can. |
| Transport / 5xx / bad shape | `friendlyError` (`packs.ts:152-163`); reel reverts to idle; balance untouched. |
| `WonCardSchema` fails | "Got an unexpected response…" (`packs.ts:118-123`); no reveal. |
| `image` missing | `WonCardSchema` is `looseObject`; `image` read raw (`packs.ts:132`). Reel must show a **fallback token face**, not break. |
| `pullId` null | No sell-back for that token; hide the CTA (sell-back keys off `pullId`). |
| `balance` / `buyback` null | Backend-shape regression; render no balance / no sell-back; reel still shows the win. |
| Double-submit / re-spin mid-animation | No idempotency on opens (`open/route.ts`) → a second submit = a second real `price×N` charge. The classic `opening` flag clears in the `finally` the instant the call resolves (`PackDetailClient.tsx:230`), which in the slot is **seconds before** the reels stop. **Fix:** hold the spin guard (SPIN + `−`/`+` disabled) from SPIN-press **until all rows settle**, plus a short post-settle cooldown. |
| Insufficient funds for xN | UI hard-gates SPIN on `TOTAL ≤ balance` (§3.3); the batch also pre-checks `balance ≥ count×price` and rejects the **whole** batch with `needsTopUp` (all-or-nothing, §7.2) — never a partial roll. |
| Batch fails mid-flight | **All-or-nothing** (§7.2): one workflow, so the saga compensates every committed step — deletes any inserted pulls and refunds the single `count×price` debit. Either all N commit or none do. Client shows the error and reverts to idle, balance untouched. |
| Reveal ping fails / 429 | `createPullRevealRateLimit` = 20/10s (`rate-limit.ts:444-454`). On throttle/failure that row falls back to the open/batch `instant_deadline_ms` (`packs.ts:188-194`) — for a batch that is `rolled_at + 30s`, possibly already short/elapsed; show the resulting (possibly flat-90%) offer rather than a stuck countdown. |
| Navigate away / close mid-stagger (xN) | All N pulls are already charged + recorded but revealed over several seconds; leaving at row 2/5 strands rows 3–5 as paid, unrevealed pulls (no reveal ping → window governed only by `rolled_at` fallback). **Fix:** on unmount/`beforeunload`, force-settle all remaining rows + fire their reveal pings; the pulls are recoverable from the vault regardless. Offer a **"reveal all now"** tap to skip the stagger. |
| Balance/ticker spoiler | CREDIT + RECENT WINS must update only on settle, not at batch-resolve (§3.1) — otherwise the debited balance/new wins leak the outcome mid-spin. |
| Instant window timing in xN | Rows stop ~0.6–1 s apart, so all reveals land within ~N seconds; each row's 30 s window anchors to its own stop. `rolled_at + 5 min` grace bounds it. |
| Stock 0 | Pull still wins (counter, not a gate; `decrement-card-stock.ts:19-28`). |
| Backend down | `getPackDetail` → `null`, `recentPulls` → `[]` (`PackDetailClient.tsx` props). Reel renders idle from the built-in default ball art (§16.1); SPIN attempts surface the open error. |

---

## 11. Responsive / mobile thumb-zone + accessibility

- **Thumb zone:** Band 3 pinned to the bottom on mobile (the controls live in the
  bottom third); `−`/SPIN/`+` reachable one-handed.
- **Touch targets ≥48px:** `−`/`+` round buttons and the SPIN pill meet ≥48×48 CSS px.
- **Reduced motion:** §3.5 — no reel translate; instant centered reveal; honored via
  `usePrefersReducedMotion` everywhere (`use-reveal.ts:18-24`).
- **ARIA (the slot is INLINE page content, not a modal):**
  - One `role="status" aria-live="polite"` region announces the result **once, on final
    settle**, as a summary — e.g. "Won 1 item: <name>, <value>" or "Won N items, top:
    <name>, <value>." **Do NOT** put a live region on each of the N rows (that produces
    the N-announcement spam this avoids).
  - Mark the reel `aria-busy="true"` during the spin; decoy strips `aria-hidden`.
  - On settle, move focus to the result/primary sell-keep control so keyboard users land
    on the actionable element (no modal to trap, so define the inline focus target).
  - The modals that DO open (SellConfirm, OddsSheet) need `role="dialog"
    aria-modal="true"`, a labelled title, focus trap, and Escape-to-close — the classic
    overlay is a trapless div (`PackOpenOverlay.tsx:322-335`); fix it in the extracted
    components.
- **Keyboard:** SPIN / `−` / `+` are real `<button>`s; rows are focusable `role="button"`
  for refocus (§3.8); sell/keep reachable by tab; the countdown is text, not color-only.
- **Scroll-lock:** the inline reel can be scrolled out of view mid-stagger (compounding
  the navigate-away edge). Lock body scroll during an active spin (the classic modal does
  this via `body overflow:hidden`, `SellConfirmModal.tsx:71-72`); release on settle.
- **5/3 visible tokens** per row via responsive cell sizing; side tokens clipped with
  `overflow-hidden`, full-bleed `.px-fluid` gutters, no `max-w` cap.
- **N rows must fit the viewport.** Cap N at **5 on all viewports** (decided, §7.2/§14):
  5 rows stay readable even on mobile, and the hero never needs to scroll. Row height
  scales down from 1→5.
- **Audio/haptics are never the sole indicator** (§3.9): the visual reveal + the ARIA
  status text always carry the outcome; the mute toggle is independent of
  `prefers-reduced-motion`.

---

## 12. Testing & verification plan

**Unit (vitest `^3.2.6`)** — new/extracted logic:
- Reel-offset math (§6.5, the `RouletteClient:74` formula): winner index → center offset,
  across viewport widths, cell sizes, jitter on/off. Property: the winner index always
  lands center.
- **Extraction guard:** generalizing `RouletteClient` into `SlotReelRow` must keep
  `/roulette` behaving identically — snapshot its landing offset + reduced-motion path
  before/after the refactor.
- Stack stagger math: N winners → N rows; `durationMs(k) = BASE_SPIN_MS + k*STOP_STAGGER_MS`
  monotonic top→bottom (later rows settle later); turbo compresses correctly; all-or-nothing
  batch → `rolls.length === count` always renders exactly N rows.
- `price` added to `OpenPackResult`: mapping + null handling.
- Reuse existing backend specs as guardrails (don't duplicate): `buyback-rate.unit.spec.ts`,
  `quote-buyback.unit.spec.ts`, `pack-open-charge.unit.spec.ts`,
  `odds-math/src/__tests__/odds-math.unit.spec.ts`, `rate-limit.unit.spec.ts`.

**Backend integration (jest)** — Phase 2 (`open-batch` is required): extend
`integration-tests/http/pack-open-charge.spec.ts` and `pack-open-rate-limit.spec.ts`
for `open-batch` (one `N×price` debit + N pulls on success; **whole-batch reject + full
rollback** when balance < N×price or a roll fails — assert no orphan charge/pull; lock
honored once; `count` cap 5 enforced; counts as one request against the limiter).
`credit-race.spec.ts` already covers concurrent-spin safety.

**Playwright visual / E2E (per CLAUDE.md — verify on prod build :4000, NOT `next dev`)**:
- New `scripts/qa-slot-machine.mjs` (model on `qa-pack-open-charge.mjs`): top-up →
  /slots/[slug] → spin → reel lands the backend winner center → COST debits exactly
  `price` → reveal ping → sell-back refills credit → insufficient-funds path.
- New `scripts/capture-slot-anim.mjs` (model on `capture-pack-open-anim.mjs`):
  screenshot idle / spinning / landed / big-win / sell-back at desktop 16:9, mobile
  9:16, and 4K — plus an **xN multi-row** capture (all rows started, mid staggered-stop,
  full settle) to verify row stacking + shared payline. Read PNGs back from
  `docs/research/`.
- `qa-demo-spin.mjs` analog: a logged-out demo reel makes **no** backend POST.
- Reduced-motion capture: assert the reel renders centered with no translate.
- Verify flow headless+fast **before** recording (per memory `verify-flow-before-recording`).

**Win-rate-lock regression:** an E2E asserting admin odds edits don't change the
storefront roll path (mirrors `qa-claw-e2e.mjs` step "admin-odds-don't-change-storefront").

---

## 13. Phased rollout

**Phase 0 — Scaffold & extract**
- New route `src/app/slots/[slug]/` (server + client) coexisting with `/claw`.
- Generalize `RouletteClient` into `SlotReelRow` (extraction guard test, §12); extract
  `SellBackPanel` from `PackOpenOverlay`; add `price` to `OpenPackResult`.
- Add the `display_win_rate` field + admin editor input (§7.3) — decoupled from odds.
- **Balls (§16):** media `kind:'ball'`; `Ball` model + `GET/POST /admin/balls` +
  `PUT/DELETE /admin/balls/:id`; additive `ball_id` on `PackOdds` + a Ball selector in the
  odds editor; `card.ball` attached on the open/batch response; balls embedded per-item in
  `GET /store/packs/:slug`; the **Balls** admin page (CRUD + art); seed built-in default
  balls so the reel renders before any upload.
- Align the SPIN pill / payline on the existing fuchsia→violet accent.

**Phase 1 — Single-roll reel (x1)**
- `SlotReelRow` (single row) + `PaylineBeam` + status/control bands;
  idle/resolving/spinning/landed/error.
- Wire `openPack` (x1), reveal ping at stop, `SellBackPanel`, published-odds sheet,
  WIN-RATE chip from `display_win_rate`.
- **Sound + haptics (`useSound`) + functional mute** (§3.9).
- Spoiler guard (balance/ticker on settle), spin guard across full animation,
  reduced-motion (all surfaces), inline ARIA, scroll-lock, thumb-zone. Playwright
  capture/compare green.

**Phase 2 — Multiplier (real-slot multi-row, max 5)**
- Ship `open-batch` (§7.2) — **all-or-nothing**, one atomic `count×price` debit,
  hard-cap 5.
- `−`/`+` roll count (1–5); `SlotReelStack` renders N rows, all start together, stop
  staggered top→bottom via per-row `durationMs` (§4.1) + turbo. Per-row reveal ping
  (mind the 20/10s reveal limiter) + per-row sell-back with the focused-row model (§3.8);
  navigate-away force-settle + "reveal all" skip; one consolidated ARIA announcement.

**Phase 3 — Polish**
- Big-win confetti (`canvas-confetti`, reduced-motion-gated, or CSS), RECENT WINS ticker
  animation, SFX asset polish, 4K/mobile fidelity pass, final visual-regression sign-off.

---

## 14. Open questions resolved → decisions

| Q | Decision |
|---|---|
| Cost per spin | **Per-pack `Pack.price`**; surface `price` via `OpenPackResult`. |
| Multiplier range / behavior | `−`/`+` = roll **count**; **one row = one roll = one price**. xN = N stacked rows, **all start together, stop staggered** (real slot machine). Phase 1 = x1; Phase 2 = multiplier via the required `open-batch` endpoint. |
| "ODDS 1:2.3-50" | Replaced by a **published rarity-odds list**; no win-rate-lock exposure. |
| Replace vs coexist | **Coexist** as a new mode. |
| Route | **New route `/slots/[slug]`**; classic `/claw/[slug]` untouched. |
| Batch transaction | **All-or-nothing**: one batch workflow, one atomic `count×price` debit (lock once), full saga rollback on any failure; affordability pre-checked → reject whole batch (§7.2). |
| WIN-RATE % | **Admin-set `display_win_rate`** field, fully decoupled from the secret lock; rendered verbatim, hidden when unset (§3.3/§7.3). |
| Sound / haptics | **Full MVP**: spin/stop/win/big-win SFX + functional persisted mute + mobile haptics, gesture-unlocked (§3.9). |
| Max N (multiplier cap) | **5** — backend hard-cap + UI cap on all viewports (§7.2/§11). |
| Reel tokens | **Admin-created Balls** (CRUD: own art + name), grouping a pack's items via an additive `ball_id` on the odds row. Reel symbol = the won card's **assigned ball**, cosmetic + keyed by the backend-rolled card. Card slab + value stay the real prize/sell-back basis (§16). |
| Admin manages slot | Price, odds/lock, buyback %, status, **balls (CRUD + art)**, **item→ball assignment**, **items/products**, `display_win_rate` — via the existing pack/odds/cards editors + a new **Slot Management** area (Balls page + Ball column in the odds editor). Reel timing + the roll stay code/server-side (§16). |
| Won-card surfacing | Ball is the reveal hero; **"view card"** reveals the graded slab; the card lands in the vault with the **same 30 s instant offer timing** (unchanged buyback). |
| Row = spin = reward | **1 row = 1 spin = 1 item.** `−`/`+` add/remove rows; each row is one independent roll awarding exactly one card. A ball may *contain* 1..N items but a row still awards one. **No multi-item "bundle" balls.** |
| `ball_id` scope | On the **per-`(pack, card)` `PackOdds` row** — a card can show as a different ball in different machines (matches the existing per-pack `rarity` model). |
| Slot-machine list | A slot machine **is a pack**; Slot Management **relabels the existing Packs data as "Slot machines"** (one source of truth, no new entity). Add machine = create pack (§16.3). |

**Resolved (folded in):** batch = **all-or-nothing** (§7.2); WIN-RATE % = **admin
`display_win_rate`** (§3.3/§7.3); sound/haptics = **full MVP** (§3.9); max N = **5**
(§7.2/§11); reel symbols = **admin-CRUD Balls** grouping items via additive per-`(pack,card)`
`ball_id`, managed in Slot Management, lock untouched (§16); won-card = **ball hero + "view
card" + vault + same 30 s offer**; **1 row = 1 spin = 1 item (no bundles)**; route =
**`/slots/[slug]`**; machine list = **relabeled Packs**.

**Still to confirm.** Items marked _(default chosen)_ have a working default in the spec
and just need a nod; the rest are minor calls.

1. **Mid-spin exit policy** _(default chosen)_: on navigate-away, auto-settle + fire all
   reveal pings, plus a "reveal all now" skip tap (§10).
2. **Balance/ticker reveal timing** _(default chosen)_: hold displayed CREDIT + ticker
   until final settle (§3.1) — or prefer an animated count-down landing at settle?
3. **Anticipation/spin curve source** _(default chosen)_: reuse `RouletteClient`'s CSS
   `cubic-bezier(0.12,0.8,0.18,1)` (§4.1) vs promoting `motion.ts` tokens.
4. **Reel jitter** _(default chosen)_: drop `RouletteClient`'s ±18% jitter and land
   dead-center (banner says center wins).
5. **Demo reel (logged-out)** _(default chosen)_: x1 only, `−`/`+` hidden, sign-up CTA
   replaces the sell-back panel (§3.4).
6. **Stop stagger + turbo** _(default chosen)_: `STOP_STAGGER_MS ≈ 800` (your "~1 s"),
   turbo ~200–300 ms, turbo trigger (auto at N≥? / toggle).
7. **Decoy count & randomization:** how many side tokens per row, re-shuffled per spin?
8. **WINS counter source:** recent-feed length (no backend) vs a real lifetime count
   (small endpoint)?
9. **Default mute state** _(default chosen)_: unmuted (gesture-gated) — or start muted?

All architecture-level questions are now resolved; the remaining items are minor defaults
or small content choices (decoy count, WINS source) that don't block implementation.

---

## 15. Sources

**Primary (repo precedent — these govern the implementation):**
- `src/app/roulette/RouletteClient.tsx` — the working translateX reel: strip + center-
  landing formula (`:74`), CSS `transition-transform duration-[4200ms]
  ease-[cubic-bezier(0.12,0.8,0.18,1)]` (`:121-124`), `onTransitionEnd` settle, jitter,
  reduced-motion short-circuit, fuchsia→violet pill. **The engine to extend.**
- `src/lib/motion.ts` — measured tokens (`SHUFFLE_SPIN`, `EASE_RISE`, `EASE_BACK`).
- `src/components/CommunitySection.tsx:129-138` — reduced-motion-aware marquee
  (`sp-scroll-x`) for the RECENT WINS ticker.
- `src/app/globals.css:229-334` — win-burst keyframes (`pullShout`, `revealFlash`,
  `revealRing`, `shardFly`).

**Secondary (slot-UX timing intuition only — not authoritative over the tokens above):**
- [The Slow Spin Effect (On: Yorkshire Magazine)](https://www.on-magazine.co.uk/stuff/gaming/how-millisecond-level-timing-in-slot-animations-shapes-player-emotion-and-perceived-luck/)
- [Spin-feature pacing (Noetic Games)](https://www.noeticgames.com/how-quickly-do-spin-features-accelerate-the-online-slot-gameplay-pace/)
- [Psychology of slot design (Big Easy)](https://bigeasymagazine.com/2026/02/23/the-psychology-behind-online-slot-game-design/)

---

## 16. Admin management

**Today (verified):** the admin fully manages the slot's *economics* and *items* via the
existing pack / card / odds editors — but **balls, ball↔item grouping, and slot-presentation
config do not exist** and are net-new (all **additive**; none touch the roll).

- Already admin-managed (reused as-is): **price** (`pack.price`, `packs/page.tsx:455-461`),
  **odds / win-rate lock** (per-card `weight` + `locked` + % → `useSaveOdds` →
  `POST /admin/packs/:slug/odds`, normalized to basis points `pack-odds.ts:22-29`),
  **buyback %** (clamped 90–100), **status** active/draft, pack **create/delete** (= **add/
  remove a slot machine** — a slot machine *is* a pack, served at `/slots/<slug>`), pool
  **membership** (`useSaveMembers`), and **items** (Cards registered from Medusa Products —
  `coerceRegisterCardBody`, `cards/validate.ts`).
- Net-new: a **`Ball` entity (CRUD + art)**, an **additive `ball_id` on the odds row**, a
  public ball feed, and a **Slot Management** admin area.

### 16.1 Ball entity — admin CRUD + art

- **`Ball` is an admin-created entity, not a fixed set.** New model
  `Ball { id (pk), name (text), image (text URL), rank (number, sort) }` — global, reusable
  across packs. Admin can **create, rename, upload/replace image, reorder, delete**.
- **Art upload — reuse `POST /admin/media`** (`media/route.ts:28`; 20 MB cap, lossless
  store, S3/local env-gated `medusa-config.ts:37`) with a new `kind: 'ball'`:
  - Extend `ImageKind` `"pack" | "card"` → add `"ball"` (`media/validate.ts:11`) + the
    route guard (`media/route.ts:36-41`).
  - Add a `ball` profile to `IMAGE_RULES.profiles` (`media/validate.ts:61-64`):
    `{ minWidth: 512, minHeight: 512, targetRatio: 1, aspectTolerance: 0.05 }` (round-in-
    square — identical to the `pack` profile). Mirror it in the browser pre-check
    (`apps/admin/src/lib/image-validation.ts`).
  - Extend `useUploadImage` `kind` (`queries.ts:198-202`) + `uploadImage(file, kind)`
    (`admin-rest.ts:21`) to include `'ball'`.
- **REST:** `GET/POST /admin/balls`, `PUT/DELETE /admin/balls/:id` (RQ hooks beside
  `useSaveOdds`). `Ball.image` holds the CDN URL `POST /admin/media` returns
  (`route.ts:91-99`), exactly like `pack.image` / `card.image`.
- Ship a few **built-in default balls** (Poké/Great/Ultra/Master/Luxury) seeded so the reel
  renders before the operator customizes; the operator may edit/replace/add freely.

### 16.2 Ball ↔ item grouping (additive `ball_id`, lock untouched) + product flow

- **A Ball groups 1..N items.** An "item" = a Card (registered from a Medusa Product). The
  link is a **nullable `ball_id` added to the `PackOdds` membership row** (`models/pack-odds.ts`
  — the per-`(pack, card)` row that already holds `rarity` + `weight` + `locked`). A Ball
  "contains" every odds row whose `ball_id` points to it (1..N items, across packs).
- **The win-rate lock is untouched.** `ball_id` is **pure metadata**: `computeOdds` /
  `save-pack-odds` normalize `weight` only (`pack-odds.ts:22-29`); `roll-pack.ts` draws over
  `weight` and reads `rarity` from the won row — it would *also* read `ball_id` to attach
  the ball, but **never weights by it**. Adding the column changes no roll/odds math.
- **1 row = 1 spin = 1 Card** (decided, §14). `−`/`+` add/remove rows; each row is one
  independent roll. The reel symbol = that card's `ball_id` → `Ball`. A ball with one item
  ⇒ landing on it = that item; a ball with many items ⇒ the symbol reflects whichever of
  its items the lock rolled. **No multi-item "bundle" balls** — a row never awards more than
  one card.
- **Product → storefront flow:** admin adds/updates a Medusa **Product** → register/update
  the **Card** (`coerceRegisterCardBody` `cards/validate.ts`; `Card.image/name/market_value`,
  `card.ts`) → add it to a pack's **membership** + set its **odds** + assign its **`ball_id`**
  → storefront reflects it via `GET /store/packs/:slug` (`card-view.ts:43-54`, `weight`
  omitted). Win-rate lock stays hidden throughout.

### 16.3 Slot Management — admin pages

A new **"Slot Management"** nav grouping, reusing existing editor patterns:
- **Slot machines (= packs)** — list + **Add slot machine** + edit/delete. A "slot machine"
  *is* a pack: adding one = the existing `useCreatePack` → `POST /admin/packs` →
  `createPackWorkflow` (`queries.ts:134`, `packs/route.ts:41`); new machines default to
  `status:'draft'` (`packs/page.tsx:78`) and go live at `/slots/<slug>` when set `active`.
  Per machine the admin sets `title`, `price`, `buyback_percent`, `display_win_rate`,
  `image`, and `status`. **`slug` is create-only / immutable** (it keys the route + the
  `PackOdds` rows — `packs/page.tsx:392-394`). Each machine then gets its items, balls, and
  odds via the pages below.
- **Balls** — list + create/edit/delete; per ball: name, image upload (`kind:'ball'`), rank.
  (New page; pattern = `packs/page.tsx` image field + `useUploadImage`.)
- **Pack reel + odds** — extend the existing odds editor (`packs/[slug]/page.tsx`) with a
  **Ball selector column** per row, beside `rarity`/`weight`/`locked`. Save via `useSaveOdds`
  (`queries.ts:165-172`) with `ball_id` added to the row payload — the **lock-save path
  stays byte-identical** apart from the additive field.
- **Items / products** — the existing Cards editor (register from product, edit
  name/image/value) + membership (`useSaveMembers`).

### 16.4 Slot config knobs

| Knob | Mechanism | New? |
|---|---|---|
| Spin cost | `pack.price` (`pack.ts:25`, `packs/page.tsx:455-461`) | reuse |
| Win rate (real RNG) | per-card `weight`+`locked`+% → odds editor → `useSaveOdds` | reuse, **untouched** |
| `display_win_rate` (marketing %) | new nullable field (§7.3), decoupled from the roll | new (small) |
| Buyback % | `pack.buyback_percent` (clamped 90–100) | reuse |
| Slot enabled per pack | `pack.status` active/draft; or additive `slot_enabled` bool | reuse / opt |
| Balls (art + name + CRUD) | new `Ball` model + media `kind:'ball'` (§16.1) | new |
| Item → ball assignment | additive `ball_id` on `PackOdds` (§16.2) | new (additive) |
| Items / products | Cards editor + product registration (`cards/validate.ts`) | reuse |
| Multiplier cap | fixed at 5 in code (§7.2) | code |

### 16.5 Stays code-level (NOT admin-managed)

Reel timing/animation tokens (`BASE_SPIN_MS`, `STOP_STAGGER_MS`, `ITEM_W`, `WIN_INDEX`,
ease curve — §4.1/§6.5), rarity→color glow (`RARITY_RGB`), and **the roll itself**
(server-side weighted sample over normalized `PackOdds`). Never client- or admin-tunable.

### 16.6 Invariants

- The **ball is cosmetic**, resolved from the won card's `ball_id` *after* the backend
  rolls — it reads no odds, weights nothing, changes no outcome. Win rate stays
  authoritatively server-decided (normalized `PackOdds`, `pack-odds.ts:22-29`, §8).
- The **graded card slab + `market_value`** remain the real prize + sell-back basis
  (`packs.ts:21-27,129-137`); "view card" reveals it, it lands in the vault with the **same
  30 s instant offer timing** (unchanged buyback). The "<Ball name> · $value" banner = ball
  label + the card's value, not a separate reward.
- All new pieces (`Ball`, `ball_id` on `PackOdds`, `display_win_rate`, optional
  `slot_enabled`) are **additive** — zero edit to the roll path, odds normalization, or the
  win-rate lock.
