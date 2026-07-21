# Plan 052: Extract `notifyFeedNonfatal` — one swallow-and-log wrapper instead of 7 copy-pasted try/catch blocks

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/src/modules/packs/notify-feed.ts backend/packages/api/src/subscribers backend/packages/api/src/workflows/steps/settle-vip.ts backend/packages/api/src/jobs/mature-commissions.ts backend/packages/api/src/api/store`
> On any change, compare the excerpts below; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

Every feed-notification producer wraps `notifyFeed` in its own hand-written "non-fatal: money is committed, notification may drop" try/catch — 6-7 sites with near-identical logic and drifting quality (some log through a guarded logger resolve, the topup route swallows with no log at all, contradicting PR #222's "log producer failures" intent). Each new producer re-invents the contract; a change to it touches every site. One wrapper kills the class and makes the next producer (e.g. the settlement engine's `challenge_stage`) a one-liner.

## Current state

- `backend/packages/api/src/modules/packs/notify-feed.ts` — the thin core (stays as-is):

  ```ts
  export type FeedTemplate =
    | 'commission_matured' | 'vip_level_up' | 'reward_won'
    | 'voucher_claimed' | 'delivery_status' | 'topup_credited';

  export async function notifyFeed(
    container: { resolve: (k: string) => any },
    args: { receiverId: string; template: FeedTemplate; data: Record<string, unknown>; idempotencyKey: string },
  ): Promise<void> { ... }
  ```

- Producer sites (grep `notifyFeed` outside tests/notify-feed.ts):
  1. `backend/packages/api/src/subscribers/vip-spend-settled.ts:34-57` — the FULL pattern (copy its semantics into the wrapper):
     ```ts
     try {
       await notifyFeed(container, { receiverId: ..., template: 'vip_level_up', data: {...}, idempotencyKey: `${data.open_id}:levelup` });
     } catch (err) {
       // Notification failure is non-fatal: the grant rows and state upsert are
       // already committed. Resolve AND emit inside one guard so a container
       // without a real logger (e.g. a unit-test container) can't throw out of
       // this path, while operators still get to see provider issues.
       try {
         container.resolve(ContainerRegistrationKeys.LOGGER).warn(
           `[vip-spend-settled] notifyFeed('vip_level_up') failed for receiver ${...} — grants committed, notification dropped: ${err message}`,
         );
       } catch { /* logger not available in test container — silently ignore */ }
     }
     ```
  2. `backend/packages/api/src/workflows/steps/settle-vip.ts:~42-57` — same shape.
  3. `backend/packages/api/src/jobs/mature-commissions.ts:~26-43` — same shape.
  4. `backend/packages/api/src/api/store/rewards/claim/[grantId]/route.ts:~52-69` — same shape.
  5. `backend/packages/api/src/api/store/credits/topup/route.ts:61-72` — DEGENERATE variant (no logging at all):
     ```ts
     if (shouldNotifyTopup(result)) {
       try {
         await notifyFeed(req.scope, { receiverId: customerId, template: 'topup_credited', data: {...}, idempotencyKey: topupFeedKey(result.reference) });
       } catch {
         // Non-fatal — never fail a committed top-up over a notification.
       }
     }
     ```
  6. `backend/packages/api/src/api/store/daily/draw/route.ts` (~line 52 region) — check its exact shape on read.
  7. `backend/packages/api/src/scripts/seed-notification-probe.ts` — a SCRIPT, leave untouched.
  8. `backend/packages/api/src/api/admin/delivery-orders/[id]/route.ts` — check shape on read; migrate if it matches the pattern.
- Existing behavior lock: `backend/packages/api/src/subscribers/__tests__/notify-feed-nonfatal.unit.spec.ts` — asserts producer failures don't break the money path. It must keep passing; retarget/extend per Test plan.
- Also exists (do not be surprised by it): `backend/packages/api/src/modules/packs/__tests__/notify-feed.unit.spec.ts` — tests the UNCHANGED `notifyFeed` core; leave it alone, it should stay green untouched.
- Convention: helpers live as siblings in `modules/packs/` (`feed-events.ts`, `notify-feed.ts`); logger via `ContainerRegistrationKeys.LOGGER`.

## Commands you will need

| Purpose                               | Command                                                                                                                     | Expected |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Backend deps (fresh worktree)         | `cd backend && corepack yarn install --immutable`                                                                           | exit 0   |
| Workspace dep build (fresh worktree)  | `cd backend/packages/odds-math && corepack yarn build`                                                                      | exit 0   |
| Typecheck                             | `cd backend/packages/api && corepack yarn check-types`                                                                      | exit 0   |
| Unit tier                             | `corepack yarn test:unit`                                                                                                   | all pass |
| Targeted                              | `corepack yarn test:unit -- notify-feed`                                                                                    | all pass |
| HTTP specs for touched routes (DB up) | `corepack yarn test:integration:http -- "store-notifications\|topup\|daily\|rewards"` (adjust filter to actual suite names) | all pass |

## Scope

**In scope**:

- `backend/packages/api/src/modules/packs/notify-feed.ts` (add `notifyFeedNonfatal` beside `notifyFeed`)
- The producer sites 1-6 and 8 above (mechanical call-site swap)
- `backend/packages/api/src/subscribers/__tests__/notify-feed-nonfatal.unit.spec.ts` (retarget/extend)

**Out of scope**:

- `notifyFeed` core behavior, `FeedTemplate` union, idempotency-key formats, `feed-events.ts` predicates (`shouldNotifyTopup` stays wrapped AROUND the call, not inside the wrapper).
- `seed-notification-probe.ts`.
- Any change to WHEN notifications fire.

## Git workflow

- Branch: `advisor/052-notify-feed-wrapper`
- Commit: `refactor(notifications): notifyFeedNonfatal wrapper replaces per-site try/catch`
- Do NOT push/PR unless instructed.
- NOTE (this machine): global formatter hook may churn backend quote style — check `git diff`, re-apply via node script if needed.

## Steps

### Step 1: Add the wrapper

In `notify-feed.ts`:

```ts
/** Fire a feed notification AFTER the money/state write has committed.
 * Never throws: failure is logged (best-effort) and swallowed — a committed
 * top-up/grant/flip must never fail over a notification. `context` names the
 * producer for the log line, e.g. 'vip-spend-settled'. */
