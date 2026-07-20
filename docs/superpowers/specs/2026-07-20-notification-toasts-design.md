# Notification Toasts — Design

**Date:** 2026-07-20
**Branch:** `claude/notification-popup-coverage-79825a`
**Status:** Approved, ready for planning

## Problem

The storefront has exactly one transient popup: `SuccessToast`, used only by
`VaultClient` for "Shipping order created successfully!". Everything else that
happens to a customer's account is silent at the moment it happens.

Separately, a backend feed exists (`GET /store/notifications`) whose entries land
in a bell badge and a bare-titles list at `/notifications`. The two systems have
never been connected, which is why a level-up — a real feed event — never pops,
while a shipping request does.

The ask: make the popup cover the events that deserve one.

## Scope

### In

Six feed templates, three of which toast:

| Template             | Feed row                     | Toast   | Producer                                    |
| -------------------- | ---------------------------- | ------- | ------------------------------------------- |
| `vip_level_up`       | exists                       | **yes** | exists (`settle-vip` / `vip-spend-settled`) |
| `commission_matured` | exists                       | **yes** | exists (`mature-commissions` job)           |
| `delivery_status`    | **new**                      | **yes** | **new** — admin route                       |
| `reward_won`         | declared, **never produced** | no      | **new** — daily-draw route                  |
| `voucher_claimed`    | exists                       | no      | exists (rewards claim route)                |
| `topup_credited`     | **new**                      | no      | **new** — `topUpCreditsWorkflow`            |

Plus: a global toast system, five client flows adopting it, a bulk mark-read
endpoint, and `/notifications` rendering from a shared copy registry.

### Out — each needs its own spec

- **`cashout` outcome.** The feature does not exist. `credit_transaction.reason`
  has a `'cashout'` enum value and `modules/packs/withdrawable.ts` describes the
  rule, but no route or workflow writes a cashout row. `/store/rewards/withdraw`
  ships a physical prize, not money. There is nothing to notify about.
- **`challenge_stage` unlock.** Stages are derived at read time from a live
  aggregate on a public, 30s-cached route (`api/store/challenge/route.ts`).
  There is no event, no persisted "already announced" state, and no per-customer
  rank tracking. A stage unlock is community-wide, so one unlock means one
  notification per customer — a broadcast fanout problem, not a per-user event.

## Transport: poll, not push

Push (SSE + Redis pub/sub + a Next streaming proxy) was chosen first and then
reversed, because after the scope cut none of the six events benefits from it.

Sort the events by who is present when each fires:

- `vip_level_up`, `reward_won`, `voucher_claimed`, `topup_credited` — consequences
  of the user's **own** click. They are already on screen.
- `commission_matured` (nightly cron), `delivery_status` (admin) — fire when the
  tab is almost certainly closed. **You cannot push to a closed tab.** Both are
  caught on next load regardless of transport.

SSE's purchase is "instant, while present, for something _someone else_
triggered." This list has none. `challenge_stage` was the one event that fit, and
it is out of scope.

Push would have added: a Redis pub/sub module, an SSE route with a connection
cap, a Next streaming proxy (the auth token is httpOnly, so the browser cannot
set an `Authorization` header), EventSource lifecycle plus failure counting plus
a poll fallback (EventSource retries forever, so the fallback code stays either
way), a self-contained event payload to dodge a publish-before-commit race,
double-toast suppression across tabs and devices, two held sockets per active
user across two tiers, and an SSE-over-Redis testing story in a repo gated on
`integration-http`. Roughly 5× the build to turn 60s into instant on two events
nobody is watching.

**Reconsider SSE when** a third-party-triggered event lands — `challenge_stage`
being the obvious candidate.

### Cost

`GET /store/notifications` is on the store read budget: 480/60s with a 120/10s
burst, env-tunable (`api/utils/rate-limit.ts`). A 60s poll costs 1 req/min per
tab; the post-pull bump adds at most 2. Not close to the ceiling.

## Behavior

### What makes a toast pop

A **client watermark**, held per device in `localStorage` under
`polycards:notif-seen:<customer_id>` — value is the newest `created_at` already
popped on this device. Anything newer pops.

`read_at` is never written by the toast path. The bell badge and the toast answer
different questions — "what haven't you dealt with" vs "what happened since you
last looked here" — and coupling them breaks both: a toast that marks read guts
the badge, and a toast that doesn't mark read re-pops forever.

