# Spec — Pokémon-grouped Pack Odds Editor ("Option B", authoring-convenience)

**Date:** 2026-06-19 · **Branch:** `worktree-feat+pokemon-grouped-odds-editor` (off `master` @ `e859757`) · **Status:** design approved + adversarially reviewed (6-critic pass), awaiting user spec review

## 1. Goal

In the admin Pack Odds Editor, cluster the existing per-card rows under collapsible
**Pokémon group headers** with per-group win-rate rollups, so an operator authoring a
pack with many cards per Pokémon can scan and manage them grouped instead of as one
flat list.

The Pokémon grouping is a **display-only, authoring-time convenience**. It is derived
from card names client-side. It is never persisted and never sent to the server.

## 2. Decisions (resolved in brainstorming)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Real two-level draw vs organizational grouping? | **Organizational only.** | Operator wants easier authoring, not a payout mechanic change. Keeps the server draw untouched. |
| 2 | Extend the editor vs new Pokémon-first page? | **Extend the existing Pack Odds Editor** with a grouped, collapsible table. | Least work, closest to current code, save path stays byte-stable. |
| 3 | Derive Pokémon server-side or client-side? | **Client-side in the admin**, via a new `@acme/pokemon` shared package. | Backend 100% untouched; mirrors how the admin already runs `computeOdds` client-side. |
| A | Group order? | **Dex number ascending**, "Other" bucket last. | Stable key (dex from immutable `row.name`) → groups do **not** reflow while the operator edits win-rates. |
| B | Sprite in the group header? | **No sprite in v1.** | Avoids an external image fetch in the admin; name + `#dex` is enough. Trivial to add later. |
| C | Group-level actions (lock-all / set-rarity / per-group win-rate)? | **None in v1 — display + collapse only.** | A per-group win-rate is the rejected "allocate-down" model. Each card row keeps its own rarity/lock/win-rate controls. |
| D | `@acme/pokemon` module format? | **Source-based (`main`/`types` → `./src/index.ts`), NOT a CJS `dist` mirror.** | The package is **admin-only**. odds-math ships a CJS `dist` *only because the `api` package consumes it at node runtime* (`medusa build`); pokemon has no such consumer. Source-based means **no build step and no `vite.config.ts` edit** (see §9). |

## 3. Scope & non-goals

### Net-new
- A `@acme/pokemon` shared package in the backend monorepo (`pokemonFromCard` + dex names).
- A pure grouping helper in the admin (`group-rows.ts`).
- Grouped/collapsible rendering + per-group rollup headers in the Pack Odds Editor.

### Hard guarantees — these MUST NOT change *(all verified against code in the critic pass)*
- **Backend, all of it:** the odds GET/POST route (`api/admin/packs/[slug]/odds/route.ts`),
  `save-pack-odds` workflow, `roll-pack` draw, `PackOdds` model/migrations, `@acme/odds-math`.
  Zero edits. (Verified: `roll-pack.ts:60-98` is a flat cumulative-weight pick; the card is the
  atomic prize; rarity comes from the winning row. No Pokémon/group concept anywhere.)
- **Save path:** still `rowsToOddsInputs(rows)` over the same flat `EditRow[]`, posted to the
  same endpoint, which accepts only `{card_id, locked, pct, rarity}` (`route.ts:113-140`).
  Win-rate **lock** semantics, the live `computeOdds` preview, the totals footer, and the
  "everything unlocked" flatten warning all stay byte-identical. (Verified: grouping is a
  read-only projection of `rows`; it never enters `rowsToOddsInputs`.)
- **Pool-picker FocusModal** (`Manage pool`) stays flat — unchanged.
- **Storefront** untouched. `src/lib/pokemon-from-card.ts` keeps its own copy — the storefront
  is a separate workspace and the repo root has no `workspaces` field, so it cannot import
  `@acme/*` (verified).
- The draw stays flat per-card. "Pokémon" is purely a display label + a rollup of its members'
  per-card win-rates.

### Out of scope (future, not now)
- Per-Pokémon win-rate / allocate-down math; a real two-level draw.
- A backend Pokémon entity, link, or migration.
- Sprites in the admin header.
- Grouping the pool-picker modal.
- Group-level bulk actions (lock-all-in-group, set-rarity-for-group).

## 4. Architecture

### 4.1 `@acme/pokemon` shared package
New package at `backend/packages/pokemon`, covered automatically by the backend Yarn-4
workspace globs (`backend/package.json` → `workspaces: ["packages/*","apps/*"]` — verified; no
glob edit needed). It reuses odds-math's **TS + Jest tooling** but is **source-based**, not a
CJS `dist` mirror (Decision D).

