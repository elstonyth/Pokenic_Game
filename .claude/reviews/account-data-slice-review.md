# Code Review: Account-data slice (orders + settings)

**Reviewed**: 2026-06-08
**Author**: elstonyth
**Branch**: feat/backend-medusa-mercur (uncommitted)
**Decision**: APPROVE with comments

## Summary
Wires `/orders` and `/settings` to the logged-in customer ("me") via server-side
Bearer-token calls, with a verified profile-update round-trip and an orders empty
state. No CRITICAL or HIGH issues. Security posture on the new server action is sound
(httpOnly-cookie auth, `/me`-only updates → no IDOR, input length-capped, errors never
leak raw). A few MEDIUM/LOW polish items, none blocking.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM
- **M1 — `money()` throws on a malformed currency (latent 500).**
  `src/app/(account)/orders/page.tsx:30` — `amount.toLocaleString("en-US", {style:"currency", currency})`
  raises `RangeError` if `currency_code` is empty/non-ISO, which would 500 the whole orders
  page. Real orders always carry a valid code and this path is unexercised pre-checkout
  (live probe: `GET /store/orders` → `{orders:[],count:0}`), so it's latent — but cheap to
  guard. Suggest a try/catch fallback to a plain formatted amount.
- **M2 — `MockTable` now renders real order data under a "Mock" name.**
  `src/app/(account)/orders/page.tsx:106` + `src/components/account/ui.tsx:30`. The component
  is a generic table but its name now misleads. It's shared with other mock pages, so a rename
  (`DataTable`) is a broader change — noting, not blocking this slice.

### LOW
- **L1 — Orders top-50 only, no pagination.** `src/lib/data/customer.ts` (`ORDER_LIST_LIMIT=50`).
  Fine now (no orders); revisit a "load more"/cursor when volume grows.
- **L2 — `updateProfile`: no phone-format validation (permissive by design) and no rate limiting.**
  `src/lib/actions/customer.ts`. Rate-limiting auth/profile endpoints is already tracked as a
  launch follow-up in `docs/note.md`.
- **L3 — Display name (first_name) can be cleared to null on save.** The header then falls back
  to the email local-part (graceful). Consider `required` on that field if a name is mandatory.
- **L4 — Order thumbnail `<img>` has no explicit width/height (CLS).** Tiny table cell; minor.
- **L5 — SettingsForm success note persists until next submit (no auto-dismiss).** Minor UX.

## Validation Results

| Check | Result |
|---|---|
| Type check (`npm run typecheck`) | Pass |
| Lint (`npm run lint`) | Pass (0 errors; pre-existing img/unused-var warnings only) |
| Tests / E2E (Playwright `scripts/verify-account.mjs`) | Pass (profile round-trip + orders empty state) |
| Build (`npm run build`) | Pass (`/orders`, `/settings` → ƒ Dynamic) |

## Files Reviewed
- `src/lib/data/customer.ts` — Modified (getCustomer cache(); +getOrders, +updateCustomerProfile)
- `src/lib/actions/customer.ts` — Added (updateProfile server action)
- `src/components/account/SettingsForm.tsx` — Added (client profile form)
- `src/app/(account)/orders/page.tsx` — Modified (real orders + empty state)
- `src/app/(account)/settings/page.tsx` — Modified (getCustomer → SettingsForm)
- `scripts/verify-account.mjs` — Added (QA script; test fixtures only)
