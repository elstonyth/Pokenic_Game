# Plan 047: Stop the admin challenge/VIP tabs from discarding unsaved edits on tab switch; retire the dead payout patch surface

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/apps/admin/src/routes/challenge/page.tsx backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx backend/packages/api/src/modules/packs/challenge-validate.ts backend/packages/api/src/modules/packs/service.ts backend/apps/admin/src/lib/admin-rest.ts backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts backend/packages/api/integration-tests/http/challenge.spec.ts`
> On any change, compare the excerpts below; mismatch = STOP. (service.ts WILL
> have drifted if plans 044/054 ran — re-locate by symbol name; STOP only on
> changed code, not shifted lines.)

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: 044 (both touch `challenge-validate.ts` — run 044 first, then rebase)
- **Category**: bug
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

Two operator hazards on the Weekly Challenge admin page (`/challenge` in the admin SPA, shipped in PR #208):

1. **Tab switch silently discards unsaved edits.** `StagesTab` and `PayoutTab` render inside `@medusajs/ui` `<Tabs.Content>` (Radix Tabs), which **unmounts** inactive content by default (no `forceMount`). Each tab holds its edit buffer in component state seeded once per mount. Edit stages → click "Week & Reset" → click back: the buffer state is destroyed and reseeded from server data; the edits are gone with no warning. Same shape in the VIP ladder tab.
2. **A retired payout surface still accepts writes.** The product decision (recorded in `store/challenge/route.ts` and on the page itself) is: "stages ARE the prize pool — the old flat top-10 payout is retired." The UI no longer shows payout inputs, but `validateChallengeSettingsPatch` still accepts `payout_credits`/`payout_card_ids`, `service.ts` still validates+persists+echoes them, and the admin DTO still declares them. A raw API client can write money-shaped config nothing reads — decision-drift that will confuse the future settlement-engine builder.

## Current state

- `backend/apps/admin/src/routes/challenge/page.tsx`:
  - `:107-125` `StagesTab` — buffer: `const [seededFrom, setSeededFrom] = useState<...>(); const [rows, setRows] = useState<StageRow[]>([]);` with the seed-once guard:
    ```ts
    // Seed once per mount only — `data` gets a new object identity on every
    // React Query refetch (e.g. refetchOnWindowFocus), so comparing
    // `data !== seededFrom` re-seeds — and silently wipes unsaved edits — on
    // every background refetch.
    if (data && seededFrom === undefined) { setSeededFrom(data); ... }
    ```
  - `:265-280` `PayoutTab` (section comment "── Week & Payout tab ──", trigger label already renamed "Week & Reset") — same seed-once shape; form fields are timezone / reset_day / reset_hour / reason only (no payout inputs in the UI).
  - `:364-384` page root: `const [tab, setTab] = useState<'stages' | 'payout'>('stages');` and
    ```tsx
    <Tabs.Content value="stages"><StagesTab /></Tabs.Content>
    <Tabs.Content value="payout"><PayoutTab /></Tabs.Content>
    ```
    No `forceMount` anywhere in the file.
- `backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx:70-75` — same seed-once buffer pattern; check whether its parent page mounts it in unmounting Tabs the same way (`daily-rewards/page.tsx`) and apply the same fix if so.
- Dead payout surface:
  - `backend/packages/api/src/modules/packs/challenge-validate.ts:116-124` — the settings patch accepts `payout_credits` (`>= 0` check) and `payout_card_ids` (via `validateCardIds`).
  - `backend/packages/api/src/modules/packs/service.ts` — FIVE payout sites, all in scope: `:4948-4949` `challengeSettings()` echoes `payout_credits`/`payout_card_ids`; and in `editChallengeSettings`: `:4964-4977` existence-check of `payout_card_ids` against cards, `:4990-4991` the `before` audit view, `:4998-4999` the `after` audit view, `:5004-5010` the `data` write cast. All are typed against `ChallengeSettingsView`/`ChallengeSettingsPatch` (`challenge-validate.ts:15-16, 24-25`) — the interface fields MUST be stripped too or these sites won't compile/will half-persist (see Step 4).
  - `backend/packages/api/integration-tests/http/challenge.spec.ts` — the http-tier spec that LOCKS the current payout behavior: `:74-81` asserts the GET echo includes `payout_credits: 0, payout_card_ids: []`, and `:220-248` PATCHes payout values and asserts they round-trip. This spec MUST be updated in the same change (Step 4) or the `integration:http` CI tier goes red — none of this plan's local gates run that tier, so missing it fails only in CI.
  - `backend/apps/admin/src/lib/admin-rest.ts:739-740` — DTO declares `payout_credits: number;` / `payout_card_ids: string[];`.
  - The decision record — `backend/packages/api/src/api/store/challenge/route.ts:11-15`: "There is NO separate flat payout — stages ARE the prize pool (the old settings payout fields are retired and not exposed here)."
  - The DB columns (`challenge-settings.ts:12-13`, `payout_credits` default 0 + `payout_card_ids` json) STAY — dropping columns is the settlement designer's call (plan 056).
- Admin test exemplar: vitest colocated under `backend/apps/admin/src` — `backend/apps/admin/src/lib/seed-buffer.test.ts` is the closest existing test; run via `corepack yarn vitest run` in `backend/apps/admin` (or turbo `test`). The admin suite has NO Testing Library render harness (only `main.tsx` calls `render`), so Step 3's static-source-check branch is the expected path.

## Commands you will need

| Purpose                       | Command                                                                       | Expected                                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend deps (fresh worktree) | `cd backend && corepack yarn install --immutable`                             | exit 0                                                                                                                                                           |
| Admin typecheck+build         | `cd backend/apps/admin && corepack yarn build`                                | exit 0 (if a global TS7 shadows the repo tsc and errors appear, invoke `node_modules/.bin/tsc` semantics via the repo's pinned typescript — known machine quirk) |
| Admin tests                   | `cd backend/apps/admin && corepack yarn vitest run`                           | all pass                                                                                                                                                         |
| API typecheck                 | `cd backend/packages/api && corepack yarn check-types`                        | exit 0                                                                                                                                                           |
| API unit tier                 | `cd backend/packages/api && corepack yarn test:unit -- challenge-validate`    | all pass                                                                                                                                                         |
| Challenge HTTP suite (DB up)  | `cd backend/packages/api && corepack yarn test:integration:http -- challenge` | all pass — REQUIRED for Step 4 sub-step 5                                                                                                                        |

## Scope

**In scope**:

- `backend/apps/admin/src/routes/challenge/page.tsx`
- `backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx` + its parent `daily-rewards/page.tsx` (ONLY if it has the same unmounting-Tabs shape)
- `backend/packages/api/src/modules/packs/challenge-validate.ts` (remove payout fields from the patch)
- `backend/packages/api/src/modules/packs/service.ts` (ONLY the five payout sites listed in Current state — nothing else in this 5k-line file)
- `backend/apps/admin/src/lib/admin-rest.ts` (drop the two DTO fields)
- `backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts`
- `backend/packages/api/integration-tests/http/challenge.spec.ts` (update the payout-echo and payout-PATCH assertions — see Step 4)

**Out of scope**:

- DB columns / migrations — leave `payout_credits`/`payout_card_ids` in the model; plan 056's settlement design decides their fate.
- `store/challenge/route.ts` — already correct (never exposed payout).
- Plan 044's new caps in `challenge-validate.ts` — rebase over them, don't rewrite.
- Any Tabs behavior change elsewhere in the admin SPA.

## Git workflow

- Branch: `advisor/047-challenge-tab-buffers`
- Commits: `fix(admin): preserve challenge/VIP tab edits across tab switches` and `chore(challenge): retire the dead payout patch surface`
- Do NOT push/PR unless instructed.
- NOTE (this machine): global formatter hook may churn backend quote style — check `git diff`, re-apply via node script if needed.

## Steps

### Step 1: Preserve tab edits

Smallest fix honoring the existing seed-once design: add `forceMount` + hide inactive content on both `Tabs.Content` entries so the components never unmount (buffers survive):

```tsx
<Tabs.Content value="stages" forceMount className={tab === 'stages' ? undefined : 'hidden'}>
  <StagesTab />