Accepted cost: per-device. Level up on your phone, open your laptop, it pops
again there. That is correct — a toast is a _presence_ notification and you
weren't present on the laptop.

The key is scoped by customer id so logging out and in as someone else cannot
inherit the wrong watermark.

### First run

No watermark — new device, cleared storage, or first release. Seed the watermark
to the newest `created_at` in that first response and **pop nothing**. A device
that has shown you nothing has no backlog to report. The bell badge still carries
the true unread count, so nothing is hidden.

Consequence for QA: **you cannot verify this feature by deploying and waiting.**
The test must trigger a _fresh_ event after the watermark exists. This is the
main reason for the two-PR split below.

### Catch-up

On any fetch, notifications newer than the watermark and permitted by policy:

- **1–3** — pop individually.
- **4 or more** — collapse into one "N new notifications" toast linking to
  `/notifications`.

The bell badge always shows the true unread count regardless.

Note the feed returns the **50 most recent** only, DESC (`RECENT_NOTIFICATIONS`
in `api/store/notifications/route.ts`), and its `unread_count` is page-scoped,
not a lifetime total. The bell caps display at "9+" so this is invisible in
practice.

### Per-template toast policy

Four of six events fire from the user's own click, and some already show a client
toast. Dedupe-by-id cannot catch that collision — the client toast has no
notification id.

Solution: each registry entry declares whether the feed may toast it.

- **`never`** — `voucher_claimed`, `topup_credited`, `reward_won`. Their own UI
  already speaks: the first two get a client toast (see below), and `reward_won`
  has the full-screen `PrizeReveal`. Feed row and badge still count them.
- **`always`** — `vip_level_up`, `commission_matured`, `delivery_status`.
  `vip_level_up` has no client toast today; the slot machine never announces it.
  That gap is the original complaint.

One declarative field beside the copy it governs. No timing heuristics, no
id-guessing. Rule reads as: _if the click that caused it already told you, the
feed stays quiet._

Accepted cost: claim a voucher on your phone and your laptop never pops it — only
the badge increments. You performed the action; you already know.

### Cadence

- 60s interval **while the tab is visible**; paused on `document.hidden`.
- Refetch on window focus and on route change.
- `bump()` after a pull, at ~2s and ~6s, stopping early once something new
  arrives.

The interval's only job is the sit-idle case: you are on the app doing nothing
and an admin ships your order or the cron matures a commission. 60s vs 30s is
indistinguishable for those; take the cheaper one.

`bump()` has exactly one call site — after a pull — because `vip_level_up` is the
only `always` template that follows a user action. VIP settles in a **worker
subscriber**, so the row usually does not exist when the pull response returns;
an immediate single bump would miss it. Two bounded retries cover a slow worker
without looping.

This composes with suppression: a bump landing at 2s or 6s while the slot machine
is still up queues the toast, which drains the instant the user exits — reading
as "the game told me right as I finished."

## Architecture

### Backend

Three producers, one new route. No new module, no migration, no schema change —
`NotificationSchema` is a `looseObject` with loose `data` (`src/lib/data/schemas.ts`).

1. **`modules/packs/notify-feed.ts`** — widen `FeedTemplate` from 4 to 6:
   `+delivery_status`, `+topup_credited`.

2. **`delivery_status` producer — in the admin route, not the workflow.**
   `POST /store/delivery-orders/:id/cancel` and `POST /admin/delivery-orders/:id`
   both call `updateDeliveryOrderWorkflow`. A producer inside the workflow would
   notify a customer about their own cancellation.

   The workflow looks like the root-cause choke point but is not: the two callers
   mean different things — _someone did something to your order_ vs _you did
   something to your order_. Only the first is news. Admin-route placement
   encodes that structurally instead of via a conditional, and is a smaller diff
   than threading an actor flag through the workflow input.

   Fires on `shipped`, `delivered`, `canceled`. **Not** `packing` — that is the
   transition an operator flips most casually while working a queue.

   Idempotency key: `delivery:<order_id>:<status>`.
   Data: `{ order_id, status, tracking_number }`.

3. **`topup_credited` producer** — in `topUpCreditsWorkflow`.
   Key `topup:<transaction_id>`. Data `{ amount_myr, reference }`.
   Synchronous against the mock gateway today, so the toast is suppressed by
   policy and the client toast covers it. Becomes meaningful when a live gateway
   webhook lands.

