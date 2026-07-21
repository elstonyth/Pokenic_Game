# Plan 044: Cap the new admin reward money inputs and put the three new routes under the admin rate limiter

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/src/modules/packs/vip-levels-validate.ts backend/packages/api/src/modules/packs/challenge-validate.ts backend/packages/api/src/api/middlewares.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

PR #208 added three admin write routes — `POST /admin/vip-levels`, `POST /admin/challenge/stages`, `POST /admin/challenge/settings` — that persist credit-minting money fields (`voucher_amount`, `reward_credits`, `payout_credits`) with **no server-side upper bound**, and none of the three is registered with the shared admin-mutation rate limiter. Every sibling admin money input in this codebase is capped (five prior audit rounds enforced that discipline — see `voucher-ranges.ts` below, which caps the _same DB column_ the vip-levels route writes uncapped) and every sibling economy mutation shares one `adminActionRateLimit` budget. A fat-fingered or compromised admin token can currently stage an outsized reward payout that the rest of the codebase was hardened to prevent. Latent today (the rewards redemption economy is env-gated off), live the day it launches.

## Current state

Files and roles:

- `backend/packages/api/src/modules/packs/vip-levels-validate.ts` — request-body validator for `POST /admin/vip-levels`. `voucher_amount` check (~line 46-48) is lower-bound only:
  ```ts
  const voucher = r.voucher_amount;
  if (typeof voucher !== 'number' || !Number.isFinite(voucher) || voucher < 0)
    bad(`level ${level}: voucher_amount must be >= 0.`);
  ```
  `spend_threshold` (~line 37-44) is also unbounded above (checked finite, `>= 0`, strictly increasing).
- `backend/packages/api/src/modules/packs/challenge-validate.ts` — validators for the challenge routes. `reward_credits` (~line 64-66) and `payout_credits` (~line 116-119) are `>= 0` only; `threshold_myr` (~line 58) is unbounded above.
- `backend/packages/api/src/modules/packs/voucher-ranges.ts:5-11` — the established ceiling for the SAME `vip_level.voucher_amount` column, with the in-code note that predicted this plan:
  ```ts
  // Per-level payout ceiling. voucher_amount is a credit-minting lever once the
  // rewards economy is live, so an admin write needs an upper bound like every
  // sibling money input. 10_000 mirrors the credit-adjust ADJUST_MAX_RM ceiling
  // and sits well above the seeded 0–888 range (see seed-reward-economy-demo.ts).
  export const MAX_VOUCHER_MYR = 10_000;
  ```
- `backend/packages/api/src/api/middlewares.ts` — the admin money-mutation rate-limit block (~lines 519-596) registers `adminActionRateLimit` for freeze/unfreeze, commissions reverse/suspend/unsuspend, `rewards-settings`, `customers/*/credits`, `daily-rewards/boxes/*`, `daily-rewards/vouchers`, `pricing/fx`, `site-settings`, `avatar-frames`. Entry shape (copy this):
  ```ts
  {
    // Voucher-ladder write (POST /admin/daily-rewards/vouchers) — rewrites
    // vip_level.voucher_amount, so it shares the admin money-mutation budget.
    matcher: '/admin/daily-rewards/vouchers',
    method: 'POST',
    middlewares: [adminActionRateLimit],
  },
  ```
  `grep -n "vip-levels\|challenge" backend/packages/api/src/api/middlewares.ts` currently returns **nothing** — the three routes are absent.
- Route handlers (do NOT need changes): `backend/packages/api/src/api/admin/vip-levels/route.ts`, `backend/packages/api/src/api/admin/challenge/stages/route.ts`, `backend/packages/api/src/api/admin/challenge/settings/route.ts`. Each POST calls its validator then a `service.ts` save; `/admin/*` framework auth already gates them.
- Existing unit specs to extend: `backend/packages/api/src/modules/packs/__tests__/vip-levels-validate.unit.spec.ts` and `backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts`.
- Domain vocabulary (CONTEXT.md): money amounts here are **MYR** ("RM"); `voucher_amount` and `reward_credits` are MYR credit values; `spend_threshold` / `threshold_myr` are MYR thresholds.

## Commands you will need

| Purpose                                   | Command (from repo root)                                                                               | Expected on success         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| Backend deps (fresh worktree only)        | `cd backend && corepack yarn install --immutable`                                                      | exit 0                      |
| Workspace dep build (fresh worktree only) | `cd backend/packages/odds-math && corepack yarn build`                                                 | exit 0 (jest needs `dist/`) |
| Unit tier                                 | `cd backend/packages/api && corepack yarn test:unit`                                                   | all pass, no DB needed      |
| Targeted specs                            | `cd backend/packages/api && corepack yarn test:unit -- vip-levels-validate` (and `challenge-validate`) | all pass                    |
| Backend typecheck                         | `cd backend/packages/api && corepack yarn check-types`                                                 | exit 0                      |

## Scope

**In scope** (the only files you should modify):

- `backend/packages/api/src/modules/packs/vip-levels-validate.ts`
- `backend/packages/api/src/modules/packs/challenge-validate.ts`
- `backend/packages/api/src/api/middlewares.ts` (three additive matcher entries only)
- `backend/packages/api/src/modules/packs/__tests__/vip-levels-validate.unit.spec.ts`
- `backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts`

**Out of scope** (do NOT touch):

