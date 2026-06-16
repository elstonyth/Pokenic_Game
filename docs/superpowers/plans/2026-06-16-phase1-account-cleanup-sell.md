# Phase 1 — Account Cleanup + Transactions + Sell Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trim four dead account tabs, turn the mock "Earnings" tab into a real "Transactions" ledger, and add a sell-confirmation modal at both sell points — with the instant-sell window made strict-30s by anchoring it to a server-stamped card-reveal time.

> **Post-review note:** the Transactions running-balance column (and the `withRunningBalance` helper) described below were **dropped during review** — the page ships date · type · signed amount plus the three totals only. Code/test blocks below that build the running balance are superseded; see PR #7.

**Architecture:** Three independent groups. **A** (storefront-only) removes nav entries + routes. **B** (backend service + storefront) exposes lifetime credit totals and renders the existing `/store/credits` ledger. **C** (backend model/route + storefront) adds a `revealed_at` stamp + `POST /store/pulls/:id/reveal` ping so the 30s instant window counts from card-reveal, then wires a shared `SellConfirmModal` into the reveal overlay and the vault grid, including a post-expiry flat-sell affordance.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, zod, vitest, Tailwind v4, `@base-ui/react`, lucide-react (storefront); Medusa v2 / Mercur, MikroORM models + migrations, jest (backend).

**Spec:** `docs/superpowers/specs/2026-06-16-customer-vault-account-ux-design.md` (Phase 1 sections 1.1–1.3).

**Conventions used below**
- Storefront commands run from the repo root (`npm …`). Backend commands run from `backend/packages/api` (`corepack yarn …`).
- The PostToolUse typecheck hook + Stop build-verify hook are already wired — but each task still ends with an explicit verify + commit.
- Verify the storefront on the standalone build at `:4000` (`npm run build` → `pwsh scripts/serve-standalone.ps1 -Port 4000`), never `next dev`.
- Conventional-commit messages; end bodies with the Co-Authored-By trailer used in this repo.

---

## File Structure

**Group A — cleanup (storefront)**
- Modify `src/components/account/AccountSidebar.tsx` — drop 4 nav entries + unused icon imports.
- Modify `src/app/social/page.tsx` — remove the `/messages` "Message" link, regrid 3→2 cols.
- Delete `src/app/(account)/messages/`, `src/app/(account)/pokecoin/`, `src/app/(account)/accelerate-claim/`, `src/app/borrow-lend/`.

**Group B — transactions (backend + storefront)**
- Create `backend/packages/api/src/modules/packs/credit-summary.ts` — pure ledger-fold helpers.
- Create `backend/packages/api/src/modules/packs/__tests__/credit-summary.unit.spec.ts`.
- Modify `backend/packages/api/src/modules/packs/service.ts` — `creditSummary()` + delegate `creditBalance()`.
- Modify `backend/packages/api/src/api/store/credits/route.ts` — return lifetime totals.
- Modify `src/lib/data/schemas.ts` — `CreditsSchema` + `CreditTransactionSchema`.
- Modify `src/lib/actions/vault.ts` — `getTransactions()` action + types.
- Create `src/lib/transactions.ts` — `reasonLabel` / `signedUsd` (pure). _(running-balance helper dropped in review — see note up top.)_
- Create `src/lib/__tests__/transactions.test.ts`.
- Rename `src/app/(account)/earnings/` → `src/app/(account)/transactions/`; rewrite `page.tsx`.
- Modify `src/components/account/AccountSidebar.tsx` — Earnings → Transactions entry.

**Group C — sell confirmation + reveal ping (backend + storefront)**
- Modify `backend/packages/api/src/modules/packs/models/pull.ts` — `+ revealed_at`.
- New migration under `backend/packages/api/src/modules/packs/migrations/`.
- Modify `backend/packages/api/src/modules/packs/buyback-rate.ts` — reveal-anchored window.
- Rewrite `backend/packages/api/src/modules/packs/__tests__/buyback-rate.unit.spec.ts`.
- Modify `backend/packages/api/src/modules/packs/service.ts` — `quoteBuyback` signature + `revealPull()`.
- Modify `backend/packages/api/src/api/store/vault/route.ts` + `…/workflows/steps/buyback-pull.ts` — pass `revealed_at`.
- Modify `backend/packages/api/src/api/store/packs/[slug]/open/route.ts` — return vault fields + deadline.
- Create `backend/packages/api/src/api/store/pulls/[id]/reveal/route.ts`.
- Modify `backend/packages/api/src/api/utils/rate-limit.ts` — `createPullRevealRateLimit()`.
- Modify `backend/packages/api/src/api/middlewares.ts` — register the reveal matcher.
- Modify `src/lib/actions/packs.ts` — extend `OpenPackResult.buyback` + `revealPull()` action.
- Modify `src/lib/data/schemas.ts` — extend `OpenBuybackSchema`.
- Rewrite `src/lib/sell-countdown.ts` + `src/lib/__tests__/sell-countdown.test.ts`.
- Create `src/components/SellConfirmModal.tsx`.
- Modify `src/app/claw/[slug]/PackOpenOverlay.tsx` — reveal ping, deadline countdown, post-expiry flat sell, modal.
- Modify `src/app/claw/[slug]/PackDetailClient.tsx` — map new buyback fields + pass `onReveal`.
- Modify `src/app/(account)/vault/VaultClient.tsx` — modal before sell.

---

## GROUP A — Account Cleanup

### Task A1: Remove the four dead nav entries

**Files:**
- Modify: `src/components/account/AccountSidebar.tsx`

- [ ] **Step 1: Edit the imports and the ACCOUNT_NAV array**

Replace the lucide import block and the `ACCOUNT_NAV` array. Drop `MessageSquare`, `HandCoins`, `Coins`, `Zap` imports and the Messages / Borrow-Lend / PokéCoin / Accelerate-Claim entries (Earnings stays — it is renamed in Task B6):

```typescript
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  Package,
  TrendingUp,
  Gift,
  Award,
  Ticket,
  Landmark,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const ACCOUNT_NAV: { label: string; href: string; icon: LucideIcon }[] =
  [
    { label: 'Vault', href: '/vault', icon: Vault },
    { label: 'Settings', href: '/settings', icon: Settings },
    { label: 'Orders', href: '/orders', icon: Package },
    { label: 'Earnings', href: '/earnings', icon: TrendingUp },
    { label: 'Referrals', href: '/referrals', icon: Gift },
    { label: 'Achievements', href: '/achievements', icon: Award },
    { label: 'Vouchers', href: '/vouchers', icon: Ticket },
    { label: 'Withdraw', href: '/bank-withdrawal', icon: Landmark },
  ];
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no unused-import or missing-symbol errors from this file).

- [ ] **Step 3: Commit**

```bash
git add src/components/account/AccountSidebar.tsx
git commit -m "refactor(account): drop messages/borrow-lend/pokecoin/accelerate-claim nav"
```

---

### Task A2: Remove the `/messages` link on the social page

**Files:**
- Modify: `src/app/social/page.tsx` (around lines 87–106)

- [ ] **Step 1: Remove the Message link and regrid the action row**

The user-card action row is a 3-column grid (Profile / Message / Trade). Remove the middle `<Link href="/messages">…</Link>` and change the grid to 2 columns. Replace:

```tsx
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Link
                  href={`/profile/${u.username}`}
                  className="flex h-9 items-center justify-center rounded-lg bg-neutral-200 text-[12px] font-semibold text-neutral-950 transition-colors hover:bg-white"
                >
                  Profile
                </Link>
                <Link
                  href="/messages"
                  className="flex h-9 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Message
                </Link>
                <button
                  type="button"
                  className="flex h-9 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Trade
                </button>
              </div>
```

with:

```tsx
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link
                  href={`/profile/${u.username}`}
                  className="flex h-9 items-center justify-center rounded-lg bg-neutral-200 text-[12px] font-semibold text-neutral-950 transition-colors hover:bg-white"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  className="flex h-9 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 text-[12px] font-medium text-white/80 transition-colors hover:bg-white/10"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden /> Trade
                </button>
              </div>
