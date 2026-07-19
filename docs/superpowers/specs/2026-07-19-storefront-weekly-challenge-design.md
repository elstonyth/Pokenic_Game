# Storefront Weekly Challenge (`/task`) — data-driven

**Date:** 2026-07-19
**Scope:** ~4 files. This is a near-carbon-copy of the existing leaderboard vertical
slice (`store/leaderboard` route + `lib/data/leaderboard.ts` seam + null→empty-state
fallback), applied to the already-shipped but inert Weekly Challenge config.

## Problem

The storefront `/task` page (`src/app/task/page.tsx`) is a hardcoded "launching soon"
placeholder — it fetches nothing, and there is no public `store/` challenge API. The
Weekly Challenge **config** (milestone stages + weekly reset + top-10 payout) is fully
modeled and admin-editable (`challenge_settings`, `challenge_stages`), but only exposed
on `admin/` routes. Make `/task` render that config; keep the placeholder as the honest
empty state when the challenge is off.

## Non-goals

No live community-pool progress and no live rankings — there is no settlement engine yet
(the admin page calls the config "inert config a future settlement engine will read"). The
page shows the challenge **structure** (what's up for grabs), never fabricated live numbers.

## Design

1. **`GET /store/challenge`** (new; mirrors `GET /store/leaderboard` — plain publishable-key
   store route, read-only, resolves `PACKS_MODULE`). Returns:

   ```javascript
   { active,                                   // stages.length > 0 (admin's "0 stages = off")
     settings: { timezone, resetDay, resetHour, payoutCredits, payoutCardIds },
     stages:   [{ stageNumber, thresholdMyr, rewardCredits, rewardCardIds }],
     cards:    { [id]: { name, image } } }     // image = slab_image ?? image, referenced ids only
   ```

   Uses existing service methods: `challengeSettings()`, `listChallengeStages()`, `listCards()`.

2. **`src/lib/data/challenge.ts`** (mirrors `lib/data/leaderboard.ts`). `getChallenge()`
   fetches the route, zod-validates (new schema in `lib/data/schemas.ts`), formats RM via
   `rm()` and the reset line ("Resets Mondays 00:00 MYT"). Returns `null` on any backend
   failure **or** `active:false`.

3. **`src/app/task/page.tsx`** (stays a server component; keeps `metadata`).
   - `getChallenge() === null` → current placeholder, unchanged.
   - else → hero + milestone ladder (stage: "Reach RM X" → "RM Y credits" + featured-card
     thumbnails) + weekly-reset line + top-10 payout card + the existing "View the
     leaderboard" pill. Reuses `px-fluid`, pill, neutral-900 surfaces, `chase` accent.
     Featured cards render as plain `<img>` thumbnails (admin pattern; avoids Next remote
     image config).

4. **Seed** — a `medusa exec` script: lists a few local cards, writes ~4 ascending stages
   (threshold → credits + a featured card) and settings (Monday 00:00 Asia/Kuala_Lumpur,
   payout credits + cards) through the audited `saveChallengeStages` / `editChallengeSettings`
   service methods (adminId `seed-script`, reason string) — same validated path the admin uses.

## Iteration 2 (2026-07-19, operator-directed): live community pool

The operator supplied a VIP-page reference and the MIT-licensed uiverse.io
"strong-parrot-96" progress panel and asked for progress tracking. Resolution of
the earlier "no fake numbers" rule: the pool is REAL — a new read-only aggregate
(`PacksModuleService.challengeWeekPool`) sums pulled value this week from the
same pull ledger the leaderboard ranks on, with the week anchor computed in SQL
via `AT TIME ZONE` from the seeded reset settings. `GET /store/challenge` gains
`progress: { pooledMyr, weekStartIso }` (optional in the storefront schema for
deploy skew → the page hides the panel when absent).

Storefront: the seam derives pool stats (pooled / next milestone / to go,
overall %) and per-stage `complete | active | locked` states + marker positions;
the page adds the adapted progress panel (pulsing LIVE dot, chase-gold glow bar,
particle drift — keyframes in globals.css with a prefers-reduced-motion guard),
milestone markers along the bar, VIP-ladder-style stage state chips
(Check / IN PROGRESS / Lock), and a SnapGen-generated wordless gold trophy
emblem (`public/images/task/challenge-emblem.webp`, chroma-keyed alpha,
verified). Milestone rewards copy stays future-tense (settlement engine still
inert); only the pool is presented as live.

## Iteration 3 (2026-07-19, operator standard): full alignment

The operator supplied the "Weekly Pulled Value Challenge" standard. Alignment:

- **Cumulative stage rewards ARE the top-10 prize pool** — per stage, featured
  cards go to ranks 1-3 and credits to ranks 4-10; unlocking a higher stage
  stacks (never replaces) the lower stages. The flat top-10 payout is RETIRED:
  removed from GET /store/challenge, the /task page, the seed, and the admin
  "Week & Payout" tab (now "Week & Reset"; the settings columns remain in the
  DB but nothing reads them).
- **/task** now renders: the standard's 4-rule intro; Community Progress as
  "RM X / RM Y — NN%" (bar + markers kept); per-stage rank-split reward lines +
  Unlocked/Locked states; a cumulative Rewards Summary ("Top 3 will receive…" /
  "Top 4-10 will receive…"); and the Weekly Pull Value top-10 standings.
- **Weekly leaderboard = pull value** (operator decision, weekly tab only):
  GET /store/leaderboard?period=weekly now ranks by pulled value over the
  challenge-anchored week via the new `challengeWeekTop` aggregate — the SAME
  board as /task's top-10, so the two surfaces can never disagree. All-time
  stays spend-ranked ("points"). LeaderboardClient renders per-tab: weekly's
  big figure/your-rank value is pulled value; all-time keeps points.
- **Flagged follow-up (not in scope):** true "Recorded Pull Value" needs a
  draw-time value snapshot column on `pull` + backfill; today both boards and
  the pool recompute from live card FMV, so price syncs can shift totals
  retroactively.

## Verify / testing

- One small unit check on the seam: reset-line formatter + `null` fallback (active:false and
  backend-down both → null).
- Visual: screenshot `/task` from a **fresh prod build on :4000** via the Playwright
  `scripts/*.mjs` (repo hard constraint — not `next dev`, not Chrome MCP; `-Rebuild` so it
  isn't the stale placeholder).
