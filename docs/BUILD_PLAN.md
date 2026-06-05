# Build Plan — Wire the Pokenic frontend to a prebuilt Medusa v2 backend

> Wire the (already-built) Pokenic front-end clone to a prebuilt **Medusa v2** backend for full
> functionality: auth, catalog, Stripe (test mode), the gacha pack-opening + pull ledger, realtime
> live feed + leaderboard, and admin odds management.
>
> **Status:** AUTHORITATIVE PLAN — 2026-06-05. Supersedes the earlier DigitalOcean/Supabase-targeted
> draft (preserved in git history). **Local-first; this plan chooses no cloud host.**

---

## Scope & ground rules (carried forward — unchanged intent)

**What this project is:** a learning/portfolio build. We reconstruct the *look and feel* of
phygitals.com and pair it with an original, self-built backend (Medusa + custom modules) running on
mock/seed data. This is your own product built on open-source foundations.

**What this project is NOT:**
- Not a copy of phygitals' real backend, inventory, or data (none of that is public).
- Not a deployable look-alike of their auth/checkout meant to impersonate them or handle real users'
  money. We build our *own* auth/payments against test keys (Stripe test mode), never a replica of theirs.
- Not their brand/logo/trademarked content in any shipped/deployed form. Cloned text & assets are
  scaffolding/reference during development; real launch content must be original.

**Hard rules baked into every phase:**
- Stripe stays in **test mode** (`sk_test_…`) until/unless this becomes a real, owned, legally-cleared product.
- No real user data. All accounts, cards, packs, pulls are seeded/fake.
- Every build step must pass `npm run check` (lint + typecheck + build) and run before moving on.

---

## Context

`Pokenic_Game` is a **complete, static** front-end clone of phygitals.com — a trading-card
pack-opening (gacha) marketplace (Next.js 16.2.1 App Router, React 19, Tailwind v4, shadcn/ui).
Today **every page is hardcoded**: no API layer, no `fetch`, no auth, no env vars. The Login/Sign Up
buttons and the claw "Open" button are presentational only.

The goal is to wire in the most capable prebuilt open-source backend; we chose **Medusa v2**
(~31k★, the leading Node/TS open-source headless commerce engine) with **full scope**: auth, catalog,
Stripe (test mode), gacha pack-opening + pull ledger, realtime live feed + leaderboard, and admin odds
management.

"Prebuilt" here = Medusa gives products/orders/payments/customers/inventory/admin **out of the box**
via `create-medusa-app`; we only add a small custom gacha module and rewire the existing UI to its
Store API. An earlier draft of this plan targeted Medusa v2 on a DigitalOcean/Supabase architecture;
this version adapts it to the *clone-and-wire*, **local-first** approach and corrects several stale
facts (next section), verified against current Medusa v2 docs.

**Why not the alternatives** (surveyed, for the record): Supabase (fastest, great realtime, but
not commerce-native — you build orders/checkout yourself); Mercur (prebuilt multi-vendor marketplace
on Medusa, but ~680★ and heaviest); PocketBase (simplest single binary, but no commerce primitives).
Medusa wins on commerce-out-of-the-box + TypeScript stack match + an official Next.js reference storefront.

## Architecture decisions (verified against current Medusa v2 docs)

These are baked into this plan and correct the earlier DigitalOcean/Supabase draft:

- **Redis/Valkey is optional for local dev.** Medusa ships in-process event bus + in-memory cache +
  workflow engine. Local dev needs **Postgres only**; Redis is a prod recommendation (and for
  multi-process Socket.io fan-out). The earlier draft listed Valkey as a hard requirement — it isn't.
- **Drop Supabase entirely.** The earlier draft's architecture diagram still showed a Supabase realtime
  mirror; the text already pivoted to Socket.io. Realtime = Socket.io attached to the Medusa Node process.
- **Node rationale is mis-attributed but the conclusion holds.** The `<25` ceiling is the Next.js
  *starter* storefront's constraint, not Medusa's (Medusa needs Node 20+). Keep the pinned **24.14.0**.
- **CORS must target `:3000`.** `create-medusa-app` defaults `STORE_CORS`/`AUTH_CORS` to `:8000`;
  this storefront runs on `:3000`.
- **Hosting (DigitalOcean) is out of scope** for this wiring task — local-first.

## Recommended layout: keep storefront at repo root, add a `/backend` sibling

Do **not** move the storefront into `/storefront`. The repo root *is* the storefront (its
`package.json`, `next.config.ts`, `@/*`→`./src/*`, the hundreds of extracted assets under `public/`,
the `clone-website` skill, Playwright config, CI). Moving it churns every tooling path for zero gain,
and `create-medusa-app` won't merge into a populated root anyway.

