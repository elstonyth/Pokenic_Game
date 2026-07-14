# Vault Select-Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the boss's vault redesign — selection always on, tap-to-select tiles (star TL / select circle TR / eye BL), a persistent Show Go-style action bar (Select All + counter, FMV above and smaller than "Sell for", Deliver/Sell right) — plus a pre-work PR that removes the card-detail price-history sparkline.

**Architecture:** Two independent PRs off `origin/master`. PR A deletes the sparkline block from `CardDetail.tsx`. PR B reworks `VaultClient.tsx` around a new pure helper (`toggleSelectAll` in `src/lib/vault-selection.ts`) and a new presentational `VaultActionBar` component; the two vault e2e specs are re-authored for the always-on flow.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, Tailwind v4 + `Pill` primitives, Vitest, Playwright e2e (`tests/e2e/`) against the standalone prod server.

**Spec:** `docs/superpowers/specs/2026-07-14-vault-select-mode-design.md` (approved 2026-07-14).

## Global Constraints

- TypeScript strict, no `any`; named exports; 2-space indent; Tailwind utilities only (no inline styles except the existing rarity-glow `style` props).
- **Branching:** always from `origin/master` after `git fetch origin` (local master diverges under squash merges). Use a worktree: `git worktree add .worktrees/<branch> -b <branch> origin/master`, then `npm install` inside it.
- **Env into worktrees:** copy `.env.local` and `.env.e2e` from the main tree with PowerShell `Copy-Item` (the guard-secrets hook blocks Bash commands whose text mentions env filenames).
- **Verification:** production standalone server only — `npm run build` then `pwsh scripts/serve-standalone.ps1 -Port 4100` from the worktree (port 4100, NOT 4000 — :4000 can serve the main tree's stale build). Never `next dev`, never Chrome MCP. E2e runs with `PW_BASE=http://localhost:4100`.
- **E2e needs the backend up:** `corepack yarn dev` in `backend/packages/api` (health check `http://localhost:9000/health`) with the `pokenic-postgres`/`pokenic-redis` containers running.
- **A11y contract:** card tiles keep aria-labels `Select <name>` / `Deselect <name>`. The bar's Select All accessible name starts with "Select All" — e2e tile locators must exclude it via `/^Select (?!All\b).+/`.
- Repo hooks type-check every `.ts`/`.tsx` edit and at Stop — leave them green.
- Conventional commits; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commit only named files — never `git add docs/` wholesale (the docs corpus contains untracked local research).

---

### Task 1: PR A — remove the price-history sparkline from CardDetail

**Files:**
- Modify: `src/components/cards/CardDetail.tsx` (lines 3, 16, 33–46, 128–145)

**Interfaces:**
- Consumes: nothing from other tasks (fully independent PR).
- Produces: nothing consumed later — PR B does not touch `CardDetail.tsx`.

- [ ] **Step 1: Create the worktree**

```bash
git fetch origin
git worktree add .worktrees/card-detail-no-sparkline -b card-detail-no-sparkline origin/master
cd .worktrees/card-detail-no-sparkline
npm install
```

- [ ] **Step 2: Delete the sparkline (three edits)**

Edit `src/components/cards/CardDetail.tsx`:

(a) Line 3 — the `useMemo` import becomes unused; delete the line:

```tsx
import { useMemo } from 'react';
```

(b) Lines 33–46 — replace the spark memo block. Before:

```tsx
  // Real 30-day sparkline from history (hidden with <2 points).
  const history = detail?.priceHistory; // stable ref from state; undefined when no detail
  const spark = useMemo(() => {
    if (!history || history.length < 2) return null;
    const pts = history.map((p) => p.valueMyr);
    const max = Math.max(...pts);
    const min = Math.min(...pts);
    return pts
      .map(
        (p, i) =>
          `${(i / (pts.length - 1)) * 100},${100 - ((p - min) / (max - min || 1)) * 100}`,
      )
      .join(' ');
  }, [history]);
```

After (the 30d delta badge still needs `history`):

```tsx
  // 30-day delta from price history (the chart itself was removed — boss doc
  // "Cancel first", 2026-07-14; the badge stays).
  const history = detail?.priceHistory; // stable ref from state; undefined when no detail
```

(c) Lines 128–145 — delete the whole sparkline block:

```tsx
        {spark && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 md:p-4">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="h-12 w-full md:h-20"
            >
              <polyline
                points={spark}
                fill="none"
                stroke={`rgb(${rgb})`}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        )}
```

(d) Line 16 — the file doc comment says `(eyebrow, sparkline, trust line)`; change to `(eyebrow, delta badge, trust line)`.

- [ ] **Step 3: Verify**

Run (in the worktree): `npm run typecheck` — expected: clean. `npm run test` — expected: all pass (no test references the sparkline). `npx eslint src/components/cards/CardDetail.tsx` — expected: clean.

- [ ] **Step 4: Commit, push, PR**

```bash
git add src/components/cards/CardDetail.tsx
git commit -m "fix(card-detail): remove market price history sparkline

Boss doc (polycard.docx) 'Cancel first' + image3: drop the 30-day price
chart from the card detail. The current price, 30d delta badge, and
PriceCharting trust line stay; priceHistory plumbing is untouched.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin card-detail-no-sparkline
gh pr create --title "fix(card-detail): remove market price history sparkline" --body "Per the boss doc ('Cancel first' + the price-history screenshot): removes the 30-day sparkline chart from CardDetail (overlay + /card/[handle]). Keeps the est. price, the 30d delta badge, and the 'synced via PriceCharting' line. No data/backend changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

### Task 2: PR B worktree + commit spec/plan docs

**Files:**
- Commit (already written in the main tree — copy into the worktree if not visible there): `docs/superpowers/specs/2026-07-14-vault-select-mode-design.md`, `docs/superpowers/plans/2026-07-14-vault-select-mode.md`

**Interfaces:**
- Produces: the `vault-select-always-on` worktree every later task works in.

- [ ] **Step 1: Create the worktree + env**

```bash
git fetch origin
git worktree add .worktrees/vault-select-always-on -b vault-select-always-on origin/master
cd .worktrees/vault-select-always-on
npm install
```

Then copy env files with PowerShell (from the repo root):

```powershell
Copy-Item .env.local .worktrees\vault-select-always-on\ -Force
Copy-Item .env.e2e .worktrees\vault-select-always-on\ -Force
```

- [ ] **Step 2: Bring the spec + plan into the branch and commit (named files only)**

The spec/plan were written in the main tree and are untracked there; copy them in:

```powershell
Copy-Item docs\superpowers\specs\2026-07-14-vault-select-mode-design.md .worktrees\vault-select-always-on\docs\superpowers\specs\ -Force
Copy-Item docs\superpowers\plans\2026-07-14-vault-select-mode.md .worktrees\vault-select-always-on\docs\superpowers\plans\ -Force
```

```bash
git add docs/superpowers/specs/2026-07-14-vault-select-mode-design.md docs/superpowers/plans/2026-07-14-vault-select-mode.md
git commit -m "docs(vault): spec + plan for always-on select-mode redesign

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `toggleSelectAll` pure helper (TDD)

**Files:**
- Create: `src/lib/vault-selection.ts`
- Test: `src/lib/__tests__/vault-selection.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `toggleSelectAll(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string>` — Task 5 imports it from `@/lib/vault-selection`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/vault-selection.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { toggleSelectAll } from '@/lib/vault-selection';

describe('toggleSelectAll', () => {
  test('selects every visible id when none are selected', () => {
    const next = toggleSelectAll(new Set(), ['a', 'b', 'c']);
    expect([...next].sort()).toEqual(['a', 'b', 'c']);
  });

  test('unions visible ids with a hidden selection (persists across filters)', () => {
    // 'x' was selected under another rarity filter and is not visible now.
    const next = toggleSelectAll(new Set(['x']), ['a', 'b']);
    expect([...next].sort()).toEqual(['a', 'b', 'x']);
  });

  test('completes a partial visible selection instead of clearing it', () => {
    const next = toggleSelectAll(new Set(['a']), ['a', 'b', 'c']);
    expect([...next].sort()).toEqual(['a', 'b', 'c']);
  });

  test('deselects only the visible ids when all visible are selected', () => {
    const next = toggleSelectAll(new Set(['a', 'b', 'x']), ['a', 'b']);
    expect([...next]).toEqual(['x']);
  });

  test('is a no-op copy for an empty visible list', () => {
    const prev = new Set(['x']);
    const next = toggleSelectAll(prev, []);
    expect([...next]).toEqual(['x']);
    expect(next).not.toBe(prev); // always a fresh Set for React state
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- vault-selection`
Expected: FAIL — cannot resolve `@/lib/vault-selection`.

- [ ] **Step 3: Implement**

Create `src/lib/vault-selection.ts`:

```ts
// Select-All semantics for the vault grid (spec §3): acts on the VISIBLE
// cards only (rarity filter + search applied), never touching hidden
// selections — cross-filter selections persist. Ticked ⇔ all visible
// selected; toggling then deselects the visible ids only.
export function toggleSelectAll(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): Set<string> {
  const next = new Set(selected);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
  if (allVisibleSelected) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- vault-selection`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vault-selection.ts src/lib/__tests__/vault-selection.test.ts
git commit -m "feat(vault): toggleSelectAll helper — visible-scope select all

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `VaultActionBar` component

**Files:**
- Create: `src/components/account/VaultActionBar.tsx`

**Interfaces:**
- Consumes: `Pill` from `@/components/ui/pill`, `rm` from `@/lib/format`, `cn` from `@/lib/utils`.
- Produces: `VaultActionBar` (named export) with props `{ selectedCount, allVisibleSelected, visibleCount, fmv, sellTotal, quotesFirm, busy, onToggleSelectAll, onSell, onDeliver }` — Task 5 imports it from `@/components/account/VaultActionBar`.

No unit test — presentational component (repo testing rules: visual work is covered by Playwright, not markup assertions). E2e coverage lands in Task 6.

- [ ] **Step 1: Create the component**

Create `src/components/account/VaultActionBar.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';
import { rm } from '@/lib/format';
import { Pill } from '@/components/ui/pill';

// Persistent vault action bar (boss doc / Show Go layout): "Select All" +
// live counter on top; FMV on its own line ABOVE "Sell for" and visually
// smaller; Deliver/Sell pills bottom-right with Sell rightmost. Rendered
// whenever the vault has cards — 0 selected just disables the actions.
// Purely presentational: selection state and money live in VaultClient.
export function VaultActionBar({
  selectedCount,
  allVisibleSelected,
  visibleCount,
  fmv,
  sellTotal,
  quotesFirm,
  busy,
  onToggleSelectAll,
  onSell,
  onDeliver,
}: {
  selectedCount: number;
  allVisibleSelected: boolean;
  visibleCount: number;
  fmv: number;
  sellTotal: number;
  quotesFirm: boolean;
  busy: boolean;
  onToggleSelectAll: () => void;
  onSell: () => void;
  onDeliver: () => void;
}) {
  const none = selectedCount === 0;
  const withCount = (label: string) =>
    none ? label : `${label} ${selectedCount}`;
  return (
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6)] lg:bottom-8">
      <button
        type="button"
        onClick={onToggleSelectAll}
        disabled={visibleCount === 0}
        aria-pressed={allVisibleSelected}
        className="flex items-center gap-2 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        <span
          aria-hidden
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold',
            allVisibleSelected
              ? 'border-white bg-neutral-50 text-neutral-950'
              : 'border-white/40 text-transparent',
          )}
        >
          ✓
        </span>
        Select All
        <span className="font-normal text-neutral-400">
          · {selectedCount} selected
        </span>
      </button>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            FMV {fmv > 0 ? rm(fmv) : '—'}
          </p>
          <p className="text-[15px] font-bold text-buyback-fg">
            Sell for {rm(sellTotal)}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Pill
            variant="secondary"
            size="sm"
            onClick={onDeliver}
            disabled={none || busy}
          >
            {withCount('Deliver')}
          </Pill>
          <Pill
            size="sm"
            onClick={onSell}
            disabled={none || busy || !quotesFirm}
            className="bg-buyback text-white hover:bg-buyback/90 disabled:opacity-50"
          >
            {busy ? 'Selling…' : withCount('Sell')}
          </Pill>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` — expected clean (component is not yet imported anywhere; that's fine).

```bash
git add src/components/account/VaultActionBar.tsx
git commit -m "feat(vault): persistent VaultActionBar (Select All, FMV/Sell-for, Deliver/Sell)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Rework `VaultClient` — always-on selection

**Files:**
- Modify: `src/app/(account)/vault/VaultClient.tsx` (whole-file rework of the areas below; line numbers refer to the file at `origin/master`)

**Interfaces:**
- Consumes: `toggleSelectAll` from `@/lib/vault-selection` (Task 3), `VaultActionBar` from `@/components/account/VaultActionBar` (Task 4).
- Produces: the final vault UI that Task 6's e2e specs drive. A11y contract: tile buttons labelled `Select <name>` / `Deselect <name>`; bar button's accessible name starts with `Select All`; action pills named `Deliver N` / `Sell N`.

- [ ] **Step 1: Imports**

Remove `sellBackPull` from the `@/lib/actions/vault` import (single-card path is deleted; the action itself stays in the codebase for other surfaces). Add:

```tsx
import { toggleSelectAll } from '@/lib/vault-selection';
import { VaultActionBar } from '@/components/account/VaultActionBar';
```

- [ ] **Step 2: Delete dead state and the single-sell path**

- Delete `const [sellingId, setSellingId] = useState<string | null>(null);` (line 47)
- Delete `const [confirmItem, setConfirmItem] = useState<VaultItem | null>(null);` (line 56)
- Delete `const [selectMode, setSelectMode] = useState(false);` (line 74)
- Delete the whole `async function sell(item: VaultItem) { … }` (lines 170–189)
- In `bulkSell()` success branch: delete the `setSelectMode(false);` line (line 259) — keep the `setNotice(...)` call.
- In `RequestDeliveryModal`'s `onSubmitted`: delete the `setSelectMode(false);` line (line 681).

- [ ] **Step 3: Derived visible-selection state**

Directly after the `visible` memo (line 128), add:

```tsx
  const visibleIds = visible.map((i) => i.pullId);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
```

- [ ] **Step 4: Header — remove the Select/Done toggle**

Replace the header block (lines 270–294) with (title only; the wrapping flex div can go):

```tsx
      <div>
        <h1 className="font-heading text-3xl text-white">VAULT</h1>
        <p className="mt-1 text-[13px] text-neutral-400">
          Every card you&rsquo;ve pulled — hold, ship, or sell back instantly.
        </p>
      </div>
```

- [ ] **Step 5: Tile rework — tap selects; star TL, circle TR, eye BL**

Replace the entire `{selectMode ? ( … ) : ( … )}` ternary inside the grid map (lines 468–545) with a single always-on block (`art`, `isSelected`, `glow` are unchanged above it):

```tsx
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => toggleSelect(item.pullId)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `Deselect ${item.card.name}`
                        : `Select ${item.card.name}`
                    }
                    className="relative block w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    {art}
                    <span
                      className={cn(
                        'absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border text-[13px] font-bold',
                        isSelected
                          ? 'border-white bg-neutral-50 text-neutral-950'
                          : 'border-white/40 bg-black/50 text-transparent',
                      )}
                      aria-hidden
                    >
                      ✓
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleShowcase(item)}
                    disabled={showcasingId !== null}
                    aria-pressed={item.showcased}
                    title={
                      item.showcased
                        ? 'Remove from profile showcase'
                        : 'Feature on profile'
                    }
                    className={cn(
                      'absolute left-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 transition-colors disabled:opacity-50 sm:h-9 sm:w-9',
                      item.showcased
                        ? 'text-chase'
                        : 'text-neutral-400 hover:text-white',
                    )}
                  >
                    <Star
                      className={cn(
                        'h-3.5 w-3.5',
                        item.showcased && 'fill-current',
                      )}
                      aria-hidden
                    />
                    <span className="sr-only">
                      {item.showcased ? 'On profile' : 'Feature on profile'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenCard({
                        handle: item.card.handle,
                        name: item.card.name,
                        image: item.card.image,
                        slabImage: item.card.slabImage,
                        value: formatValue(item.card.marketPriceMyr),
                        rarity: isRarity(item.card.rarity)
                          ? item.card.rarity
                          : null,
                      })
                    }
                    aria-label={`View details for ${item.card.name}`}
                    className="absolute bottom-1 left-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950/70 text-white/80 backdrop-blur transition-colors hover:bg-neutral-950/90 hover:text-white sm:bottom-2 sm:left-2 sm:h-8 sm:w-8"
                  >
                    <Eye className="h-4 w-4" aria-hidden />
                  </button>
                </div>
```

Also in the tile wrapper div (line 461–466): change the selected-ring condition from `selectMode && isSelected` to `isSelected`.

- [ ] **Step 6: Delete the per-card Sell pill**

Delete the `{!selectMode && ( <Pill … Sell · {rm(item.buyback.amount)} … /> )}` block at the bottom of the tile (lines 571–591). (`Pill` stays imported — the filter empty-state still uses it.)

- [ ] **Step 7: Replace the conditional bulk bar with the persistent bar + spacer**

Replace the `{selectMode && selected.size > 0 && ( <div className="fixed …"> … </div> )}` block (lines 604–633) with:

```tsx
      {items.length > 0 && (
        <VaultActionBar
          selectedCount={selected.size}
          allVisibleSelected={allVisibleSelected}
          visibleCount={visibleIds.length}
          fmv={selectedFmv}
          sellTotal={selectedBuyback}
          quotesFirm={quotesFirm}
          busy={bulkSelling}
          onToggleSelectAll={() =>
            setSelected((prev) => toggleSelectAll(prev, visibleIds))
          }
          onSell={() => setConfirmBulkSell(true)}
          onDeliver={() => setDeliverOpen(true)}
        />
      )}
```

And directly after the footer copy `<p className="mt-5 text-[12px] …">…</p>` (line 598–602), add a spacer so the last grid row and footer scroll clear of the fixed bar:

```tsx
      <div aria-hidden className="h-36" />
```

- [ ] **Step 8: Single-card-rich confirm + drop the per-card modal**

Delete the `{confirmItem && ( <SellConfirmModal … /> )}` block (lines 635–653). Replace the bulk `{confirmBulkSell && ( … )}` block (lines 655–671) with a version that renders card-rich when exactly one card is selected (`count` omitted ⇒ the modal shows the slab image and "Sell this card?"):

```tsx
      {confirmBulkSell && (
        <SellConfirmModal
          open
          count={
            selectedItems.length === 1 ? undefined : selectedItems.length
          }
          cardName={
            selectedItems.length === 1
              ? selectedItems[0].card.name
              : `${selectedItems.length} cards from your vault`
          }
          image={
            selectedItems.length === 1 ? selectedItems[0].card.image : ''
          }
          slabImage={
            selectedItems.length === 1
              ? selectedItems[0].card.slabImage
              : undefined
          }
          fmv={selectedFmv}
          rateType="flat"
          percent={selectedPercent}
          netCredit={selectedBuyback}
          busy={bulkSelling}
          onConfirm={bulkSell}
          onCancel={() => !bulkSelling && setConfirmBulkSell(false)}
        />
      )}
```

- [ ] **Step 9: Verify**

Run: `npm run typecheck` — clean (this also proves `sellingId`/`confirmItem`/`selectMode` left no dangling references). `npm run test` — all pass. `npx eslint src/app/\(account\)/vault/VaultClient.tsx` — clean (catches unused imports, e.g. if `sellBackPull` removal was missed).

- [ ] **Step 10: Commit**

```bash
git add src/app/\(account\)/vault/VaultClient.tsx
git commit -m "feat(vault): always-on selection with persistent action bar

Boss doc (polycard.docx): no Select mode toggle — tap the art to select
(circle top-right, eye moves bottom-left per the doc), Select All with a
live counter, FMV above and smaller than 'Sell for', Deliver/Sell pills
right with Sell rightmost. Single sells route through the batch flow with
the card-rich confirm preserved.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Re-author the two vault e2e specs

**Files:**
- Modify: `tests/e2e/bulk-sell.spec.ts` (lines 1–9 comment, 28–39)
- Modify: `tests/e2e/delivery-request.spec.ts` (lines 1–9 comment, 27–34)

**Interfaces:**
- Consumes: the Task 5 UI (tile labels `Select <name>`/`Deselect <name>`, bar names `Select All …`, `Sell N`, `Deliver N`).
- Produces: green e2e specs + boss-doc screenshots `docs/research/pw-vault-bar-idle.png`, `docs/research/pw-vault-bar-selected.png`.

- [ ] **Step 1: Update `bulk-sell.spec.ts`**

Replace the header comment (lines 6–8) with:

```ts
// Re-authored 2026-07-14 against the always-on vault (spec 2026-07-14):
// selection has no mode toggle — tiles are always "Select <name>" buttons,
// the persistent action bar carries "Select All" + "Sell N" / "Deliver N".
```

Replace lines 28–39 (the `goto`, the `Select` mode-toggle click, and the tile while-loop) with:

```ts
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });

  // Selection is always on: each tile is an aria-label "Select <name>"
  // button. (?!All\b) keeps the tile locator from matching the bar's
  // "Select All · N selected" button.
  const unselected = page.getByRole('button', { name: /^Select (?!All\b).+/ });
  await expect(unselected).toHaveCount(2);

  // Boss-doc visual evidence: the persistent bar at 0 selected…
  await page.screenshot({
    path: 'docs/research/pw-vault-bar-idle.png',
    fullPage: true,
  });

  // …then one tap on Select All selects every visible card.
  await page.getByRole('button', { name: /^Select All/ }).click();
  await expect(unselected).toHaveCount(0);
  await page.screenshot({
    path: 'docs/research/pw-vault-bar-selected.png',
    fullPage: true,
  });
```

(The `goto` line replaces the existing one at line 28 — don't duplicate it. Everything from `// Bulk action bar → the shared confirm dialog…` onward is unchanged.)

- [ ] **Step 2: Update `delivery-request.spec.ts`**

Replace the header comment (lines 6–9) with:

```ts
// Re-authored 2026-07-14 against the always-on vault (spec 2026-07-14):
// no mode toggle — tap the tile's "Select <name>" button directly; delivery
// stays the bar's "Deliver N" pill.
```

Replace lines 28–33 (the mode-toggle click + tile click) with:

```ts
  // Selection is always on — tap the tile directly. (?!All\b) skips the
  // bar's "Select All" button.
  await page
    .getByRole('button', { name: /^Select (?!All\b).+/ })
    .first()
    .click();
```

(The `Deliver 1` click and everything after is unchanged.)

- [ ] **Step 3: Run the e2e specs against the worktree standalone server**

Prereqs: backend up (`corepack yarn dev` in `backend/packages/api`, wait for `http://localhost:9000/health`), containers running. Then from the worktree:

```bash
npm run build
pwsh scripts/serve-standalone.ps1 -Port 4100   # background
PW_BASE=http://localhost:4100 npx playwright test tests/e2e/bulk-sell.spec.ts tests/e2e/delivery-request.spec.ts
```

Expected: 2 passed; the two `pw-vault-bar-*.png` screenshots exist under `docs/research/`. Read both PNGs and check them against the spec layout: Select All top-left with `· N selected`, FMV small above the larger green "Sell for", Deliver left of Sell, Sell rightmost, buttons dimmed at 0 selected.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/bulk-sell.spec.ts tests/e2e/delivery-request.spec.ts
git commit -m "test(e2e): re-author vault specs for always-on selection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full gates + PR

**Files:** none new — verification + PR only.

- [ ] **Step 1: Full gates in the worktree**

```bash
npm run typecheck
npm run test
npm run build
```

Plus scoped lint over the touched files:

```bash
npx eslint src/lib/vault-selection.ts src/components/account/VaultActionBar.tsx src/app/\(account\)/vault/VaultClient.tsx tests/e2e/bulk-sell.spec.ts tests/e2e/delivery-request.spec.ts
```

Expected: all clean. Run the full e2e vault trio once more (bulk-sell, delivery-request, plus `tests/e2e/customer.spec.ts` to prove no collateral damage):

```bash
PW_BASE=http://localhost:4100 npx playwright test tests/e2e/bulk-sell.spec.ts tests/e2e/delivery-request.spec.ts tests/e2e/customer.spec.ts
```

- [ ] **Step 2: Push + PR**

```bash
git push -u origin vault-select-always-on
gh pr create --title "feat(vault): always-on selection with persistent action bar" --body "Implements the boss-doc vault redesign (spec: docs/superpowers/specs/2026-07-14-vault-select-mode-design.md):

- Selection always on — tap the card art to select; no Select/Done toggle
- Tile corners per the doc: star top-left, select circle top-right, eye (detail) bottom-left
- Persistent action bar (Show Go layout): Select All with live counter, FMV above and smaller than 'Sell for', Deliver/Sell pills with Sell rightmost — visible from 0 selected
- Select All = visible cards (rarity filter + search); selection persists across filter switches (pure helper + Vitest)
- Per-card Sell pill removed; 1-card selections keep the card-rich confirm via the batch flow
- E2e specs re-authored; bar screenshots in docs/research/

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 3: Screenshot evidence for the boss**

Attach/reference `docs/research/pw-vault-bar-idle.png` and `docs/research/pw-vault-bar-selected.png` in the PR description (drag into a comment or `gh pr comment`).
