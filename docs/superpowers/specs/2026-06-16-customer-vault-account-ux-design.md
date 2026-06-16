# Customer Vault & Account UX Overhaul — Design

- **Date:** 2026-06-16
- **Status:** Draft (awaiting spec review)
- **Branch:** `claude/objective-jones-e7c892`
- **Owner:** Elston

## Summary

Improve customer-facing account UX across the storefront, backend, and admin
dashboard. Five concrete changes plus supporting infrastructure, sequenced into
three independently shippable phases:

1. **Account cleanup** — remove four unused settings tabs, rename Earnings →
   Transactions (real credit ledger), add sell-confirmation modals at both sell
   points, and tighten the instant-sell window to a strict 30s.
2. **Vault showcase / privacy** — vaulted cards are private by default; customer
   opts individual cards in to a public profile showcase.
3. **Delivery & Orders** — customer requests physical delivery of vaulted cards
   (batch, address captured, no charge in v1); admin tracks and fulfills.

## Goals

- Vaulted cards default to private; the public profile shows only what the
  customer explicitly showcases.
- Customers can sell vaulted cards with an explicit confirmation step, and can
  request physical delivery of cards they keep.
- Admins can see and manage delivery orders.
- Trim the account surface to features that actually exist in this product.

## Non-Goals (v1)

- Shipping-fee pricing/charging (schema leaves room; logic deferred — "price
  later").
- Carrier integration / automated label printing (admin enters tracking
  manually).
- Reworking the pack-open reveal animation (only the sell affordances change).
- Restoring or replacing the removed tabs' functionality (lending, messaging,
  PokéCoin, accelerate-claim are dropped, not reimplemented).

## Current State (verified)

| Area | File(s) | Today |
|---|---|---|
| Vault | `src/app/(account)/vault/VaultClient.tsx`, `src/lib/actions/vault.ts` | Lists vaulted pulls; one-click `sellBackPull` (no confirm). Already customer-scoped/private. No showcase concept. |
| Vault model | `backend/.../modules/packs/models/pull.ts` | `Pull` with `status: ["vaulted","bought_back"]`. No visibility/showcase field, no delivery fields. |
| Reveal sell | `src/app/claw/[slug]/PackOpenOverlay.tsx`, `src/lib/sell-countdown.ts` | 30s **visible** countdown (wall-clock, hard-capped 75s from open). During window: instant-rate sell button. On expiry: button **hidden**, only "Continue" + "card is in your vault, sells at flat %". No confirm modal. |
| Buyback rate | `backend/.../modules/packs/buyback-rate.ts` | `resolveBuybackRate(pack, rolled_at)`: instant `buyback_percent` if `now - rolled_at <= window`; else `FLAT_PERCENT` (90). Window default **90s** (env `BUYBACK_INSTANT_WINDOW_MS`), with grace so a slow user never sees instant but gets flat. |
| Open action | `src/lib/actions/packs.ts` | Returns `buyback: { percent, amount }` only. |
| Profile | `src/app/profile/[user]/`, `src/lib/data/profiles.ts`, `GET /store/profiles/:handle` | Public; Collection shows **all** pulls (card metadata only). No way to choose. |
| Settings nav | `src/components/account/AccountSidebar.tsx` | 12 tabs incl. Messages, Borrow/Lend, PokéCoin, Accelerate Claim, Earnings. |
| Orders tab | `src/app/(account)/orders/page.tsx` | Reads **stock Medusa** orders (`getOrders()`); effectively empty (pack checkout never wired). |
| Credits | `GET /store/credits`, `src/lib/actions/vault.ts` | Returns balance + recent ~50 transactions; frontend currently parses **balance only** (`BalanceSchema`). Txn reasons: `topup`, `pack_open`, `buyback`, `adjustment`. |
| Admin | `backend/apps/admin/src/routes/*`, `lib/queries.ts`, `lib/query-keys.ts` | Sections: cards, packs, economy, pulls, support. No orders/delivery page. RQ seam: `qk` factory + `useQuery`/`useMutation` with `invalidateQueries`. |
| Delivery | — | Does not exist anywhere (no model, route, address, or UI). |

---

## Phase 1 — Account Cleanup *(frontend + small backend)*

