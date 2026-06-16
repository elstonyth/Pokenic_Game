# Admin Shared Formatters + Odds Mapper Dedup + Vitest — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the duplicated admin display formatters and the `EditRow→OddsInput` mapper into pure, unit-tested `lib/` modules, and stand up a Vitest runner — with zero behavior change.

**Architecture:** Three new dependency-free modules under `backend/apps/admin/src/lib/` (`format.ts`, `query-keys.ts`, `odds-rows.ts`) hold the pure logic. The React route files import from them and delete their local copies. A standalone `vitest.config.ts` (NOT extending the app's `vite.config.ts`, to avoid loading `mercurDashboardPlugin`) runs node-environment pure-function tests.

**Tech Stack:** TypeScript (strict, bundler resolution), React 18, Vite 5.4, Vitest 3.2.6, `@tanstack/react-query`, `@acme/odds-math`.

**Spec:** `docs/superpowers/specs/2026-06-16-admin-shared-formatters-and-vitest-design.md`

---

## File Structure

All paths are under `backend/apps/admin/`.

**Create:**

- `vitest.config.ts` — standalone Vitest config (node env, `src/**/*.test.ts`).
- `src/lib/format.ts` — `usd`, `timeAgo`, `fmtPct` (zero imports).
- `src/lib/format.test.ts`
- `src/lib/query-keys.ts` — `qk` query-key factory (zero imports).
- `src/lib/query-keys.test.ts`
- `src/lib/odds-rows.ts` — `EditRow` type, `mapOddsToRows`, `rowsToOddsInputs` (type-only imports).
- `src/lib/odds-rows.test.ts`

**Modify:**

- `package.json` — add `vitest` devDep + `"test"` script.
- `src/lib/queries.ts` — import `qk` from `./query-keys`, delete inline `qk`.
- `src/routes/pulls/page.tsx` — delete local `usd`/`timeAgo`, import from `../../lib/format`.
- `src/routes/economy/page.tsx` — delete local `usd`, import from `../../lib/format`.
- `src/routes/support/page.tsx` — delete local `usd`, import from `../../lib/format`.
- `src/routes/packs/[slug]/page.tsx` — delete local `fmtPct`/`EditRow`/`mapOddsToRows` + both inline `EditRow→OddsInput` builds; import from `../../../lib/format` and `../../../lib/odds-rows`; drop now-unused `OddsRow` and `OddsInput` type imports.

## Conventions (apply throughout)

- **Commands run from** `backend/apps/admin/` unless stated. Build runs from `backend/`.
- **Run the test suite:** `cd backend && corepack yarn workspace @acme/admin test`
- **Run one test file:** `cd backend && corepack yarn workspace @acme/admin test src/lib/format.test.ts`
- **Full build (the real gate):** `cd backend && corepack yarn build` (turbo; builds `@acme/odds-math` dist, then `tsc -b && vite build` for admin).
- **Commit trailer:** end every commit message with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- A global prettier PostToolUse hook reformats files after each edit. If a later edit's `old_string` fails to match, Read the file first — quoting/spacing may have changed.
- Use **single quotes** and extensionless imports to match the prettier config and existing `lib/` style.

---

### Task 1: Stand up Vitest + `format.ts` (TDD)

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/lib/format.test.ts`
- Create: `src/lib/format.ts`

- [ ] **Step 1: Add the Vitest devDependency and test script**

Edit `package.json`. Add a `test` script and a `devDependencies.vitest` entry:

```json
{
  "name": "@acme/admin",
  "private": true,
  "version": "2.1.6",
  "type": "module",
  "scripts": {
    "dev": "vite --port 7000",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview --port 7000",
    "test": "vitest run"
  },
  "dependencies": {
    "@acme/api": "workspace:*",
    "@acme/odds-math": "workspace:*",
    "@mercurjs/admin": "2.1.6"
  },
  "devDependencies": {
    "@medusajs/ui-preset": "2.15.5",
    "@types/node": "^24.10.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vitest": "^3.2.6"
  }
}
```

- [ ] **Step 2: Install so the new dep resolves**

Run: `cd backend && corepack yarn install`
Expected: completes; yarn dedupes `vitest` to the workspace's existing `3.2.6`.

- [ ] **Step 3: Create the standalone Vitest config**

Create `vitest.config.ts`. Do NOT import or `mergeConfig` the app `vite.config.ts` — that would load `mercurDashboardPlugin`/`loadMedusaConfig`. Pure-function tests need no plugins:

```ts
import { defineConfig } from 'vitest/config';

// Standalone, intentionally NOT extending vite.config.ts: the admin Vite config
// loads mercurDashboardPlugin (which reads the Medusa config). These tests are
// pure functions, so we keep a minimal node-environment runner with no plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { usd, timeAgo, fmtPct } from './format';

describe('usd', () => {
  it('formats a number with two decimals and a dollar sign', () => {
    expect(usd(12.5)).toBe('$12.50');
  });
  it('formats a whole number with grouping and trailing zeros', () => {
    expect(usd(1000)).toBe('$1,000.00');
  });
  it('returns an em dash for null', () => {
    expect(usd(null)).toBe('—');
  });
});

describe('timeAgo', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0); // fixed clock (ms)

  it('returns "just now" under a minute', () => {
    expect(timeAgo(new Date(now - 30_000).toISOString(), now)).toBe('just now');
  });
  it('returns whole minutes', () => {
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe(
      '5m ago',
    );
  });
  it('returns whole hours', () => {
    expect(timeAgo(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe(
      '3h ago',
    );
  });
  it('returns whole days', () => {
    expect(timeAgo(new Date(now - 2 * 86_400_000).toISOString(), now)).toBe(
      '2d ago',
    );
  });
  it('returns an em dash for an invalid ISO string', () => {
    expect(timeAgo('not-a-date', now)).toBe('—');
  });
});

describe('fmtPct', () => {
  it('formats an integer without decimals', () => {
    expect(fmtPct(20)).toBe('20%');
  });
  it('formats a fractional value with two decimals', () => {
    expect(fmtPct(12.5)).toBe('12.50%');
  });
});
```

- [ ] **Step 5: Run the test to verify it fails for the right reason**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/format.test.ts`
Expected: FAIL — Vitest runs but cannot resolve `./format` (module does not exist yet).

- [ ] **Step 6: Implement `format.ts`**

Create `src/lib/format.ts` (bodies copied verbatim from the originals; `timeAgo` gains an injectable `now` defaulting to `Date.now()`):

```ts
// Shared display formatters for the gacha admin pages. Pure and dependency-free
// so they can be unit-tested in a node environment (see format.test.ts).

export const usd = (n: number | null): string =>
  n === null
    ? '—'
    : `$${n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

// `now` is injectable so the function is pure and testable with a fixed clock;
// the default keeps every existing callsite (`timeAgo(iso)`) byte-identical.
export function timeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const secs = Math.max(0, Math.floor((now - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export const fmtPct = (n: number): string =>
  `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/format.test.ts`
Expected: PASS — all 10 assertions green.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/admin/package.json backend/apps/admin/vitest.config.ts \
  backend/apps/admin/src/lib/format.ts backend/apps/admin/src/lib/format.test.ts
git commit -m "$(cat <<'EOF'
test(admin): add vitest runner + shared format.ts helpers

usd/timeAgo/fmtPct extracted into a pure, dependency-free module with
node-environment unit tests. timeAgo gains an injectable `now` (default
Date.now()) so it is pure; callsites stay byte-identical. Standalone
vitest.config.ts avoids loading the dashboard Vite plugin.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `query-keys.ts` + rewire `queries.ts` (TDD)

**Files:**

- Create: `src/lib/query-keys.test.ts`
- Create: `src/lib/query-keys.ts`
- Modify: `src/lib/queries.ts` (delete inline `qk` at lines 31–42; add import)

- [ ] **Step 1: Write the failing test**

Create `src/lib/query-keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { qk } from './query-keys';

describe('qk', () => {
  it('exposes the static list keys', () => {
    expect(qk.packs).toEqual(['admin', 'packs']);
    expect(qk.cards).toEqual(['admin', 'cards']);
    expect(qk.pulls).toEqual(['admin', 'pulls']);
    expect(qk.economy).toEqual(['admin', 'economy']);
    expect(qk.eligibleProducts).toEqual(['admin', 'eligible-products']);
  });

  it('nests odds under the pack key so a pack invalidation can target odds', () => {
    expect(qk.pack('starter')).toEqual(['admin', 'pack', 'starter']);
    expect(qk.packOdds('starter')).toEqual([
      'admin',
      'pack',
      'starter',
      'odds',
    ]);
  });

  it('builds a per-customer gacha key', () => {
    expect(qk.customerGacha('cus_1')).toEqual([
      'admin',
      'customer',
      'cus_1',
      'gacha',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/query-keys.test.ts`
Expected: FAIL — cannot resolve `./query-keys`.

- [ ] **Step 3: Implement `query-keys.ts`** (moved verbatim from `queries.ts:33-42`)

Create `src/lib/query-keys.ts`:

```ts
// Centralized query keys for the gacha admin pages. Hierarchical so a pack-level
// invalidation can target the odds without touching the pack list.
export const qk = {
  packs: ['admin', 'packs'] as const,
  pack: (slug: string) => ['admin', 'pack', slug] as const,
  packOdds: (slug: string) => ['admin', 'pack', slug, 'odds'] as const,
  cards: ['admin', 'cards'] as const,
  pulls: ['admin', 'pulls'] as const,
  economy: ['admin', 'economy'] as const,
  eligibleProducts: ['admin', 'eligible-products'] as const,
  customerGacha: (id: string) => ['admin', 'customer', id, 'gacha'] as const,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/query-keys.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `queries.ts` to import `qk`**

In `src/lib/queries.ts`, delete the inline `qk` block (the comment on lines 31–32 plus the `export const qk = { ... };` on lines 33–42). Then add an import next to the existing `import type { OddsInput } from '@acme/odds-math';` line (line 29):

```ts
import type { OddsInput } from '@acme/odds-math';
import { qk } from './query-keys';
```

Leave every `qk.*` usage in the hooks unchanged — `qk` is now the imported value.

- [ ] **Step 6: Verify the build (qk move must not break consumers)**

Run: `cd backend && corepack yarn build`
Expected: PASS — `@acme/admin` `tsc -b && vite build` green (every `qk.*` reference resolves to the imported `qk`).

- [ ] **Step 7: Commit**

```bash
git add backend/apps/admin/src/lib/query-keys.ts \
  backend/apps/admin/src/lib/query-keys.test.ts \
  backend/apps/admin/src/lib/queries.ts
git commit -m "$(cat <<'EOF'
refactor(admin): extract qk query-key factory to query-keys.ts

Moves the query-key factory into a pure module so it can be unit-tested
without importing the React Query hooks (and their transport deps).
queries.ts imports qk; no key values changed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `odds-rows.ts` — `EditRow` + mappers (TDD)

**Files:**

- Create: `src/lib/odds-rows.test.ts`
- Create: `src/lib/odds-rows.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/odds-rows.test.ts`. The `import type` lines are erased at runtime, so this test loads no transport/UI deps:

```ts
import { describe, it, expect } from 'vitest';
import type { OddsRow } from './packs-api';
import { mapOddsToRows, rowsToOddsInputs, type EditRow } from './odds-rows';

const oddsRow = (over: Partial<OddsRow> = {}): OddsRow => ({
  card_id: 'card_1',
  name: 'Charizard',
  image: 'charizard.png',
  rarity: 'Rare',
  market_value: 100,
  stock: 10,
  weight: 150,
  locked: false,
  pct: 12.5,
  ...over,
});

const editRow = (over: Partial<EditRow> = {}): EditRow => ({
  card_id: 'card_1',
  name: 'Charizard',
  image: 'charizard.png',
  rarity: 'Rare',
  market_value: 100,
  stock: 10,
  currentPct: 12.5,
  locked: false,
  pctInput: '12.5',
  ...over,
});

describe('mapOddsToRows', () => {
  it('copies card facts and seeds currentPct + pctInput from pct', () => {
    expect(mapOddsToRows([oddsRow()])).toEqual([
      {
        card_id: 'card_1',
        name: 'Charizard',
        image: 'charizard.png',
        rarity: 'Rare',
        market_value: 100,
        stock: 10,
        currentPct: 12.5,
        locked: false,
        pctInput: '12.5',
      },
    ]);
  });

  it('does not carry the server weight field into the editable row', () => {
    const [row] = mapOddsToRows([oddsRow({ weight: 999 })]);
    expect(row).not.toHaveProperty('weight');
  });
});

describe('rowsToOddsInputs', () => {
  it('maps each row to the odds-math input shape, parsing pctInput to a number', () => {
    expect(
      rowsToOddsInputs([editRow({ pctInput: '20', locked: true })]),
    ).toEqual([{ card_id: 'card_1', locked: true, pct: 20, rarity: 'Rare' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails for the right reason**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/odds-rows.test.ts`
Expected: FAIL — cannot resolve `./odds-rows`.

- [ ] **Step 3: Implement `odds-rows.ts`**

Create `src/lib/odds-rows.ts`. Use **explicit `import type`** (esbuild only elides the `type` keyword form, keeping the module runtime-dependency-free):

```ts
import type { OddsRow } from './packs-api';
import type { OddsInput } from '@acme/odds-math';

// One editable row in the pack odds editor: the immutable card facts + its
// current saved %, plus the editable PER-PACK rarity (drives the unlocked
// share), the lock state, and (when locked) the win-rate input as a string so
// the operator can type freely (e.g. "12.").
export type EditRow = {
  card_id: string;
  name: string;
  image: string;
  rarity: string;
  market_value: number;
  stock: number | null;
  currentPct: number;
  locked: boolean;
  pctInput: string;
};

// Map a server odds snapshot into the editable row buffer. Used to seed the
// editor on load and to reseed after a membership change.
export const mapOddsToRows = (odds: OddsRow[]): EditRow[] =>
  odds.map((o) => ({
    card_id: o.card_id,
    name: o.name,
    image: o.image,
    rarity: o.rarity,
    market_value: o.market_value,
    stock: o.stock,
    currentPct: o.pct,
    locked: o.locked,
    pctInput: String(o.pct),
  }));

// Map the editable rows back into the odds-math input shape — the SAME mapping
// the live preview and the save handler use, so what the operator previews is
// exactly what gets persisted.
export const rowsToOddsInputs = (rows: EditRow[]): OddsInput[] =>
  rows.map((r) => ({
    card_id: r.card_id,
    locked: r.locked,
    pct: Number(r.pctInput),
    rarity: r.rarity,
  }));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && corepack yarn workspace @acme/admin test src/lib/odds-rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/admin/src/lib/odds-rows.ts \
  backend/apps/admin/src/lib/odds-rows.test.ts
git commit -m "$(cat <<'EOF'
refactor(admin): extract EditRow + odds mappers to odds-rows.ts

Pure module holding EditRow, mapOddsToRows, and a single rowsToOddsInputs
(the previously-duplicated EditRow->OddsInput build). Type-only imports
keep it dependency-free and node-testable. Not yet wired into the page.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the modules into the route files; delete local copies

No new tests — this is a pure refactor verified by the typecheck/build gate. Each edit removes a local definition and imports the shared one.

**Files:**

- Modify: `src/routes/pulls/page.tsx`
- Modify: `src/routes/economy/page.tsx`
- Modify: `src/routes/support/page.tsx`
- Modify: `src/routes/packs/[slug]/page.tsx`

- [ ] **Step 1: `pulls/page.tsx` — import `usd`/`timeAgo`, delete locals**

Add this import after the existing `import { resolveImageUrl } from "../../lib/image-url";` line:

```ts
import { usd, timeAgo } from '../../lib/format';
```

Then delete the local definitions (the `usd` arrow on lines 13–14 and the `timeAgo` function on lines 16–26). Leave both callsites (`usd(...)`, `timeAgo(p.rolled_at)`) untouched.

- [ ] **Step 2: `economy/page.tsx` — import `usd`, delete local**

Add after the existing `import { useEconomy } from "../../lib/queries";` line:

```ts
import { usd } from '../../lib/format';
```

Delete the local `usd` arrow (lines 12–15).

- [ ] **Step 3: `support/page.tsx` — import `usd`, delete local**

Add after the existing `import { resolveImageUrl } from "../../lib/image-url";` line:

```ts
import { usd } from '../../lib/format';
```

Delete the local `usd` arrow (lines 27–30).

- [ ] **Step 4: `packs/[slug]/page.tsx` — import shared helpers, delete locals + the two inline mapper builds, and drop the now-unused type imports**

4a. Change the `@acme/odds-math` import (line 21) to drop `type OddsInput` (it is no longer referenced once both inline builds use `rowsToOddsInputs`):

```ts
import { computeOdds, RARITIES } from '@acme/odds-math';
```

4b. Change the `packs-api` import (line 20) to drop `OddsRow` (only `mapOddsToRows` used it, and that moves out):

```ts
import type { PackOddsResponse } from '../../../lib/packs-api';
```

4c. Add the shared-module imports next to the existing `queries` import block:

```ts
import { fmtPct } from '../../../lib/format';
import {
  mapOddsToRows,
  rowsToOddsInputs,
  type EditRow,
} from '../../../lib/odds-rows';
```

4d. Delete the local `EditRow` type (lines 30–44), the local `mapOddsToRows` (lines 46–59), and the local `fmtPct` (lines 61–62). Leave the `mapOddsToRows(data.odds)` call (≈ line 87) untouched — it now resolves to the import.

4e. Replace the live-preview input build inside the `useMemo` (lines 129–134). From:

```ts
const inputs: OddsInput[] = (rows ?? []).map((r) => ({
  card_id: r.card_id,
  locked: r.locked,
  pct: Number(r.pctInput),
  rarity: r.rarity,
}));
const result = computeOdds(inputs);
```

To:

```ts
const inputs = rowsToOddsInputs(rows ?? []);
const result = computeOdds(inputs);
```

4f. Replace the save handler's entries build (lines 166–171). From:

```ts
const entries: OddsInput[] = rows.map((r) => ({
  card_id: r.card_id,
  locked: r.locked,
  pct: Number(r.pctInput),
  rarity: r.rarity,
}));
const res = await saveOdds.mutateAsync({ slug, entries });
```

To:

```ts
const entries = rowsToOddsInputs(rows);
const res = await saveOdds.mutateAsync({ slug, entries });
```

- [ ] **Step 5: Verify the build (catches any missed unused import under `noUnusedLocals`)**

Run: `cd backend && corepack yarn build`
Expected: PASS — admin `tsc -b && vite build` green. If `tsc` reports an unused `OddsInput`/`OddsRow`, re-check steps 4a/4b.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/admin/src/routes/pulls/page.tsx \
  backend/apps/admin/src/routes/economy/page.tsx \
  backend/apps/admin/src/routes/support/page.tsx \
  "backend/apps/admin/src/routes/packs/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
refactor(admin): use shared format + odds-rows helpers in route pages

Deletes the duplicated usd/timeAgo/fmtPct copies and the two inline
EditRow->OddsInput builds; the pages now import the shared pure modules.
Drops the now-unused OddsRow/OddsInput type imports from the editor.
No behavior change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `cd backend && corepack yarn workspace @acme/admin test`
Expected: PASS — `format.test.ts`, `query-keys.test.ts`, `odds-rows.test.ts` all green (3 files).

- [ ] **Step 2: Run the full build**

Run: `cd backend && corepack yarn build`
Expected: PASS — turbo builds `@acme/odds-math` then admin `tsc -b && vite build`, no type errors.

- [ ] **Step 3: Confirm the lint baseline is unchanged**

Run: `cd backend/apps/admin && node ../../node_modules/eslint/bin/eslint.js .`
Expected: only the 5 pre-existing `react-refresh/only-export-components` errors on the route `config` exports (cards/economy/packs/pulls/support). No NEW errors from the `lib/*` modules or `*.test.ts` files. (Lint is not a gate, but a new error here would indicate a problem.)

- [ ] **Step 4: Sanity-check no duplicated helper remains**

Run: `cd backend/apps/admin && grep -rn "const usd" src/routes || echo "no local usd copies remain"`
Expected: prints `no local usd copies remain` (every `usd` now lives in `lib/format.ts`).

---

## Self-Review

**Spec coverage:**

- Extract `usd`/`timeAgo`/`fmtPct` → `format.ts` — Task 1 + Task 4 (wiring). ✓
- Dedup `EditRow→OddsInput` mapper — Task 3 (`rowsToOddsInputs`) + Task 4 (both callsites). ✓
- Move `mapOddsToRows` to a testable module — Task 3. ✓
- `qk` testable — Task 2. ✓
- Vitest runner (devDep + script + config) — Task 1. ✓
- Pure-function tests for all four targets — Tasks 1–3. ✓
- Core-D-only (no money sweep) — no task touches `cards/page.tsx`, `packs/page.tsx`, or `RegisterCardModal.tsx`. ✓
- Zero behavior change — bodies copied verbatim; `timeAgo` default param keeps callsites identical; Task 4 Step 5 + Task 5 Step 2 enforce the build gate. ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to". Every code step shows full content. ✓

**Type consistency:** `EditRow` fields match across `odds-rows.ts`, its test, and the original `page.tsx` type. `OddsRow` (9 fields incl. `weight`) and `OddsInput` (`card_id`/`locked`/`pct`/`rarity`) match the source definitions in `packs-api.ts` and `@acme/odds-math`. `rowsToOddsInputs`/`mapOddsToRows`/`qk`/`usd`/`timeAgo`/`fmtPct` names are identical everywhere they appear. ✓
