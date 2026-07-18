# Reward Admin Surfaces — Design Spec

- **Date:** 2026-07-18
- **Status:** Draft — awaiting review
- **Author:** brainstorming session (Claude + Elston)
- **Branch:** `claude/reward-admin-surfaces-handoff-2dfed2`
- **Predecessor:** `2026-07-18-vip-leaderboard-redesign-design.md` (PR #207, sub-projects
  A+B+C). This spec covers the **admin surfaces** follow-up; it does **not** build
  sub-project D (the Weekly Challenge runtime).

---

## 1. Context & scope decisions

Polycards has two independent reward systems (never conflate them):

- **VIP Reward** — per-user 100-level ladder. Backend fully built; ladder rows live in
  the `vip_level` table (seeded from `vip-levels.data.ts`) but there is **no admin UI
  or API for the ladder itself**. The existing `daily-rewards` admin page configures
  only boxes / voucher ranges / frames / engine settings.
- **Leaderboard "Weekly Pulled Value Challenge"** — deferred sub-project D. **No
  backend exists.** Its runtime (snapshot column, re-rank, pool, weekly settlement,
  top-10 payout) is explicitly out of scope here.

**Decided scope for this project** (brainstormed 2026-07-18):

1. **VIP ladder admin** — a new **Levels tab on the merged "VIP" admin page**
   (backed by a new `/admin/vip-levels` API) with **full CRUD**
   (edit fields *and* add/remove rungs; the ladder becomes variable-length).
2. **Challenge config layer** — inert config a future D reads. Three groups, all
   admin-editable, none of which move money or trigger settlement:
   - **Milestone stages** — full CRUD (variable count, not fixed at 4; D must render N
     stages). Threshold + per-stage rewards (credits + featured cards).
   - **Week config** — **fixed calendar weeks** (§6.2 question resolved): configurable
     IANA timezone (default `Asia/Kuala_Lumpur`), reset day (default Monday) and reset
     hour (default 00:00). Not rolling-window.
   - **Top-10 weekly reward** — **flat** (§6.2 question resolved): one reward
     definition applied to every top-10 finisher (credits + featured cards). Not
     per-rank, not banded.

**Deferred to D (this project must NOT build):** `pulled_value_myr` snapshot column,
`leaderboardTop` re-rank, community-pool aggregation, week close/settlement, the actual
payout (idempotency-critical), and any storefront challenge UI.

---

## 2. Shared architecture decisions

- **Config lives in the `packs` module.** Both surfaces add models/service methods to
  `backend/packages/api/src/modules/packs/` — the VIP ladder already lives there and D
  will extend the packs pull/leaderboard logic. No new Medusa module.
- **Bulk audited-replace, not per-row REST CRUD.** Each editor POSTs the *whole set*;
  the server validates cross-row invariants atomically (contiguity, strictly-increasing
  thresholds) and replaces. Per-row writes would make those invariants race-prone.
  Matches the repo's existing reward-config surfaces (`avatar-frames`,
  `daily-rewards/boxes`, `daily-rewards/vouchers` — all whole-catalog replaces).
- **Audited writes** (pattern of `editRewardsSettings` / `editSiteSettings` /
  `editAvatarFrames`): `adminId` from `req.auth_context.actor_id` (never the body),
  a required `reason` (`reqReason`), before/after snapshot into `AdminActionAudit`.
  Wrapper methods are named `edit*` / `save*` to avoid shadowing the MedusaService
  auto-generated `create*/update*/delete*` CRUD methods.
- **Admin frontend conventions** (per existing routes): page at
  `backend/apps/admin/src/routes/<name>/page.tsx` with `export const config:
  RouteConfig` (from `@mercurjs/dashboard-sdk`) for the sidebar; `@medusajs/ui`
  components; React Query hooks in `admin/src/lib/queries.ts`; REST helpers in
  `admin/src/lib/admin-rest.ts`; `LoadingSkeleton`; `toast` + `usePrompt` for
  save/confirm flows.