export async function notifyFeedNonfatal(
  container: { resolve: (k: string) => any },
  context: string,
  args: Parameters<typeof notifyFeed>[1],
): Promise<void> {
  try {
    await notifyFeed(container, args);
  } catch (err) {
    try {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[${context}] notifyFeed('${args.template}') failed for receiver ${args.receiverId} — state committed, notification dropped: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
    } catch {
      // logger not available (unit-test container) — stay silent, never throw.
    }
  }
}
```

Import `ContainerRegistrationKeys` from `@medusajs/framework/utils` (match the file's existing import style).

**Verify**: `corepack yarn check-types` → 0.

### Step 2: Swap the call sites

For each site 1-6 (and 8 if it matches): replace the try/catch block with `await notifyFeedNonfatal(container, '<context>', { ... })`, where `<context>` preserves the site's existing log prefix (e.g. `'vip-spend-settled'`, `'mature-commissions'`, `'topup'`, `'daily-draw'`, `'rewards-claim'`). Keep surrounding conditionals (`if (gained.length === 0) return;`, `if (shouldNotifyTopup(result))`) exactly where they are. The topup and any other silent sites GAIN logging — that's intended (PR #222 direction).

**Verify**: `grep -rn "await notifyFeed(" backend/packages/api/src --include=*.ts | grep -v notify-feed.ts | grep -v __tests__ | grep -v scripts` → 0 matches (all direct calls outside the module/script are gone). `corepack yarn check-types` → 0.

### Step 3: Tests

Retarget `notify-feed-nonfatal.unit.spec.ts` to the wrapper: (a) notify throws → wrapper resolves (no throw) and logger.warn called with the context string; (b) notify throws AND logger.resolve throws → wrapper still resolves; (c) happy path → no warn. Keep every existing end-to-end case in that spec green (they prove call-site behavior didn't change).

**Verify**: `corepack yarn test:unit -- notify-feed` → green; full `corepack yarn test:unit` → green; HTTP suites for topup/draw/claim (DB up) → green.

## Test plan

As Step 3. Pattern: the existing spec file's own container-stub style. No new spec file — extend the existing one (it already owns this contract).

## Done criteria

- [ ] `notifyFeedNonfatal` exists with the never-throws contract documented
- [ ] Step-2 grep → 0 direct `notifyFeed(` calls outside module/tests/scripts
- [ ] Unit tier + touched HTTP suites green
- [ ] Topup path now logs on failure (assert in spec or show the call site)
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- A producer site's catch does MORE than log (e.g. metrics, retry) — that site keeps its custom block; report it instead of forcing the wrapper.
- Sites 6/8 don't match the pattern on read — handle only matching sites, list the rest.
- Any HTTP suite fails after the swap (behavior changed — the wrapper must be observably identical apart from added logging).

## Maintenance notes

- New producers (settlement engine's `challenge_stage`, cashout notifications) should call `notifyFeedNonfatal` — never hand-roll the try/catch again.
- Reviewer: confirm every swapped site still fires AFTER its transaction commits (the swap must not move calls).