**`package.json` (source-based — note `main`/`types`/`exports` all point at `./src/index.ts`,
and there is no `build` script / no `dist`):**
```jsonc
{
  "name": "@acme/pokemon",
  "version": "2.1.6",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "scripts": { "check-types": "tsc -p tsconfig.json --noEmit", "test": "jest" },
  "devDependencies": {
    "@swc/core": "^1.7.28", "@swc/jest": "^0.2.36",
    "@types/jest": "^29.5.13", "jest": "^29.7.0", "typescript": "5.9.3"
  }
}
```
`tsconfig.json` + `jest.config.js` are copied byte-for-byte from `backend/packages/odds-math`
(the Jest `testMatch` glob `**/src/**/__tests__/**/*.unit.spec.[jt]s` + `@swc/jest` transform are
what make the named test file run — verified). No `.gitignore`/`dist` entry is needed.

**Exports:**
- `type CardPokemon = { dex: number; name: string }`
- `pokemonFromCard(cardName: string): CardPokemon | null` — copied **verbatim** from
  `src/lib/pokemon-from-card.ts`: normalize → longest-substring dex match → `null` on no hit.
  **There is NO "form-base fallback" inside the function** (the earlier draft mis-stated this).
  It returns `null` for trainer/energy and any name with no longest-substring dex hit; the
  storefront's fallback *rendering* lives in that function's callers, not in the function. Here,
  `null` simply routes the card into the **"Other"** bucket (§4.2).
- `POKEDEX_NAMES: string[]` — copied **verbatim** from `src/lib/mock/pokedex-names.ts`
  (plain `string[]`, **1025** entries, Bulbasaur→Pecharunt). **Order is significant:**
  `pokemonFromCard` derives `dex = index + 1`, so the array must be copied in order and never
  re-sorted.

**Why a package and not a copy into `apps/admin/src/lib/`:** the admin already consumes
`@acme/odds-math` as `workspace:*` (verified), so the resolution pattern is proven; a shared
package keeps the dex data in **one** place inside the backend monorepo (the storefront's
separate copy is unavoidable and acceptable — static national-dex data does not drift).

Own unit tests at `src/__tests__/pokemon.unit.spec.ts`: port the storefront's matching cases —
longest-match specificity ("mewtwo" before "mew"), `null` for non-Pokémon, normalization of
punctuation/case.

### 4.2 Grouping helper — `apps/admin/src/lib/group-rows.ts` (+ `.test.ts`)
Pure, sibling to `odds-rows.ts`. The component maps over its output; the logic is unit-tested
in isolation.

```ts
import { pokemonFromCard, type CardPokemon } from '@acme/pokemon';
import type { EditRow } from './odds-rows';

export type PokemonGroup = {
  /** null = the "Other" bucket (unresolvable cards). */
  pokemon: CardPokemon | null;
  /** stable React key: `dex` as string, or 'other'. */
  key: string;
  rows: EditRow[];
};

export function groupRowsByPokemon(rows: EditRow[]): PokemonGroup[];
```

Behavior:
- Each `EditRow` → `pokemonFromCard(row.name)`. Rows with the same `dex` join one group;
  `null` → the single shared **"Other"** group.
- **Group order:** by `dex` ascending; the "Other" group is always **last**.
- **Within a group:** preserve the incoming row order (the server already sorts by
  `market_value` desc at `route.ts:81`; the helper does not re-sort within a group).
- Total row count and row identity are preserved (every input row appears in exactly one group).
- `dex` derives from `row.name`, which is **immutable** in `EditRow` (only `rarity`/`locked`/
  `pctInput`/`currentPct` change on edit), so group membership and order are invariant across
  win-rate edits → no reflow (verified).

### 4.3 Editor component changes — `apps/admin/src/routes/packs/[slug]/page.tsx`
Reuse everything; only the table body rendering changes.

- Keep `rows`/`setRows`, the in-render reseed (`seededFrom`), `previewByCard`/`result`
  `useMemo`, `setRow`, `toggleLock`, `save`, the totals footer, the flatten warning, and the
  pool-picker modal **exactly as they are**.
- Derive groups per render: `const groups = useMemo(() => groupRowsByPokemon(rows ?? []), [rows])`.
  Because grouping is recomputed from `rows` every render, it is automatically correct after the
  in-render reseed (which `setRows` during render → schedules a re-render → the `[rows]`-keyed
  memo recomputes; identical pattern to the existing `previewByCard` memo — verified) and after
  every edit. There is no separate grouping state to keep in sync.
- New local UI state: `collapsed: Set<string>` (group keys), default **empty ⇒ all expanded**.
  Plus a single expand-all (clear the set) / collapse-all (add all current `groups` keys)
  toggle. A new group key (absent from the set after a reseed) defaults to expanded — automatic.
  This is **view-only** state — it never touches `rows` or the save buffer; a locked row inside
  a collapsed group still saves.
