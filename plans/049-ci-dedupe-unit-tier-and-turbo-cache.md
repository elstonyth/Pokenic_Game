# Plan 049: CI hygiene — stop re-running the 43 unit specs in the modules tier; give integration-http the turbo cache

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/jest.config.js .github/workflows/ci.yml`
> On any change, compare the excerpts below; mismatch = STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

Two pure-waste items in backend CI (the workflow's critical path — see PR #210's timing work):

1. The `integration:modules` tier's testMatch (`**/src/modules/*/__tests__/**/*.[jt]s`) also matches the 43 `*.unit.spec.ts` files under `src/modules/*/__tests__/`, which the no-DB `unit` tier already runs. Those 43 fast specs execute a second time inside the slower, `--runInBand`, DB-backed `integration-modules` job — zero added coverage, longer job, and every unit-spec edit pays twice.
2. The `integration-http` job (8 parallel shards, the long pole) is the only backend job WITHOUT the `Cache turbo` step — its `yarn build --filter="@acme/api^..."` workspace-dep build runs cold on all 8 shards every run, while `backend-quality` (ci.yml:129), `backend-unit` (:205) and `integration-modules` (:455) all restore `backend/.turbo`.

## Current state

- `backend/packages/api/jest.config.js:28-36` — tier routing:
  ```js
  if (process.env.TEST_TYPE === 'integration:http') {
    module.exports.testMatch = ['**/integration-tests/http/*.spec.[jt]s'];
  } else if (process.env.TEST_TYPE === 'integration:modules') {
    module.exports.testMatch = ['**/src/modules/*/__tests__/**/*.[jt]s'];
  } else if (process.env.TEST_TYPE === 'unit') {
    module.exports.testMatch = ['**/src/**/__tests__/**/*.unit.spec.[jt]s'];
  }
  ```
  Overlap check at plan time: `ls backend/packages/api/src/modules/*/__tests__/*.unit.spec.ts | wc -l` → 43. (Nested `migrations/__tests__` unit specs are NOT matched by the modules glob — it's one path segment — so 43 is the whole overlap.)
- `.github/workflows/ci.yml` — the `Cache turbo` block used by three sibling jobs (copy verbatim; comment included):
  ```yaml
  # turbo writes its local cache to backend/.turbo; without restoring it every
  # lint/check-types/build task reruns cold. github.sha key + os restore-key
  # means each run seeds from the newest prior cache and saves its own.
  - name: Cache turbo
    uses: actions/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6
    with:
      path: backend/.turbo
      key: turbo-${{ runner.os }}-${{ github.sha }}
      restore-keys: |
        turbo-${{ runner.os }}-
  ```
- The `integration-http` job starts at `ci.yml:268` (matrix `shard: [1..8]`, postgres+redis services, tmpfs). Its step order: checkout → node setup → yarn cache → node_modules cache → `corepack yarn install --immutable` → **Build workspace deps** (`corepack yarn build --filter="@acme/api^..."`) → run shard. The turbo cache step must land BEFORE "Build workspace deps".
- Known trap (handled — do not "fix"): the shard divisor. `run-http-shards.mjs` forwards `--shard=N/8` straight to jest; the matrix has 8 entries. Both sides say 8. Leave them.

## Commands you will need

| Purpose                                          | Command                                                                                                                                             | Expected                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Backend deps (fresh worktree)                    | `cd backend && corepack yarn install --immutable`                                                                                                   | exit 0                                      |
| Workspace dep build                              | `cd backend/packages/odds-math && corepack yarn build`                                                                                              | exit 0                                      |
| Unit tier                                        | `cd backend/packages/api && corepack yarn test:unit`                                                                                                | all pass (634+ tests at plan time)          |
| Modules tier (needs pokenic-postgres + redis up) | `cd backend/packages/api && corepack yarn test:integration:modules`                                                                                 | all pass; suite count DROPS by 43 vs before |
| Count the overlap                                | `ls backend/packages/api/src/modules/*/__tests__/*.unit.spec.ts \| wc -l`                                                                           | 43 (at plan time)                           |
| YAML parse                                       | `node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"` (run from backend/, js-yaml is a transitive dep) | no error                                    |

## Scope

**In scope**:

- `backend/packages/api/jest.config.js`
- `.github/workflows/ci.yml` (one additive cache step in `integration-http` only)

**Out of scope**:

- `run-http-shards.mjs`, the shard matrix/divisor, tmpfs/services config.
- Any spec file. If a mis-suffixed spec surfaces (see STOP), report — don't rename (that was plan 027's amendment pattern; renames need review).
- Other workflows (`e2e.yml`, `dependency-review.yml`).

## Git workflow

- Branch: `advisor/049-ci-hygiene`
- Commit: `ci(backend): exclude unit specs from the modules tier; turbo cache for http shards`
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Exclude unit specs from the modules tier

In `jest.config.js`, scope the modules branch:

```js
} else if (process.env.TEST_TYPE === 'integration:modules') {
  module.exports.testMatch = ['**/src/modules/*/__tests__/**/*.[jt]s'];
  // The unit tier owns *.unit.spec.* — running them again here under the
  // DB-backed --runInBand runner adds minutes and no coverage.
  // '/node_modules/' listed explicitly: setting testPathIgnorePatterns
  // REPLACES jest's default, it does not merge.
  module.exports.testPathIgnorePatterns = [
    '/node_modules/',
    '\\.unit\\.spec\\.[jt]s$',
  ];
}
```

(Verified at plan time: the base config has NO explicit `testPathIgnorePatterns`, so jest's implicit `['/node_modules/']` default applies today — the explicit list above preserves it. If you find one has appeared in the config head since, merge its entries into the list instead.)

**Verify**: with DB up: `corepack yarn test:integration:modules 2>&1 | tail -5` → suite count = previous minus 43 (record before/after numbers); zero failures. Then `corepack yarn test:unit 2>&1 | tail -5` → unchanged count, green (proves the 43 still run somewhere).

### Step 2: Sanity-check the 43 don't need the modules runner

`grep -L "moduleIntegrationTestRunner\|medusaIntegrationTestRunner" backend/packages/api/src/modules/*/__tests__/*.unit.spec.ts` → should list ALL 43 (none uses an integration runner). If any file appears to need the runner, STOP (it's mis-suffixed — the plan-027 `reward-draw` precedent).

**Verify**: the grep lists 43 files (i.e., every unit spec is runner-free).

### Step 3: Add the turbo cache step to integration-http

Copy the exact `Cache turbo` block (shown in Current state) into the `integration-http` job, positioned after the node_modules cache step and before "Build workspace deps". Keep the SHA-pinned action version identical to the siblings.

**Verify**: YAML parse → no error; `grep -c "Cache turbo" .github/workflows/ci.yml` → 4.

## Test plan

No new tests — this plan is the test infrastructure. Proof obligations:

- Before/after suite counts for the modules tier (43 fewer suites, all green).
- Unit tier unchanged and green.
- CI-side proof lands on the first PR run: `integration-http` shards show a turbo cache restore line and a faster "Build workspace deps"; note in the report that this final check happens there.

## Done criteria

- [ ] `jest.config.js` modules branch excludes `*.unit.spec.*`; unit tier count unchanged
- [ ] Modules tier green with exactly 43 fewer suites (numbers recorded)
- [ ] Step-2 grep proves all excluded specs are runner-free
- [ ] `ci.yml` has 4 `Cache turbo` steps; YAML parses; action SHA identical to siblings
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- The modules-tier drop ≠ 43 (something else matched/unmatched — investigate and report the actual set before proceeding).
- Any excluded spec fails under the unit tier after the change (it was secretly DB-dependent — the plan-027 mis-suffix case; report, don't rename).
- The `integration-http` job's step order differs from the map above (drift).

## Maintenance notes

- New module tests: `*.unit.spec.ts` → unit tier (no DB); anything using `moduleIntegrationTestRunner` → plain `*.spec.ts` name in `__tests__/`. This plan's ignore pattern enforces the split — document-by-behavior.
- Reviewer: on the first PR, open one http-shard log and confirm the turbo restore hit; a `turbo-<os>-` restore-key miss on the very first run is expected (cache seeds then).
- Deferred (round-4 note, still open): the ~69s per-shard install floor is irreducible without a bigger runner or a container image — not this plan.
