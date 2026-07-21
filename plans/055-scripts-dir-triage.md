# Plan 055: Triage the 269-file scripts/ junk drawer — inventory, classify, propose the delete list (operator approves before anything dies)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- scripts/`
> Drift here is likely and harmless (new one-offs appear constantly); re-run the inventory fresh regardless.

## Status

- **Priority**: P3
- **Effort**: S–M (phase 1 inventory is S; the delete commit is S after approval)
- **Risk**: LOW (nothing in scripts/ ships; two-phase gate prevents deleting a wanted tool)
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

`scripts/` holds 269 tracked files, overwhelmingly one-off Playwright capture/measure/debug scripts accreted across the UI-measurement workflow (`hover-*` ×8, `shot*`/`shotfoot*` ×15, `final-*`, `lama_*` ×5, `avif_*` probes). ~130 reference deleted entities (`claw`, `clawmaker`, `repacks`, `pack-party`, `pixelslot`, `pokenic`) — re-running one silently fails or navigates a dead route. None of it is imported by the app or CI, so the cost is navigation noise and a correctness trap, not runtime risk — which is also why deletion is safe once the keep-set is agreed. The keep/delete split needs the operator's eye (MED confidence on individual files); this plan produces the classified inventory and executes only the approved deletions.

## Current state

- `scripts/` — 269 files at plan time (`ls scripts | wc -l`). Known-live citizens that MUST survive:
  - `scripts/serve-standalone.ps1` — referenced by README's Quick Start (verification workflow).
  - Anything referenced from `package.json` scripts, `.github/workflows/*`, `docs/**`, or `tests/**` (the inventory discovers the exact set).
  - The reusable measurement family the README's "Measurement-driven UI" section describes (capture/measure scripts that dump to `docs/research/`) — the ACTIVE ones, i.e. those touching live routes/components.
- Deleted-entity signal: route deletions happened in rounds 3-6 (`/claw`, `/clawmaker` plan 024; `/marketplace`/`/merchants`/`/pack-party`/`/repacks`/`/series`/`/pokemon/generation` in #219). Any script driving those is dead by construction.
- Repo conventions: `scripts/*.mjs` are plain node/Playwright one-offs; PowerShell utilities are operational; nothing in `scripts/` is built or bundled.

## Commands you will need

| Purpose                       | Command (repo root, POSIX shell)                                                                                               | Expected                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Count                         | `ls scripts \| wc -l`                                                                                                          | current total                                                                                                                                                                                           |
| Reference scan                | `grep -rn "scripts/" package.json .github docs tests README.md \| grep -v node_modules`                                        | the externally-referenced set. ROOT package.json is the right one (backend scripts out of scope). Known at plan time: `qa:csp` → `scripts/qa-csp.mjs`, `test:a11y` → `scripts/qa-a11y.mjs` — hard KEEPs |
| Dead-entity scan              | `grep -lE "claw\|clawmaker\|repacks\|pack-party\|pixelslot\|pokenic\|/series\|/merchants\|/marketplace" scripts/* 2>/dev/null` | candidate dead list                                                                                                                                                                                     |
| Dead-route scan               | for each script's target URL: `grep -l "localhost:3000/<deleted-route>" scripts/*`                                             | corroboration                                                                                                                                                                                           |
| Storefront gate (post-delete) | `npm run check`                                                                                                                | exit 0 — SECONDARY signal only: `check` = lint+typecheck+build and does NOT run `qa:csp`/`test:a11y`, so it cannot catch a deleted-but-referenced script; the reference-scan re-run is the primary gate |

## Scope

**In scope**:

- `scripts/**` (classification; then ONLY approved deletions + approved moves)
- One NEW file: `scripts/README.md` (the inventory outcome — what each surviving family does)

**Out of scope**:

- `backend/packages/api/src/scripts/` — operational medusa-exec scripts (seeds, backfills, resets); different lifecycle, NOT part of this triage.
- Editing any surviving script's content (fixing a broken-but-wanted script is its own task).
- `docs/research/` (gitignored output dir).

## Git workflow

- Branch: `advisor/055-scripts-triage`
- Two commits: `chore(scripts): inventory + classification README` then (post-approval) `chore(scripts): delete approved dead one-offs`
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Build the classified inventory

Produce a table (this becomes `scripts/README.md` + your report) with one row per file (group obvious families like `hover-*` into one row with a count): **name(s) | family (capture / measure / qa / seed / ops / one-off-debug) | targets (route/component) | references-deleted-entity? | referenced-externally? | verdict (KEEP / DELETE / ASK)**.

Verdict rules:

- KEEP: externally referenced (package.json/CI/docs/tests/README), or targets a live route AND belongs to the measurement workflow, or is an ops utility (`serve-standalone.ps1`-class).
- DELETE: targets a deleted route/entity, or is a superseded iteration in a numbered family (`hover-cdp2`, `shotfoot2`, `final-*` variants) whose newest sibling is kept, or brand-era rebrand one-offs (`rebrand-claw-*`).
- ASK: anything ambiguous — when in doubt, ASK, never DELETE.

**Verify**: every one of the 269 files appears in exactly one row; the KEEP set includes `serve-standalone.ps1` and every externally-referenced file (cross-check against the reference scan output).

### Step 2: Present the split to the operator and WAIT

Report: counts per verdict, the full DELETE list, the ASK list with one-line questions. Do not proceed to Step 3 without an explicit approval (this is a hard gate, not a formality).

**Verify**: operator approval recorded (quote it in the report).

### Step 3: Execute the approved deletions + write scripts/README.md

`git rm` the approved DELETE set. Optionally (only if the operator approved the reorganization too) move survivors into `scripts/qa/`, `scripts/capture/`, `scripts/ops/` — a pure `git mv`, updating the README/docs references you found in Step 1. Write `scripts/README.md` describing the surviving families and the rule ("one-off debug scripts get deleted after use; reusable capture/measure tools live here").

**Verify**: PRIMARY gate — re-run the Step-1 reference scan and `ls` every externally-referenced path (this is what catches a deleted-but-referenced script; note `npm run check` does NOT run `qa:csp`/`test:a11y`, so a green `check` proves nothing about them). SECONDARY — `npm run check` → exit 0. `git status` clean apart from the intended deletions/moves.

## Test plan

No tests — non-shipping files. The gates: `npm run check` green post-delete; reference-scan paths all resolve.

## Done criteria

- [ ] `scripts/README.md` exists with the classification
- [ ] Operator approval for the DELETE list is quoted in the report
- [ ] Approved deletions executed; `ls scripts | wc -l` reflects it
- [ ] `npm run check` exits 0; all externally-referenced paths resolve
- [ ] `backend/packages/api/src/scripts/` untouched (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- Any DELETE candidate turns out to be referenced from package.json/CI/docs/tests — reclassify KEEP and note the miss.
- The operator doesn't respond — stop at the end of Step 2 with the inventory as the deliverable (mark DONE-partial: inventory complete, deletion pending approval).
- You're tempted to fix/modernize a script "while in there" — that's out of scope by definition.

## Maintenance notes

- The real fix is behavioral: one-off capture scripts should be born in the gitignored scratchpad, not `scripts/` — the new README states the rule.
- Reviewer: spot-check 5 random DELETE files for a live reference the scans missed (e.g. referenced from a gitignored local doc — acceptable loss, but know it).