- Render: for each group, a **group header row** followed by its card rows (collapsed groups
  render only the header). The card-row JSX (image, rarity `Select`, value, current %, lock
  `Switch`, win-rate `Input`, result %) and all its handlers are reused **verbatim**.

### 4.4 Group header row
Shows, per group:
- Pokémon **name** + `#dex` (no sprite — decision B). "Other" group labeled "Other / Ungrouped".
- **Member count.**
- **Rollup current win%** = Σ `row.currentPct` over the group's members.
  *(`currentPct` is the admin's renamed copy of the server `OddsRow.pct`, mapped in
  `odds-rows.ts:30` — use `row.currentPct`; `row.pct` does NOT exist on `EditRow`.)*
- **Rollup preview win%** = Σ `previewByCard.get(row.card_id)` over the group's members
  (mirrors the per-row current/preview columns so the operator sees how a row edit moves the
  group total).
  - **Highlight rule (pinned):** highlight the group's preview cell **iff any member row is
    itself highlighted** — i.e. reuse the existing per-row test `Math.abs(preview − currentPct)
    >= 0.005` (`page.tsx:228`) and OR it across members. This stays consistent with what the
    operator sees per row and avoids float-summation drift (a naive `abs(Σpreview − Σcurrent) >=
    0.005` can flip the group highlight inconsistently with the visible rows).
- **Aggregate stock** = Σ of members' `stock`; if **any** member is `null` (untracked), display
  "— untracked", else the sum (e.g. "120"). (`EditRow.stock` is `number | null`, verified.)
- **Collapse/expand** affordance.

**Rounding note:** `currentPct` is server-rounded to 2dp and preview pct is `weight/100` (2dp),
so a group/footer rollup can read e.g. `99.99`/`100.01` even when the true total is 100. Format
group rollups with the existing `fmtPct`; do **not** assert a group sums to exactly 100.

**Rendering realization (settled):** use **one `<Table>` with interleaved group-header rows** —
this is the primary path, not a fallback. The `@medusajs/ui` v4.1.1 **primitive** `<Table>` is a
thin pass-through over native `<table>`/`<tr>`/`<td>` elements with no column config (verified
`table.js`), and the editor already uses it directly, so a `<Table.Row>` styled as a group
header inside the single `<Table.Body>` is fully supported. The spanning header cell **must** be
`<Table.HeaderCell colSpan={N}>` — `Table.Cell` is typed `HTMLAttributes` and **omits `colSpan`**,
which fails strict `tsc` (Stop-hook), whereas `Table.HeaderCell` is `TdHTMLAttributes` and accepts
it (verified). Header copy goes through i18n (`react-i18next`) under `packs.editor.group.*`,
beside the existing `packs.editor.*` keys. Follow `medusa-ui-conformance` / `dashboard-page-ui`.

## 5. Data flow

```
server odds GET (unchanged)
  → mapOddsToRows(data.odds)            (unchanged)
  → rows: EditRow[]                     (unchanged buffer)
  → groupRowsByPokemon(rows)            (NEW, pure, client-side, per render)
  → render groups + headers             (NEW rendering)
  ↑ per-row edits via setRow/toggleLock (unchanged)
  → rowsToOddsInputs(rows) → POST       (unchanged save path)
```

Grouping is a read-only projection of `rows`. Nothing about the grouping is included in
`rowsToOddsInputs`, so the persisted payload is identical to today's (verified).

## 6. Edge cases
- **Unresolvable cards** (trainer/energy, or a form-labeled dex entry the card omits):
  `pokemonFromCard` → `null` → the shared "Other" bucket, always last. Never dropped.
- **Empty pack** (`rows` empty): no groups; existing empty/loading states render as today.
- **All cards one Pokémon:** a single group; still collapsible.
- **Collapse during edit:** collapse state is independent of `rows`; collapsing/expanding never
  alters values or the save buffer.
- **Reseed after membership change:** `rows` reseeds from the server snapshot (existing in-render
  reseed); groups recompute automatically; collapse state keyed by stable group key
  (`dex`/`'other'`) so it survives a reseed where possible; new groups default to expanded.
- **Stale rarity string** on a row: handled upstream by `@acme/odds-math` (tolerant lookup);
  grouping is by name only, unaffected.

## 7. Testing & verification
- **Unit — `@acme/pokemon`** (`src/__tests__/pokemon.unit.spec.ts`, Jest + `@swc/jest`):
  longest-match specificity, `null` for non-Pokémon, normalization.