```
Pokenic_Game/                  ← git root = STOREFRONT (unchanged)
├── src/app, src/components…   ← existing Next.js 16 app (rewired in place)
├── public/…                   ← extracted assets (unchanged)
├── package.json               ← add @medusajs/js-sdk
├── .env.local                 ← NEW: NEXT_PUBLIC_MEDUSA_BACKEND_URL, NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
└── backend/                   ← NEW: create-medusa-app output (Medusa v2 + admin at :9000/app)
    ├── medusa-config.ts        ← register packs module + Stripe payment provider
    ├── .env                    ← DATABASE_URL, STRIPE_API_KEY=sk_test_…, secrets, *_CORS=…:3000
    └── src/
        ├── modules/packs/      ← Pack, PackOdds, Card, Pull models + MedusaService
        ├── workflows/open-pack/← weighted seeded roll w/ per-step compensation
        ├── links/              ← defineLink: pack↔product, card↔inventoryItem
        ├── api/store/ + api/admin/
        ├── admin/routes/packs/ + admin/widgets/pack-odds.tsx
        ├── subscribers/pack-opened.ts
        ├── loaders/socket.ts   ← Socket.io on the Medusa HTTP server
        └── scripts/seed.ts
```
Two plain npm apps (not Turborepo): backend `npm run dev` in `backend/` (`:9000`), storefront
`npm run dev` at root (`:3000`).

## Data model — the custom "Packs" (gacha) module (carried forward)

Built as a Medusa custom module so it auto-gets migrations, CRUD, and container access to core modules.

```
Pack
  id, title, slug, price (→ links to a Medusa product/variant for checkout)
  category (pokemon | basketball | football | onepiece | baseball | yugioh)
  image, status (active/draft)
  ── has many ──▶ PackOdds

PackOdds  (the gacha table — admin-editable)
  id, pack_id (FK)
  card_id (FK → Card)
  weight        ← relative probability (e.g. 1000 = common, 1 = chase)
  // pull chance = weight / sum(weights in pack)

Card
  id, name, set, grader (PSA | Fanatics | Alt), grade, rarity
  image, market_value
  ── links to ──▶ Medusa Inventory item (vault custody / stock)

Pull   (ledger — one row per opened pack)
  id, customer_id, pack_id, card_id (result), rolled_at, order_id
  // source of truth for the live-pulls feed + leaderboard
```

**Provably-fair note:** real phygitals advertises *provably fair* odds (commit-reveal / on-chain seed).
For the clone we implement a simpler **server-side seeded RNG with an auditable Pull ledger**. A true
commit-reveal scheme is an optional later enhancement, documented but not required for v1.

## Verified Medusa v2 specifics to use (no training-data guesses)

- **Scaffold:** `npx create-medusa-app@latest backend` (decline its starter storefront — we keep ours).
  Needs Postgres 15+. DB lifecycle: `npx medusa db:generate packs` → `npx medusa db:migrate`;
  seed via `npx medusa exec ./src/scripts/seed.ts`.
- **Module:** `model.define("pack", {…})` with `model.enum([...])` / `model.number()` / relations;
  `class PacksModuleService extends MedusaService({ Pack, PackOdds, Card, Pull }) {}`;
  `Module(PACKS_MODULE, { service: PacksModuleService })`; register in `medusa-config.ts`.
- **Links to core:** `defineLink(PacksModule.linkable.pack, ProductModule.linkable.product)` and
  `…card ↔ InventoryModule.linkable.inventoryItem`; read linked data with `query.graph({…})`.
- **Workflow:** `createWorkflow` + `createStep(name, invoke, compensate)` returning
  `new StepResponse(result, rollbackData)`; run via `openPackWorkflow(req.scope).run({ input })`.
  Use `reserveInventoryStep` for stock and `emitEventStep({ eventName: "pack.opened", data })`.
- **API routes:** `backend/src/api/store/packs/route.ts`, `…/[id]/open/route.ts`,
  `backend/src/api/admin/packs/…`; store routes need `x-publishable-api-key`, customer routes need
  `Authorization: Bearer <JWT>`; validation/auth in `backend/src/api/middlewares.ts`.
- **Storefront SDK:** `@medusajs/js-sdk` → `src/lib/medusa.ts` (`new Medusa({ baseUrl, publishableKey })`);
  auth via `sdk.auth.register/login` (emailpass), data via `sdk.store.product.list`, `sdk.store.cart.*`,
  `sdk.store.customer.*`. Create the publishable key in Admin → Settings, attached to a sales channel.
