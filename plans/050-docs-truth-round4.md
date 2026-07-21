# Plan 050: Docs truth round 4 — reconcile infra names, fix the runbook's stale blocker, retire the template CHANGELOG, date the redesign doc

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- docs/ops .do CHANGELOG.md slot-machine-redesign.md`
> On any change, compare the excerpts below; mismatch = STOP.
>
> **Operator input required for Step 1** — this plan cannot finish Step 1 without the live DigitalOcean resource names (see the STOP condition there). Steps 2–4 are independent and can complete regardless.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (doc edits; Step 1's underlying deploy mismatch, if real, is higher and is escalated, not fixed here)
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

Four places where committed docs contradict code or each other. Three are cheap truth fixes; one (infra names) is a real operational hazard: the committed deploy spec and the two ops runbooks disagree about whether the DigitalOcean database clusters and Spaces bucket are named `pokenic-*` or `polycards-*`. An operator following the go-live runbook during an incident would hunt for resources under the wrong name — or a `do-apply` could bind a wrong/missing cluster. Stale ops docs are worse than missing ones: they erode trust in the runbook's REAL blockers (like the settlement engine).

## Current state

1. **Infra-name three-way disagreement**:
   - `.do/backend.app.yaml:130,139,263-272` — declares `S3_BUCKET=polycards-media`, `S3_FILE_URL=https://polycards-media…`, `cluster_name: polycards-pg` / `polycards-valkey`.
   - `docs/ops/infra-rename-migration-runbook.md:3` — "Status: planned, NOT executed." with "Current facts (2026-07-15)" saying live infra is `pokenic-pg`/`pokenic-valkey`/`pokenic-media`.
   - `docs/ops/production-reset-and-golive-runbook.md:82,84` (written 2026-07-19) — still says Spaces bucket `pokenic-media`.
   - `.do/README.md:11-13` — only the App Platform APPS were destroyed+recreated 2026-07-16 for polycards hostnames; the cluster/bucket rename is a separate migration.
   - Git signal: commits `39e8204f` ("point media host + IaC at polycards-media / polycards-pg / polycards-valkey") and `e1030dab` ("recreate both DO apps") say the IaC moved; whether the RESOURCES moved is unknowable from the repo.
2. **Runbook lists a fixed item as BLOCKING** — `docs/ops/production-reset-and-golive-runbook.md` §1.3 (~line 71-75):
   ```
   - **Vendor self-registration is open** — `seller_registration:false` is UI-only; an anonymous
     `POST /vendor/sellers` creates a real seller… Close before a public launch.
   ```
   Reality: closed since round-5 plan 034 / commit `a44a5651` — `backend/packages/api/src/api/middlewares.ts:136` defines `blockUnusedVendorSelfRegistration`, registered at `:193` on `POST /vendor/sellers` (and member self-register); `medusa-config.ts` sets `seller_registration: false`.
