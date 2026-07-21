# Plan 046: Roll back the Card mutation (and reclaim the baked slab) when update-card's product mirror fails

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/src/workflows/steps/update-card.ts backend/packages/api/src/workflows/steps/__tests__/update-card.unit.spec.ts`
> On any change, compare the "Current state" excerpts before proceeding; mismatch = STOP.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

`update-card` first commits the Card row mutation (`packs.updateCards`), then mirrors it into the Medusa Product (`updateProductsWorkflow`) **with no try/catch**. A workflow step's own compensation only runs when a LATER step throws — if the invoke itself throws mid-way, nothing undoes what it already did. So any mirror failure (core-flow throw, DB error, validation) leaves the Card showing a new FMV/grade/price/`for_sale` while the marketplace Product keeps the old title/status/price — silently corrupted money-display and listing state — and the freshly-baked slab composite is orphaned in storage. The sibling step `create-card.ts` hand-rolls exactly this guard (delete card + slab file, rethrow) for exactly this reason; `update-card` predates that discipline and its unit spec never exercises the failure path.

## Current state

- `backend/packages/api/src/workflows/steps/update-card.ts` — the step. Key structure (line numbers at `b5944e26`):
  - `:101` `updateCardInvoke` — exported invoke (unit-tested directly).
  - `:118-141` builds `snapshot: CardSnapshot` of the card's PRIOR state (name, set, grader, grade, market_value, image, price, for_sale, pixel fields, pc fields, market_multiplier, `slab_image`, `slab_image_key`, label fields) — this is the exact restore payload the fix needs; it already exists.
  - `:148` `const baked = await bakeSlabImage(...)` → `nextSlabImage` / `nextSlabKey` (`baked` may be null — best-effort bake).
  - `:166` `resolvePixelPokemonPatch(...)` — can throw NOT_FOUND; note it runs AFTER the bake (see Step 1's try-start choice).
  - `:171` `await packs.updateCards([{ id: card.id, ...new values... }])` — the Card commit.
  - `:196` product lookup (`const [product] = await productModule.listProducts(...)`); `:210` `prevProduct` snapshot; `:219` `await updateProductsWorkflow(container).run({...})` — the mirror. **No try/catch anywhere in the file** (`grep -n "catch" update-card.ts` → empty).
  - `:261` on the found-product path, after a successful mirror, the OLD slab file is deleted: `await deleteSlabFile(container, snapshot.slab_image_key);` then `:263` returns `StepResponse`.
  - `:294` upsert branch (product missing → `createProductsWorkflow`), `:304` same old-slab delete, `:306` `StepResponse`.
  - `:312` `updateCardStep = createStep(...)` with the compensate fn at `:315-373` (restores card from snapshot + product from `prevProduct`).
- The pattern to copy — `backend/packages/api/src/workflows/steps/create-card.ts:297-306`:
  ```ts
  } catch (error) {
    // The just-uploaded composite is referenced only by the Card row being
    // undone here — reclaim it too (deleteSlabFile never throws), so a failed
    // mirror doesn't orphan one file per retried registration.
    if (baked) {
      await deleteSlabFile(container, baked.key);
    }
    await packs.deleteCards([card.id]);
    throw error;
  }
  ```
- The rationale comment the repo already carries — `backend/packages/api/src/workflows/steps/record-pull.ts:16`: compensation rolls back only "if a LATER step throws".
- `backend/packages/api/src/workflows/steps/__tests__/update-card.unit.spec.ts` — mocks `bake-slab` (`bakeSlabImage` → null, `deleteSlabFile` → undefined) and `@medusajs/medusa/core-flows` (`updateProductsWorkflow` → `{ run: resolve({}) }`). Every existing case resolves the mirror; the failure path is untested. Use its container-stub + mock arrangement as the pattern for the new cases.

## Commands you will need

| Purpose                              | Command                                                             | Expected |
| ------------------------------------ | ------------------------------------------------------------------- | -------- |
| Backend deps (fresh worktree)        | `cd backend && corepack yarn install --immutable`                   | exit 0   |
| Workspace dep build (fresh worktree) | `cd backend/packages/odds-math && corepack yarn build`              | exit 0   |
| Typecheck                            | `cd backend/packages/api && corepack yarn check-types`              | exit 0   |
| Targeted spec                        | `cd backend/packages/api && corepack yarn test:unit -- update-card` | all pass |
| Full unit tier                       | `corepack yarn test:unit`                                           | all pass |

## Scope

**In scope**:

- `backend/packages/api/src/workflows/steps/update-card.ts`
- `backend/packages/api/src/workflows/steps/__tests__/update-card.unit.spec.ts`

**Out of scope** (do NOT touch):

- `create-card.ts` — already correct; it is your exemplar, not your target.
- `bake-slab.ts` / `deleteSlabFile` — contract stays "never throws".
- The compensate function's restore logic (`:315-373`) — extend it ONLY as Step 3 describes (adding the new-slab reclaim); do not restructure.
- Admin SPA callers.

## Git workflow

- Branch: `advisor/046-update-card-rollback`
- Commit: `fix(cards): roll back card mutation when the product mirror fails`
- Do NOT push/PR unless instructed.
- NOTE (this machine): global formatter hook may churn backend quote style — check `git diff`, re-apply via node script if needed.

## Steps

### Step 1: Wrap mutation + mirror in a rollback guard

In `updateCardInvoke`, wrap everything from the `resolvePixelPokemonPatch` call (`:166`) through both mirror branches (found-product update at `:219` and the upsert branch at `:294`) in `try { ... } catch (error) { ... }` — starting the try at `:166` rather than `:171` because the pixel resolve can throw NOT_FOUND after the slab was already baked at `:148`, and that path would otherwise orphan the new file. Inside the catch, mirror `create-card.ts:297-306` — but note: if the throw happened BEFORE `packs.updateCards` ran (the pixel-resolve case), the card was never mutated, and the restore in (2) is a harmless idempotent re-write of current values; that is acceptable and simpler than tracking whether the mutation happened. The catch must:

1. reclaims the NEW slab file if one was baked: `if (nextSlabKey) { await deleteSlabFile(container, nextSlabKey); }` — note update-card's variable is `nextSlabKey`, not `baked.key`, and `baked` may be null;
2. restores the Card from the already-built `snapshot`: `await packs.updateCards([{ id: snapshot.id, name: snapshot.name, ... }])` — write back every field the forward call at `:171` writes, sourced from `snapshot` (the compensate fn at `:315+` already does this same restore — match its field list exactly);
3. rethrows the original error.

Keep the happy-path code inside the try unchanged, including the old-slab `deleteSlabFile(snapshot.slab_image_key)` calls and the `StepResponse` returns. Add a comment in create-card's voice explaining why the invoke must self-compensate.

Careful: the restore in (2) can itself throw (DB down). That's acceptable — the original error still propagates from the rethrow path; wrap the restore in its own try/catch that logs-and-continues ONLY if the file already has a logger convention available in scope; otherwise let it throw (the operator retries; state is no worse than today). Do not swallow the original error.

**Verify**: `corepack yarn check-types` → exit 0; `corepack yarn test:unit -- update-card` → existing cases still green.

### Step 2: Reclaim the new slab in compensate too

In the compensate fn (`:315-373`), the restore puts back `snapshot.slab_image`/`slab_image_key` on the Card — but the NEW baked file (the one the failed-later-step run created) is never deleted. Verified at plan time: the compensate payload is `{ card: snapshot, product: prevProduct }` and the new key is NOT in it. So this step is a three-site change, all inside the in-scope file: (i) add a field (e.g. `newSlabKey: string | null`) to the `CardCompensate` type at `:94`; (ii) populate it with `nextSlabKey` at BOTH `StepResponse` return sites — `:263` (found-product branch) AND `:306` (upsert branch) — missing one silently half-fixes; (iii) in compensate, `if (data.newSlabKey && data.newSlabKey !== data.card.slab_image_key) { await deleteSlabFile(container, data.newSlabKey); }`.

**Verify**: `corepack yarn check-types` → exit 0.

### Step 3: Failure-path unit cases

See Test plan.

**Verify**: `corepack yarn test:unit -- update-card` → all pass, including new cases; temporarily re-break (comment out the catch) to confirm the new cases FAIL red, then restore. Record red→green in your report.

## Test plan

New cases in `update-card.unit.spec.ts`, using the existing mock arrangement:

1. **Mirror throws → card restored**: make `updateProductsWorkflow(...).run` reject once; call `updateCardInvoke` with input values that GENUINELY DIFFER from the `CARD` fixture (e.g. `market_value: 999`, `name: 'Changed Name'`) — CAUTION: in the existing spec the input's `market_value`/`name` EQUAL the fixture's (25 / 'Test Card'), so reusing the existing input makes "restored old value" indistinguishable from "forward wrote the same value" and the test proves nothing; assert it rethrows AND `packs.updateCards` was called a second time with the snapshot values (25, 'Test Card').
2. **Mirror throws → new slab reclaimed**: set `bakeSlabImage` to resolve `{ url: 'u', key: 'new-key' }`; mirror rejects; assert `deleteSlabFile` called with `'new-key'` and NOT with the old `slab_image_key`.
3. **Mirror succeeds → no restore**: happy path still calls `packs.updateCards` exactly once and deletes only the OLD slab key (regression guard on the guard).
4. **Upsert branch throws** (`createProductsWorkflow.run` rejects when no product found): same restore assertions as (1).

Pattern: model on the file's existing cases (jest module mocks + `CARD` fixture).

## Done criteria

- [ ] `corepack yarn check-types` exits 0
- [ ] `corepack yarn test:unit -- update-card` green; 4 new failure-path cases present; red→green proof recorded
- [ ] `grep -c "catch" backend/packages/api/src/workflows/steps/update-card.ts` ≥ 1
- [ ] Full `corepack yarn test:unit` green
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- File structure doesn't match the line map in "Current state" (drift).
- Extending `CardCompensate` (Step 2) ripples into `card-product.ts` or workflow definitions beyond the two in-scope files — report the actual blast radius instead of expanding scope.
- Existing spec cases fail for reasons unrelated to your change.
- You find evidence Medusa DOES self-compensate a throwing invoke (would invalidate the premise — cite the framework source if so).

## Maintenance notes

- If update-card ever gains more post-mutation side effects (e.g. price-set writes), they belong INSIDE this try so the restore covers them.
- Reviewer: diff the restore field list against the forward `updateCards` field list — a missed field restores partially and hides the bug this plan kills.
- Deferred: an integration-tier test with a real DB was considered and skipped — the unit mocks prove the control flow, and the compensate path already has workflow-level coverage elsewhere.
- Known residual (pre-existing, NOT fixed by this plan — don't mistake it for covered): on the later-step-throw path the invoke already completed, meaning the OLD slab file was already deleted at `:261`/`:304`; compensate restores `snapshot.slab_image_key` pointing at that already-deleted file. Fixing it means deferring the old-slab delete until after the whole workflow commits — a bigger change; recorded here so a future reader knows the boundary.