4. **`reward_won` producer** — in `POST /store/daily/draw`
   (`api/store/daily/draw/route.ts`), after the draw workflow commits and a
   `reward_draw` row exists. Idempotency key: `reward:<reward_draw_id>`.
   The template is declared
   in the union today and nothing produces it; zero rows have ever existed. The
   feed is the durable "what happened to my account" record and a prize win
   belongs in it, but the toast stays `never` because `PrizeReveal` is the
   announcement.

5. **`POST /store/notifications/read-all`** — new. Bulk mark-read, owner-scoped,
   its own rate-limit tier (not the per-id limiter, which makes a client-side
   loop non-viable). Matcher entry in `api/middlewares.ts`. Integration test on
   the IDOR boundary.

   This exists because the watermark design deliberately leaves `read_at`
   untouched, so every notification now pops, is seen, and stays unread. Without
   a bulk clear the badge accumulates permanently and stops being read. The
   problem is self-inflicted, so it is fixed in the same change that creates it.

All producers wrap in non-fatal `try/catch`, matching the existing ones — a
notification failure must never roll back committed state.

### Frontend

Four units, dependencies running one way.

1. **`src/lib/notifications/copy.ts`** — the registry.
   `template → { icon, variant, policy, title(data), body(data), href(data) }`.
   Pure, no JSX; icon is a lucide component reference.

   **Single source of truth consumed by both the toast and `/notifications`**, so
   a new template is one entry rather than three. Replaces the `TITLES` map in
   `NotificationsClient.tsx`.

   Deep links: `vip_level_up` → `/vip` · `commission_matured` → `/transactions`
   (the ledger it lands in) · `delivery_status` → `/orders` · `reward_won` →
   `/rewards` · `voucher_claimed` → `/vip` · `topup_credited` → `/transactions`.

   Variants: `reward` for `vip_level_up` and `reward_won`, `success` for money
   confirmations, `info` for `delivery_status`.

2. **`src/components/ui/Toast.tsx`** — `SuccessToast` generalized. Keeps the glass
   rim, the shrinking progress bar, the dismiss button, and the **always-mounted
   `role="status"` region** (load-bearing: a live region inserted together with
   its content is skipped by some screen-reader/browser combinations). Adds
   `variant` and optional `href`.

3. **`src/components/notifications/ToastProvider.tsx`** — pure UI. Owns the queue,
   exposes `useToast().show()` and `useSuppressToasts()`, hosts the live region.
   **Knows nothing about notifications.**

4. **`src/lib/notifications/` pure core + `NotificationsProvider`** — the domain.
   Headless; owns poll, watermark, unread count, `bump()`, policy application.
   Calls `useToast()`. Renders nothing.

`NotificationBell` reads its count from `NotificationsProvider` and **drops its
own poll** — one poll for the whole app, not two.

`NotificationsClient` renders from the registry, gaining bodies, icons, deep
links, and a Mark all read control.

Root stack becomes:
`AuthProvider > ToastProvider > NotificationsProvider > TopUpProvider > …`.
`NotificationsProvider` fully no-ops when `customer` is null — no polling for
logged-out visitors.

The split exists so each half is testable alone: the queue with fake toasts, the
feed logic with a fake `show`.

### Presentation

**Stacking.** The toast layer sits at `z-[140]`. Today's `z-[70]` renders _below_
`PrizeReveal` (80), `AuthModal` / `CardDetailOverlay` / `StepInfoPill` /
`SlotMachineClient` (100), `SellConfirmModal` (110), `EditProfileModal` (120),
and `AvatarCropper` (130) — meaning any toast fired while one of those is open is
currently **invisible**. The worst case is the headline one: `vip_level_up` lands
~2s after a pull, while `SlotMachineClient` still owns the screen.

**Suppression.** `SlotMachineClient` (while spinning/revealing), `PrizeReveal`,
and `AvatarCropper` call `useSuppressToasts()` while mounted. Toasts **queue
rather than drop** and drain when the surface releases. Plain modals do not
suppress — a toast over a modal is fine and often the point.

Delaying the level-up toast until the reveal finishes is better than instant, not
a compromise. Queue-don't-drop is what makes suppression safe; without it,
suppression is a fancier way of losing notifications.

