# Live Market Price Tracking via PriceCharting — Design Spec

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Branch:** `feat/live-market-price-pricecharting`

## 1. Goal

Let an admin create a card by **searching PriceCharting**, pick the exact grade,
and have the card **automatically track that grade's live market value** going
forward. Both admin and the customer who owns the card see a **market price that
is the PriceCharting value converted to MYR and marked up 20% by default**. The
admin additionally sees the raw value and the markup so the margin is visible.

## 2. Context — what already exists

This is a Medusa v2 / Mercur backend (`backend/packages/api`) with a Vite admin
dashboard (`backend/apps/admin`) and a Next.js storefront. The gacha domain is
the `packs` module.

Already built and reused by this feature:

- **PriceCharting proxy** — server-side client + two admin routes:
  - `backend/packages/api/src/api/admin/pricecharting/client.ts` — auth via
    `PRICECHARTING_API_TOKEN` appended as the `t` query param; base
    `https://www.pricecharting.com`; upstream prices are integer **pennies**;
    returns a discriminated `PcResult` (`ok` / `no-token` / `error`).
  - `.../pricecharting/search/route.ts` — `GET /admin/pricecharting/search?q=` →
    up to 20 `{ id, name, set }` matches (upstream `/api/products?q=`).
  - `.../pricecharting/product/route.ts` — `GET /admin/pricecharting/product?id=`
    → `{ id, name, set, prices: { grade, usd }[] }` (upstream `/api/product?id=`).
- **Grade-tier mapping** (already encoded in `product/route.ts`, ascending):

  | PriceCharting field    | Tier label  |
  | ---------------------- | ----------- |
  | `loose-price`          | Ungraded    |
  | `cib-price`            | Grade 7     |
  | `new-price`            | Grade 8     |
  | `graded-price`         | Grade 9     |
  | `box-only-price`       | Grade 9.5   |
  | `manual-only-price`    | PSA 10      |
  | `bgs-10-price`         | BGS 10      |
  | `condition-17-price`   | CGC 10      |
  | `condition-18-price`   | SGC 10      |