### 1.1 Remove four settings tabs

Remove from `AccountSidebar.tsx` and delete the route directory each entry links
to: **Messages, Borrow/Lend, PokéCoin, Accelerate Claim**.

- Verify each sidebar `href` at implementation time — at least `/borrow-lend`
  also exists as a top-level marketing page distinct from the account tab. Only
  the **account** routes/entries are removed; a shared marketing page stays
  unless separately requested.
- Grep for inbound links to the removed routes and fix/remove dangling
  references. Git history restores them if ever wanted (no feature flag).

### 1.2 Earnings → Transactions

- Rename route `src/app/(account)/earnings/` → `.../transactions/`; sidebar
  label "Transactions". (Internal account page; no SEO/redirect concern, but add
  a redirect from `/earnings` if any external bookmark risk is identified.)
- Replace mock earnings content with the **real credit ledger** from
  `GET /store/credits` (already returns balance + recent transactions).
- New data seam: a `getTransactions()` server action (in `actions/vault.ts` or a
  new `actions/credits.ts`) + a `CreditTransactionSchema` validating ledger rows
  `{ id, amount, reason, reference?, created_at }`. Extend the `/store/credits`
  response read — the rows are already returned, only the frontend parse is
  balance-only today.
- UI:
  - Summary cards: **Current balance · Total topped up · Total spent**.
  - Table: date · type label (`Top-up +`, `Pack open −`, `Sell-back +`,
    `Adjustment ±`) · signed amount · running balance.
  - A small pure util maps `reason → {label, sign}` and computes running
    balance — unit-tested (this is the genuine logic in the phase).

### 1.3 Sell-confirmation modal (both sell points) + strict 30s window

Neither the reveal nor the vault confirms before selling today. Add one shared
component.

- **`SellConfirmModal`** (new, `src/components/`): props `{ cardName, image,
  fmv, rateType: 'instant'|'flat', percent, netCredit, secondsLeft?, onConfirm,
  onCancel }`. Shows card, FMV, which rate applies, net credit, a "this is
  permanent" warning. Confirm → caller's sell handler; Cancel → close.
- **Vault** (`VaultClient.tsx`): Sell button opens the modal (`flat` rate) →
  Confirm calls existing `sellBackPull`. No backend change.