**Position.** Max 3 visible, newest on top, stacking downward from the existing
`top-[4.25rem]` anchor (already tuned to clear the header; the mobile TabBar is
at the opposite edge). Overflow queues FIFO.

**Lifetime.** 5s, **pausing on hover and on keyboard focus**, resuming on leave.
The pause is the part that matters — it turns "I missed it" from permanent loss
into recoverable, and it closes a WCAG 2.2.1 (Timing Adjustable) gap that the
current toast has and that becomes far more visible once toasts carry actions.

**Interaction.** A toast with an `href` is clickable across its whole surface
_and_ shows a visible action label ("View orders →"). The label supplies
discoverability; the full surface supplies a tap target that survives a 5s window
on a phone. The dismiss button stops propagation. Toasts without an `href` —
client action confirmations, where you are already on the page that changed —
render without the label and are not clickable.

### Client toast adoption

Nine of the ten components with local feedback state hold **`error` only** —
inline errors next to a form. There is one real toast (`VaultClient`) and one
`notice` (`VipVouchers`). On success these flows call `router.refresh()` or flip
a `done` flag; most show no confirmation at all.

**Errors stay inline.** A validation error must persist beside its field, must
not vanish after 5s, and must stay in the form's accessibility context. Toasts
are for confirmations, not failures.

Adopt `useToast()` in the money and irreversible flows — top-up credited,
withdraw requested, delivery requested, voucher claimed — plus migrate
`VaultClient` off the local `SuccessToast`. Five components.

These four are exactly where "did that actually work?" matters most and where the
page often does not visibly change. They are also why `topup_credited` and
`voucher_claimed` can safely be `never` at the feed layer: without client toasts
those two events would notify nowhere at all.

Not adopted: addresses, profile save, frame equip, order actions. Equipping a
frame visibly equips the frame; a toast saying so is noise.

## Testing

The storefront runs **vitest**, 31 existing files, all pure logic under
`src/lib/**/__tests__` — no React Testing Library, no component unit tests. This
matches the repo rule: logic gets unit tests, presentational work goes to
Playwright.

Every decision moves into pure functions so the components stay dumb:

- **`selectToastable(notifications, watermark, policy) → { pops, summary, nextWatermark }`**
  — the entire rule set in one function. Cases: empty feed; absent watermark
  (silent seed); 1, 3, and 4+ (summary threshold); `never`-policy filtering;
  all-already-seen; 50-row truncation; malformed/missing `data`.
- **`toastQueue(state, action) → state`** — a plain reducer for enqueue /
  dismiss / expire / suppress / drain-on-release. Queue-don't-drop is a reducer
  test, not a browser test.
- **`copy.ts`** — snapshot every template's title/body/href/icon so a missing
  entry fails loudly.

Backend: unit-test both new producers' idempotency keys and the
`shipped|delivered|canceled` filter; integration-test `read-all` for owner
scoping.

This is not a compromise — it is the reason to structure the code this way. With
the pure core extracted, the untested remainder is "provider calls reducer,
component renders array," the thin glue the repo already accepts as visually
verified. No new dependencies.

## Delivery

Two PRs. `master` is branch-protected and PR-gated on quality + gitleaks.

**PR 1 — backend + feed page.** `FeedTemplate` widen · three producers ·
`read-all` route, matcher, limiter, integration test · `copy.ts` ·
`NotificationsClient` rewritten off the registry with bodies, icons, deep links,
Mark all read. No toasts.

**PR 2 — toast system.** `Toast.tsx` · `ToastProvider` · `NotificationsProvider` ·
`selectToastable` + `toastQueue` + tests · root layout wiring · `NotificationBell`
drops its poll · five client flows adopt `useToast` · three surfaces call
`useSuppressToasts`.

PR 1 ships value alone — `/notifications` stops being a list of bare titles — and
it solves the QA problem the silent seed creates: once it lands, real
`delivery_status` / `topup_credited` / `reward_won` rows accrue in staging and
production, so PR 2 has genuine data to pop and the copy registry gets reviewed
against actual rows rather than invented fixtures.

## Constraints

- No new dependencies.
- No migrations. No schema changes.
- Zero changes to `GET /store/notifications` or the existing `markRead` path.
- Existing `SuccessToast` a11y pattern (always-mounted live region) preserved.
- Existing `motion-safe:` prefixes preserved for reduced-motion.