- **`Card` model** (`backend/packages/api/src/modules/packs/models/card.ts`):
  `id`, `handle` (unique, = the linked Product's handle), `name`, `set`,
  `grader` (free text), `grade` (free text), `market_value` (bigNumber, **USD
  decimal** — the fair-market value used by vault worth / pack RTP / buyback),
  `image`, `price` (bigNumber nullable — the standalone sale price mirrored to
  the Medusa variant), `for_sale` (bool, drives Product PUBLISHED/DRAFT),
  `pokemon_dex`, `sprite_image`.
- **Card registration flow** — `RegisterCardModal.tsx` already searches
  PriceCharting and drops the chosen grade's USD value into `market_value`. The
  PriceCharting product id and chosen tier are **not persisted** today, and there
  is **no** structured grade picker, markup, FX, or scheduled refresh.
- **Admin data layer** — `lib/admin-rest.ts` (fetch helpers, cookie-session,
  `credentials: 'include'`) + `lib/queries.ts` (React Query) + `lib/query-keys.ts`.
- **Create/update card workflows** — `workflows/steps/create-card.ts` (requires
  an existing `product_id`) and `update-card.ts` (patches Card + mirrors Product).
- **Jobs** — only `jobs/mature-commissions.ts` exists; no price jobs.

## 3. Terminology

- **Product** = Medusa catalog entity (variant carries checkout price/inventory).
- **Card** = the gacha prize wrapper linked to a Product by `handle`. Carries
  `market_value`, `grade`, `grader`. **This is where the feature lives.**
- **The customer "who got the product"** = a customer holding the card in their
  **vault** (a `Pull`). Cards are acquired by opening packs; the Marketplace
  route is currently feature-flagged **off**.
- **Raw value** = PriceCharting's per-grade value (USD).
- **Displayed market price** = `raw × FX(USD→MYR) × multiplier` (MYR), shown to
  customers as the card's "market price".

## 4. Key decisions (with rationale)

1. **Entry point: one-step card creation from PriceCharting.** A single action
   searches PC, creates the Medusa Product, registers the Card, and stores the PC
   link — collapsing today's two-step inventory-first flow. Reuses the existing
   search UI. The current "register an already-in-inventory product" path is
   **kept** as a secondary option.
2. **Grade model: one card = one grade.** Each card is a single specific grade
   (a PSA 10 is a distinct card from a PSA 9), matching physical slab inventory
   and the existing single `grade`/`grader` fields. Structured grade picker;
   create one card at a time. (Batch multi-grade creation is out of scope.)
3. **Markup is display-only; internals stay raw.** `market_value` continues to
   hold the **raw** PriceCharting value (so buyback / RTP / vault math is
   unaffected). The **+20% and the FX conversion are applied only when computing
   the displayed price**. This is the money-path-safe choice and is consistent
   with this repo's money-path hardening history.
4. **Multiplier is per-card, default 1.20, editable** — pre-filled to 20% on both
   create and edit; the admin can override per card.
5. **Currency: real USD→MYR conversion** (mid-market, Google-Finance-style), not
   a relabel. See §8.
6. **Refresh cadence: daily.** PriceCharting recomputes values only ~once/24h and
   the API is limited to **1 request/second**; polling on every pageview would
   waste a paid quota and gain nothing. A daily cron caches the raw value; every
   surface reads the cached number.
7. **History: current number only.** Store just the latest raw value per card;
   the daily job overwrites it. No history table / trend chart in v1. (The
   PriceCharting API does not expose historic prices anyway.)
8. **Customer surfaces:** vault (owned cards), card detail / pull-reveal, and
   marketplace listings (built now, dormant behind the existing flag). Customers
   see only the final MYR market price — never the raw value or the markup.

## 5. Data model changes — `Card`

Add (all nullable / defaulted so the 51 seeded cards migrate cleanly):

| Field               | Type                       | Meaning |
| ------------------- | -------------------------- | ------- |
| `pc_product_id`     | `text().nullable()`        | PriceCharting product id. **Set ⇒ auto-tracked; null ⇒ manual pricing** (job skips it). |
| `pc_grade`          | `text().nullable()`        | The exact tier label (e.g. `"PSA 10"`, matching the §2 table) so the job reads the right price field. |
| `market_multiplier` | `bigNumber().default(1.2)` | Per-card display markup. Decimal (bigNumber, not number — avoid integer truncation). |
| `pc_synced_at`      | `dateTime().nullable()`    | Last successful refresh (ops/debug; not shown to customers). |

`market_value` semantics unchanged (raw USD). A DB migration is required
(`medusa db:generate` + `db:migrate`); production must run the migration on deploy.

**FX rate storage** (app-level, not per-card): a single persisted setting holding
`usd_myr_rate`, `usd_myr_rate_at`, `usd_myr_rate_source`, and a manual-override
flag/value. Implemented as a small settings record/module (mirroring the existing
server-persisted-setting pattern used for the win-rate lock). Refreshed daily.

## 6. Backend design

### 6.1 Persist the PriceCharting link
Extend the create/register path and `update-card` to write `pc_product_id`,
`pc_grade`, and `market_multiplier`. When a PC tier is selected in the admin,
also derive `grader`/`grade` from the tier label:
- Tiers naming a grader → auto-fill: `PSA 10`→(PSA,10), `BGS 10`→(BGS,10),
  `CGC 10`→(CGC,10), `SGC 10`→(SGC,10).
- Generic tiers (`Grade 7/8/9/9.5`, `Ungraded`) set `grade` only; `grader` stays
  admin-chosen/blank. `pc_grade` always stores the exact tier label.

### 6.2 One-step create workflow
New admin path "Add from PriceCharting":
1. Admin uploads the card image (existing `uploadImage` pipeline — **the Prices
   API returns no image**, so this stays a manual upload / placeholder).
2. Create the Medusa Product (title = PC name, handle derived, status from
   `for_sale`) via Medusa's product-create.
3. Register the Card (reuse `createCardWorkflow`) with `market_value` = chosen
   tier's USD value, plus `pc_product_id`, `pc_grade`, `market_multiplier`.
Chained in one workflow with compensation (roll back the Product if Card
registration fails), so the admin experiences one atomic action.

### 6.3 Daily sync job — `jobs/sync-market-prices.ts`
Runs once/day. Steps:
1. **Refresh FX** once: fetch USD→MYR mid-market rate (see §8), cache it. On
   failure keep the last-known rate.
2. **Refresh raw values:** for every card with `pc_product_id`, call
   `/api/product?id=`, read the price field for its `pc_grade`, write
   `market_value = raw`, stamp `pc_synced_at`.
   - **Throttle ≤1 request/second** (PriceCharting hard limit).
   - **Guardrails:** skip and keep last-known value if PC returns
     null/zero/error; never crash the batch on one bad card; log every change
     (old→new) for audit.
3. Manual `market_value` edits are respected only for **unlinked** cards; a
   linked card is authoritatively driven by the job (to go manual, clear the PC
   link).

Future optimization (not v1): if the catalog grows to thousands of cards, switch
to the once-per-24h **CSV download** (Legendary tier) instead of per-product calls.

### 6.4 Displayed-price computation
Computed **on read** (single source of truth for the formula), not stored per
card (avoids drift + migration churn):

```
displayPriceMYR = round2( market_value_USD × usd_myr_rate × market_multiplier )
```

Exposed in the card read/serialization layer:
- **Customer surfaces** receive only `displayPriceMYR`.
- **Admin** additionally receives `market_value` (raw USD), the FX rate used,
  the multiplier, the market value in MYR (`raw × fx`), and the markup delta
  (`raw × fx × (multiplier − 1)`).

## 7. Admin UI (card create / edit)

- PriceCharting **search box → match list → grade-tier picker** (structured;
  auto-fills grader/grade/raw value and records `pc_product_id` + `pc_grade`).
- **Markup field**, prefilled to **20%** on create and edit; editable.
- **Live preview row:** `Raw $X · FX 4.xx · Market RM(raw×fx) · Customer sees
  RM(raw×fx×1.2) · Markup RM(delta)`. Satisfies "admin knows the margin".
- **"🔗 Linked · synced <date>"** indicator on tracked cards; a way to unlink
  (clear `pc_product_id`) to switch to manual pricing.
- Reuses `admin-rest.ts` / `queries.ts` / `query-keys.ts` patterns and
  `@medusajs/ui` primitives. Follow `medusa-ui-conformance` for any new UI.

## 8. Currency / FX

- **Formula:** `RM = raw_USD × FX(USD→MYR) × multiplier`. FX and markup are
  display-only; `market_value` stays raw USD.
- **Source:** Google Finance has **no public API**; Google displays the
  **mid-market** rate. We fetch the same mid-market USD→MYR rate from a reputable
  free feed (e.g. Frankfurter/ECB-derived or open.er-api), **cache it, refresh
  once daily**, and expose a **manual override** in admin settings.
- **Guardrail:** on FX fetch failure, keep the last-known rate; never zero out
  prices. Tracks Google to a fraction of a cent, not byte-for-byte identical.
- Rounding: to 2 decimals (sen).

## 9. Security

- `PRICECHARTING_API_TOKEN` lives only in the backend `.env` (gitignored), read
  server-side, never exposed to the browser (existing proxy pattern). **The token
  value is not recorded in this spec or any committed file.**
- The token was shared in a chat transcript during design; if that transcript is
  stored anywhere untrusted, **regenerate the token** from the PriceCharting
  Subscriptions page (repo has a prior transcript-leak rotation precedent).
- FX feed is an unauthenticated GET to a public endpoint; no secret involved.

## 10. Dependencies

- **Paid PriceCharting API subscription + token** (provided). Without it, every
  proxy call 503s: the create form falls back to manual entry and the daily job
  no-ops (keeps last-known values).
- A reachable public FX endpoint (with manual-override fallback).
- DB migration applied in every environment (local + production).

## 11. Out of scope (v1)

- Price history / trend charts.
- Batch multi-grade card creation.
- Coupling the displayed market price to marketplace **checkout** price or to
  buyback/RTP math (kept raw). If the marketplace is re-enabled and checkout
  should equal the displayed price, that's a separate decision.
- Backfilling PC links onto the 51 already-seeded cards (they can be linked
  one-by-one via edit).
- CSV-bulk sync path (per-product API is sufficient at current scale).

## 12. Risks & considerations

- **FX vs "Google exactly":** mid-market feed ≈ Google, not identical. Manual
  override covers disputes.
- **Displayed vs transactional mismatch:** a customer sees a marked-up "market
  price" but buyback pays off the raw value — intentional (the markup is the
  store's sticker), but worth a clear label in the UI so it doesn't read as a bug.
- **Grade-tier ambiguity:** generic `Grade 9` tiers don't name a grading company;
  grader stays admin-set for those.
- **Job/quota:** 1 req/sec cap bounds the job to ~N seconds for N linked cards;
  fine at current scale, revisit with CSV if the catalog explodes.

## 13. Verification plan

- **Backend:** module test for the migration + linked-card refresh; HTTP
  integration test for the one-step create route and the display-price
  computation (raw × fx × multiplier). Money-adjacent → run
  `test:integration:http` per repo rule, not just unit.
- **Job:** unit-test the guardrails (null/zero/error → keep last-known; throttle).
- **FX:** unit-test conversion + last-known fallback + manual override.
- **Admin/storefront:** Playwright capture of the admin preview row and the
  customer-facing market price on vault / card detail.
- **Typecheck:** the repo Stop hook type-checks storefront + backend; must be green.