- **Unit — `group-rows.test.ts`:** groups by dex; "Other" bucket collects `null`s and sorts
  last; group order is dex-asc; within-group order preserved; every input row appears exactly
  once. Because the source-based `@acme/pokemon` exposes `main`/`types` as `./src/index.ts`, the
  admin's node-env Vitest resolves the TS **source** directly — **no `dist` build is required**
  before the test runs (this is the payoff of Decision D vs the CJS-mirror).
- **Build/lint:** admin `tsc`/`eslint` run via `node` (not on PATH). The repo Stop-hook
  type-checks storefront + backend and blocks on real type errors. **No package build step** for
  `@acme/pokemon` (source-based).
- **Resolution gate (do this first):** after `corepack yarn install` in `backend/`, confirm the
  admin **Vite dev/build** and the admin **Vitest** both resolve `import { pokemonFromCard } from
  '@acme/pokemon'` against the TS source via the workspace symlink (`moduleResolution: bundler`).
  This is expected to work for a source-based ESM/TS package with no extra wiring. **If it does
  not** (CJS-interop surprise), fall back per §9.
- **Manual (running admin `:7000`):** open a Pokémon pack odds editor
  (`/dashboard/packs/pokemon-mythic`) →
  1. rows render grouped under Pokémon headers in dex order;
  2. collapse/expand + expand-all/collapse-all work;
  3. rollup current/preview sums match the visible member rows (allowing ±0.01 rounding);
  4. editing a row's win-rate updates that group's preview rollup live + the highlight;
  5. **Save** persists identically to before (compare the POST payload + reloaded odds to a
     pre-change baseline — they must match for unchanged inputs).
- No new backend tests (backend unchanged). No storefront change to verify.

## 8. File-by-file change list
**New**
- `backend/packages/pokemon/package.json` (source-based `@acme/pokemon` — §4.1; no `build`/`dist`)
- `backend/packages/pokemon/tsconfig.json` (copied from odds-math)
- `backend/packages/pokemon/jest.config.js` (copied byte-for-byte from odds-math)
- `backend/packages/pokemon/src/index.ts` (`pokemonFromCard`, `POKEDEX_NAMES`, `CardPokemon`)
- `backend/packages/pokemon/src/__tests__/pokemon.unit.spec.ts`
- `backend/apps/admin/src/lib/group-rows.ts`
- `backend/apps/admin/src/lib/group-rows.test.ts`

**Edited**
- `backend/apps/admin/src/routes/packs/[slug]/page.tsx` — derive groups, collapse state, grouped
  rendering + header rows (row JSX + handlers + save path reused verbatim).
- `backend/apps/admin/package.json` — add `"@acme/pokemon": "workspace:*"` (mirrors the existing
  `@acme/odds-math` entry).
- `backend/apps/admin/src/i18n/en.json` — add `packs.editor.group.*` keys (group label, count,
  "Other / Ungrouped", rollup labels, expand/collapse-all). **This is the only locale file**, and
  only `en` is wired (`src/i18n/index.ts`) — no second locale to sync.

**NOT edited under the chosen source-based package (asserted):**
- `backend/apps/admin/vite.config.ts` — **untouched**. (Only the CJS-mirror fallback in §9 would
  require editing it; the source-based package needs no Vite CJS interop.)
- All backend `src/` (routes, workflows, modules, models, migrations), `@acme/odds-math`,
  `odds-rows.ts`, `packs-api.ts`, the pool-picker modal, the storefront.

## 9. Risks
- **Module resolution (primary risk, with a tested gate).** The package is source-based to avoid
  odds-math's CJS `dist` + the admin's package-specific Vite interop. Verify per §7's resolution
  gate. **Fallback if source resolution fails in Vite/Vitest:** make `@acme/pokemon` a CJS-`dist`
  mirror of odds-math instead — set `main`/`exports.default` → `./dist/index.js`, add the
  `build: "tsc -p tsconfig.json"` script + a `.gitignore` `/dist`, build it (its own `build` or
  `turbo run build` so `dist` exists before the admin build/test), AND edit
  `backend/apps/admin/vite.config.ts` to add `'@acme/pokemon'` to `optimizeDeps.include` (≈line 45)
  and `/packages[\/]pokemon/` to `build.commonjsOptions.include` (≈lines 47-49), mirroring the
  existing `@acme/odds-math` entries (`vite.config.ts:41-50`). This is the proven path odds-math
  uses; the source-based primary just avoids it.
- **Rendering:** none — the primitive `<Table>` supports interleaved header rows (verified). The
  only gotcha is using `<Table.HeaderCell colSpan>` (not `<Table.Cell>`) for the spanning cell;
  pinned in §4.4.
- **Dex-data duplication:** the dex list now exists in both the storefront and `@acme/pokemon`.
  Acceptable (static data), but note it in the package header comment so a future change to
  `pokemonFromCard` rules updates both.