```

- [ ] **Step 2: Remove the now-unused `MessageSquare` import**

In the lucide-react import at the top of `src/app/social/page.tsx`, delete `MessageSquare` from the named imports (leave `ArrowLeftRight` and the rest). If `MessageSquare` appears nowhere else in the file, the typecheck/lint in Step 3 confirms removal is clean.

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS (no "MessageSquare is defined but never used").

- [ ] **Step 4: Commit**

```bash
git add src/app/social/page.tsx
git commit -m "refactor(social): drop /messages action link"
```

---

### Task A3: Delete the removed routes

**Files:**
- Delete: `src/app/(account)/messages/`, `src/app/(account)/pokecoin/`, `src/app/(account)/accelerate-claim/`, `src/app/borrow-lend/`

- [ ] **Step 1: Confirm no remaining inbound references**

Run (PowerShell): `npm run -s lint 2>$null; git grep -nE "/(messages|pokecoin|accelerate-claim|borrow-lend)\b" -- src` (or use the Grep tool for `href=["'`]/(messages|pokecoin|accelerate-claim|borrow-lend)`).
Expected: only matches are the directories about to be deleted (and the borrow-lend page's own header comment). If any OTHER file links these routes, fix it before deleting.

- [ ] **Step 2: Delete the directories**

```bash
git rm -r "src/app/(account)/messages" "src/app/(account)/pokecoin" "src/app/(account)/accelerate-claim" src/app/borrow-lend
```

- [ ] **Step 3: Build to prove no broken imports/links remain**

Run: `npm run build`
Expected: build SUCCEEDS; route list no longer contains `/messages`, `/pokecoin`, `/accelerate-claim`, `/borrow-lend`.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(account): delete messages/pokecoin/accelerate-claim/borrow-lend routes"
```

---

### Task A4: Verify the trimmed account shell

- [ ] **Step 1: Serve the standalone build**

```bash
npm run build
pwsh scripts/serve-standalone.ps1 -Port 4000   # run in background
```

- [ ] **Step 2: Screenshot the sidebar**

Use the Playwright capture pattern (an existing `scripts/*.mjs` or a one-off) to log in as the dev customer (`test@pokenic.app` / `PokenicTest123!`), navigate to `http://localhost:4000/vault`, and screenshot to `docs/research/phase1-sidebar.png`. Read the PNG back.
Expected: the sidebar shows Vault, Settings, Orders, Earnings, Referrals, Achievements, Vouchers, Withdraw — and NONE of Messages / Borrow-Lend / PokéCoin / Accelerate Claim.

- [ ] **Step 3: Confirm removed routes 404**

In the same Playwright session, navigate to `http://localhost:4000/messages` and `/borrow-lend`.
Expected: Next.js 404 for both.

---

## GROUP B — Earnings → Transactions

### Task B1: Pure ledger-fold helpers (backend)

**Files:**
- Create: `backend/packages/api/src/modules/packs/credit-summary.ts`
- Test: `backend/packages/api/src/modules/packs/__tests__/credit-summary.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

`backend/packages/api/src/modules/packs/__tests__/credit-summary.unit.spec.ts`:

```typescript
import {
  EMPTY_TOTALS,
  foldLedgerRow,
  totalsToUsd,
} from "../credit-summary";

describe("credit-summary fold", () => {
  it("sums balance in cents, accumulating top-ups and spends separately", () => {
    const rows = [
      { amount: 50, reason: "topup" },
      { amount: -10, reason: "pack_open" },
      { amount: 9, reason: "buyback" }, // a credit, but NOT a top-up
      { amount: -2.5, reason: "adjustment" }, // negative adjustment = a spend
    ];
    const totals = rows.reduce(foldLedgerRow, EMPTY_TOTALS);
    expect(totalsToUsd(totals)).toEqual({
      balance: 46.5, // 50 - 10 + 9 - 2.5
      topupTotal: 50, // only the topup row
      spendTotal: 12.5, // |−10| + |−2.5|
    });
  });

  it("avoids float drift on half-cent amounts", () => {
    const rows = [
      { amount: 0.1, reason: "topup" },
      { amount: 0.2, reason: "topup" },
    ];
    const totals = rows.reduce(foldLedgerRow, EMPTY_TOTALS);
    expect(totalsToUsd(totals).balance).toBe(0.3);
    expect(totalsToUsd(totals).topupTotal).toBe(0.3);
  });

  it("treats a positive adjustment as a credit but not a top-up or spend", () => {
    const totals = foldLedgerRow(EMPTY_TOTALS, { amount: 5, reason: "adjustment" });
    expect(totalsToUsd(totals)).toEqual({
      balance: 5,
      topupTotal: 0,
      spendTotal: 0,
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack yarn test:unit credit-summary`
Expected: FAIL — cannot find module `../credit-summary`.

- [ ] **Step 3: Write the helper**

`backend/packages/api/src/modules/packs/credit-summary.ts`:

```typescript
// Pure aggregation over the credit ledger, factored out of the service so it is
// unit-testable without a DB. Money is 2dp USD decimals; summing in INTEGER
// CENTS avoids the float drift a running decimal sum accumulates over a long
// ledger. `amount` is signed: positive = credit, negative = spend.

export interface LedgerTotals {
  balanceCents: number;
  topupCents: number;
  spendCents: number;
}

export const EMPTY_TOTALS: LedgerTotals = {
  balanceCents: 0,
  topupCents: 0,
  spendCents: 0,
};

export function foldLedgerRow(
  acc: LedgerTotals,
  row: { amount: number; reason: string },
): LedgerTotals {
  const cents = Math.round(row.amount * 100);
  return {
    balanceCents: acc.balanceCents + cents,
    // Lifetime money the customer put IN (top-ups only — buybacks/credits are
    // not deposits).
    topupCents: acc.topupCents + (cents > 0 && row.reason === "topup" ? cents : 0),
    // Lifetime money OUT (every negative row — pack opens + any negative
    // adjustment).
    spendCents: acc.spendCents + (cents < 0 ? -cents : 0),
  };
}

export function totalsToUsd(t: LedgerTotals): {
  balance: number;
  topupTotal: number;
  spendTotal: number;
} {
  return {
    balance: t.balanceCents / 100,
    topupTotal: t.topupCents / 100,
    spendTotal: t.spendCents / 100,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack yarn test:unit credit-summary`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/packages/api/src/modules/packs/credit-summary.ts backend/packages/api/src/modules/packs/__tests__/credit-summary.unit.spec.ts
git commit -m "feat(packs): pure credit-ledger summary helpers"
```

---

### Task B2: `creditSummary()` service method

**Files:**
- Modify: `backend/packages/api/src/modules/packs/service.ts`

- [ ] **Step 1: Add the import**

At the top of `service.ts`, add the fold helpers to the existing imports:

```typescript
import {
  EMPTY_TOTALS,
  foldLedgerRow,
  totalsToUsd,
  type LedgerTotals,
} from "./credit-summary";
```

- [ ] **Step 2: Add `creditSummary` and delegate `creditBalance`**

Replace the existing `creditBalance` method with:

```typescript
  // Lifetime ledger totals (balance + money-in/out), paged so the result is
  // exact at any ledger size. Reuses the pure fold so the arithmetic is
  // unit-tested. balance == Σ(amount); topupTotal == Σ top-ups; spendTotal == Σ
  // |negatives|.
  async creditSummary(customerId: string): Promise<{
    balance: number;
    topupTotal: number;
    spendTotal: number;
  }> {
    let totals: LedgerTotals = EMPTY_TOTALS;
    for (let skip = 0; ; skip += BALANCE_PAGE) {
      const page = await this.listCreditTransactions(
        { customer_id: customerId },
        { skip, take: BALANCE_PAGE, order: { created_at: "ASC" } }
      );
      for (const t of page) {
        totals = foldLedgerRow(totals, {
          amount: Number(t.amount),
          reason: t.reason,
        });
      }
      if (page.length < BALANCE_PAGE) break;
    }
    return totalsToUsd(totals);
  }

  // Customer credit balance = Σ(amount) over the append-only ledger. Kept as a
  // thin delegate so existing callers (pack detail affordability, etc.) are
  // unchanged.
  async creditBalance(customerId: string): Promise<number> {
    return (await this.creditSummary(customerId)).balance;
  }
```

- [ ] **Step 3: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS (no type errors in service.ts).

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/modules/packs/service.ts
git commit -m "feat(packs): creditSummary() lifetime totals on the packs service"
```

---

### Task B3: `/store/credits` returns lifetime totals

**Files:**
- Modify: `backend/packages/api/src/api/store/credits/route.ts`

- [ ] **Step 1: Return the summary fields**

Replace the body of the `GET` handler so it uses `creditSummary` and emits `topup_total` / `spend_total` alongside `balance`:

```typescript
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerId = req.auth_context.actor_id;

  const [summary, transactions] = await Promise.all([
    packs.creditSummary(customerId),
    packs.listCreditTransactions(
      { customer_id: customerId },
      { order: { created_at: "DESC" }, take: RECENT_TRANSACTIONS }
    ),
  ]);

  res.json({
    balance: summary.balance,
    topup_total: summary.topupTotal,
    spend_total: summary.spendTotal,
    transactions: transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      reason: t.reason,
      pull_id: t.pull_id,
      created_at: t.created_at,
    })),
  });
}
```

- [ ] **Step 2: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS.

- [ ] **Step 3 (manual): sanity-check the shape**

With the backend running (`corepack yarn dev`, health `:9000/health`) and a logged-in customer token, GET `/store/credits` returns `{ balance, topup_total, spend_total, transactions:[…] }`. (Optional — covered by the storefront render in Task B6. The `creditSummary` arithmetic is already unit-tested in B1.)

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/api/store/credits/route.ts
git commit -m "feat(store): expose lifetime topup/spend totals on /store/credits"
```

---

### Task B4: Storefront schema + `getTransactions()` action

**Files:**
- Modify: `src/lib/data/schemas.ts`
- Modify: `src/lib/actions/vault.ts`

- [ ] **Step 1: Add the credit schemas**

Append to `src/lib/data/schemas.ts` (next to `BalanceSchema`). `finite` is the existing local validator used by the other schemas:

```typescript
/** GET /store/credits — lifetime totals (balance is also validated by BalanceSchema). */
export const CreditsSchema = z.looseObject({
  balance: finite,
  topup_total: finite,
  spend_total: finite,
});

/** GET /store/credits transaction row. `amount` is signed (credit +, spend −). */
export const CreditTransactionSchema = z.looseObject({
  id: z.string(),
  amount: finite,
  reason: z.enum(['buyback', 'topup', 'pack_open', 'adjustment']),
  created_at: z.string(),
});
```

- [ ] **Step 2: Add the action + types to `vault.ts`**

In `src/lib/actions/vault.ts`, add `CreditsSchema, CreditTransactionSchema` to the existing `@/lib/data/schemas` import, then add:

```typescript
export type CreditTxn = {
  id: string;
  amount: number;
  reason: 'buyback' | 'topup' | 'pack_open' | 'adjustment';
  createdAt: string;
};

export type TransactionsResult =
  | {
      ok: true;
      balance: number;
      topupTotal: number;
      spendTotal: number;
      transactions: CreditTxn[];
    }
  | { ok: false; error: string; needsAuth?: boolean };

// The credit ledger for the Transactions account page: lifetime totals + the
// recent rows. The backend caps the row list (RECENT_TRANSACTIONS); the totals
// are computed over the FULL ledger server-side, so they stay accurate beyond
// the visible rows.
export async function getTransactions(): Promise<TransactionsResult> {
  const token = await getAuthToken();
  if (!token) {
    return {
      ok: false,
      error: 'Please log in to view your transactions.',
      needsAuth: true,
    };
  }
  try {
    const raw = await sdk.client.fetch('/store/credits', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const totals = parseOne(CreditsSchema, raw);
    const rows = parseList(
      CreditTransactionSchema,
      (raw as { transactions?: unknown }).transactions,
    );
    return {
      ok: true,
      balance: totals?.balance ?? 0,
      topupTotal: totals?.topup_total ?? 0,
      spendTotal: totals?.spend_total ?? 0,
      transactions: rows.map((r) => ({
        id: r.id,
        amount: r.amount,
        reason: r.reason,
        createdAt: r.created_at,
      })),
    };
  } catch (error) {
    logger.error('[credits] transactions load failed:', error);
    return {
      ok: false,
      error: friendlyError(error, VAULT_RULES, VAULT_FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/schemas.ts src/lib/actions/vault.ts
git commit -m "feat(credits): getTransactions() server action + schemas"
```

---

### Task B5: Pure transactions view helpers

**Files:**
- Create: `src/lib/transactions.ts`
- Test: `src/lib/__tests__/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/transactions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  reasonLabel,
  signedUsd,
  withRunningBalance,
} from '@/lib/transactions';
import type { CreditTxn } from '@/lib/actions/vault';

describe('reasonLabel', () => {
  it('maps each reason to a human label', () => {
    expect(reasonLabel('topup')).toBe('Top-up');
    expect(reasonLabel('pack_open')).toBe('Pack open');
    expect(reasonLabel('buyback')).toBe('Sell-back');
    expect(reasonLabel('adjustment')).toBe('Adjustment');
  });
});

describe('signedUsd', () => {
  it('prefixes a sign and formats the magnitude', () => {
    expect(signedUsd(48)).toBe('+$48.00');
    expect(signedUsd(-25)).toBe('-$25.00');
    expect(signedUsd(0)).toBe('$0.00');
  });
});

describe('withRunningBalance', () => {
  it('walks newest-first rows back from the current balance', () => {
    // newest-first; current balance reflects all three
    const rows: CreditTxn[] = [
      { id: 'c', amount: 10, reason: 'buyback', createdAt: '2026-06-03' },
      { id: 'b', amount: -4, reason: 'pack_open', createdAt: '2026-06-02' },
      { id: 'a', amount: 20, reason: 'topup', createdAt: '2026-06-01' },
    ];
    const out = withRunningBalance(rows, 26);
    expect(out.map((r) => r.balanceAfter)).toEqual([26, 16, 20]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/transactions.test.ts`
Expected: FAIL — cannot resolve `@/lib/transactions`.

- [ ] **Step 3: Write the helper**

`src/lib/transactions.ts`:

```typescript
// Pure presentation helpers for the Transactions account page. Isomorphic (no
// server-only imports) so the server component can call them directly.
import type { CreditTxn } from '@/lib/actions/vault';
import { usd } from '@/lib/format';

const REASON_LABEL: Record<CreditTxn['reason'], string> = {
  topup: 'Top-up',
  pack_open: 'Pack open',
  buyback: 'Sell-back',
  adjustment: 'Adjustment',
};

export const reasonLabel = (reason: CreditTxn['reason']): string =>
  REASON_LABEL[reason];

/** "+$48.00" for credits, "-$25.00" for spends (amount carries the sign). */
export function signedUsd(amount: number): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${usd(Math.abs(amount))}`;
}

/**
 * Rows are newest-first (API order). Returns each row with the balance the
 * account held immediately AFTER that transaction, derived by walking backward
 * from the current (authoritative, full-ledger) balance. Accurate for the
 * visible window even though it is only the recent N rows.
 */
export function withRunningBalance(
  rows: CreditTxn[],
  currentBalance: number,
): (CreditTxn & { balanceAfter: number })[] {
  let running = currentBalance;
  return rows.map((r) => {
    const balanceAfter = running;
    running = Math.round((running - r.amount) * 100) / 100; // balance before this row
    return { ...r, balanceAfter };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/transactions.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/transactions.ts src/lib/__tests__/transactions.test.ts
git commit -m "feat(transactions): pure label/sign/running-balance helpers"
```

---

### Task B6: Transactions page + nav rename

**Files:**
- Rename: `src/app/(account)/earnings/` → `src/app/(account)/transactions/`
- Modify (rewrite): `src/app/(account)/transactions/page.tsx`
- Modify: `src/components/account/AccountSidebar.tsx`

- [ ] **Step 1: Rename the route directory**

```bash
git mv "src/app/(account)/earnings" "src/app/(account)/transactions"
```

- [ ] **Step 2: Rewrite the page as a real ledger view**

Overwrite `src/app/(account)/transactions/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { AccountHeader, StatCards } from '@/components/account/ui';
import { usd } from '@/lib/format';
import { getTransactions } from '@/lib/actions/vault';
import {
  reasonLabel,
  signedUsd,
  withRunningBalance,
} from '@/lib/transactions';

export const metadata: Metadata = { title: 'Transactions | Pokenic' };

// The credit ledger: lifetime money in/out + the recent transactions. The
// (account) layout already gates signed-out visitors; getTransactions reads the
// httpOnly JWT. No interactivity → server component, no client island.
export default async function TransactionsPage() {
  const res = await getTransactions();

  if (!res.ok) {
    return (
      <>
        <AccountHeader title="Transactions" sub="Your top-ups and spending." />
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
          {res.error}
        </p>
      </>
    );
  }

  const rows = withRunningBalance(res.transactions, res.balance);

  return (
    <>
      <AccountHeader
        title="Transactions"
        sub="Every top-up and spend on your account."
      />
      <StatCards
        items={[
          { label: 'Current balance', value: usd(res.balance) },
          { label: 'Total topped up', value: usd(res.topupTotal) },
          { label: 'Total spent', value: usd(res.spendTotal) },
        ]}
      />
      <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-white/50">
            No transactions yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[12px] uppercase tracking-wide text-white/45">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-white/5 last:border-0"
                >
                  <td className="px-4 py-3 text-white/70">
                    {new Date(t.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3 text-white/90">
                    {reasonLabel(t.reason)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${
                      t.amount >= 0 ? 'text-emerald-300' : 'text-white/80'
                    }`}
                  >
                    {signedUsd(t.amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">
                    {usd(t.balanceAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Flip the nav entry Earnings → Transactions**

In `src/components/account/AccountSidebar.tsx`: swap the `TrendingUp` import for `Receipt` and update the entry. The import list becomes `Settings, Package, Receipt, Gift, Award, Ticket, Landmark, Vault, type LucideIcon`, and the array entry becomes:

```typescript
    { label: 'Transactions', href: '/transactions', icon: Receipt },
```

(Place it where the Earnings entry was — between Orders and Referrals.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: SUCCEEDS; route list contains `/transactions` and NOT `/earnings`.

- [ ] **Step 5: Verify rendering on the standalone build**

Serve `:4000` (build already done), log in, navigate `http://localhost:4000/transactions`, screenshot to `docs/research/phase1-transactions.png`, read it back.
Expected: three stat cards (Current balance / Total topped up / Total spent) over a real table with Date · Type · Amount (signed) · Balance rows (or the "No transactions yet." empty state for a fresh account — top up once via the vault's AddCreditsPanel to populate).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(account)/transactions" src/components/account/AccountSidebar.tsx
git commit -m "feat(account): real Transactions ledger page (replaces mock Earnings)"
```

---

## GROUP C — Sell Confirmation + Strict-30s Reveal Ping

> Build the backend (C1–C6) before the storefront (C7–C13): the storefront reveal ping and the new buyback payload fields depend on the backend changes.

### Task C1: `Pull.revealed_at` field + migration

**Files:**
- Modify: `backend/packages/api/src/modules/packs/models/pull.ts`
- Create: a migration under `backend/packages/api/src/modules/packs/migrations/`

- [ ] **Step 1: Add the field to the model**

In `pull.ts`, insert `revealed_at` immediately after `rolled_at`:

```typescript
    rolled_at: model.dateTime(),
    // When the customer first SAW the card at the reveal (the open animation
    // lags rolled_at). The 30s instant-sell window counts from here, capped at
    // rolled_at + BUYBACK_REVEAL_GRACE_MS so a delayed ping can't extend it.
    // Null until the reveal ping stamps it (or for cards never revealed).
    revealed_at: model.dateTime().nullable(),
```

- [ ] **Step 2: Generate the migration**

Use the `medusa-dev:db-generate` skill, or run from `backend/packages/api`:
`npx medusa db:generate packs`
(`packs` is the module name registered in `src/modules/packs/index.ts` — confirm the exported name there and pass it.)
Expected: a new file `src/modules/packs/migrations/Migration<timestamp>.ts` whose `up()` contains roughly:

```sql
ALTER TABLE "pull" ADD COLUMN IF NOT EXISTS "revealed_at" timestamptz NULL;
```

- [ ] **Step 3: Run the migration**

Use `medusa-dev:db-migrate`, or run: `npx medusa db:migrate`
Expected: applies cleanly; `pull.revealed_at` exists, NULL for all existing rows.

- [ ] **Step 4: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/api/src/modules/packs/models/pull.ts backend/packages/api/src/modules/packs/migrations
git commit -m "feat(packs): add Pull.revealed_at for reveal-anchored instant window"
```

---

### Task C2: Reveal-anchored buyback rate (TDD)

**Files:**
- Modify (rewrite): `backend/packages/api/src/modules/packs/buyback-rate.ts`
- Rewrite: `backend/packages/api/src/modules/packs/__tests__/buyback-rate.unit.spec.ts`

- [ ] **Step 1: Rewrite the unit spec (new signature + reveal anchoring)**

Overwrite `backend/packages/api/src/modules/packs/__tests__/buyback-rate.unit.spec.ts`:

```typescript
import {
  FLAT_PERCENT,
  buybackAmount,
  instantDeadlineMs,
  instantWindowMs,
  revealGraceMs,
  resolveBuybackRate,
} from "../buyback-rate";

const NOW = 1_750_000_000_000;
const ago = (ms: number) => new Date(NOW - ms);

describe("instantDeadlineMs", () => {
  it("falls back to rolled_at + window when not yet revealed", () => {
    expect(instantDeadlineMs(ago(0), null)).toBe(NOW + instantWindowMs());
  });

  it("anchors to revealed_at + window once revealed", () => {
    // rolled 60s ago, revealed 5s ago → deadline is 25s from now
    expect(instantDeadlineMs(ago(60_000), ago(5_000))).toBe(
      NOW - 5_000 + instantWindowMs(),
    );
  });

  it("never exceeds rolled_at + grace, even for a late reveal", () => {
    const rolled = ago(revealGraceMs() - 1_000); // grace nearly elapsed
    const revealedNow = new Date(NOW);
    expect(instantDeadlineMs(rolled, revealedNow)).toBe(
      rolled.getTime() + revealGraceMs(),
    );
  });

  it("returns NaN for an unparsable rolled_at", () => {
    expect(Number.isNaN(instantDeadlineMs("nope", null))).toBe(true);
  });
});

describe("resolveBuybackRate", () => {
  const pack = { buyback_percent: 95 };

  it("credits the pack rate inside the reveal window", () => {
    expect(
      resolveBuybackRate(pack, { rolled_at: ago(60_000), revealed_at: ago(5_000) }, NOW),
    ).toEqual({ percent: 95, rate_type: "instant" });
  });

  it("uses the rolled_at fallback window before reveal", () => {
    expect(
      resolveBuybackRate(pack, { rolled_at: ago(1_000), revealed_at: null }, NOW),
    ).toEqual({ percent: 95, rate_type: "instant" });
  });

  it("floors a below-flat pack rate at the flat rate inside the window", () => {
    expect(
      resolveBuybackRate({ buyback_percent: 80 }, { rolled_at: ago(1_000) }, NOW),
    ).toEqual({ percent: FLAT_PERCENT, rate_type: "instant" });
  });

  it("falls back to flat when the pack is gone or the rate is invalid", () => {
    expect(
      resolveBuybackRate(null, { rolled_at: ago(1_000) }, NOW).percent,
    ).toBe(FLAT_PERCENT);
    expect(
      resolveBuybackRate({ buyback_percent: 250 }, { rolled_at: ago(1_000) }, NOW)
        .percent,
    ).toBe(FLAT_PERCENT);
  });

  it("credits the FLAT vault rate after the reveal window", () => {
    expect(
      resolveBuybackRate(
        pack,
        { rolled_at: ago(120_000), revealed_at: ago(instantWindowMs() + 1) },
        NOW,
      ),
    ).toEqual({ percent: FLAT_PERCENT, rate_type: "vault" });
  });

  it("credits the FLAT vault rate past the grace cap even if revealed late", () => {
    expect(
      resolveBuybackRate(
        pack,
        { rolled_at: ago(revealGraceMs() + 1), revealed_at: new Date(NOW) },
        NOW,
      ),
    ).toEqual({ percent: FLAT_PERCENT, rate_type: "vault" });
  });

  it("treats an unparsable rolled_at as outside the window (flat rate)", () => {
    expect(
      resolveBuybackRate(pack, { rolled_at: "not-a-date" }, NOW),
    ).toEqual({ percent: FLAT_PERCENT, rate_type: "vault" });
  });
});

describe("buybackAmount", () => {
  it("computes FMV × percent to whole cents", () => {
    expect(buybackAmount(21.99, 92)).toBe(20.23);
    expect(buybackAmount(19.2, 100)).toBe(19.2);
    expect(buybackAmount(0, 90)).toBe(0);
  });

  it("rounds an exact half-cent up, where naive float math rounds down", () => {
    expect(buybackAmount(0.15, 90)).toBe(0.14);
    expect(buybackAmount(2.45, 90)).toBe(2.21);
    expect(buybackAmount(0.05, 90)).toBe(0.05);
  });
});

describe("instantWindowMs", () => {
  const KEY = "BUYBACK_INSTANT_WINDOW_MS";
  const saved = process.env[KEY];
  afterEach(() => {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  });

  it("defaults to a strict 30s", () => {
    delete process.env[KEY];
    expect(instantWindowMs()).toBe(30_000);
  });

  it("honors a valid env override and rejects invalid ones", () => {
    process.env[KEY] = "5000";
    expect(instantWindowMs()).toBe(5_000);
    process.env[KEY] = "0";
    expect(instantWindowMs()).toBe(30_000);
    process.env[KEY] = "soon";
    expect(instantWindowMs()).toBe(30_000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack yarn test:unit buyback-rate`
Expected: FAIL — `instantDeadlineMs` / `instantWindowMs` / `revealGraceMs` not exported and the signature mismatch.

- [ ] **Step 3: Rewrite `buyback-rate.ts`**

Overwrite `backend/packages/api/src/modules/packs/buyback-rate.ts`:

```typescript
// Which buyback rate applies to a pull — the single source of truth shared by
// the buyback workflow (what gets credited), the vault route, the reveal route,
// and the open quote. They must agree or the UI would quote one amount and
// credit another.
//
// Model: a sell within the INSTANT WINDOW gets the pack's instant rate
// (buyback_percent — the "sell on the spot" offer behind the 30s keep/sell
// countdown). The window is 30s from the card REVEAL (revealed_at), capped at
// rolled_at + GRACE so a delayed reveal ping can't extend it. Before the ping
// stamps revealed_at (e.g. the open quote, or if the ping fails) it falls back
// to rolled_at + window. After the window, every sell is at the FLAT rate.

export type BuybackRateType = "instant" | "vault";

export type BuybackRate = {
  /** % of current FMV credited (0–100). */
  percent: number;
  rate_type: BuybackRateType;
};

// Site-wide flat buyback rate: every vault sell, the floor a pack's instant
// rate must beat, and the fallback when the source pack was deleted.
export const FLAT_PERCENT = 90;

// Strict 30s instant window, anchored to revealed_at (see header).
const DEFAULT_WINDOW_MS = 30 * 1000;
// Hard ceiling from rolled_at: even a delayed reveal ping cannot push the
// instant window beyond this, so a client can't sit on the pre-card stages then
// ping late to start a fresh 30s arbitrarily far from the pull.
const DEFAULT_REVEAL_GRACE_MS = 5 * 60 * 1000;

// Env-tunable; invalid values fall back, never 0 (a 0ms window would silently
// kill the instant rate).
function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const floored = Math.floor(Number(raw));
  return Number.isSafeInteger(floored) && floored > 0 ? floored : fallback;
}

export const instantWindowMs = (): number =>
  envMs("BUYBACK_INSTANT_WINDOW_MS", DEFAULT_WINDOW_MS);

export const revealGraceMs = (): number =>
  envMs("BUYBACK_REVEAL_GRACE_MS", DEFAULT_REVEAL_GRACE_MS);

/**
 * Epoch ms when the instant rate expires for a pull. Reveal-anchored once the
 * ping has stamped revealed_at; otherwise rolled_at + window (the open quote,
 * before reveal, and the safe default if the ping never lands). Always capped at
 * rolled_at + grace. NaN for an unparsable rolled_at (treated as expired).
 */
export function instantDeadlineMs(
  rolledAt: Date | string,
  revealedAt: Date | string | null | undefined,
): number {
  const rolledMs = new Date(rolledAt).getTime();
  if (!Number.isFinite(rolledMs)) return NaN;
  const cap = rolledMs + revealGraceMs();
  if (revealedAt == null) return Math.min(rolledMs + instantWindowMs(), cap);
  const revealedMs = new Date(revealedAt).getTime();
  if (!Number.isFinite(revealedMs)) {
    return Math.min(rolledMs + instantWindowMs(), cap);
  }
  return Math.min(revealedMs + instantWindowMs(), cap);
}

// FMV × percent in INTEGER CENTS (naive float misrounds exact half-cents). The
// vault quote and the buyback credit MUST both go through this helper.
export function buybackAmount(marketValue: number, percent: number): number {
  const cents = Math.round(marketValue * 100);
  return Math.round((cents * percent) / 100) / 100;
}

const sanePercent = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

export function resolveBuybackRate(
  pack: { buyback_percent: unknown } | undefined | null,
  pull: { rolled_at: Date | string; revealed_at?: Date | string | null },
  nowMs: number = Date.now(),
): BuybackRate {
  const deadline = instantDeadlineMs(pull.rolled_at, pull.revealed_at ?? null);
  const isInstant = Number.isFinite(deadline) && nowMs <= deadline;

  // Floor the instant rate at flat: legacy rows predating admin validation must
  // never make selling now pay less than vaulting would.
  const percent = isInstant
    ? Math.max(sanePercent(pack?.buyback_percent) ?? FLAT_PERCENT, FLAT_PERCENT)
    : FLAT_PERCENT;

  return { percent, rate_type: isInstant ? "instant" : "vault" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack yarn test:unit buyback-rate`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add backend/packages/api/src/modules/packs/buyback-rate.ts backend/packages/api/src/modules/packs/__tests__/buyback-rate.unit.spec.ts
git commit -m "feat(packs): reveal-anchored strict-30s instant buyback window"
```

---

### Task C3: Thread `revealed_at` through the rate call sites

**Files:**
- Modify: `backend/packages/api/src/api/store/vault/route.ts` (~line 67)
- Modify: `backend/packages/api/src/workflows/steps/buyback-pull.ts` (~line 84)
- Modify: `backend/packages/api/src/modules/packs/service.ts` (`quoteBuyback`)

- [ ] **Step 1: Vault route**

Change the rate call to pass the pull's `revealed_at`:

```typescript
const { percent, rate_type } = resolveBuybackRate(pack, {
  rolled_at: p.rolled_at,
  revealed_at: p.revealed_at,
});
```

- [ ] **Step 2: Buyback workflow step**

Change:

```typescript
const { percent, rate_type } = resolveBuybackRate(pack, {
  rolled_at: pull.rolled_at,
  revealed_at: pull.revealed_at,
});
```

- [ ] **Step 3: `quoteBuyback` signature**

Replace the method so it takes a `pull` object instead of a bare `rolledAt`:

```typescript
  async quoteBuyback(
    packSlug: string,
    pull: { rolled_at: Date | string; revealed_at?: Date | string | null },
    marketValue: number,
    nowMs: number = Date.now()
  ): Promise<{ percent: number; amount: number; rate_type: BuybackRate["rate_type"] }> {
    const [pack] = await this.listPacks({ slug: packSlug }, { take: 1 });
    const { percent, rate_type } = resolveBuybackRate(pack, pull, nowMs);
    return { percent, amount: buybackAmount(marketValue, percent), rate_type };
  }
```

(The open route — its only caller — is updated in Task C6.)

- [ ] **Step 4: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS (the open route still passes the old args until C6 — do C6 in the same working session; if building between, temporarily it will type-error at the open route, which C6 fixes. To keep each commit green, stage C3+C6 together OR do C6 immediately after this step before committing.)

- [ ] **Step 5: Commit (with C6 done)**

Defer the commit until Task C6 compiles the open route, then:

```bash
git add backend/packages/api/src/api/store/vault/route.ts backend/packages/api/src/workflows/steps/buyback-pull.ts backend/packages/api/src/modules/packs/service.ts
git commit -m "refactor(packs): pass revealed_at into resolveBuybackRate/quoteBuyback"
```

---

### Task C4: `revealPull()` service method

**Files:**
- Modify: `backend/packages/api/src/modules/packs/service.ts`

- [ ] **Step 1: Add imports**

Ensure `service.ts` imports `instantDeadlineMs` from `./buyback-rate` (add to the existing buyback-rate import) and `MedusaError` from `@medusajs/framework/utils`:

```typescript
import { MedusaService, MedusaError } from "@medusajs/framework/utils";
```
```typescript
import {
  resolveBuybackRate,
  buybackAmount,
  instantDeadlineMs,
  type BuybackRate,
} from "./buyback-rate";
```

- [ ] **Step 2: Add the method**

```typescript
  // Stamp the first-seen time for a pull so the 30s instant window counts from
  // the reveal, not the pull. Idempotent: only the first call writes revealed_at;
  // later calls return the same deadline. Ownership enforced (a foreign/unknown
  // pull 404s — same error, no existence leak). The grace cap in instantDeadlineMs
  // means a late first call can't extend the window.
  async revealPull(
    pullId: string,
    customerId: string,
    nowMs: number = Date.now()
  ): Promise<{ instant_deadline_ms: number }> {
    const [pull] = await this.listPulls({ id: pullId }, { take: 1 });
    if (!pull || pull.customer_id !== customerId) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Pull '${pullId}' not found.`
      );
    }
    let revealedAt = pull.revealed_at as Date | null;
    if (revealedAt == null) {
      revealedAt = new Date(nowMs);
      await this.updatePulls([{ id: pull.id, revealed_at: revealedAt }]);
    }
    return { instant_deadline_ms: instantDeadlineMs(pull.rolled_at, revealedAt) };
  }
```

- [ ] **Step 3: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS.

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/modules/packs/service.ts
git commit -m "feat(packs): revealPull() stamps revealed_at, returns instant deadline"
```

---

### Task C5: Reveal route + rate limiter

**Files:**
- Create: `backend/packages/api/src/api/store/pulls/[id]/reveal/route.ts`
- Modify: `backend/packages/api/src/api/utils/rate-limit.ts`
- Modify: `backend/packages/api/src/api/middlewares.ts`

- [ ] **Step 1: Add the limiter factory**

Append to `rate-limit.ts` (next to `createVaultBuybackRateLimit`):

```typescript
/**
 * The pull-reveal limiter — scoped per customer. The reveal ping fires once per
 * pull and is DB-idempotent, so this only throttles hammering. Env-tunable:
 * PULL_REVEAL_RATE_BURST_LIMIT / PULL_REVEAL_RATE_BURST_WINDOW_MS (20/10s)
 * PULL_REVEAL_RATE_LIMIT / PULL_REVEAL_RATE_WINDOW_MS (60/60s)
 */
export function createPullRevealRateLimit(): MiddlewareHandler {
  return createEnvRateLimit({
    name: "pull-reveal",
    message: "Too many requests.",
    defaults: {
      burstLimit: 20,
      burstWindowMs: 10_000,
      limit: 60,
      windowMs: 60_000,
    },
  });
}
```

- [ ] **Step 2: Create the route**

`backend/packages/api/src/api/store/pulls/[id]/reveal/route.ts`:

```typescript
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { PACKS_MODULE } from "../../../../../modules/packs";
import type PacksModuleService from "../../../../../modules/packs/service";

// POST /store/pulls/:id/reveal — stamp the first-seen time for a pull so the
// 30s instant-sell window counts from the reveal, not the pull. Idempotent:
// only the first call stamps; later calls return the same deadline.
//
// AUTH + RATE LIMIT: registered in src/api/middlewares.ts (authenticate() then
// the pull-reveal limiter). The customer id comes ONLY from the verified token;
// ownership is enforced in revealPull (foreign/unknown pull ids 404).
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const result = await packs.revealPull(id, customerId);
  res.json(result);
}
```

- [ ] **Step 3: Register the middleware matcher**

In `middlewares.ts`: add `createPullRevealRateLimit` to the import from `./utils/rate-limit`, then add a matcher entry alongside the vault-buyback one:

```typescript
      {
        // Reveal ping (POST /store/pulls/:id/reveal).
        matcher: "/store/pulls/*/reveal",
        method: ["POST"],
        middlewares: [
          authenticate("customer", ["bearer"]),
          createPullRevealRateLimit(),
        ],
      },
```

(Match the exact object shape used by the surrounding entries — copy the `method` style from a neighbor; if neighbors omit `method`, omit it here too.)

- [ ] **Step 4: Build + codegen**

Run: `corepack yarn build` then `corepack yarn dev:codegen` (a new route path changed the generated types).
Expected: SUCCEEDS; `_generated` includes the new route.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/api/src/api/store/pulls backend/packages/api/src/api/utils/rate-limit.ts backend/packages/api/src/api/middlewares.ts backend/packages/api/.mercur
git commit -m "feat(store): POST /store/pulls/:id/reveal (rate-limited reveal ping)"
```

---

### Task C6: Open route returns vault fields + deadline

**Files:**
- Modify: `backend/packages/api/src/api/store/packs/[slug]/open/route.ts`

- [ ] **Step 1: Add the vault fields + deadline to the buyback payload**

Update the imports and the handler tail. Replace the `toMoney` import line with one that also pulls in the rate helpers, and rewrite the quote + response:

```typescript
import { toMoney } from '../../../../../modules/packs/money';
import {
  FLAT_PERCENT,
  buybackAmount,
  instantDeadlineMs,
} from '../../../../../modules/packs/buyback-rate';
```

```typescript
  const packsService = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const marketValue = toMoney(result.card.market_value);
  const buyback = await packsService.quoteBuyback(
    slug,
    { rolled_at: result.pull.rolled_at, revealed_at: result.pull.revealed_at },
    marketValue,
  );

  res.json({
    pull: result.pull,
    card: result.card,
    balance: result.balance,
    price: result.price,
    buyback: {
      ...buyback,
      // The flat rate that applies after the instant window — surfaced so the
      // reveal can offer a post-expiry "sell at flat" without recomputing.
      vault_percent: FLAT_PERCENT,
      vault_amount: buybackAmount(marketValue, FLAT_PERCENT),
      // Fallback instant deadline (rolled_at + window) for when the reveal ping
      // fails; the ping returns the authoritative, reveal-anchored deadline.
      instant_deadline_ms: instantDeadlineMs(result.pull.rolled_at, result.pull.revealed_at),
    },
  });
```

- [ ] **Step 2: Build the backend**

Run: `corepack yarn build`
Expected: SUCCEEDS (this also fixes the C3 `quoteBuyback` call-site break).

- [ ] **Step 3: Commit C3 + C6 together**

```bash
git add backend/packages/api/src/api/store/packs/[slug]/open/route.ts backend/packages/api/src/api/store/vault/route.ts backend/packages/api/src/workflows/steps/buyback-pull.ts backend/packages/api/src/modules/packs/service.ts
git commit -m "feat(store): open route returns vault rate/amount + instant deadline"
```

- [ ] **Step 4: Backend regression run**

Run: `corepack yarn test:unit`
Expected: PASS (credit-summary + buyback-rate suites green).

---

### Task C7: Storefront — extend `openPack` + add `revealPull` action

**Files:**
- Modify: `src/lib/data/schemas.ts` (`OpenBuybackSchema`)
- Modify: `src/lib/actions/packs.ts`

- [ ] **Step 1: Extend `OpenBuybackSchema`**

Replace `OpenBuybackSchema` in `schemas.ts` (extra fields optional so an older backend still validates):

```typescript
/** Open-route `buyback` offer — instant percent/amount (required) + the vault
 *  rate/amount and instant deadline (optional; older backends omit them). */
export const OpenBuybackSchema = z.looseObject({
  percent: finite,
  amount: finite,
  vault_percent: finite.optional(),
  vault_amount: finite.optional(),
  instant_deadline_ms: finite.optional(),
});
```

- [ ] **Step 2: Extend `OpenPackResult.buyback` + map the fields**

In `src/lib/actions/packs.ts`, update the `buyback` shape in `OpenPackResult` and the `BackendBuyback` interface and the mapping. The `OpenPackResult` buyback becomes:

```typescript
      buyback: {
        percent: number;
        amount: number;
        /** Flat vault rate/amount for the post-expiry sell; null if an older
         *  backend omitted them. */
        vaultPercent: number | null;
        vaultAmount: number | null;
        /** Fallback instant deadline (epoch ms) when the reveal ping fails. */
        instantDeadlineMs: number | null;
      } | null;
```

Update `BackendBuyback`:

```typescript
interface BackendBuyback {
  percent?: unknown;
  amount?: unknown;
  vault_percent?: unknown;
  vault_amount?: unknown;
  instant_deadline_ms?: unknown;
}
```

And the mapping (replace the existing `buyback:` line in the returned object):

```typescript
      buyback: offer
        ? {
            percent: offer.percent,
            amount: offer.amount,
            vaultPercent: offer.vault_percent ?? null,
            vaultAmount: offer.vault_amount ?? null,
            instantDeadlineMs: offer.instant_deadline_ms ?? null,
          }
        : null,
```

(Add `OpenBuybackSchema` is already imported in this file; no import change needed.)

- [ ] **Step 3: Add the `revealPull` action**

Append to `src/lib/actions/packs.ts`:

```typescript
export type RevealResult =
  | { ok: true; instantDeadlineMs: number }
  | { ok: false };

// Reveal ping — stamps revealed_at server-side so the 30s instant window counts
// from when the card is shown. Best-effort: any failure returns { ok: false }
// and the overlay falls back to the open response's deadline. The backend
// derives the customer from the bearer token; ownership is enforced there.
export async function revealPull(pullId: string): Promise<RevealResult> {
  if (typeof pullId !== 'string' || pullId.trim() === '') return { ok: false };
  const token = await getAuthToken();
  if (!token) return { ok: false };
  try {
    const data = await sdk.client.fetch<{ instant_deadline_ms?: unknown }>(
      `/store/pulls/${encodeURIComponent(pullId)}/reveal`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {},
      },
    );
    const ms = data?.instant_deadline_ms;
    return typeof ms === 'number' && Number.isFinite(ms)
      ? { ok: true, instantDeadlineMs: ms }
      : { ok: false };
  } catch (error) {
    logger.error(`[packs] reveal ping failed for '${pullId}':`, error);
    return { ok: false };
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (PackDetailClient will still typecheck — it reads `res.buyback?.percent` etc. which remain; the new fields are additive. The overlay wiring is updated in C10–C11).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/schemas.ts src/lib/actions/packs.ts
git commit -m "feat(packs): openPack carries vault rate/amount + deadline; add revealPull action"
```

---

### Task C8: Simplify `sell-countdown.ts` to a server deadline

**Files:**
- Modify (rewrite): `src/lib/sell-countdown.ts`
- Rewrite: `src/lib/__tests__/sell-countdown.test.ts`

- [ ] **Step 1: Rewrite the test**

Overwrite `src/lib/__tests__/sell-countdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELL_COUNTDOWN_SECS, sellSecondsLeft } from '@/lib/sell-countdown';

describe('SELL_COUNTDOWN_SECS', () => {
  it('is the strict 30s display window', () => {
    expect(SELL_COUNTDOWN_SECS).toBe(30);
  });
});

describe('sellSecondsLeft', () => {
  it('rounds partial seconds up and never goes below zero', () => {
    const now = 1_000_000;
    expect(sellSecondsLeft(now + 30_000, now)).toBe(30);
    expect(sellSecondsLeft(now + 1, now)).toBe(1); // partial rounds up
    expect(sellSecondsLeft(now, now)).toBe(0);
    expect(sellSecondsLeft(now - 5_000, now)).toBe(0); // never negative
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/sell-countdown.test.ts`
Expected: FAIL (the file still exports the old `sellOfferDeadlineMs`/`SELL_HARD_CAP_MS`; the test no longer imports them — this will pass only after Step 3 strips them, but run now to confirm the harness picks up the file).

- [ ] **Step 3: Rewrite the module**

Overwrite `src/lib/sell-countdown.ts`:

```typescript
// Keep/sell offer timing at the pack reveal — the deadline now comes from the
// server. POST /store/pulls/:id/reveal returns instant_deadline_ms (anchored to
// revealed_at, capped at rolled_at + grace); the open response carries a
// fallback deadline for when the ping fails. The client only formats the
// remaining seconds.

export const SELL_COUNTDOWN_SECS = 30;

/** Whole seconds remaining until the deadline — partial seconds round up, never below 0. */
export function sellSecondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/__tests__/sell-countdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sell-countdown.ts src/lib/__tests__/sell-countdown.test.ts
git commit -m "refactor(reveal): drive sell countdown from the server deadline"
```

---

### Task C9: `SellConfirmModal` component

**Files:**
- Create: `src/components/SellConfirmModal.tsx`

- [ ] **Step 1: Write the component**

`src/components/SellConfirmModal.tsx` (manual portal modal mirroring `AuthModal`'s focus-trap/Escape/backdrop pattern):

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { X } from 'lucide-react';
import { usd } from '@/lib/format';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Confirm-before-sell dialog, shared by the pack reveal and the vault grid.
// `rateType` switches the copy between the on-reveal instant offer (with a live
// countdown) and the flat vault rate. Accessibility mirrors AuthModal: focus
// moves into the panel, Tab is trapped, Escape + backdrop close, focus restores.
export default function SellConfirmModal({
  open,
  cardName,
  image,
  fmv,
  rateType,
  percent,
  netCredit,
  secondsLeft,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  cardName: string;
  image: string;
  fmv: number;
  rateType: 'instant' | 'flat';
  percent: number;
  netCredit: number;
  secondsLeft?: number;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busy) onCancel();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const f = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => !busy && onCancel()}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm sell-back"
        tabIndex={-1}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 p-6 shadow-2xl shadow-black/60 outline-none"
      >
        <button
          type="button"
          onClick={() => !busy && onCancel()}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <div className="flex items-center gap-3">
          <Image
            src={image}
            alt={cardName}
            width={56}
            height={78}
            className="h-[78px] w-auto rounded-md object-contain"
          />
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-white">
              Sell this card?
            </h2>
            <p className="truncate text-[13px] text-white/60">{cardName}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-white/55">Market value</dt>
            <dd className="text-white/85">{usd(fmv)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-white/55">
              {rateType === 'instant' ? 'Instant rate' : 'Vault rate'}
            </dt>
            <dd className="text-white/85">{percent}%</dd>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2">
            <dt className="font-semibold text-white">You receive</dt>
            <dd className="font-bold text-emerald-300">{usd(netCredit)}</dd>
          </div>
        </dl>

        <p className="mt-3 text-[12px] text-white/45">
          {rateType === 'instant' && typeof secondsLeft === 'number'
            ? `Instant offer — ${secondsLeft}s left. `
            : ''}
          Selling is permanent: the card leaves your vault and the amount is
          credited to your site balance.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-amber-400 text-sm font-bold text-neutral-950 transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? 'Selling…' : `Sell for ${usd(netCredit)}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/SellConfirmModal.tsx
git commit -m "feat(sell): shared SellConfirmModal (instant + flat rate copy)"
```

---

### Task C10: Wire reveal overlay — ping, deadline countdown, post-expiry flat sell, modal

**Files:**
- Modify: `src/app/claw/[slug]/PackOpenOverlay.tsx`

- [ ] **Step 1: Update the `buyback` prop type + add `onReveal`**

In the props type, replace the `buyback` shape and add `onReveal`:

```typescript
  /** Sell-back offer for THIS pull; null for demo spins. */
  buyback?: {
    pullId: string;
    percent: number;
    amount: number;
    /** Flat vault rate/amount for the post-expiry sell. */
    vaultPercent: number;
    vaultAmount: number;
    /** Fallback instant deadline (epoch ms) if the reveal ping fails. */
    instantDeadlineMs: number;
  } | null;
  onSellBack?: (
    pullId: string,
  ) => Promise<
    | { ok: true; amount: number; percent: number; balance: number }
    | { ok: false; error: string; needsAuth?: boolean }
  >;
  /** Reveal ping — stamps revealed_at server-side and returns the authoritative
   *  instant deadline. Best-effort; on failure the open-response deadline is used. */
  onReveal?: (
    pullId: string,
  ) => Promise<{ ok: true; instantDeadlineMs: number } | { ok: false }>;
```

Add `onReveal` to the destructured params and remove `openedAtMs` usages.

- [ ] **Step 2: Replace the deadline state + countdown effect**

Replace the existing `sellDeadline`/`secondsLeft` block (the `useRef`/`useEffect` that called `sellOfferDeadlineMs`) with a deadline driven by the reveal ping + a confirm-modal state:

```typescript
  // Deadline for the instant offer: the reveal ping returns the authoritative,
  // reveal-anchored value; until it resolves (or if it fails) we use the
  // open-response fallback. Wall-clock based so background-tab throttling can't
  // stretch it.
  const [deadlineMs, setDeadlineMs] = useState<number | null>(
    buyback ? buyback.instantDeadlineMs : null,
  );
  const [secondsLeft, setSecondsLeft] = useState(SELL_COUNTDOWN_SECS);
  const sellExpired = secondsLeft <= 0;
  const revealPinged = useRef(false);
  // Confirm-before-sell dialog.
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Fire the reveal ping ONCE when the card is shown, then drive the deadline
  // from its result (falling back to the open-response deadline on failure).
  useEffect(() => {
    if (stage !== 'card' || !buyback || revealPinged.current) return;
    revealPinged.current = true;
    if (!onReveal) return;
    let cancelled = false;
    onReveal(buyback.pullId).then((r) => {
      if (!cancelled && r.ok) setDeadlineMs(r.instantDeadlineMs);
    });
    return () => {
      cancelled = true;
    };
  }, [stage, buyback, onReveal]);

  // Tick the visible countdown to the server deadline.
  useEffect(() => {
    if (stage !== 'card' || deadlineMs === null) return;
    if (sell.phase === 'sold') return;
    const tick = () => setSecondsLeft(sellSecondsLeft(deadlineMs, Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [stage, deadlineMs, sell.phase]);
```

Update the `sell-countdown` import to the new surface:

```typescript
import { SELL_COUNTDOWN_SECS, sellSecondsLeft } from '@/lib/sell-countdown';
```

- [ ] **Step 3: Gate `handleSellBack` on the modal, not direct click**

Keep `handleSellBack` as the actual sell call but allow it whether instant or expired (the server decides the rate). Change its guard from `sellExpired` rejection to just in-flight/sold guards:

```typescript
  async function handleSellBack() {
    if (
      !buyback ||
      !onSellBack ||
      sell.phase === 'selling' ||
      sell.phase === 'sold'
    )
      return;
    setSell({ phase: 'selling' });
    try {
      const res = await onSellBack(buyback.pullId);
      if (res.ok) {
        setSell({ phase: 'sold', amount: res.amount, balance: res.balance });
        setConfirmOpen(false);
      } else {
        setSell({ phase: 'error', message: res.error });
      }
    } catch {
      setSell({
        phase: 'error',
        message: 'Something went wrong. Please try again.',
      });
    }
  }
```

- [ ] **Step 4: Replace the card-stage sell CTAs + render the modal**

In the card stage, replace the sell-button / keep-in-vault / expiry-note block (the JSX that rendered `Sell back for $… · Ns`, the `Keep in vault`/`Continue` button, and the expiry note) with the instant-or-flat affordance that opens the modal. The instant button shows while the window runs; after expiry a flat-rate sell button appears; both open the confirm modal:

```tsx
                {/* Real pull: sell now (instant while the window runs, flat
                    after) — both go through the confirm modal. Demo spins have
                    no offer. */}
                {buyback && sell.phase !== 'sold' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(true)}
                      disabled={sell.phase === 'selling'}
                      className="inline-flex h-12 w-[300px] items-center justify-center rounded-xl border border-amber-400/60 bg-amber-400/10 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-400/20 disabled:opacity-60"
                    >
                      {sell.phase === 'selling'
                        ? 'Selling…'
                        : sellExpired
                          ? `Sell for $${buyback.vaultAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${buyback.vaultPercent}%)`
                          : `Sell back for $${buyback.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${buyback.percent}%) · ${secondsLeft}s`}
                    </button>
                    <p className="max-w-[300px] text-center text-[11px] text-white/45">
                      {sellExpired
                        ? `Instant offer expired — this card is in your vault and sells at the flat ${buyback.vaultPercent}% rate.`
                        : `Or keep it: vaulted cards sell anytime at the flat ${buyback.vaultPercent}% rate.`}
                    </p>
                  </>
                )}
                {sell.phase === 'sold' && (
                  <p className="flex h-12 w-[300px] items-center justify-center rounded-xl border border-emerald-400/50 bg-emerald-400/10 text-sm font-bold text-emerald-300">
                    +$
                    {sell.amount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    credited · balance $
                    {sell.balance.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
                {sell.phase === 'error' && (
                  <p className="max-w-[300px] text-center text-[12px] font-medium text-red-400">
                    {sell.message}
                  </p>
                )}
```

Keep the existing `onSignUp` demo CTA block and the `Continue` / `Open another` buttons as they are (the `Continue` button already closes the overlay — keeping the card in the vault). Then, just before the closing `</div>` of the card stage (or anywhere inside the overlay root), render the modal:

```tsx
        {buyback && (
          <SellConfirmModal
            open={confirmOpen}
            cardName={card.name}
            image={card.image}
            fmv={reveal_fmv_placeholder /* see note */}
            rateType={sellExpired ? 'flat' : 'instant'}
            percent={sellExpired ? buyback.vaultPercent : buyback.percent}
            netCredit={sellExpired ? buyback.vaultAmount : buyback.amount}
            secondsLeft={sellExpired ? undefined : secondsLeft}
            busy={sell.phase === 'selling'}
            onConfirm={handleSellBack}
            onCancel={() => setConfirmOpen(false)}
          />
        )}
```

**FMV note:** the overlay does not currently receive a numeric FMV (only `card.value` string). Pass the FMV through by reading it from the buyback context: use `buyback.amount` is net, not FMV. To show FMV accurately, add `fmv: number` to the `buyback` prop in C11 (PackDetailClient already has `reveal.marketValue`). Replace `reveal_fmv_placeholder` with `buyback.fmv` and add `fmv: number` to the overlay `buyback` type in Step 1. (Update C11 mapping to include `fmv: reveal.marketValue`.)

- [ ] **Step 5: Import the modal**

Add at the top of `PackOpenOverlay.tsx`:

```typescript
import SellConfirmModal from '@/components/SellConfirmModal';
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS once C11 supplies the new `buyback` fields (`vaultAmount`, `instantDeadlineMs`, `fmv`). If typecheck runs before C11, expect errors at the PackDetailClient call site — proceed to C11, then re-run.

- [ ] **Step 7: Commit (with C11)**

Defer commit until C11 supplies the props; commit both together.

---

### Task C11: PackDetailClient — map new fields + pass `onReveal`

**Files:**
- Modify: `src/app/claw/[slug]/PackDetailClient.tsx`

- [ ] **Step 1: Extend the reveal state type**

Add `vaultAmount` + `instantDeadlineMs` to the `reveal` state object type (keep `buybackPercent`/`buybackAmount`; drop reliance on `openedAt` for the offer — it can stay for other uses or be removed if unused):

```typescript
  buybackPercent: number | null;
  buybackAmount: number | null;
  vaultPercent: number | null;
  vaultAmount: number | null;
  instantDeadlineMs: number | null;
```

- [ ] **Step 2: Map the new fields in `handleOpenPack`**

In the `setReveal({...})` call, add:

```typescript
      buybackPercent: res.buyback?.percent ?? null,
      buybackAmount: res.buyback?.amount ?? null,
      vaultPercent: res.buyback?.vaultPercent ?? null,
      vaultAmount: res.buyback?.vaultAmount ?? null,
      instantDeadlineMs: res.buyback?.instantDeadlineMs ?? null,
```

- [ ] **Step 3: Build the overlay `buyback` prop + pass `onReveal`**

Import `revealPull` next to `sellBackPull`:

```typescript
import { revealPull } from '@/lib/actions/packs';
```

Replace the `<PackOpenOverlay … buyback={…} onSellBack={…} … />` buyback wiring with the server-authoritative values (fallbacks only for an older backend):

```tsx
    buyback={
      reveal.pullId !== null && reveal.marketValue !== null
        ? {
            pullId: reveal.pullId,
            fmv: reveal.marketValue,
            percent:
              reveal.buybackPercent ??
              active.buybackPercent ??
              FLAT_BUYBACK_PERCENT,
            amount:
              reveal.buybackAmount ??
              Math.round(
                reveal.marketValue *
                  (active.buybackPercent ?? FLAT_BUYBACK_PERCENT),
              ) / 100,
            vaultPercent: reveal.vaultPercent ?? FLAT_BUYBACK_PERCENT,
            vaultAmount:
              reveal.vaultAmount ??
              Math.round(reveal.marketValue * FLAT_BUYBACK_PERCENT) / 100,
            instantDeadlineMs:
              reveal.instantDeadlineMs ?? Date.now() + 30_000,
          }
        : null
    }
    onSellBack={sellBackPull}
    onReveal={revealPull}
```

(Add `fmv: number` to the overlay's `buyback` prop type in C10 Step 1 to match.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: SUCCEEDS.

- [ ] **Step 5: Commit C10 + C11**

```bash
git add "src/app/claw/[slug]/PackOpenOverlay.tsx" "src/app/claw/[slug]/PackDetailClient.tsx"
git commit -m "feat(reveal): confirm modal + post-expiry flat sell + reveal-anchored countdown"
```

---

### Task C12: Vault grid — confirm before sell

**Files:**
- Modify: `src/app/(account)/vault/VaultClient.tsx`

- [ ] **Step 1: Add modal state + import**

At the top, import the modal and add a pending-item state:

```typescript
import SellConfirmModal from '@/components/SellConfirmModal';
```
```typescript
  const [confirmItem, setConfirmItem] = useState<VaultItem | null>(null);
```

- [ ] **Step 2: Open the modal from the Sell button**

Change the Sell button's `onClick` from `() => sell(item)` to `() => setConfirmItem(item)` (leave the rest of the button as-is):

```tsx
              <button
                type="button"
                onClick={() => setConfirmItem(item)}
                disabled={sellingId !== null}
                className="mt-2.5 inline-flex h-9 items-center justify-center rounded-lg border border-amber-400/60 bg-amber-400/10 text-[12px] font-bold text-amber-300 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
              >
                {sellingId === item.pullId
                  ? 'Selling…'
                  : `Sell for ${usd(item.buyback.amount)} (${item.buyback.percent}%)`}
              </button>
```

- [ ] **Step 3: Confirm-then-sell + render the modal**

Add a handler that runs the existing `sell()` then closes, and render the modal once at the end of the component (before the closing fragment):

```tsx
        {confirmItem && (
          <SellConfirmModal
            open
            cardName={confirmItem.card.name}
            image={confirmItem.card.image}
            fmv={confirmItem.card.marketValue}
            rateType="flat"
            percent={confirmItem.buyback.percent}
            netCredit={confirmItem.buyback.amount}
            busy={sellingId === confirmItem.pullId}
            onConfirm={async () => {
              const item = confirmItem;
              await sell(item);
              setConfirmItem(null);
            }}
            onCancel={() => setConfirmItem(null)}
          />
        )}
```

(`sell()` already manages `sellingId`, removes the item, updates balance, and surfaces errors — no change to it.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: SUCCEEDS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(account)/vault/VaultClient.tsx"
git commit -m "feat(vault): confirm modal before sell-back"
```

---

### Task C13: End-to-end verification

- [ ] **Step 1: Backend tests + build**

From `backend/packages/api`: `corepack yarn test:unit && corepack yarn build`
Expected: PASS (credit-summary + buyback-rate green); build SUCCEEDS.

- [ ] **Step 2: Storefront tests + build**

From repo root: `npm test && npm run build`
Expected: vitest PASS (transactions + sell-countdown); build SUCCEEDS.

- [ ] **Step 3: Live reveal flow (standalone + backend running)**

Start the backend (`corepack yarn dev`, `:9000`), serve the storefront standalone on `:4000`. Log in as the dev customer with credits, open a pack, and at the card reveal:
- Confirm the button reads `Sell back for $X (instant%) · {N}s` and the countdown ticks down (verify via Playwright snapshot/network: a `POST /store/pulls/<id>/reveal` fires once on card show and returns `instant_deadline_ms`).
- Click Sell → the `SellConfirmModal` opens with FMV / instant rate / net credit and the seconds-left line. Cancel keeps the overlay; the countdown keeps ticking.
- Let the countdown hit 0 (or set `BUYBACK_INSTANT_WINDOW_MS=3000` on the backend for a fast test) → the button switches to `Sell for $Y (90%)` and the note says the instant offer expired. Confirm → flat credit; sold state shows the actual credited amount.
Screenshot the modal to `docs/research/phase1-reveal-sell-modal.png` and read it back.

- [ ] **Step 4: Vault sell modal**

Navigate to `/vault`, click Sell on a card → modal opens (flat rate) → Confirm removes the card and updates the credit balance; Cancel leaves it. Screenshot `docs/research/phase1-vault-sell-modal.png`.

- [ ] **Step 5: Transactions reflects the activity**

Navigate to `/transactions` → the top-up, pack open (−), and sell-back (+) rows appear with a running Balance column and the three totals cards are populated.

- [ ] **Step 6: Final regression**

From repo root: `npm run check` (lint + typecheck + build). From `backend/packages/api`: `corepack yarn build`.
Expected: all green. Reset any temporary `BUYBACK_INSTANT_WINDOW_MS` override.

---

## Self-Review

**Spec coverage:**
- 1.1 Remove four tabs → Tasks A1–A4 (nav entries, social link, route deletions, verify). ✓
- 1.2 Earnings → Transactions (real ledger, summary cards, table, util, unit test) → B1–B6 + backend lifetime totals. ✓
- 1.3 Sell-confirm modal at both points → C9 (modal), C10 (reveal), C12 (vault). ✓
- 1.3 Strict-30s server-stamped reveal ping (revealed_at, POST reveal, rate change, deadline anchoring, fallback) → C1–C8, C10–C11. ✓
- Data model: `Pull.revealed_at` (Phase 1) → C1. ✓
- API: extend `/store/credits` read (B3–B4); `POST /store/pulls/:id/reveal` (C5); open payload `+ vault_percent/vault_amount/instant_deadline_ms` (C6). ✓

**Placeholder scan:** One intentional marker — `reveal_fmv_placeholder` in C10 Step 4 — is resolved in the same step's FMV note and in C11 Step 3 (`fmv: reveal.marketValue` + `fmv` added to the overlay `buyback` type). No other TBD/TODO.

**Type consistency:**
- `resolveBuybackRate(pack, { rolled_at, revealed_at }, nowMs)` — new object signature used identically in C2 (def), C3 (vault route + buyback step), and via `quoteBuyback` (C3/C6). ✓
- `instantDeadlineMs(rolledAt, revealedAt)` — defined C2, used in `revealPull` (C4) and the open route (C6). ✓
- Overlay `buyback` shape (`pullId, percent, amount, vaultPercent, vaultAmount, instantDeadlineMs, fmv`) — defined C10 Step 1, supplied C11 Step 3. ✓
- `revealPull` action returns `{ ok: true; instantDeadlineMs } | { ok: false }` (C7), consumed by overlay `onReveal` (C10). ✓
- `CreditTxn` type (C4) consumed by `transactions.ts` (B5) and the page (B6). ✓
- `creditSummary` returns `{ balance, topupTotal, spendTotal }` (B2), mapped to `topup_total`/`spend_total` JSON (B3), read back via `CreditsSchema` (B4). ✓

**Scope:** Phase 1 only; delivery/showcase are separate plans per the spec's phasing.
