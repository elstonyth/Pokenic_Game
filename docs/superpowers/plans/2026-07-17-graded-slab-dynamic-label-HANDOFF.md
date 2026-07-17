# HANDOFF: implement graded-slab-dynamic-label (fresh session)

**You are picking up a fully specced, fully planned feature. Do not re-design.**
Execute `docs/superpowers/plans/2026-07-16-graded-slab-dynamic-label.md` task-by-task with
`superpowers:subagent-driven-development` (or `superpowers:executing-plans`). Read the spec
first: `docs/superpowers/specs/2026-07-16-graded-slab-dynamic-label-design.md`.

## What the feature is

Bake the PSA label wording (grade, set line, card name, number, year, note) into the graded
slab image per card, replacing the static "GEM MINT 10" printed on the frame asset. Third
composite layer in `composeSlab()` (photo → frame → label SVG), bundled Arimo font, two new
Card columns (`label_year`, `label_note`), admin dropdowns + pokemontcg.io prefill, PSA-only
bake. Operator workflow contract is spec §14: label = CARD property baked at grading time;
the tier frame = runtime PACK property, never baked.

## Preconditions — verify BEFORE Task 1

1. **PR #196 (tier slab frame) must be MERGED to master.** `gh pr view 196 --json state`.
   Task 2b edits files that PR ships (`scripts/compose-frame-variant.mjs`,
   `scripts/measure-slab-margins.mjs`, `scripts/capture-slab-glass.mjs`,
   `public/images/slab-frames/*`, `SlabImage.tsx` frame constants). If it is not merged,
   stop and tell the operator.
2. **Local-only masters must exist** (docs/research is gitignored — they live only on this
   machine): `docs/research/slabframe-snapgen-v2.png` (Task 2's case-frame master) and
   `docs/research/frame-variant-19-darkglass-bright.png` +
   `docs/research/frame-ref-darkglass.png` (Task 2b's tier-frame master + style ref).
   Missing ⇒ STOP and ask the operator; regenerating costs SnapGen credits.
3. `SNAPGEN_API_KEY` in the root `.env` (`node .claude/skills/snapgen-generate/scripts/snapgen.mjs account`).

## Plan-staleness corrections (the plan predates 2026-07-17 work)

- **Task 1 is largely DONE**: `bake-slab.ts` SSRF fix, its 33 tests, the spec, and the plan
  are already committed to master. Task 1 collapses to: create the branch
  (`git checkout -b feat/graded-slab-dynamic-label origin/master` after #196 merges) and
  verify the unit tests still pass. The "uncommitted working-tree slot-sfx changes"
  constraint may also be stale — trust `git status`, not the plan's snapshot.
- **Task 2b was added 2026-07-17** (tier-frame geometry lockstep). It is NOT optional:
  Task 2 changes `SLAB_ASPECT` 0.5977 → 0.5581 and the tier bands are cut to the old
  geometry. Ship Task 2 and Task 2b in the same branch or the tier frames render misfit.
- Task numbering skips 7 (6 → 8) — that's historical, not a missing task.

## Hard-won gotchas (from memory — respect these)

- **master is branch-protected, repo is PUBLIC.** All work on the feature branch; ship via
  PR. Before EVERY push: `git log @{u}..HEAD` and inspect for commits you didn't make
  (another tool auto-commits untracked files mid-session). Never `git add -A` — stage named
  files only.
- **Local bakes**: the `localFileOrigin()` SSRF trust seam is what makes localhost bakes
  work; backfill via `cd backend/packages/api && corepack yarn medusa exec ./src/scripts/bake-slab-images.ts`.
- **Commands**: storefront = `npm` at repo root; backend = `corepack yarn` from
  `backend/packages/api`. Unit tests: `corepack yarn test:unit <spec>`. Typecheck hooks run
  on every .ts/.tsx edit + a Stop hook — the only auto-enforced gate.
- **Verify storefront on the production server, never `next dev`**: `npm run build` then
  `pwsh scripts/serve-standalone.ps1 -Port 4000`. "Cannot read properties of undefined
  (reading 'length')" at build start = stale `.next` → stop server, `rm -rf .next`, rebuild.
- **Playwright scripts, not the browser pane**, for visual QA (`scripts/*.mjs` →
  docs/research PNGs, Read them back).
- **SnapGen**: one job at a time; attach references with `--files`, keep prompts short;
  failed jobs cost 0; `--dry-run` to validate. During variant EXPLORATION show raw
  generations; construct (key/mask) only at ship time.
- **Backend infra**: `pokenic-postgres` / `pokenic-redis` Docker containers (DB user
  `medusa`); backend dev = `corepack yarn dev` from `backend/packages/api`, health
  `:9000/health`. A missing `backend/packages/api/.env` mimics a Knex pool-full error.
- **Trade-dress risk** is flagged in spec §13 — operator's call, already acknowledged;
  don't re-litigate.

## Tier-frame system quick reference (shipped in #196, context for Task 2b)

`SlabImage` `rarity` prop → halo + `public/images/slab-frames/<tier>.webp` + light sweep;
colors from `RARITY_RGB` (`src/lib/rarity.ts`); geometry measured by alpha scan (band 5% of
width; hole = plastic outline − tuck; the visible silver arc is a printed rail INSIDE the
clear plastic — ignore it). Pipeline: `compose-frame-variant.mjs --guide` (generation
guide), one gpt-image master → six `sharp.tint()` tiers → `--from-guide` band cut → webp.
Proof: `node scripts/capture-slab-glass.mjs`.

## Session state at handoff (2026-07-17)

- Branch `feat/tier-slab-frame` pushed; PR #196 open, CI was running (quality + security
  pending, backend jobs correctly skipped). Operator merges it themselves.
- `src/lib/liquid-glass.ts` is deliberately untracked in the working tree (rejected
  refraction experiment; the skill at `.claude/skills/liquid-glass/` references it).
  Leave it unless the operator says otherwise.
- SnapGen balance ≈ 18.8k credits.