</Tabs.Content>
<Tabs.Content value="payout" forceMount className={tab === 'payout' ? undefined : 'hidden'}>
  <PayoutTab />
</Tabs.Content>
```

Check `@medusajs/ui`'s `Tabs.Content` passes `forceMount` through to Radix (it re-exports Radix props). If it does not, fall back to lifting the two buffers into `ChallengePage` and passing them down as props (bigger diff — only if forceMount is genuinely unavailable). Add a one-line comment stating why (`// forceMount: tab buffers are seeded once per mount; unmounting would wipe unsaved edits`).

Both tabs render data-independent skeletons while `!data` — confirm no layout/visual regression from mounting both at once (they're gated `hidden`).

**Verify**: `cd backend/apps/admin && corepack yarn build` → exit 0. Manual check (if a live admin is available): edit a stage threshold, switch to "Week & Reset", switch back → the edit survives. If no live admin, state so in the report; the vitest in Step 3 is the automated proof.

### Step 2: Same fix for the VIP ladder tab

Open `backend/apps/admin/src/routes/daily-rewards/page.tsx`; if `vip-levels-tab` (and siblings holding buffers) mount inside unmounting `Tabs.Content`, apply the same `forceMount`+hidden treatment. If that page uses a different container (not Radix Tabs), record "not applicable" and skip.

**Verify**: `corepack yarn build` → exit 0.

### Step 3: Unit-test the preserved buffer

Add a vitest for the page-level behavior IF the admin suite already has a component-render harness (check for existing `*.test.tsx` using Testing Library). If the suite is logic-only (no DOM harness), extract the tiny tab-visibility decision into a pure helper is overkill — instead assert the `forceMount` props exist via a static source check in the test (read the file, expect `/forceMount/` twice). Pragmatic, but it locks the fix against a refactor that silently drops it.

**Verify**: `corepack yarn vitest run` → all pass, including the new test.

### Step 4: Retire the payout patch surface

Ordered sub-steps (the interface strip is what makes the rest compile):

1. `challenge-validate.ts`: remove `payout_credits?`/`payout_card_ids?` from the `ChallengeSettingsPatch` interface (`:15-16`) AND from the `ChallengeSettingsView` interface (`:24-25`); delete the two accept blocks in `validateChallengeSettingsPatch` (`:116-124`). The validator ignores unknown fields, so removing the accept blocks suffices — a payout-only patch then hits the existing "No valid settings to update." error. Add a comment: "payout fields retired — stages are the prize pool, see store/challenge/route.ts".
2. `service.ts`: fix ALL FIVE sites now type-broken by (1): drop the echo (`:4948-4949`), the existence-check block (`:4964-4977`), the `before` view fields (`:4990-4991`), the `after` view fields (`:4998-4999`), and the payout members of the `data` write cast (`:5004-5010`). After this, `editChallengeSettings` neither validates, persists, nor reports payout fields; the DB columns simply go cold.
3. `admin-rest.ts`: remove the two DTO fields (`:739-740`). Then `grep -rn "payout_credits\|payout_card_ids" backend/apps/admin/src` → must be 0.
4. `challenge-validate.unit.spec.ts`: update/replace cases that patch payout fields — a payout-only patch must now fail "No valid settings to update.".
5. `integration-tests/http/challenge.spec.ts`: update `:74-81` (drop `payout_credits`/`payout_card_ids` from the GET-echo `toEqual`) and `:220-248` (the payout-PATCH round-trip case — replace with an assertion that a payout-only PATCH is rejected with the empty-patch error, preserving the spec's auth/setup plumbing).

**Verify**: `corepack yarn check-types` (api) → 0; `corepack yarn test:unit -- challenge-validate` → green; with DB up: `corepack yarn test:integration:http -- challenge` → green (this is the tier that catches sub-step 5 — do not skip it); `grep -rn "payout_credits\|payout_card_ids" backend/apps/admin/src backend/packages/api/src --include=*.ts --include=*.tsx | grep -v models/challenge-settings | grep -v migrations | grep -v __tests__` → 0 matches (columns + historical migrations are the only survivors).

### Step 5: Rename the stale section comment

`page.tsx` "── Week & Payout tab ──" → "── Week & Reset tab ──"; rename the `PayoutTab` component/`'payout'` tab value ONLY if the diff stays mechanical (component + two usages + `useState` union); otherwise leave the internal name and just fix the comment.

**Verify**: `corepack yarn build` (admin) → exit 0.

## Test plan

- Admin: the Step 3 test (buffer survival lock).
- API: updated `challenge-validate.unit.spec.ts` — payout-only patch rejected; a legitimate reset_day/reset_hour/timezone patch still accepted (regression).
- Full gates: admin `vitest run`, api `test:unit`, both builds.

## Done criteria

- [ ] Admin build + vitest green; api check-types + unit tier green
- [ ] `grep -c "forceMount" backend/apps/admin/src/routes/challenge/page.tsx` ≥ 2 (or the lifted-state fallback is in place and described in the report)
- [ ] Payout grep (Step 4) returns 0 outside models/migrations/tests
- [ ] Manual or test proof that tab-switch preserves edits, stated in the report
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- `@medusajs/ui` `Tabs.Content` rejects `forceMount` AND lifting the buffers requires restructuring beyond the page file — report the real shape.
- `service.ts` line regions don't match (drift — 044 or other work may have shifted lines; re-locate by symbol name, and STOP only if the code itself changed).
- Anything else in the api reads `payout_credits`/`payout_card_ids` besides the sites listed (grep first; a hidden reader means the "retired" premise is wrong — report).
- Admin build fails with TS5102/baseUrl-style errors — that's the known global-TS7-shadowing machine quirk, not your change; verify with the repo-pinned tsc and report.

## Maintenance notes

- Plan 056 (settlement design spike) owns the fate of the `payout_credits`/`payout_card_ids` DB columns — this plan only stops NEW writes reaching them.
- If the admin SPA ever adopts a router-level dirty-guard pattern, the forceMount workaround can be replaced by it.
- Reviewer: confirm the hidden-tab content doesn't fire its queries eagerly in a way that changes load behavior (React Query mounts both tabs' queries now — acceptable, both are cheap admin reads; flag if a heavy query appears here later).