3. **CHANGELOG.md documents a different product** — newest real entries are `[0.3.1] 2026-03-29` / `[0.3.0] 2026-03-29` about `/clone-website` and `sync-agent-rules.sh` (the ai-website-cloner template this repo started from); none of the actual platform exists in it. Repo is `private: true` — no external consumer.
4. **`slot-machine-redesign.md` (repo root) header**:
   ```
   **Status:** PLANNING — nothing is being built yet.
   **Last updated:** 2026-07-04
   ```
   The redesign it plans substantially shipped (#147 press-spin, #150 spin room, #176 holo card back, #182 reveal audio; `PokeCardBack.tsx` deleted in #219).

## Commands you will need

| Purpose                                          | Command                                 | Expected                              |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------- |
| Live DB cluster names (OPERATOR or doctl access) | `doctl databases list --format Name`    | shows either pokenic-_ or polycards-_ |
| Live Spaces bucket                               | `doctl spaces list` (or the DO console) | shows the bucket name                 |
| Grep gates                                       | see Done criteria                       | —                                     |

No build/test gates — docs only. `npx prettier --check <changed .md files>` keeps formatting consistent with the repo's Prettier config.

## Scope

**In scope**:

- `docs/ops/production-reset-and-golive-runbook.md`
- `docs/ops/infra-rename-migration-runbook.md`
- `.do/backend.app.yaml` — ONLY if Step 1 determines the IaC is the wrong side (see below); otherwise untouched
- `CHANGELOG.md`
- `slot-machine-redesign.md`

**Out of scope**:

- Any code file. Any other `.do/` spec content (env vars, scaling).
- `docs/superpowers/**` (historical records).
- Executing the infra rename itself — this plan reconciles DOCUMENTATION; a real migration is the runbook's own job, operator-driven.

## Git workflow

- Branch: `advisor/050-docs-truth-4`
- Commit: `docs(ops): reconcile infra names + retire stale blocker/changelog/redesign-status`
- Do NOT push/PR unless instructed.

## Steps

### Step 1: Resolve the infra-name disagreement (operator input)

Ask the operator (or run, if doctl access exists): `doctl databases list --format Name` and the Spaces bucket name.

- **If live = polycards-\***: the rename ran. Edit `infra-rename-migration-runbook.md:3` status to "EXECUTED <date> — kept as historical record", and update `production-reset-and-golive-runbook.md` lines ~82-84 to `polycards-media`. `.do/backend.app.yaml` untouched.
- **If live = pokenic-\***: the IaC is ahead of reality. DO NOT edit the yaml silently — add a loud comment block at the top of the `databases:` section and next to `S3_BUCKET` in `.do/backend.app.yaml`: `# WARNING: live resources are still pokenic-* (rename not executed — see docs/ops/infra-rename-migration-runbook.md). Do not do-apply this spec until the rename runs or these names are reverted.` and report to the operator that the spec/live mismatch needs a decision (revert names vs run the migration). Update the go-live runbook to state the mismatch explicitly.
- **If unanswerable** (no doctl, no operator response): STOP for Step 1, complete Steps 2-4, and mark the plan DONE-partial with Step 1 as an explicit operator follow-up in the README row.

**Verify**: `grep -rn "pokenic-" docs/ops .do` → every remaining hit is either historical-record context or the deliberate WARNING block; no hit presents a stale name as current fact.

### Step 2: Fix the runbook's vendor bullet

Replace §1.3's vendor bullet with reality:

```
- **Vendor self-registration: CLOSED** (round-5 hardening, commit a44a5651) —
  `blockUnusedVendorSelfRegistration` in `backend/packages/api/src/api/middlewares.ts`
  hard-404s anonymous `POST /vendor/sellers` and member self-register. Pre-launch check:
  verify the middleware entry is still mounted (grep the symbol), don't re-audit.
```

**Verify**: `grep -n "self-registration" docs/ops/production-reset-and-golive-runbook.md` → shows CLOSED phrasing; no "creates a real seller… Close before" text remains.

### Step 3: Retire the template CHANGELOG

Replace `CHANGELOG.md` body: keep the Keep-a-Changelog header, delete the 0.x ai-website-cloner history, and start honest:

```markdown
## [Unreleased]

This file was reset on 2026-07-20 — entries before this date described the
repository's original template (ai-website-cloner) and were removed. For the
platform's history, see `git log` and `plans/README.md` (audit rounds 1–6).
```

Carry forward the Node-24 bump line under Unreleased/Changed (it's real).

**Verify**: `grep -n "clone-website\|sync-agent-rules" CHANGELOG.md` → 0 matches.

### Step 4: Date the redesign doc honestly

In `slot-machine-redesign.md`, replace the two header lines:

```
**Status:** SHIPPED (in stages, #147/#150/#176/#182 among others) — kept as the design record; no longer a live plan.
**Last updated:** 2026-07-20
```

Leave the body intact (it is the historical rationale). If round-3's "decision #10 rarity-colors residue" note matters to the owner it stays in the body untouched — body edits are out of scope.

**Verify**: `head -4 slot-machine-redesign.md` → shows the new status; `grep -c "nothing is being built yet" slot-machine-redesign.md` → 0.

## Test plan

Docs-only: the Verify greps are the tests. `npx prettier --check` on the touched markdown is ADVISORY only — these files sit outside the repo's prettier scope (`format:check` covers `src scripts` only), so pre-existing formatting may fail the check through no fault of your edit. If it fails on lines you didn't touch, note it and move on; do NOT run `--write` across whole files (that reformats tables you never meant to touch — out-of-scope churn).

## Done criteria

- [ ] Step 1 resolved with live names recorded in the report (or DONE-partial + operator follow-up row)
- [ ] `grep -n "Close before" docs/ops/production-reset-and-golive-runbook.md` → 0
- [ ] `grep -n "clone-website" CHANGELOG.md` → 0
- [ ] `grep -c "nothing is being built yet" slot-machine-redesign.md` → 0
- [ ] `npx prettier --check` run on touched files, result recorded (advisory — pre-existing failures on untouched lines are acceptable, see Test plan)
- [ ] No files outside scope modified (`git status`)
- [ ] `plans/README.md` updated

## STOP conditions

- Live infra names unobtainable → Step 1 becomes the operator follow-up (see Step 1 third branch); do not guess a side.
- The runbook's §1.3 has been rewritten since planning (drift).
- You are tempted to "just fix" `.do/backend.app.yaml` cluster names without operator confirmation — that changes what deploys bind to; never do it from a docs plan.

## Maintenance notes

- The FROZEN-infra items (ondigitalocean hostnames, `admin@pokenic.app`, and any resource the rename runbook lists as deliberately kept) must never be blanket-renamed by a future sweep — the rename runbook is the authority on what moves.
- Reviewer: check Step 1's branch logic was followed literally — the wrong branch here writes a confident lie into the ops docs.
- Deferred: `/bank-withdrawal` page copy overlaps the new wallet-gate explainer (both honest; consolidation is a product call, recorded in round-6 notes, not planned).