- `voucher-ranges.ts` — already correct; only import from it.
- `service.ts` save methods (`saveVipLevels`, `saveChallengeStages`, `editChallengeSettings`) — validation lives in the validators by this repo's convention; don't add a second layer.
- The admin SPA (`backend/apps/admin`) client-side mirrors — a follow-up may mirror the caps inline, but the server bound is the contract (plan 047 touches that page; avoid conflicts).
- Any change to the rate limiter implementation itself (`createAdminActionRateLimit`).

## Git workflow

- Branch: `advisor/044-admin-reward-caps`
- Conventional commits, e.g. `fix(security): cap admin reward money inputs + rate-limit the #208 routes`
- Do NOT push or open a PR unless the operator instructed it.
- NOTE (this machine): a global formatter hook may rewrite backend quote style on Edit/Write. After each edit, check `git diff` for whole-file churn; if present, revert and re-apply the edit via a small node script run through the shell.

## Steps

### Step 1: Cap `voucher_amount` and `spend_threshold` in `vip-levels-validate.ts`

Import `MAX_VOUCHER_MYR` from `./voucher-ranges`. Extend the voucher check to reject `voucher > MAX_VOUCHER_MYR` with a message in the file's existing style (e.g. `` `level ${level}: voucher_amount must be between 0 and ${MAX_VOUCHER_MYR}.` ``). Give `spend_threshold` a generous sanity ceiling constant local to the file (e.g. `const MAX_SPEND_THRESHOLD_MYR = 100_000_000;` — thresholds are lifetime-spend rungs, not payouts; the cap only needs to stop absurd values) and reject above it.

**Verify**: `cd backend/packages/api && corepack yarn test:unit -- vip-levels-validate` → existing cases still pass (new cases come in Step 4).

### Step 2: Cap `reward_credits`, `payout_credits`, `threshold_myr` in `challenge-validate.ts`

Import `MAX_VOUCHER_MYR` from `./voucher-ranges` and apply it as the ceiling for `reward_credits` (stages) and `payout_credits` (settings patch) — these are the same class of admin-authored credit grants. Cap `threshold_myr` with the same `MAX_SPEND_THRESHOLD_MYR`-style local constant as Step 1 (community pool thresholds are large by design — prod already renders RM 1.5M pools — so use 100,000,000). Keep message style consistent with the file's `bad(...)` helper.

**Verify**: `corepack yarn test:unit -- challenge-validate` → existing cases pass.

### Step 3: Register the three routes with `adminActionRateLimit`

In `backend/packages/api/src/api/middlewares.ts`, inside the existing admin money-mutation block (after the `/admin/daily-rewards/vouchers` entry is a natural spot), add three entries copying the exact shape shown in "Current state", with one-line comments in the block's established voice:

- `matcher: '/admin/vip-levels'`, method POST — rewrites the VIP ladder incl. `voucher_amount`.
- `matcher: '/admin/challenge/stages'`, method POST — rewrites challenge reward stages.
- `matcher: '/admin/challenge/settings'`, method POST — challenge singleton patch.

**Verify**: `grep -n "vip-levels\|challenge" backend/packages/api/src/api/middlewares.ts` → exactly the three new entries. Then `corepack yarn check-types` → exit 0.

### Step 4: Add rejection unit cases

See Test plan.

**Verify**: `corepack yarn test:unit -- vip-levels-validate` and `-- challenge-validate` → all pass including new cases.

## Test plan

Model new cases on the existing rejection cases in each spec (same `expect(() => validate...).toThrow(...)` shape):

- `vip-levels-validate.unit.spec.ts`:
  - `voucher_amount` exactly `MAX_VOUCHER_MYR` → accepted (boundary).
  - `voucher_amount` = `MAX_VOUCHER_MYR + 1` → rejected.
  - `spend_threshold` above the new ceiling → rejected.
- `challenge-validate.unit.spec.ts`:
  - stage `reward_credits` = cap → accepted; cap + 1 → rejected.
  - settings patch `payout_credits` above cap → rejected.
  - `threshold_myr` above ceiling → rejected; a large-but-legal value (e.g. 2_000_000) → accepted (protects the prod RM 1.5M pool reality).

Verification: `corepack yarn test:unit` → full unit tier green.

## Done criteria

- [ ] `corepack yarn check-types` (packages/api) exits 0
- [ ] `corepack yarn test:unit` exits 0; ≥6 new boundary cases exist and pass
- [ ] `grep -n "MAX_VOUCHER_MYR" backend/packages/api/src/modules/packs/vip-levels-validate.ts backend/packages/api/src/modules/packs/challenge-validate.ts` → ≥1 match in each
- [ ] `grep -c "adminActionRateLimit" backend/packages/api/src/api/middlewares.ts` → 16 (current count is 13: the declaration at `:72` + 12 usage entries; your 3 new entries make 16)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The validator excerpts don't match (drift — e.g. someone already added caps).
- The middlewares block no longer matches the entry shape shown (the matcher API changed).
- Any existing unit case fails after your change for a reason other than your new bound (you may have broken a legitimate large value — check the prod-sized threshold case).
- You find the admin SPA sends values above the new caps in normal operation (would mean the cap is wrong, not the client).

## Maintenance notes

- The future Weekly-Challenge settlement engine (plan 056 spike) will read `reward_credits` — its designer should keep grants ≤ the cap enforced here.
- If a legitimate reward ever needs to exceed RM 10,000/level, raise `MAX_VOUCHER_MYR` in `voucher-ranges.ts` (single source) — do not add per-route exceptions.
- Reviewer: check the three middleware matchers against the actual route paths (`api/admin/vip-levels/route.ts`, `api/admin/challenge/{stages,settings}/route.ts`) — a typo'd matcher silently rate-limits nothing.