- **Sidebar organization — exactly one top-level entry per reward system**
  (decided 2026-07-19, operator-friendliness). **Neither lives under Promotions:**
  - **VIP system → one page, "VIP":** the existing daily-rewards page is renamed
    **"Daily Rewards" → "VIP"**, un-nested from `/promotions`, and gains a new
    **Levels** tab — giving five tabs: **Levels, Boxes, Vouchers, Frames,
    Engine**. Levels goes first (the ladder is the system's overview; the other
    tabs configure what its rungs reference). There is **no separate
    `/vip-levels` admin route.**
  - **Milestone system → one page, "Weekly Challenge":** a top-level sidebar
    item, ranked after VIP, with tabs **Milestone Stages** and **Week & Payout**.
    Keeps the community-milestone system visually separate from the per-user VIP
    system (the two must never be conflated).

---

## 3. Surface 1 — VIP ladder admin

### 3.1 Backend

**No model change.** `vip_level` already has every field
(`level`, `spend_threshold`, `voucher_amount`, `box_tier`, `frame_unlock`,
`direct_referral_pct`, `prizes`). Verified variable-length-safe end to end:

- `levelForSpend()` (`vip-ladder.ts`) iterates whatever DB rows exist — no 100
  assumption.
- `rewardsForLevel()` (`vip-rewards.ts`) **snapshots values into each grant**, so
  ladder edits affect only *future* level-ups; granted rewards stay frozen.
- Draw-time box tier resolves from the DB row (`vipLevel?.box_tier ?? ''`), not a
  formula.
