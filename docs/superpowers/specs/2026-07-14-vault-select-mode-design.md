# Vault Select-Mode Redesign — Design Spec

**Date:** 2026-07-14
**Source:** boss doc `polycard.docx` (vault paragraph + inline image crops 4–11), Show Go vault screenshot (image5) as the layout reference.
**Register:** product (app surface) — `DESIGN.md` app-shell system (pill primitives, 5-tab bar) applies.

## Problem

The vault's multi-select is a mode: users must tap **Select**, hand-pick cards, and only then see a floating sheet with Sell/Deliver. The boss wants Show Go's model — selection always available, a persistent bottom action bar with **Select All**, and a clearer money hierarchy (FMV small, "Sell for" big). Two deliverables:

- **PR A (pre-work, ships first):** remove the market-price-history sparkline from the card detail ("Cancel first" + image3 in the doc).
- **PR B:** the vault select-mode redesign.

## PR A — remove the price-history chart

`src/components/cards/CardDetail.tsx`: delete the `spark` useMemo and the sparkline `<svg>` block (the `rounded-2xl` chart container). Nothing else changes:

- **Keep** the price line (`RM x est.`), the 30d delta badge (`▲/▼ RM y · 30d` — still computed from `priceHistory`), the "Instant buyback if pulled" line, and the "Market price · synced … via PriceCharting" trust line.
- **Keep** the `priceHistory` data plumbing (`CardDetailData`, endpoint) — the delta badge consumes it.
- Applies everywhere CardDetail renders: the overlay (vault, pack pages) and `/card/[handle]`.

## PR B — vault select-mode redesign

### 1. Tile interaction (always-on selection)

- Delete the **Select/Done** header button and the `selectMode` state; selection is always active.
- **Tap on card art = toggle selection** (white ring + check treatment as today).
- Corner layout per the doc (image6 crop = the eye icon):
  - **top-left:** showcase star (unchanged)
  - **top-right:** selection circle (✓ when selected) — always visible
  - **bottom-left of the art:** eye button → opens `CardDetailOverlay`
- Delete the per-card **"Sell · RM x"** pill; all selling goes through the action bar.

### 2. Persistent action bar — new `VaultActionBar` component

New file `src/components/account/VaultActionBar.tsx` — presentational, props only:
`selectedCount`, `allVisibleSelected`, `visibleCount`, `fmv`, `sellTotal`, `quotesFirm`, `busy`, `onToggleSelectAll`, `onSell`, `onDeliver`.

- Docked with the same fixed treatment as today's bulk sheet (`fixed inset-x-4 bottom-24 lg:bottom-8`, `max-w-md`, neutral-900 panel), rendered whenever the vault has ≥1 card (hidden on the empty state).
- Layout (doc: image8 "FMV … change to above", image9 "fmv smaller then sell for", image10 "select all - 5 selected", "sell change to right side"):

  ```text
  ◯ Select All · 5 selected
  FMV RM 2,379            (small, muted)
  Sell for RM 2,141       (big, buyback-green)
            [ Deliver 5 ]  [ Sell 5 ]
  ```

  - **Select All** row top-left with live counter (`· N selected`, N = true total).
  - **FMV** on its own line above **Sell for**; FMV visually smaller.
  - Buttons right-aligned on the bottom row: `Deliver N` (secondary pill), `Sell N` (primary pill, buyback-green) rightmost.
- **0 selected:** both buttons disabled, money reads `RM 0.00`, Select All circle unticked.
- `!quotesFirm` disables Sell (existing amber notice explains why); `busy` shows the selling state.
- The grid/page gets bottom padding so the last card row scrolls clear of the bar.

### 3. Select All semantics

- **Scope = visible cards**: rarity filter AND search both apply ("what you see is what you select"). This generalizes the doc's rarity rule (image11): with a rarity pill active, Select All selects exactly that rarity.
- **Selection persists** across filter/search changes (cross-rarity batches). The counter always shows the true total; Sell/Deliver act on the full selection; the confirm modal's count is the final guard.
- Checkbox state: ticked ⇔ every visible card is selected (and `visibleCount > 0`). Tapping while ticked **deselects the visible cards only**; otherwise it unions the visible cards into the selection.
- Logic lives in a pure helper `toggleSelectAll(selected, visibleIds)` in `src/lib/vault-selection.ts` with a Vitest spec in `src/lib/__tests__/`.

### 4. Single-card sell path

- Per-card `confirmItem`/`sell()` code in `VaultClient` is deleted; a 1-card selection sells through the existing batch flow (`sellBackPullsBatch`).
- When `selected.size === 1`, pass that card's `cardName`/`image`/`slabImage` to `SellConfirmModal` so the single-sell confirm keeps its card-rich rendering.
- The `sellBackPull` server action is untouched (other surfaces use it).

### 5. Unchanged

Rarity pills + search, stat strip, `quotesFirm` gating + notices, `RequestDeliveryModal` flow, batch-sell self-healing (`refreshVault` on partial failure), rarity glow/tile styling, Cancel-on-the-left convention in dialogs (already satisfied; the doc's "Cancel first" referred to the chart, not button order).

### Error handling

No new failure modes: batch sell keeps its partial-commit recovery (remove sold IDs, `refreshVault` on error); delivery keeps its modal-level errors. Selection state clears where it does today (after successful sell/deliver, and inside `refreshVault`).

## Testing & verification

- **Vitest:** the Select All pure helper — visible-scope union, deselect-visible-only, persistence math (the one runnable check for new logic).
- **Existing e2e specs must be re-authored** (they drive the old Select-button flow and will break):
  - `tests/e2e/bulk-sell.spec.ts` — drop the mode-toggle click; tap tiles directly (or use the new Select All).
  - `tests/e2e/delivery-request.spec.ts` — same.
  - **A11y contract:** tiles keep their `Select <name>` / `Deselect <name>` aria-labels. The new Select All control's accessible name ("Select All") collides with the specs' `/^Select .+/` tile locator — updated specs must scope tile locators to the grid (or the Select All name must be matched exactly and excluded).
- **Visual evidence rides the e2e specs** (no separate QA script): the re-authored `bulk-sell.spec.ts` screenshots (a) the bar at 0 selected and (b) the bar with a full selection (FMV/Sell-for hierarchy) to `docs/research/`. The rarity-filter Select All case is covered by the Vitest helper (e2e can't deterministically mint a two-rarity vault — pack pulls are random).
- Gates: `npm run typecheck`, `npm run test`, scoped lint, build + serve-standalone (never `next dev`).

## Out of scope

Odds panel (#1), Top Hits (#2), Me page (#4), NEW-card red-dot flow (#5) — each gets its own brainstorm → spec → plan cycle. Backend changes: none in either PR.

## Sequencing

1. **PR A** — branch from `origin/master`, ships immediately (~10-line deletion).
2. **PR B** — separate branch from `origin/master` (worktree per repo convention), implemented via writing-plans → SDD after this spec is approved.