- **Stripe (test):** register `@medusajs/medusa/payment` with provider `@medusajs/medusa/payment-stripe`
  (`apiKey: STRIPE_API_KEY`); enable on the region in Admin; storefront uses `@stripe/react-stripe-js`
  (mirror the official Next.js B2C starter's checkout session→confirm sequence as reference only).
- **Admin UI:** route `backend/src/admin/routes/packs/page.tsx` (`defineRouteConfig`) + odds editor
  widget `defineWidgetConfig({ zone: "product.details.after" })`, weights table in `@medusajs/ui`,
  live `pull chance % = weight / Σweights`.
- **Realtime:** Medusa has **no built-in client WebSocket** — add Socket.io via a loader, a
  `pack.opened` subscriber emits to a room; Redis adapter only for prod/multi-process.

## Component → Medusa Store API wiring map

Pattern (verified for Next 16): fetch in an `async` **server component**, pass data as props into the
existing `"use client"` component (keeps its animations). `src/app/marketplace/page.tsx` already does
this split — replicate it. Introduce a `src/lib/data/*.ts` seam first so the app never breaks.

| File | Today | Rewire to |
|---|---|---|
| `src/app/marketplace/MarketplaceClient.tsx` | 16 hardcoded `CARDS`, 13 `CATEGORIES` | `sdk.store.product.list()` + `productCategory.list()` (price/fmv from variant + metadata) |
| `src/components/OpenPacksSection.tsx` | 6 hardcoded categories | `GET /store/packs?group=category` |
| `src/app/claw/page.tsx` | hardcoded packs; "Open" inert | list via `GET /store/packs`; **"Open" → `POST /store/packs/:id/open`** (customer JWT) → reveal animation from returned `Card`/`Pull` |
| `src/components/RecentPullsSection.tsx` | 8 hardcoded pulls | initial `GET /store/pulls/recent`; live via **Socket.io** `pack.opened` |
| `src/components/LeaderboardSection.tsx` + `src/app/leaderboard/page.tsx` | hardcoded entries/podium | `GET /store/leaderboard?period=weekly\|alltime` — aggregation over `Pull` ledger |
| `src/components/SiteHeader.tsx` | inert Login/Sign Up | auth context → `sdk.auth.login/register`, reflect `customer.retrieve()` |
| Hero / HowItWorks / Community / Cta / how-it-works / pack-party | static marketing | leave as-is (no backend data) |

Honor Next 16: `await params`/`searchParams`; `fetch` uncached by default (use `<Suspense>` / `use cache`
for live + leaderboard); add `loading.tsx` for `/marketplace`, `/leaderboard`, `/claw`.

## Phased sequence (app stays runnable; each phase ends green via `npm run check`)

0. **Backend scaffold.** Local Postgres up → `npx create-medusa-app@latest backend`; admin loads at
   `:9000/app`, log in, create publishable key + sales channel. Set `*_CORS` to include `:3000`.
1. **SDK seam (no UI change).** Add `@medusajs/js-sdk`; create `src/lib/medusa.ts` + `src/lib/data/*.ts`
   returning the *current* hardcoded arrays; add `.env.local`. App runs identically.
2. **Catalog.** Seed card products + categories in Medusa; flip `lib/data/products.ts` to
   `sdk.store.product.list`; server-fetch in `marketplace/page.tsx` and home `OpenPacksSection`.
3. **Auth.** Storefront auth context + Login/Sign Up via `sdk.auth.*`; header reflects session.
4. **Packs module.** Models + service + links; `db:generate packs` + `db:migrate`; seed packs/odds;
   `GET /store/packs`; wire `/claw` listing.
5. **open-pack workflow + Stripe.** Stripe test provider + region; workflow
   (validate → charge → weighted seeded roll → reserve inventory → write `Pull` → emit `pack.opened`),
   each step with compensation; `POST /store/packs/:id/open`; wire claw "Open" → reveal.
6. **Admin odds.** `/app/packs` route + odds widget with live pull-chance %; validate weights ≥0, Σ>0.
7. **Realtime + leaderboard.** Socket.io loader + `pack.opened` subscriber → room; `GET /store/pulls/recent`
   and `GET /store/leaderboard` (ledger aggregation); wire live feed + leaderboard tabs.
8. **Polish/QA.** `loading.tsx`/error boundaries, realistic seed data, responsive QA, `npm run check` both apps.

## Verification

- **Per phase:** root `npm run check` (lint + typecheck + build) stays green; `backend` `npm run dev` boots.
- **Phase 0:** admin dashboard loads at `:9000/app`, login succeeds, seed products visible.
- **Phase 2/3:** marketplace + home render real Medusa data; register/login round-trips; header shows user.
- **Phase 5 (critical):** logged-in user opens a pack → Stripe **test** payment → weighted card revealed →
  `Pull` row written. **Force a mid-workflow failure** and confirm the Stripe charge + inventory reserve
  roll back (no orphaned charge, no lost card).
- **Phase 7:** open a pack in tab A → live-pulls feed + leaderboard update in tab B.
- **Hard rules:** Stripe stays `sk_test_`; all accounts/cards/packs/pulls are seeded/fake.

## Risks

- **Atomicity** of charge↔inventory is the whole point of workflow compensation — test the rollback path.
- **Auth gate**: `/claw` open needs a customer JWT + publishable key — Phase 3 must precede Phase 5 usefully.
- **Two ports / two `node_modules`** (`:3000` storefront, `:9000` backend) — never run `create-medusa-app`
  at the repo root.
- **Next 16 async APIs** and uncached `fetch` — keep animations in client components, fetch in server parents.
- Medusa is a multi-week backend to learn; the phased order keeps the app runnable throughout.
