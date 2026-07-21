# Plan 054: Extract the Weekly-Challenge slice (and the one-shot backfills) out of service.ts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/src/modules/packs/service.ts`
> service.ts is the repo's highest-churn file — expect drift. Re-locate every
> symbol by NAME (grep), not line number, and STOP only if a listed method's
> body has materially changed.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (the money-core file; mitigation: move-only, no behavior change, dense existing specs)
- **Depends on**: 044 and 047 first (both touch challenge validators/service edges; land them, then rebase)
- **Category**: tech-debt
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

`service.ts` grew 4,425 → 5,096 lines (+671, +15%) in one round — 3.5× the largest prior round's growth — almost entirely from the Weekly-Challenge slice and three one-shot backfills landing inside the god object that five audit rounds have flagged as the repo's highest-blast-radius refactor target. The challenge slice is self-contained (own models `challenge-settings`/`challenge-stage`, own validators, cohesive read/write set) and is the natural FIRST extraction seam: moving it now (a) reverses this round's growth, (b) rehearses the facade-delegation pattern the eventual full refactor needs, and (c) hands plan 056's settlement engine a clean module to build beside instead of deepening the pile.

## Current state

- `backend/packages/api/src/modules/packs/service.ts` (5,096 lines at `b5944e26`) — symbols to move, located by grep at plan time:
  - `:247` `PULLED_VALUE_USD_SQL` — **SHARED** (used by `leaderboardTop`'s wins CTE at `:2486` AND the challenge aggregates) — see Step 2 for where it goes.
  - `:348` `challengeWeekAnchorParams` (+ the `CHALLENGE_WEEK_ANCHOR_CTE` it parameterizes — grep for it) — challenge-only.
  - `:4811` `challengeWeekPool`, `:4839` `challengeWeekTop` — the two week aggregates (raw SQL through the ORM's knex/em).
  - `:4935` `challengeSettings`, `editChallengeSettings` (nearby, ~`:4956`), `:4701` `saveChallengeStages` — config read/writes with audit rows.
  - `:3575` `backfillExternalFundedBasis`, `:3613` `backfillExternalFundedBasisForCustomer`, `:4893` `backfillRecordedPullValues` — one-shot migration backfills, invoked only by `medusa exec` scripts under `src/scripts/` (verify each caller by grep before moving).
  - `:4599` `saveVipLevels` — VIP, NOT challenge; LEAVE IT (its extraction couples to the vip-ladder slice — out of scope).
- The extraction pattern — TWO established shapes among the sibling helpers, and the challenge methods need the SECOND one:
  1. **Pure-function helpers** (`withdrawable.ts`, `credit-summary.ts`, `buyback-rate.ts`, `voucher-ranges.ts`): exports take plain data, no DB handle. NOT the shape for this slice — the challenge methods are DB-bound.
  2. **Service-as-argument helpers** (`pricing.ts` — read `resolveFxRate(source: FxRateSource)` and how `challengeWeekPool` already calls it at `service.ts:4810-4831`): the helper takes the service (typed to a narrow interface) and/or a resolved `em`, and the DECORATED service method stays home, resolving what the helper needs and forwarding it. This is your exemplar.
- **Decorator reality (this is the load-bearing constraint)**: every method in scope carries `@InjectManager()` or `@InjectTransactionManager()` + `@MedusaContext()` (verified at `:3574, :3612, :4700, :4810, :4838, :4892, :4934, :4955`). Those decorators MUST remain on the service methods — they are what threads the transaction manager. The extracted functions in `challenge.ts` therefore take `(em, service, args)`-style parameters; the service method keeps its decorator + `@MedusaContext()` signature, resolves `em = sharedContext.transactionManager ?? sharedContext.manager`, and forwards. `challengeSettings`/`editChallengeSettings` also call `this.listChallengeSettings(...)`/`this.listCards(...)`, so the extracted functions need the service instance (narrow interface), not just `em`.
- The facade keeps its public method names + signatures, so ALL callers — routes, workflows, tests — stay untouched.
- Callers that must keep working unchanged (grep at plan time; re-verify): `api/store/challenge/route.ts`, `api/store/leaderboard/route.ts` (weekly period → `challengeWeekTop`), `api/admin/challenge/{stages,settings}/route.ts`, scripts calling the backfills, and the specs below.
- The specs that lock behavior (your safety net — they must pass before AND after): `modules/packs/__tests__/challenge*.spec.ts` + `challenge-validate.unit.spec.ts`, `recorded-pull-value.integration.spec.ts`, `wallet-summary.spec.ts`, `credit-external-funded.spec.ts`, the leaderboard HTTP suite, `store/challenge` HTTP suite. Run the modules+unit tiers to enumerate exactly.
- CONTEXT.md vocabulary: "Pull", "Open", "PackOdds" — keep names/comments consistent; the new module is about the **Weekly Pulled Value Challenge** (its proper noun).

## Commands you will need

| Purpose                            | Command                                                           | Expected               |
| ---------------------------------- | ----------------------------------------------------------------- | ---------------------- |
| Backend deps (fresh worktree)      | `cd backend && corepack yarn install --immutable`                 | exit 0                 |
| Workspace dep build                | `cd backend/packages/odds-math && corepack yarn build`            | exit 0                 |
| Typecheck                          | `cd backend/packages/api && corepack yarn check-types`            | exit 0                 |
| Unit tier                          | `corepack yarn test:unit`                                         | all pass               |
| Modules tier (DB up)               | `corepack yarn test:integration:modules`                          | all pass               |
| Money smoke (DB up)                | `corepack yarn test:integration:smoke`                            | all pass               |
| Challenge/leaderboard HTTP (DB up) | `corepack yarn test:integration:http -- "challenge\|leaderboard"` | all pass               |
| Line count                         | `wc -l src/modules/packs/service.ts`                              | ≥600 lines below 5,096 |

## Scope

**In scope**:

- `backend/packages/api/src/modules/packs/service.ts` (deletions + thin decorated forwarders only)
- NEW `backend/packages/api/src/modules/packs/challenge.ts` (the slice)
- NEW `backend/packages/api/src/modules/packs/pulled-value.ts` (the shared SQL constant — see Step 2) — or an existing shared home if one fits better (e.g. `pricing.ts` if that's where its FX/fallback inputs live; executor judgment, state the choice)
- NEW `backend/packages/api/src/modules/packs/backfills.ts` (the three one-shots)

**Out of scope**:

- ANY behavior change — this is a move-only refactor. SQL strings byte-identical.
- `saveVipLevels` and the VIP slice; `leaderboardTop` itself; validators (`challenge-validate.ts`) — they already live outside.
- Route files, scripts, specs — they keep calling the service facade; only if a spec imports a moved PRIVATE symbol directly may that import be updated (record it).
- Renaming public service methods.

## Git workflow

- Branch: `advisor/054-extract-challenge-slice`
- Commits per step (move slice → move backfills → wire+verify), `refactor(packs): ...` style.
- Do NOT push/PR unless instructed.
- NOTE (this machine): global formatter hook may churn backend quote style — check `git diff` after each edit; whole-file churn on a 5k-line file is unacceptable — use a node script for service.ts edits if the hook fires.

## Steps

### Step 1: Baseline

Run unit + modules tiers (+ smoke) green; record counts and `wc -l service.ts`.

**Verify**: all green; numbers recorded.

### Step 2: Move the shared pulled-value SQL

Create `pulled-value.ts` exporting `PULLED_VALUE_USD_SQL` (and its companion constants/comment block, byte-identical). service.ts imports it; both `leaderboardTop` and the challenge code consume the import.

**Verify**: `corepack yarn check-types` → 0; grep shows ONE definition site.

### Step 3: Extract the challenge slice

Create `challenge.ts` housing `challengeWeekAnchorParams` + `CHALLENGE_WEEK_ANCHOR_CTE`, and the BODIES of `challengeWeekPool`, `challengeWeekTop`, `challengeSettings`, `editChallengeSettings`, `saveChallengeStages` as exported functions taking explicit dependencies — `(em, service, args)` or narrower, per method. Exemplar: `pricing.ts`'s `resolveFxRate(source: FxRateSource)` (service-as-narrow-interface argument), which `challengeWeekPool` already consumes.

The service methods stay home as THIN DECORATED FORWARDERS — this is deliberate and is NOT a "one-line delegation" in the literal sense: each keeps its `@InjectManager()`/`@InjectTransactionManager()` decorator and `@MedusaContext()` parameter (stripping them breaks transaction threading — see the plan-021 `mature-commissions` precedent), resolves `em = sharedContext.transactionManager ?? sharedContext.manager` exactly as the current body does, and calls the extracted function with `(em, this, args)`. A correct forwarder is therefore ~3-5 lines: decorator, signature, em-resolve, return-call. Move the methods' doc comments to `challenge.ts` with the bodies.

**Verify**: `check-types` → 0; unit + modules tiers green; challenge/leaderboard HTTP green.

### Step 4: Extract the backfills

Same treatment into `backfills.ts` for the three `backfill*` methods. Grep each script under `src/scripts/` that invokes them — they call service methods, which remain as delegations, so scripts stay untouched.

**Verify**: `check-types` → 0; `node --check` passes on any script if edited (should be none); modules tier green.

### Step 5: Final gates

**Verify**: full unit + modules + smoke green with counts equal to Step 1; `wc -l service.ts` shows ≥600-line reduction; `git diff service.ts` contains ONLY deletions, imports, and thin decorated forwarders (decorator + signature + em-resolve + call — no logic edits beyond that shape).

## Test plan

No new tests — the move is locked by the existing dense suites (Step 1 baseline = Step 5 counts). If any spec imports a moved private symbol, update the import and list it in the report.

## Done criteria

- [ ] service.ts ≤ ~4,450 lines; challenge/backfill logic lives in the new siblings
- [ ] All five public method names unchanged on the service (grep from route files resolves)
- [ ] Unit + modules + smoke + challenge/leaderboard HTTP all green, same counts as baseline
- [ ] SQL strings byte-identical (diff the moved constants against baseline)
- [ ] No files outside scope modified except recorded spec-import updates (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- A "challenge" method turns out to share private state with non-challenge service internals beyond em/repos (coupling the move can't cleanly cut) — report the actual dependency graph.
- Any tier's pass count differs from baseline for reasons other than a moved import.
- A method's dependencies exceed `em` + the narrow service interface (private state the forwarder can't cleanly pass) — report the actual dependency graph. NEVER strip an `@InjectManager`/`@InjectTransactionManager`/`@MedusaContext` decorator to force purity — the decorated-forwarder shape in Step 3 is the required pattern, not a contingency.
- Plans 044/047 not yet merged (dependency order) — rebase first.

## Maintenance notes

- Plan 056's settlement engine should live beside `challenge.ts` (e.g. `challenge-settlement.ts`), NOT in service.ts — this extraction is what makes that natural.
- The backfills in `backfills.ts` are one-shots; once confirmed run in prod (see the vip-external-basis operational note), they're candidates for deletion in a later cleanup.
- Reviewer: the whole review is "is this move-only?" — any hunk that isn't a deletion, an import, or a thin decorated forwarder (decorator + signature + em-resolve + call) is a red flag. The forwarders keeping their decorators is CORRECT, not scope creep.