- **Reveal** (`PackOpenOverlay.tsx`):
  - During the countdown: Sell button opens the modal (`instant` rate, shows
    `secondsLeft`). **The countdown keeps running while the modal is open**
    (wall-clock; modal reads the same deadline). If the window expires while the
    modal is open, the modal swaps to the `flat` rate state (it does not silently
    confirm at the wrong rate).
  - **After expiry**: instead of hiding the sell affordance (today's behavior),
    show a **`Sell for $Y (flat %)`** button + **"Add to vault"**. The flat sell
    routes through the same `sellBackPull` (the backend already credits the flat
    rate post-window).
- **Strict 30s from card-reveal, server-stamped** (user decision): the instant
  window is exactly 30s and starts when the card is **revealed**, not when it was
  pulled — stamped server-side so the visible countdown and the credited rate
  always agree, and animation/lingering never eats into the 30s.
  - `Pull + revealed_at (dateTime, nullable)`.
  - `POST /store/pulls/:id/reveal` — customer-scoped; stamps
    `revealed_at = now()` on the **first** call only (idempotent; later calls
    return the existing deadline). Honored only if
    `now - rolled_at <= BUYBACK_REVEAL_GRACE_MS` (hard ceiling, default 5 min) —
    past that the instant rate is already gone (prevents a client from delaying
    the ping to start its 30s arbitrarily late). Returns `{ instantDeadlineMs }`.
  - Window resolution (`buyback-rate.ts`): instant if
    `now <= min(revealed_at + 30s, rolled_at + REVEAL_GRACE)`. If `revealed_at`
    is null (reduced-motion jump, ping failed, or a card already in the vault)
    fall back to `rolled_at + 30s`. Env: `BUYBACK_INSTANT_WINDOW_MS=30000`
    (per-reveal window) + `BUYBACK_REVEAL_GRACE_MS` (ceiling).
    `resolveBuybackRate` takes `{ rolled_at, revealed_at }` and is shared by the
    reveal route, the vault quote, and the buyback workflow so all three agree.
  - Client (`PackOpenOverlay.tsx`): when the card stage mounts, fire the reveal
    ping once and drive the countdown from the returned `instantDeadlineMs`. On
    ping failure fall back to the open response's `rolled_at + 30s` deadline so
    the countdown still works. `sell-countdown.ts` counts to the server deadline
    (drop the `cardShownAt + 30s` anchor and the 75s cap); update its unit tests.
  - Open route + `openPack` action also return `vaultPercent` + `vaultAmount`
    (cent-accurate `buybackAmount(fmv, FLAT_PERCENT)`) for the post-expiry flat
    sell, plus a fallback `rolled_at`-based deadline.
- The sold-state already shows the actual credited amount returned by the
  backend — keep that (authoritative).

### Phase 1 testing
- Unit: `reason → {label, sign}` + running-balance util; updated
  `sell-countdown` tests for deadline-anchored countdown.
- Playwright: sell modal open/confirm/cancel at vault and reveal; reveal
  post-expiry flat-sell path; transactions page renders ledger.

---

## Phase 2 — Vault Showcase / Privacy *(backend + frontend)*

### 2.1 Model
- Add `showcased: boolean (default false)` to `Pull` + migration. (Cards are
  already private; this makes showcasing opt-in.)

### 2.2 API
- `POST /store/vault/:id/showcase` — customer-scoped toggle (body
  `{ showcased: boolean }`); 403 on a pull the caller doesn't own, reject
  non-`vaulted` pulls.
- `GET /store/profiles/:handle` Collection now returns **showcased pulls only**.
  Default-empty until the customer opts in (intended).
- **Activity feed stays = all recent pulls** (it is activity, not a showcase).
  Resolved: ungated (see Decisions Made).

### 2.3 Frontend
- Vault: per-card "Feature on profile" toggle (star/eye affordance) with a
  showcased vs private visual state; optimistic update + revert on failure.
- Profile Collection renders the showcased set; empty state copy when none.

### Phase 2 testing
- Backend integration: showcase toggle ownership guard + non-vaulted rejection;
  profile returns only showcased.
- Playwright: vault toggle reflects on profile.

---

## Phase 3 — Delivery & Orders *(backend + admin + storefront)*

### 3.1 Model
- New `DeliveryOrder`: `id`, `customer_id`, `status` enum
  `["requested","packing","shipped","delivered","canceled"]`, address snapshot
  (denormalized from the Medusa customer address book at request time),
  `tracking_number` (nullable), `shipping_fee` (nullable — price-later),
  `created_at`, `shipped_at` (nullable), `delivered_at` (nullable).
- New `DeliveryOrderItem` join: `delivery_order_id`, `pull_id` (batch: one order
  → many pulls).
- Extend `Pull.status` enum → `["vaulted","bought_back","delivering","delivered"]`.
  Pulls in an active order are `delivering` (leave the vault, can't be sold);
  on delivery they become `delivered`; on order cancel they revert to `vaulted`.

### 3.2 Workflow
- `requestDeliveryWorkflow(customer_id, pull_ids[], address_id)`: validate every
  pull is owned + `vaulted`; snapshot the chosen address; create the order +
  items; flip pulls to `delivering`. Compensation reverts pull status and deletes
  the order on failure. Reject empty selection / already-`delivering`/sold pulls.
- Admin transitions: `packing` → `shipped` (requires tracking) → `delivered`
  (pulls → `delivered`); `canceled` (pulls → `vaulted`).

### 3.3 Storefront
- Vault: multi-select mode → "Request delivery" → address step (select / add /
  **edit** via the **Medusa customer address book**, store address routes) →
  review selected cards + address → submit (`POST /store/delivery-orders`).
- Orders tab: replace the stock-Medusa `getOrders()` read with
  `GET /store/delivery-orders` — list the customer's delivery orders with status,
  item thumbnails, and tracking.
- Edit shipping address on an order: while status is `requested` or `packing`
  (not yet `shipped`), the customer can update that order's snapshot via
  `PATCH /store/delivery-orders/:id` (address only). The snapshot stays
  denormalized so editing the address book later never rewrites a shipped order.

### 3.4 Admin
- New page `backend/apps/admin/src/routes/orders/` (RouteConfig nav entry, Truck
  icon), wired through the existing `lib/queries.ts` + `qk` factory pattern.
- Backend admin routes: `GET /admin/delivery-orders` (filter by status),
  `GET /admin/delivery-orders/:id` (detail: items, address, customer),
  `PATCH /admin/delivery-orders/:id` (status + tracking).
- Query hooks: `useDeliveryOrders(status?)`, `useUpdateDeliveryOrder()` with
  `invalidateQueries`; add `qk.deliveryOrders` / `qk.deliveryOrder(id)`.

### Phase 3 testing
- Backend integration: request-delivery ownership guard, status-transition
  rules, compensation, idempotency; pull leaves vault when `delivering`.
- Playwright: storefront request flow (multi-select → address → submit → Orders
  tab shows it); admin orders page list/detail/status update.

---

## Data Model Changes (summary)

| Model | Change | Phase |
|---|---|---|
| `Pull` | `+ revealed_at dateTime nullable` | 1 |
| `Pull` | `+ showcased boolean default false` | 2 |
| `Pull` | `status` enum `+ "delivering" + "delivered"` | 3 |
| `DeliveryOrder` | new model | 3 |
| `DeliveryOrderItem` | new join model | 3 |

## API Surface (summary)

| Route | Phase | Purpose |
|---|---|---|
| `GET /store/credits` (extend frontend read) | 1 | ledger rows for Transactions |
| `POST /store/pulls/:id/reveal` | 1 | server-stamp reveal time; returns instant deadline |
| open route + `openPack` action `buyback` payload `+ vaultPercent, vaultAmount, fallback deadline` | 1 | post-expiry flat sell + reveal-ping fallback |
| `POST /store/vault/:id/showcase` | 2 | toggle showcase |
| `PATCH /store/delivery-orders/:id` | 3 | customer edits address (pre-ship) |
| `GET /store/profiles/:handle` (filter) | 2 | showcased-only Collection |
| `POST /store/delivery-orders` | 3 | request batch delivery |
| `GET /store/delivery-orders` | 3 | customer's orders |
| `GET /admin/delivery-orders` | 3 | admin list (status filter) |
| `GET /admin/delivery-orders/:id` | 3 | admin detail |
| `PATCH /admin/delivery-orders/:id` | 3 | status + tracking |

## Decisions Made

- **Delivery model:** batch cart (multi-select → one order/address/shipment).
- **Shipping cost:** capture address only in v1; `shipping_fee` nullable, no
  charge logic yet.
- **Sequencing:** phased (cleanup → showcase → delivery); each phase its own
  implementation plan.
- **Instant window:** strict 30s, **server-stamped from card-reveal** via a
  reveal ping (`revealed_at`), capped by `BUYBACK_REVEAL_GRACE_MS`. Full 30s from
  reveal, what-you-see = what-you-get, replay-safe.
- **Activity feed:** stays **ungated** (shows all recent pulls); only the profile
  Collection is showcase-gated.
- **Address:** reuse the Medusa customer address book; customer can add / edit /
  select, and edit an order's address snapshot until it ships.
- **Removed tabs:** delete the account routes outright (git history restores).

## Resolved at Review

All open items resolved 2026-06-16:

1. Activity feed — left ungated.
2. Address — Medusa address book, customer-editable (incl. pre-ship order edit).
3. Instant window — invest in the server-stamped reveal ping (full 30s from
   reveal).
4. Removed tabs — delete outright.

## Verification Notes (repo-specific)

- Storefront verify on the **standalone** build at `:4000`
  (`npm run build` → `pwsh scripts/serve-standalone.ps1 -Port 4000`), never
  `next dev`. Use the Playwright `scripts/*.mjs` capture pattern.
- Backend: `corepack yarn build` + `test:integration:*` / `test:unit` from
  `backend/packages/api`; generate migrations for model changes; run codegen if
  route types change.
- Admin: vite build/lint; new route follows the `qk` + RQ seam (do **not** add a
  second `QueryClientProvider` — the dashboard already provides one).