- Storefront (PR #207 branch): `vip-benefits.ts` derives box upgrades by **diffing
  consecutive tiers**; the carousel clamps a missing `highest_level_ever` to index 0;
  tier labels render generically (`Tier ${letter.toUpperCase()}`).

**New API** — `backend/packages/api/src/api/admin/vip-levels/route.ts`:

- `GET` → `{ levels: VipLevelDTO[] }` (full ladder, ordered by `level`).
- `POST` → body `{ levels: VipLevelInput[], reason: string }` → validate → audited
  full replace → returns the saved ladder.

**New service method** `editVipLevels({ levels, adminId, reason })` +
**pure validator** `validateVipLevels()` in its own file
(`modules/packs/vip-levels-validate.ts`), unit-tested.

**Invariants (server-enforced):**

- `level` values are **contiguous `1..N`** (POST = the full renumbered ladder; the
  server rejects gaps/duplicates). N ≥ 1; no fixed upper bound.
- `spend_threshold` strictly increasing; **rung 1's threshold must be `0`**
  (`levelForSpend`'s defensive floor).
- `box_tier` must be one of the existing `reward_box` tiers (else the daily-box draw
  would resolve an empty tier).
- `frame_unlock = true` only on decade levels 10, 20 … 100 (§3.2).
- `voucher_amount` ≥ 0, `direct_referral_pct` ≥ 0.
- `prizes` JSON is not surfaced or edited (unused; out of scope).

### 3.2 Avatar-frame constraint (review amendment 1; decided 2026-07-18)

`rewardsForLevel()` grants an avatar frame for **any** rung with `frame_unlock:
true`, but the frame-milestone list `[10, 20 … 100]` is hardcoded as `FRAME_LEVELS`
in **three places**: backend catalog validation (`modules/packs/avatar-frames.ts`,
also used by `editAvatarFrames`'s normalization loop), the admin daily-rewards
Frames tab (its own local copy), and the storefront (`src/lib/frame-levels.ts`,
used by both the `/me` appearance picker and the `setAvatarFrame` server action's
equip validation). An unconstrained `frame_unlock` would therefore grant frames the
storefront refuses to equip — a half-broken state.

**Decision — constrain, don't cascade:** the vip-levels validator requires
`frame_unlock = true` **only on the classic decade levels (10, 20 … 100)** (i.e.
levels in the backend `FRAME_LEVELS` constant); `frame_unlock` on any other level is
rejected with a clear error. All three hardcoded lists stay as they are. Everything
else on the ladder remains fully editable. Making frame milestones ladder-driven
end-to-end (backend + admin Frames tab + storefront equip flow) is a **documented
follow-up**, not part of this project.

### 3.3 Frontend

The ladder editor is a new **Levels tab** on the existing daily-rewards page
(renamed "VIP", §2) — built as its own component file
`backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx` that `page.tsx`
imports and wires as the first tab. The page file is already ~1,330 lines (over
the repo's 800-line guideline), so the tab component owns all Levels UI and state;
`page.tsx` grows only by the tab registration.

- `@medusajs/ui` `Table` of editable rows (level, threshold RM, voucher RM, box tier
  select from live `reward_box` tiers, frame toggle, referral %).
- Add-row / remove-row controls; client renumbers `1..N` on any add/remove.
- Dirty-state tracking against the loaded snapshot; save opens a confirm with a
  **required reason** field; `toast` on result.
- Hooks `useVipLevels` / `useSaveVipLevels` in `lib/queries.ts`; REST in
  `lib/admin-rest.ts`.

### 3.4 Documented edge cases (accepted, no code)

- **Ladder shrink vs `highest_level_ever`:** the marker is monotonic, so deleting top
  rungs leaves some users' recorded peak above the ladder max. Verified graceful:
  `levelForSpend` recomputes the live level from the current ladder; the store `/vip`
  route's `next` lookup returns `null` (treated as ladder top); the carousel falls
  back to index 0. Do **not** "fix" this — grants and peaks are historical facts.
- **Seed reappearance:** `seed.ts` / `seed-vip-achievements.ts` are idempotent
  upsert-if-absent **by `level`** — they never overwrite operator edits, but a
  *deleted* rung whose level number is in `VIP_LEVELS` reappears if a seed re-runs.
  Accepted: seeds are manual/first-boot operations.
- **Workbook pin test** (`vip-levels-workbook.unit.spec.ts`) pins the **seed data
  file**, not DB rows. Runtime admin edits don't touch it. It stays as-is.
- **Renumbering semantics:** existing `vip_reward_grant` rows keep their snapshotted
  level numbers even if the ladder is renumbered — frozen by design; no migration of
  historical grants.

---

## 4. Surface 2 — Challenge config layer

### 4.1 Models (new, in `packs`; one additive migration)

**`challenge_stage`** — one row per milestone stage:

| field | type | notes |
|---|---|---|
| `id` | id (pk) | |
| `stage_number` | number | contiguous from 1; unique |
| `threshold_myr` | bigNumber | community-pool cumulative threshold, MYR |
| `reward_credits` | bigNumber | credits granted at this stage, MYR; ≥ 0 |
| `reward_card_ids` | json | array of featured `card` ids; may be empty |

**`challenge_settings`** — singleton (same pattern as `site_settings`: one row,
create-on-first-edit):

| field | type | default | notes |
|---|---|---|---|
| `id` | id (pk) | `'global'` | |
| `cadence` | text | `'fixed_weekly'` | only valid value today; enum-checked |
| `timezone` | text | `'Asia/Kuala_Lumpur'` | must be a valid IANA zone |
| `reset_day` | number | `1` (Monday) | 0–6 |
| `reset_hour` | number | `0` | 0–23 |
| `payout_credits` | bigNumber | `0` | flat top-10 reward, MYR; ≥ 0 |
| `payout_card_ids` | json | `[]` | flat top-10 featured cards |

Both registered in `PacksModuleService`'s `MedusaService({...})` model list.

### 4.2 APIs

- `GET/POST /admin/challenge/stages` — whole-set audited replace
  (`saveChallengeStages({ stages, adminId, reason })`).
- `GET/POST /admin/challenge/settings` — audited singleton edit
  (`editChallengeSettings({ patch, adminId, reason })`).

**Validation** (pure validators, unit-tested):

- Stages: `stage_number` contiguous from 1; `threshold_myr` strictly increasing;
  `reward_credits` ≥ 0; **every id in `reward_card_ids` must exist in the `card`
  table** (review amendment 3 — checked at save time so admin typos can't create
  dangling featured-card references that only surface when D ships).
- Settings: `cadence` ∈ `{'fixed_weekly'}`; timezone validated via
  `Intl.supportedValuesOf('timeZone')` / `Intl.DateTimeFormat` probe; day/hour ranges;
  `payout_card_ids` same card-existence check.
- **Empty stage list is valid** and means "challenge unconfigured/disabled" — D must
  treat zero stages as challenge-off. (Contrast: the VIP ladder requires N ≥ 1
  because `levelForSpend` throws on an empty ladder.)
- **`GET /admin/challenge/settings` before first save returns the §4.1 defaults**
  (create-on-first-edit; never 404s).
- Card existence is checked **at save time only**; a featured card deleted *later*
  leaves a dangling id. D must skip missing ids at render (documented in §4.4).

### 4.3 Frontend

`backend/apps/admin/src/routes/challenge/page.tsx` — **top-level** sidebar entry
"Weekly Challenge" (see §2 sidebar organization), two `@medusajs/ui` `Tabs`:

- **Milestone Stages** — editable table (stage #, threshold RM, credits RM,
  featured-card picker reusing the existing card-search pattern from the daily-box
  prize editor); add/remove stage rows (client renumbers).
- **Week & Payout** — week cadence (read-only `fixed_weekly` for now), timezone
  select, reset day/hour, and the flat top-10 reward (credits + featured cards).

Both tabs save independently with required reason; same query-hook/REST conventions.

### 4.4 Contract note for D

These tables are **inert** until D consumes them. D's spec must treat them as the
config contract: variable stage count (render N, don't assume 4; **zero stages =
challenge disabled**), flat top-10 reward, fixed-weekly cadence anchored at
(`timezone`, `reset_day`, `reset_hour`), and **skip `reward_card_ids` /
`payout_card_ids` entries whose card no longer exists**. If D's settlement design
needs a different shape (e.g. per-rank payouts), it amends this schema in its own
migration — this project does not pre-build for that.

---

## 5. Security

- All routes under `/admin/*` — framework-auto-protected; `adminId` from
  `auth_context.actor_id`, never the body.
- Every write requires a `reason` and lands an `AdminActionAudit` row with
  before/after snapshots.
- No money moves in this project, but the config **governs** future money (voucher
  amounts, stage/payout rewards) — run **`/security-review`** on all new write paths
  before completion. Payout settlement idempotency is D's concern, not this project's.
- **Accepted trade-off — no optimistic concurrency:** concurrent admin edits are
  last-write-wins (no version/`If-Match` check). No existing admin surface in this
  repo has one and this is a single-operator shop. Revisit if a second operator
  materialises; the audit trail records both writes meanwhile.

---

## 6. Testing & verification

- **Unit:** `validateVipLevels`, `validateChallengeStages`, challenge-settings
  validator — invariant matrix (gaps, duplicate levels, non-increasing thresholds,
  nonzero first threshold, unknown box tier, bad timezone, dangling card ids).
- **Integration** (backend `integration-tests/http/`): new admin routes — 401
  unauthenticated; GET shapes; POST happy path persists + writes an audit row; POST
  invariant violations reject with 400 and change nothing (atomicity).
- **Frame-constraint regression:** vip-levels POST rejects `frame_unlock: true` on a
  non-decade level (and on any level > 100); accepts it on 10 … 100. The
  avatar-frames validator and its tests are untouched.
- **Type gate:** repo PostToolUse + Stop typecheck hooks (storefront + backend green).
- **Browser verification:** admin on `:7000` against the **worktree** backend on
  `:9000` (per the handoff caveat: kill the main-tree `:9000` backend first, copy env
  via PowerShell `Copy-Item`). Exercise both pages end-to-end: load, edit, add/remove
  rows, save with reason, reload persists.

---

## 7. Out of scope

- All of sub-project D's runtime (snapshot column, re-rank, pool, weekly buckets,
  settlement, payout, Task-hub UI).
- Editing `vip_level.prizes` (unused JSON, null throughout the seed).
- The daily-rewards admin page's existing four tabs (Boxes / Vouchers / Frames /
  Engine) and the avatar-frames validator — behavior unchanged. The page only
  gains the imported Levels tab plus its `RouteConfig` update (label → "VIP",
  `nested: '/promotions'` removed, `rank` added; §2). Frame milestones stay
  fixed per
  §3.2; ladder-driven frames are a documented follow-up.
- Seed-file changes (`vip-levels.data.ts`) and the workbook pin test.
- Optimistic-concurrency/versioning on admin writes (documented trade-off, §5).
