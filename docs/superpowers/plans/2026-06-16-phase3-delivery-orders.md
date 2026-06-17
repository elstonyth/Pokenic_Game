# Phase 3 — Delivery & Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer request physical delivery of vaulted cards (batch, address captured, no charge in v1), and let admins track + fulfill those delivery orders.

**Architecture:** Two new MedusaORM models (`DeliveryOrder` + `DeliveryOrderItem`) live in the existing `packs` module. A `requestDeliveryWorkflow` validates ownership/vaulted-state, snapshots the chosen Medusa customer address, creates the order + items, and flips the selected pulls to `delivering` (compensated rollback on failure). Admin status transitions (`packing → shipped → delivered`, or `canceled`) run through an `updateDeliveryOrderWorkflow` that flips pulls to `delivered`/`vaulted` accordingly. Store routes (`/store/delivery-orders`) and admin routes (`/admin/delivery-orders`) mirror the existing Phase-2 vault/showcase route patterns exactly (GET/POST/DELETE only — no PUT/PATCH). Storefront vault gains a multi-select → address → review flow; the Orders tab swaps the stock-Medusa read for the new delivery-orders read. Admin gains a `Deliveries` page wired through the existing `qk` + React Query seam, calling the backend via `admin-rest.ts` direct fetch (no codegen dependency).

**Tech Stack:** Medusa v2 (`@medusajs/framework`), Mercur 2.1.6, MikroORM migrations, Jest (`@swc/jest`, `medusaIntegrationTestRunner`), Next.js 16 App Router (server actions + `sdk.client.fetch`), Vite admin (`@medusajs/ui` + `@tanstack/react-query`), Playwright (`scripts/*.mjs`).

**Lifecycle invariants (the contract this whole phase upholds):**
- A pull's `status` moves `vaulted → delivering → delivered` (terminal) or `delivering → vaulted` (on order cancel). `bought_back` is unreachable once `delivering` (it's not `vaulted`).
- A `delivering`/`delivered` pull can NOT be sold back or showcased (existing routes already gate on `status === 'vaulted'`).
- **No inventory mutation in the delivery flow.** The physical unit was earmarked at pack-open (`stock_earmarked`); shipping consumes it (stock stays decremented), cancel leaves it reserved (still `vaulted`). Buyback (only reachable while `vaulted`) remains the sole stock-restore path.
- **No credit/ledger change.** v1 is address-only; `shipping_fee` is nullable and unused.

---

## File Structure

**Backend — create:**
- `backend/packages/api/src/modules/packs/models/delivery-order.ts` — `DeliveryOrder` model (status + denormalized address snapshot + tracking/fee/timestamps).
- `backend/packages/api/src/modules/packs/models/delivery-order-item.ts` — `DeliveryOrderItem` join (order ↔ pull).
- `backend/packages/api/src/modules/packs/delivery.ts` — pure logic: `validateDeliveryRequest`, `validateDeliveryStatusTransition`, address-snapshot mapper, the status enum constant. Unit-tested.
- `backend/packages/api/src/workflows/request-delivery.ts` + `steps/request-delivery.ts` — create order workflow (compensated).
- `backend/packages/api/src/workflows/update-delivery-order.ts` + `steps/update-delivery-order.ts` — admin status/tracking transition workflow (compensated).
- `backend/packages/api/src/api/store/delivery-orders/route.ts` — `POST` (request) + `GET` (list mine).
- `backend/packages/api/src/api/store/delivery-orders/[id]/route.ts` — `GET` (detail).
- `backend/packages/api/src/api/store/delivery-orders/[id]/address/route.ts` — `POST` (edit address pre-ship).
- `backend/packages/api/src/api/admin/delivery-orders/route.ts` — `GET` (list + status filter).
- `backend/packages/api/src/api/admin/delivery-orders/[id]/route.ts` — `GET` (detail) + `POST` (status/tracking update).
- `backend/packages/api/src/api/admin/delivery-orders/validate.ts` — admin body coercion helpers.
- `backend/packages/api/src/modules/packs/__tests__/delivery.unit.spec.ts` — unit tests for the pure logic.
- `backend/packages/api/integration-tests/http/delivery-orders.spec.ts` — store + admin integration test.

**Backend — modify:**
- `backend/packages/api/src/modules/packs/models/pull.ts` — extend `status` enum: `+ "delivering" + "delivered"`.
- `backend/packages/api/src/modules/packs/service.ts` — register `DeliveryOrder` + `DeliveryOrderItem` in `MedusaService({...})`.
- `backend/packages/api/src/modules/packs/migrations/MigrationYYYYMMDDHHMMSS.ts` — new tables + Pull status CHECK-constraint widen (generated via `db:generate`).
- `backend/packages/api/src/api/middlewares.ts` — register `authenticate('customer', ['bearer'])` for the `/store/delivery-orders*` matchers.

**Storefront — create:**
- `src/lib/actions/delivery.ts` — server actions: `getDeliveryOrders`, `requestDelivery`, `editDeliveryAddress`, `getAddresses`, `addAddress`.
- `src/components/account/RequestDeliveryModal.tsx` — multi-select review + address picker UI.

**Storefront — modify:**
- `src/lib/data/schemas.ts` — `DeliveryOrderSchema`, `DeliveryAddressSchema`.
- `src/app/(account)/vault/VaultClient.tsx` — multi-select mode + "Request delivery" entry point.
- `src/app/(account)/orders/page.tsx` — swap `getOrders()` for `getDeliveryOrders()`.

**Admin — create:**
- `backend/apps/admin/src/routes/deliveries/page.tsx` — list + detail/edit page.

**Admin — modify:**
- `backend/apps/admin/src/lib/admin-rest.ts` — `listDeliveryOrders`, `getDeliveryOrder`, `updateDeliveryOrder` + types.
- `backend/apps/admin/src/lib/query-keys.ts` — `qk.deliveryOrders(status?)`, `qk.deliveryOrder(id)`.
- `backend/apps/admin/src/lib/queries.ts` — `useDeliveryOrders`, `useDeliveryOrder`, `useUpdateDeliveryOrder`.

**Verification — create:**
- `scripts/capture-delivery.mjs` — Playwright capture of the vault request flow + Orders tab.

---

## API Surface (final — GET/POST/DELETE only)

| Method + Route | Auth | Purpose |
|---|---|---|
| `POST /store/delivery-orders` | customer bearer | Request batch delivery `{ pull_ids: string[], address_id: string }` |
| `GET /store/delivery-orders` | customer bearer | List the caller's delivery orders (+ item thumbnails, status, tracking) |
| `GET /store/delivery-orders/:id` | customer bearer | One order detail (ownership-gated) |
| `POST /store/delivery-orders/:id/address` | customer bearer | Edit address snapshot while `requested`/`packing` |
| `GET /admin/delivery-orders?status=` | admin (auto) | List all orders, optional status filter |
| `GET /admin/delivery-orders/:id` | admin (auto) | One order detail (items, address, customer email) |
| `POST /admin/delivery-orders/:id` | admin (auto) | Update `{ status?, tracking_number? }` (the spec's `PATCH`, as POST) |

> Spec wrote `PATCH` for the address edit and admin update; this repo uses **POST sub-paths / POST-to-detail** (no PUT/PATCH anywhere — confirmed in `middlewares.ts` and `admin/cards/[handle]/route.ts`).

---

## Task 0: Pre-flight (worktree + due-diligence)

**Files:** none (environment + research)

- [ ] **Step 1: Confirm worktree is built & env is present**

This worktree was prepped at plan time: root `npm install` done, `.env.local` + `backend/packages/api/.env` copied from the main repo. Still required before backend work:

```
cd backend/packages/odds-math && corepack yarn build   # @acme/odds-math dist (imported by service/tests)
```
Confirm `pokenic-postgres` + `pokenic-redis` containers are up:
```
docker ps --format "{{.Names}}" | findstr pokenic
```
Expected: both `pokenic-postgres` and `pokenic-redis` listed.

- [ ] **Step 2: Registry due-diligence (per backend/CLAUDE.md)**

```
npx @mercurjs/cli@latest search --query delivery
npx @mercurjs/cli@latest search --query fulfillment
```
Expected: no block matches this gacha-vault-specific delivery model. Proceed with the custom implementation below. (If a relevant block appears, STOP and surface it before building.)

---

## Task 1: `DeliveryOrder` + `DeliveryOrderItem` models

**Files:**
- Create: `backend/packages/api/src/modules/packs/models/delivery-order.ts`
- Create: `backend/packages/api/src/modules/packs/models/delivery-order-item.ts`

- [ ] **Step 1: Write `delivery-order.ts`**

```typescript
import { model } from "@medusajs/framework/utils";

// DeliveryOrder — a customer's request to physically ship one or more vaulted
// cards. The address is a DENORMALIZED SNAPSHOT taken from the Medusa customer
// address book at request time, so later edits to the address book never
// rewrite a shipped order. v1: address-only — shipping_fee is reserved (nullable,
// no charge logic yet).
export const DeliveryOrder = model
  .define("delivery_order", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    status: model
      .enum(["requested", "packing", "shipped", "delivered", "canceled"])
      .default("requested"),
    // Address snapshot (denormalized from StoreCustomerAddress at request time).
    ship_name: model.text(),
    ship_address_1: model.text(),
    ship_address_2: model.text().nullable(),
    ship_city: model.text(),
    ship_province: model.text().nullable(),
    ship_postal_code: model.text(),
    ship_country_code: model.text(),
    ship_phone: model.text().nullable(),
    // Operator-entered (manual) — no carrier integration in v1.
    tracking_number: model.text().nullable(),
    // Reserved for a future "price the shipping" pass; never set in v1.
    shipping_fee: model.bigNumber().nullable(),
    shipped_at: model.dateTime().nullable(),
    delivered_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_delivery_order_customer_id_created_at",
      on: ["customer_id", "created_at"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_delivery_order_status",
      on: ["status"],
      where: "deleted_at IS NULL",
    },
  ]);

export default DeliveryOrder;
```

- [ ] **Step 2: Write `delivery-order-item.ts`**

```typescript
import { model } from "@medusajs/framework/utils";

// DeliveryOrderItem — join between a DeliveryOrder and the Pull being shipped.
// One order → many items. pull_id is NOT globally unique (a canceled order
// returns the pull to the vault, where it can be re-requested), but a pull can
// only be in ONE active order at a time — that invariant is enforced by the
// Pull.status === "vaulted" gate in requestDeliveryWorkflow, not a DB constraint.
export const DeliveryOrderItem = model
  .define("delivery_order_item", {
    id: model.id().primaryKey(),
    delivery_order_id: model.text(),
    pull_id: model.text(),
  })
  .indexes([
    {
      name: "IDX_delivery_order_item_order_id",
      on: ["delivery_order_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_delivery_order_item_pull_id",
      on: ["pull_id"],
      where: "deleted_at IS NULL",
    },
  ]);

export default DeliveryOrderItem;
```

- [ ] **Step 3: Commit**

```
git add backend/packages/api/src/modules/packs/models/delivery-order.ts backend/packages/api/src/modules/packs/models/delivery-order-item.ts
git commit -m "feat(delivery): add DeliveryOrder + DeliveryOrderItem models"
```

---

## Task 2: Extend `Pull.status` + register new models in the service

**Files:**
- Modify: `backend/packages/api/src/modules/packs/models/pull.ts`
- Modify: `backend/packages/api/src/modules/packs/service.ts`

- [ ] **Step 1: Widen the `Pull.status` enum**

In `models/pull.ts`, change the `status` line from:
```typescript
    status: model.enum(["vaulted", "bought_back"]).default("vaulted"),
```
to:
```typescript
    // vaulted → delivering (in an active delivery order) → delivered (terminal);
    // delivering → vaulted on order cancel. bought_back only reachable while vaulted.
    status: model
      .enum(["vaulted", "bought_back", "delivering", "delivered"])
      .default("vaulted"),
```

- [ ] **Step 2: Register the two models in the service**

In `service.ts`, add the imports under the existing model imports:
```typescript
import DeliveryOrder from "./models/delivery-order";
import DeliveryOrderItem from "./models/delivery-order-item";
```
and extend the `MedusaService({...})` argument so it reads:
```typescript
class PacksModuleService extends MedusaService({
  Pack,
  Card,
  PackOdds,
  Pull,
  CreditTransaction,
  DeliveryOrder,
  DeliveryOrderItem,
}) {
```
This auto-generates `listDeliveryOrders`, `createDeliveryOrders`, `updateDeliveryOrders`, `deleteDeliveryOrders`, `listDeliveryOrderItems`, `createDeliveryOrderItems`, `deleteDeliveryOrderItems`.

- [ ] **Step 3: Commit**

```
git add backend/packages/api/src/modules/packs/models/pull.ts backend/packages/api/src/modules/packs/service.ts
git commit -m "feat(delivery): extend Pull.status enum + register delivery models"
```

---

## Task 3: Migration

**Files:**
- Create: `backend/packages/api/src/modules/packs/migrations/MigrationYYYYMMDDHHMMSS.ts` (generated)

- [ ] **Step 1: Generate the migration from the model changes**

```
cd backend/packages/api && corepack yarn exec medusa db:generate packs
```
This writes a new `Migration<UTC timestamp>.ts` in `src/modules/packs/migrations/`.

- [ ] **Step 2: Verify the generated SQL matches the expected shape**

Open the new migration. The `up()` must (a) create both tables and (b) widen the Pull status CHECK constraint. If `db:generate` did not emit the CHECK-constraint widen for `pull.status` (MikroORM sometimes misses enum-only changes), hand-edit `up()`/`down()` to match this — the constraint widen is mandatory or `delivering`/`delivered` writes will fail:

```typescript
import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class MigrationYYYYMMDDHHMMSS extends Migration {
  override async up(): Promise<void> {
    // New tables
    this.addSql(
      `create table if not exists "delivery_order" ("id" text not null, "customer_id" text not null, "status" text check ("status" in ('requested', 'packing', 'shipped', 'delivered', 'canceled')) not null default 'requested', "ship_name" text not null, "ship_address_1" text not null, "ship_address_2" text null, "ship_city" text not null, "ship_province" text null, "ship_postal_code" text not null, "ship_country_code" text not null, "ship_phone" text null, "tracking_number" text null, "shipping_fee" numeric null, "raw_shipping_fee" jsonb null, "shipped_at" timestamptz null, "delivered_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_order_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_order_customer_id_created_at" ON "delivery_order" ("customer_id", "created_at") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_order_status" ON "delivery_order" ("status") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `create table if not exists "delivery_order_item" ("id" text not null, "delivery_order_id" text not null, "pull_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_order_item_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_order_item_order_id" ON "delivery_order_item" ("delivery_order_id") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_order_item_pull_id" ON "delivery_order_item" ("pull_id") WHERE deleted_at IS NULL;`,
    );

    // Widen the Pull status CHECK constraint (drop + recreate).
    this.addSql(
      `alter table if exists "pull" drop constraint if exists "pull_status_check";`,
    );
    this.addSql(
      `alter table if exists "pull" add constraint "pull_status_check" check ("status" in ('vaulted', 'bought_back', 'delivering', 'delivered'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_order_item" cascade;`);
    this.addSql(`drop table if exists "delivery_order" cascade;`);

    // Narrow the constraint back; existing delivering/delivered rows would
    // violate it, so settle them to vaulted first (mirrors the reason-enum
    // down() pattern in Migration20260612002121).
    this.addSql(
      `alter table if exists "pull" drop constraint if exists "pull_status_check";`,
    );
    this.addSql(
      `update "pull" set "status" = 'vaulted' where "status" in ('delivering', 'delivered');`,
    );
    this.addSql(
      `alter table if exists "pull" add constraint "pull_status_check" check ("status" in ('vaulted', 'bought_back'));`,
    );
  }
}
```
(The real constraint name is whatever Postgres assigned — confirm with `\d pull` in `psql` if `pull_status_check` differs; the project's earlier enum migration uses the `<table>_<col>_check` convention.)

- [ ] **Step 3: Apply the migration**

```
cd backend/packages/api && corepack yarn exec medusa db:migrate
```
Expected: migration runs clean; `psql -h localhost -U medusa -d medusa -c "\d delivery_order"` shows the table.

- [ ] **Step 4: Commit**

```
git add backend/packages/api/src/modules/packs/migrations/
git commit -m "feat(delivery): migration for delivery tables + Pull status widen"
```

---

## Task 4: Pure logic — `validateDeliveryRequest` (TDD)

**Files:**
- Create: `backend/packages/api/src/modules/packs/delivery.ts`
- Test: `backend/packages/api/src/modules/packs/__tests__/delivery.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import {
  validateDeliveryRequest,
  validateDeliveryStatusTransition,
  snapshotAddress,
  DELIVERY_STATUSES,
} from "../delivery";

describe("validateDeliveryRequest", () => {
  const caller = "cus_1";
  const vaulted = (id: string, customer_id = caller) => ({
    id,
    customer_id,
    status: "vaulted" as const,
  });

  it("returns ok when every requested pull is owned and vaulted", () => {
    const pulls = [vaulted("p1"), vaulted("p2")];
    expect(validateDeliveryRequest(pulls, ["p1", "p2"], caller)).toBe("ok");
  });

  it("rejects an empty selection", () => {
    expect(validateDeliveryRequest([], [], caller)).toBe("empty");
  });

  it("rejects when a requested id is missing from the fetched pulls", () => {
    expect(validateDeliveryRequest([vaulted("p1")], ["p1", "p2"], caller)).toBe(
      "not_found",
    );
  });

  it("rejects a pull owned by someone else (no existence leak)", () => {
    const pulls = [vaulted("p1"), vaulted("p2", "cus_2")];
    expect(validateDeliveryRequest(pulls, ["p1", "p2"], caller)).toBe(
      "forbidden",
    );
  });

  it("rejects a pull that is not vaulted (already delivering/sold)", () => {
    const pulls = [
      vaulted("p1"),
      { id: "p2", customer_id: caller, status: "delivering" as const },
    ];
    expect(validateDeliveryRequest(pulls, ["p1", "p2"], caller)).toBe(
      "not_vaulted",
    );
  });

  it("rejects duplicate ids in the selection", () => {
    expect(validateDeliveryRequest([vaulted("p1")], ["p1", "p1"], caller)).toBe(
      "duplicate",
    );
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

```
cd backend/packages/api && corepack yarn test:unit -- delivery
```
Expected: FAIL — "Cannot find module '../delivery'".

- [ ] **Step 3: Write `delivery.ts` (validateDeliveryRequest portion)**

```typescript
import type { HttpTypes } from "@medusajs/types";

export const DELIVERY_STATUSES = [
  "requested",
  "packing",
  "shipped",
  "delivered",
  "canceled",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

type PullLike = { id: string; customer_id: string; status: string };

export type DeliveryRequestVerdict =
  | "ok"
  | "empty"
  | "duplicate"
  | "not_found"
  | "forbidden"
  | "not_vaulted";

// Pure validation for a batch delivery request. `fetchedPulls` is whatever the
// DB returned for `requestedIds`; ownership failure and unknown id BOTH map to
// the same caller-facing 404 upstream (no existence leak), but we distinguish
// them here for precise logging/branching.
export function validateDeliveryRequest(
  fetchedPulls: PullLike[],
  requestedIds: string[],
  callerId: string,
): DeliveryRequestVerdict {
  if (requestedIds.length === 0) return "empty";
  if (new Set(requestedIds).size !== requestedIds.length) return "duplicate";

  const byId = new Map(fetchedPulls.map((p) => [p.id, p]));
  for (const id of requestedIds) {
    const pull = byId.get(id);
    if (!pull) return "not_found";
    if (pull.customer_id !== callerId) return "forbidden";
    if (pull.status !== "vaulted") return "not_vaulted";
  }
  return "ok";
}
```

- [ ] **Step 4: Run the test — confirm the `validateDeliveryRequest` block passes**

```
cd backend/packages/api && corepack yarn test:unit -- delivery
```
Expected: the `validateDeliveryRequest` describe passes; the other two describes still fail (functions not yet defined). Proceed to Task 5.

---

## Task 5: Pure logic — `validateDeliveryStatusTransition` + `snapshotAddress` (TDD)

**Files:**
- Modify: `backend/packages/api/src/modules/packs/delivery.ts`
- Modify: `backend/packages/api/src/modules/packs/__tests__/delivery.unit.spec.ts`

- [ ] **Step 1: Append the failing tests**

```typescript
describe("validateDeliveryStatusTransition", () => {
  it("allows requested → packing", () => {
    expect(validateDeliveryStatusTransition("requested", "packing", false)).toBe(
      "ok",
    );
  });

  it("requires tracking for packing → shipped", () => {
    expect(validateDeliveryStatusTransition("packing", "shipped", false)).toBe(
      "tracking_required",
    );
    expect(validateDeliveryStatusTransition("packing", "shipped", true)).toBe(
      "ok",
    );
  });

  it("allows shipped → delivered", () => {
    expect(validateDeliveryStatusTransition("shipped", "delivered", true)).toBe(
      "ok",
    );
  });

  it("allows cancel only before shipping", () => {
    expect(validateDeliveryStatusTransition("requested", "canceled", false)).toBe(
      "ok",
    );
    expect(validateDeliveryStatusTransition("packing", "canceled", false)).toBe(
      "ok",
    );
    expect(validateDeliveryStatusTransition("shipped", "canceled", true)).toBe(
      "invalid_transition",
    );
  });

  it("rejects skips and moves out of terminal states", () => {
    expect(validateDeliveryStatusTransition("requested", "shipped", true)).toBe(
      "invalid_transition",
    );
    expect(validateDeliveryStatusTransition("delivered", "shipped", true)).toBe(
      "invalid_transition",
    );
    expect(validateDeliveryStatusTransition("canceled", "packing", false)).toBe(
      "invalid_transition",
    );
  });

  it("rejects a no-op transition to the same status", () => {
    expect(validateDeliveryStatusTransition("packing", "packing", false)).toBe(
      "invalid_transition",
    );
  });
});

describe("snapshotAddress", () => {
  it("maps a Medusa address to the order snapshot fields", () => {
    const addr = {
      first_name: "Ada",
      last_name: "Lovelace",
      address_1: "1 Analytical Way",
      address_2: "Apt 2",
      city: "London",
      province: null,
      postal_code: "EC1",
      country_code: "gb",
      phone: "555",
    } as HttpTypes.StoreCustomerAddress;
    expect(snapshotAddress(addr)).toEqual({
      ship_name: "Ada Lovelace",
      ship_address_1: "1 Analytical Way",
      ship_address_2: "Apt 2",
      ship_city: "London",
      ship_province: null,
      ship_postal_code: "EC1",
      ship_country_code: "gb",
      ship_phone: "555",
    });
  });

  it("returns null when a required field is missing", () => {
    expect(
      snapshotAddress({ first_name: "Ada" } as HttpTypes.StoreCustomerAddress),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd backend/packages/api && corepack yarn test:unit -- delivery
```
Expected: the two new describes FAIL.

- [ ] **Step 3: Append the implementations to `delivery.ts`**

```typescript
export type TransitionVerdict = "ok" | "invalid_transition" | "tracking_required";

// Allowed admin transitions. Cancel is only legal before the parcel ships
// (a shipped parcel can't revert to the vault). delivered/canceled are terminal.
const ALLOWED: Record<DeliveryStatus, DeliveryStatus[]> = {
  requested: ["packing", "canceled"],
  packing: ["shipped", "canceled"],
  shipped: ["delivered"],
  delivered: [],
  canceled: [],
};

export function validateDeliveryStatusTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  hasTracking: boolean,
): TransitionVerdict {
  if (!ALLOWED[from]?.includes(to)) return "invalid_transition";
  if (to === "shipped" && !hasTracking) return "tracking_required";
  return "ok";
}

export type AddressSnapshot = {
  ship_name: string;
  ship_address_1: string;
  ship_address_2: string | null;
  ship_city: string;
  ship_province: string | null;
  ship_postal_code: string;
  ship_country_code: string;
  ship_phone: string | null;
};

// Denormalize a Medusa customer address into the order snapshot. Returns null
// when a shippable-required field is missing (the caller turns that into a
// clean INVALID_DATA error). province/address_2/phone are optional.
export function snapshotAddress(
  addr: Partial<HttpTypes.StoreCustomerAddress>,
): AddressSnapshot | null {
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(" ").trim();
  if (
    !name ||
    !addr.address_1 ||
    !addr.city ||
    !addr.postal_code ||
    !addr.country_code
  ) {
    return null;
  }
  return {
    ship_name: name,
    ship_address_1: addr.address_1,
    ship_address_2: addr.address_2 ?? null,
    ship_city: addr.city,
    ship_province: addr.province ?? null,
    ship_postal_code: addr.postal_code,
    ship_country_code: addr.country_code,
    ship_phone: addr.phone ?? null,
  };
}
```

- [ ] **Step 4: Run the full unit file — all green**

```
cd backend/packages/api && corepack yarn test:unit -- delivery
```
Expected: all three describes PASS.

- [ ] **Step 5: Commit**

```
git add backend/packages/api/src/modules/packs/delivery.ts backend/packages/api/src/modules/packs/__tests__/delivery.unit.spec.ts
git commit -m "feat(delivery): pure validators + address snapshot (unit-tested)"
```

---

## Task 6: `requestDeliveryWorkflow` + step (compensated)

**Files:**
- Create: `backend/packages/api/src/workflows/steps/request-delivery.ts`
- Create: `backend/packages/api/src/workflows/request-delivery.ts`

- [ ] **Step 1: Write the step `steps/request-delivery.ts`**

Mirrors `steps/buyback-pull.ts` (validation → mutations → `StepResponse(result, compensateData)` → compensation reverses). Address is resolved from the Medusa Customer module and verified to belong to the caller.

```typescript
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import {
  validateDeliveryRequest,
  snapshotAddress,
} from "../../modules/packs/delivery";

export type RequestDeliveryInput = {
  customer_id: string; // from the authenticated token — NEVER the request body
  pull_ids: string[];
  address_id: string;
};

export type RequestDeliveryResult = {
  order_id: string;
  status: "requested";
  pull_ids: string[];
};

type CompensateData =
  | { orderId: string; itemIds: string[]; pullIds: string[] }
  | undefined;

const verdictError = (
  v: ReturnType<typeof validateDeliveryRequest>,
): MedusaError => {
  switch (v) {
    case "empty":
      return new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Select at least one card to deliver.",
      );
    case "duplicate":
      return new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Duplicate cards in the selection.",
      );
    case "not_vaulted":
      return new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "One or more cards are no longer available to deliver.",
      );
    // not_found AND forbidden both surface as 404 — no cross-account leak.
    default:
      return new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "One or more cards were not found.",
      );
  }
};

export const requestDeliveryStep = createStep(
  "request-delivery",
  async (input: RequestDeliveryInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const customerModule = container.resolve(Modules.CUSTOMER);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    // 1. Validate the selection (ownership + vaulted).
    const pulls = input.pull_ids.length
      ? await packs.listPulls(
          { id: input.pull_ids },
          { take: input.pull_ids.length },
        )
      : [];
    const verdict = validateDeliveryRequest(
      pulls,
      input.pull_ids,
      input.customer_id,
    );
    if (verdict !== "ok") throw verdictError(verdict);

    // 2. Resolve + verify the address belongs to the caller, then snapshot it.
    const [address] = await customerModule.listCustomerAddresses(
      { id: input.address_id, customer_id: input.customer_id },
      { take: 1 },
    );
    if (!address) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Shipping address not found.",
      );
    }
    const snapshot = snapshotAddress(address);
    if (!snapshot) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "That address is missing required shipping fields.",
      );
    }

    // 3. Create the order.
    const [order] = await packs.createDeliveryOrders([
      { customer_id: input.customer_id, status: "requested", ...snapshot },
    ]);

    // 4. Create the items (manual undo if this throws — order already exists).
    let itemIds: string[] = [];
    try {
      const items = await packs.createDeliveryOrderItems(
        input.pull_ids.map((pull_id) => ({
          delivery_order_id: order.id,
          pull_id,
        })),
      );
      itemIds = items.map((i) => i.id);
    } catch (error) {
      try {
        await packs.deleteDeliveryOrders([order.id]);
      } catch (undoError) {
        logger.error(
          `request-delivery: UNDO FAILED — order '${order.id}' exists with no items; repair manually. ${
            undoError instanceof Error ? undoError.message : String(undoError)
          }`,
        );
      }
      throw error;
    }

    // 5. Flip pulls vaulted → delivering (manual undo on failure).
    try {
      await packs.updatePulls(
        input.pull_ids.map((id) => ({ id, status: "delivering" as const })),
      );
    } catch (error) {
      try {
        await packs.deleteDeliveryOrderItems(itemIds);
        await packs.deleteDeliveryOrders([order.id]);
      } catch (undoError) {
        logger.error(
          `request-delivery: UNDO FAILED after pull flip — order '${order.id}'; repair manually. ${
            undoError instanceof Error ? undoError.message : String(undoError)
          }`,
        );
      }
      throw error;
    }

    const result: RequestDeliveryResult = {
      order_id: order.id,
      status: "requested",
      pull_ids: input.pull_ids,
    };
    return new StepResponse(result, {
      orderId: order.id,
      itemIds,
      pullIds: input.pull_ids,
    } satisfies CompensateData);
  },
  // COMPENSATION — reverse everything if a later step fails.
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.updatePulls(
      data.pullIds.map((id) => ({ id, status: "vaulted" as const })),
    );
    await packs.deleteDeliveryOrderItems(data.itemIds);
    await packs.deleteDeliveryOrders([data.orderId]);
  },
);

export default requestDeliveryStep;
```

- [ ] **Step 2: Write the workflow `request-delivery.ts`**

```typescript
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  requestDeliveryStep,
  type RequestDeliveryInput,
} from "./steps/request-delivery";

// request-delivery — a customer requests physical delivery of a batch of
// vaulted pulls: validate ownership + vaulted state, snapshot the chosen
// address, create the order + items, and flip the pulls to delivering. Single
// compensated step (the pure body leaves room to append an audit/event step).
export const requestDeliveryWorkflow = createWorkflow(
  "request-delivery",
  function (input: RequestDeliveryInput) {
    const result = requestDeliveryStep(input);
    return new WorkflowResponse(result);
  },
);

export default requestDeliveryWorkflow;
```

- [ ] **Step 3: Typecheck**

```
cd backend/packages/api && corepack yarn build
```
Expected: build succeeds (this is also the hook gate). Fix any type errors before continuing.

- [ ] **Step 4: Commit**

```
git add backend/packages/api/src/workflows/request-delivery.ts backend/packages/api/src/workflows/steps/request-delivery.ts
git commit -m "feat(delivery): requestDeliveryWorkflow with compensation"
```

---

## Task 7: `updateDeliveryOrderWorkflow` + step (admin transitions, compensated)

**Files:**
- Create: `backend/packages/api/src/workflows/steps/update-delivery-order.ts`
- Create: `backend/packages/api/src/workflows/update-delivery-order.ts`

- [ ] **Step 1: Write the step `steps/update-delivery-order.ts`**

```typescript
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";
import {
  validateDeliveryStatusTransition,
  type DeliveryStatus,
} from "../../modules/packs/delivery";

export type UpdateDeliveryOrderInput = {
  order_id: string;
  status?: DeliveryStatus;
  tracking_number?: string | null;
};

export type UpdateDeliveryOrderResult = {
  order_id: string;
  status: DeliveryStatus;
};

type CompensateData =
  | {
      orderId: string;
      prev: {
        status: DeliveryStatus;
        tracking_number: string | null;
        shipped_at: Date | null;
        delivered_at: Date | null;
      };
      pullIds: string[];
      prevPullStatus: "delivering" | "delivered" | null; // null = unchanged
    }
  | undefined;

export const updateDeliveryOrderStep = createStep(
  "update-delivery-order",
  async (input: UpdateDeliveryOrderInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    const [order] = await packs.listDeliveryOrders(
      { id: input.order_id },
      { take: 1 },
    );
    if (!order) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Delivery order '${input.order_id}' not found.`,
      );
    }

    const nextTracking =
      input.tracking_number !== undefined
        ? input.tracking_number
        : order.tracking_number;

    // Tracking-only update (no status change) — just patch + return.
    if (!input.status || input.status === order.status) {
      await packs.updateDeliveryOrders([
        { id: order.id, tracking_number: nextTracking },
      ]);
      return new StepResponse(
        { order_id: order.id, status: order.status as DeliveryStatus },
        {
          orderId: order.id,
          prev: {
            status: order.status as DeliveryStatus,
            tracking_number: order.tracking_number ?? null,
            shipped_at: order.shipped_at ?? null,
            delivered_at: order.delivered_at ?? null,
          },
          pullIds: [],
          prevPullStatus: null,
        } satisfies CompensateData,
      );
    }

    // Status transition — validate the move.
    const verdict = validateDeliveryStatusTransition(
      order.status as DeliveryStatus,
      input.status,
      !!nextTracking,
    );
    if (verdict === "invalid_transition") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Cannot move a ${order.status} order to ${input.status}.`,
      );
    }
    if (verdict === "tracking_required") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A tracking number is required to mark an order shipped.",
      );
    }

    // Which pulls this order covers (needed for delivered/canceled side-effects).
    const items = await packs.listDeliveryOrderItems(
      { delivery_order_id: order.id },
      { take: 1000 },
    );
    const pullIds = items.map((i) => i.pull_id);

    // Compute timestamp side-effects.
    const now = new Date();
    const patch: Record<string, unknown> = {
      id: order.id,
      status: input.status,
      tracking_number: nextTracking,
    };
    if (input.status === "shipped") patch.shipped_at = now;
    if (input.status === "delivered") patch.delivered_at = now;

    await packs.updateDeliveryOrders([patch]);

    // Pull side-effects: delivered → delivered (terminal); canceled → vaulted.
    let prevPullStatus: "delivering" | "delivered" | null = null;
    if (input.status === "delivered" && pullIds.length) {
      prevPullStatus = "delivering";
      await packs.updatePulls(
        pullIds.map((id) => ({ id, status: "delivered" as const })),
      );
    } else if (input.status === "canceled" && pullIds.length) {
      prevPullStatus = "delivering";
      await packs.updatePulls(
        pullIds.map((id) => ({ id, status: "vaulted" as const })),
      );
    }

    void logger;
    return new StepResponse(
      { order_id: order.id, status: input.status },
      {
        orderId: order.id,
        prev: {
          status: order.status as DeliveryStatus,
          tracking_number: order.tracking_number ?? null,
          shipped_at: order.shipped_at ?? null,
          delivered_at: order.delivered_at ?? null,
        },
        pullIds,
        prevPullStatus,
      } satisfies CompensateData,
    );
  },
  // COMPENSATION — restore the order row and pull statuses.
  async (data: CompensateData, { container }) => {
    if (!data) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.updateDeliveryOrders([
      {
        id: data.orderId,
        status: data.prev.status,
        tracking_number: data.prev.tracking_number,
        shipped_at: data.prev.shipped_at,
        delivered_at: data.prev.delivered_at,
      },
    ]);
    if (data.prevPullStatus && data.pullIds.length) {
      await packs.updatePulls(
        data.pullIds.map((id) => ({ id, status: data.prevPullStatus! })),
      );
    }
  },
);

export default updateDeliveryOrderStep;
```

- [ ] **Step 2: Write the workflow `update-delivery-order.ts`**

```typescript
import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  updateDeliveryOrderStep,
  type UpdateDeliveryOrderInput,
} from "./steps/update-delivery-order";

// update-delivery-order — operator advances an order's status (with the
// transition rules in delivery.ts) and/or sets a tracking number. On delivered
// the covered pulls become delivered (terminal); on canceled they return to the
// vault. Single compensated step.
export const updateDeliveryOrderWorkflow = createWorkflow(
  "update-delivery-order",
  function (input: UpdateDeliveryOrderInput) {
    const result = updateDeliveryOrderStep(input);
    return new WorkflowResponse(result);
  },
);

export default updateDeliveryOrderWorkflow;
```

- [ ] **Step 3: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build
git add backend/packages/api/src/workflows/update-delivery-order.ts backend/packages/api/src/workflows/steps/update-delivery-order.ts
git commit -m "feat(delivery): updateDeliveryOrderWorkflow (admin transitions, compensated)"
```

---

## Task 8: Store routes — `POST` + `GET /store/delivery-orders`

**Files:**
- Create: `backend/packages/api/src/api/store/delivery-orders/route.ts`

- [ ] **Step 1: Write the route**

Mirrors `store/vault/route.ts` (GET list with the dedupe-and-join pattern) and `store/vault/[id]/buyback/route.ts` (POST → workflow). A shared serializer maps an order + its items + their cards into the response.

```typescript
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import PacksModuleService from "../../../modules/packs/service";
import { PACKS_MODULE } from "../../../modules/packs";
import { requestDeliveryWorkflow } from "../../../workflows/request-delivery";
import { serializeDeliveryOrders } from "../../../modules/packs/delivery-view";

const ORDER_LIMIT = 200;

// POST /store/delivery-orders — request batch delivery of vaulted pulls.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const body = req.body as
    | { pull_ids?: unknown; address_id?: unknown }
    | undefined;

  const pullIds = body?.pull_ids;
  const addressId = body?.address_id;
  if (
    !Array.isArray(pullIds) ||
    pullIds.some((id) => typeof id !== "string") ||
    typeof addressId !== "string" ||
    addressId.trim() === ""
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`pull_ids` (string[]) and `address_id` (string) are required.",
    );
  }

  const { result } = await requestDeliveryWorkflow(req.scope).run({
    input: {
      customer_id: customerId,
      pull_ids: pullIds as string[],
      address_id: addressId,
    },
  });

  res.status(201).json(result);
}

// GET /store/delivery-orders — the caller's delivery orders, newest first.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);

  const orders = await packs.listDeliveryOrders(
    { customer_id: customerId },
    { order: { created_at: "DESC" }, take: ORDER_LIMIT },
  );

  const items = await serializeDeliveryOrders(packs, orders);
  res.json({ items });
}
```

- [ ] **Step 2: Write the shared serializer `modules/packs/delivery-view.ts`**

```typescript
import type PacksModuleService from "./service";

type DeliveryOrderRow = {
  id: string;
  customer_id: string;
  status: string;
  ship_name: string;
  ship_address_1: string;
  ship_address_2: string | null;
  ship_city: string;
  ship_province: string | null;
  ship_postal_code: string;
  ship_country_code: string;
  ship_phone: string | null;
  tracking_number: string | null;
  shipped_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
};

// Build the response DTO for a set of delivery orders: each order with its
// items resolved to {pull_id, card: {name, image}}. One batched cards fetch.
export async function serializeDeliveryOrders(
  packs: PacksModuleService,
  orders: DeliveryOrderRow[],
) {
  if (orders.length === 0) return [];

  const allItems = await packs.listDeliveryOrderItems(
    { delivery_order_id: orders.map((o) => o.id) },
    { take: 5000 },
  );
  const pullIds = [...new Set(allItems.map((i) => i.pull_id))];
  const pulls = pullIds.length
    ? await packs.listPulls({ id: pullIds }, { take: pullIds.length })
    : [];
  const handles = [...new Set(pulls.map((p) => p.card_id))];
  const cards = handles.length
    ? await packs.listCards({ handle: handles }, { take: handles.length })
    : [];

  const cardByHandle = new Map(cards.map((c) => [c.handle, c]));
  const pullById = new Map(pulls.map((p) => [p.id, p]));
  const itemsByOrder = new Map<string, typeof allItems>();
  for (const it of allItems) {
    const arr = itemsByOrder.get(it.delivery_order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.delivery_order_id, arr);
  }

  return orders.map((o) => ({
    id: o.id,
    customer_id: o.customer_id,
    status: o.status,
    address: {
      name: o.ship_name,
      address_1: o.ship_address_1,
      address_2: o.ship_address_2,
      city: o.ship_city,
      province: o.ship_province,
      postal_code: o.ship_postal_code,
      country_code: o.ship_country_code,
      phone: o.ship_phone,
    },
    tracking_number: o.tracking_number,
    shipped_at: o.shipped_at,
    delivered_at: o.delivered_at,
    created_at: o.created_at,
    items: (itemsByOrder.get(o.id) ?? []).map((it) => {
      const pull = pullById.get(it.pull_id);
      const card = pull ? cardByHandle.get(pull.card_id) : undefined;
      return {
        pull_id: it.pull_id,
        card: card
          ? { handle: card.handle, name: card.name, image: card.image }
          : null,
      };
    }),
  }));
}
```

- [ ] **Step 3: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build
git add backend/packages/api/src/api/store/delivery-orders/route.ts backend/packages/api/src/modules/packs/delivery-view.ts
git commit -m "feat(delivery): POST/GET /store/delivery-orders + serializer"
```

---

## Task 9: Store routes — detail + address edit

**Files:**
- Create: `backend/packages/api/src/api/store/delivery-orders/[id]/route.ts`
- Create: `backend/packages/api/src/api/store/delivery-orders/[id]/address/route.ts`

- [ ] **Step 1: Write the detail route `[id]/route.ts`**

```typescript
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import PacksModuleService from "../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../modules/packs";
import { serializeDeliveryOrders } from "../../../../modules/packs/delivery-view";

// GET /store/delivery-orders/:id — one order the caller owns.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);

  const [order] = await packs.listDeliveryOrders({ id }, { take: 1 });
  // Unknown id and foreign order both 404 — no cross-account leak.
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.");
  }

  const [serialized] = await serializeDeliveryOrders(packs, [order]);
  res.json({ order: serialized });
}
```

- [ ] **Step 2: Write the address-edit route `[id]/address/route.ts`**

Address edits are allowed only before the parcel ships. Reuses `snapshotAddress` against the caller's address book.

```typescript
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import PacksModuleService from "../../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../../modules/packs";
import { snapshotAddress } from "../../../../../modules/packs/delivery";

// POST /store/delivery-orders/:id/address — re-snapshot the shipping address
// from the caller's address book, allowed while requested|packing only.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const body = req.body as { address_id?: unknown } | undefined;
  const addressId = body?.address_id;
  if (typeof addressId !== "string" || addressId.trim() === "") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "`address_id` (string) is required.",
    );
  }

  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const [order] = await packs.listDeliveryOrders({ id }, { take: 1 });
  if (!order || order.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.");
  }
  if (order.status !== "requested" && order.status !== "packing") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "This order has already shipped — its address is locked.",
    );
  }

  const customerModule = req.scope.resolve(Modules.CUSTOMER);
  const [address] = await customerModule.listCustomerAddresses(
    { id: addressId, customer_id: customerId },
    { take: 1 },
  );
  if (!address) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Shipping address not found.",
    );
  }
  const snapshot = snapshotAddress(address);
  if (!snapshot) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "That address is missing required shipping fields.",
    );
  }

  await packs.updateDeliveryOrders([{ id: order.id, ...snapshot }]);
  res.json({ order_id: order.id, address: snapshot });
}
```

> No workflow here — it's a single-row, single-mutation update (mirrors the showcase route, which calls `updatePulls` directly). The address edit has no compensation need.

- [ ] **Step 3: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build
git add backend/packages/api/src/api/store/delivery-orders/[id]/
git commit -m "feat(delivery): store detail + address-edit routes"
```

---

## Task 10: Register store middlewares

**Files:**
- Modify: `backend/packages/api/src/api/middlewares.ts`

- [ ] **Step 1: Add the matchers**

Insert these route entries into the `routes: [...]` array (alongside the existing `/store/vault` entries). The list/detail reads reuse `storeReadRateLimit`; the create POST is unauth-rate-limited the same way (no dedicated limiter needed for v1):

```typescript
    {
      // GET + POST /store/delivery-orders
      matcher: '/store/delivery-orders',
      middlewares: [authenticate('customer', ['bearer']), storeReadRateLimit],
    },
    {
      // GET /store/delivery-orders/:id  +  POST /store/delivery-orders/:id/address
      matcher: '/store/delivery-orders/*',
      middlewares: [authenticate('customer', ['bearer']), storeReadRateLimit],
    },
```

- [ ] **Step 2: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build
git add backend/packages/api/src/api/middlewares.ts
git commit -m "feat(delivery): authenticate /store/delivery-orders routes"
```

---

## Task 11: Admin routes — list + detail + update

**Files:**
- Create: `backend/packages/api/src/api/admin/delivery-orders/validate.ts`
- Create: `backend/packages/api/src/api/admin/delivery-orders/route.ts`
- Create: `backend/packages/api/src/api/admin/delivery-orders/[id]/route.ts`

- [ ] **Step 1: Write `validate.ts`**

```typescript
import { MedusaError } from "@medusajs/framework/utils";
import {
  DELIVERY_STATUSES,
  type DeliveryStatus,
} from "../../../modules/packs/delivery";

const bad = (message: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
};

export type AdminDeliveryUpdate = {
  status?: DeliveryStatus;
  tracking_number?: string | null;
};

// Validate the status query filter (?status=). Returns undefined when absent.
export function coerceStatusFilter(raw: unknown): DeliveryStatus | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string" || !DELIVERY_STATUSES.includes(raw as DeliveryStatus)) {
    bad(`Invalid status filter '${String(raw)}'.`);
  }
  return raw as DeliveryStatus;
}

export function coerceDeliveryUpdateBody(raw: unknown): AdminDeliveryUpdate {
  if (!raw || typeof raw !== "object") bad("Body must be an object.");
  const b = raw as Record<string, unknown>;
  const out: AdminDeliveryUpdate = {};

  if (b.status !== undefined) {
    if (
      typeof b.status !== "string" ||
      !DELIVERY_STATUSES.includes(b.status as DeliveryStatus)
    ) {
      bad(`Invalid status '${String(b.status)}'.`);
    }
    out.status = b.status as DeliveryStatus;
  }
  if (b.tracking_number !== undefined) {
    if (b.tracking_number !== null && typeof b.tracking_number !== "string") {
      bad("`tracking_number` must be a string or null.");
    }
    out.tracking_number =
      typeof b.tracking_number === "string"
        ? b.tracking_number.trim() || null
        : null;
  }
  if (out.status === undefined && out.tracking_number === undefined) {
    bad("Provide `status` and/or `tracking_number`.");
  }
  return out;
}
```

- [ ] **Step 2: Write the list route `admin/delivery-orders/route.ts`**

`/admin/*` is auto-protected (no middleware entry). Joins the customer email for context (like `admin/pulls/route.ts`).

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import PacksModuleService from "../../../modules/packs/service";
import { PACKS_MODULE } from "../../../modules/packs";
import { serializeDeliveryOrders } from "../../../modules/packs/delivery-view";
import { coerceStatusFilter } from "./validate";

const LIMIT = 500;

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const customerService = req.scope.resolve(Modules.CUSTOMER);

  const status = coerceStatusFilter(req.query.status);
  const filter = status ? { status } : {};

  const orders = await packs.listDeliveryOrders(filter, {
    order: { created_at: "DESC" },
    take: LIMIT,
  });

  const serialized = await serializeDeliveryOrders(packs, orders);

  // Join customer emails for the admin table.
  const customerIds = [...new Set(orders.map((o) => o.customer_id))];
  const customers = customerIds.length
    ? await customerService.listCustomers(
        { id: customerIds },
        { take: customerIds.length },
      )
    : [];
  const emailById = new Map(customers.map((c) => [c.id, c.email]));

  res.json({
    orders: serialized.map((o) => ({
      ...o,
      customer_email: emailById.get(o.customer_id) ?? null,
    })),
  });
}
```

- [ ] **Step 3: Write the detail + update route `admin/delivery-orders/[id]/route.ts`**

```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import PacksModuleService from "../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../modules/packs";
import { serializeDeliveryOrders } from "../../../../modules/packs/delivery-view";
import { updateDeliveryOrderWorkflow } from "../../../../workflows/update-delivery-order";
import { coerceDeliveryUpdateBody } from "../validate";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const { id } = req.params;

  const [order] = await packs.listDeliveryOrders({ id }, { take: 1 });
  if (!order) {
    res.status(404).json({ message: `Delivery order '${id}' not found` });
    return;
  }
  const [serialized] = await serializeDeliveryOrders(packs, [order]);

  const customerService = req.scope.resolve(Modules.CUSTOMER);
  const [customer] = await customerService.listCustomers(
    { id: order.customer_id },
    { take: 1 },
  );

  res.json({
    order: { ...serialized, customer_email: customer?.email ?? null },
  });
}

// POST /admin/delivery-orders/:id — advance status and/or set tracking.
export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const { id } = req.params;
  const input = coerceDeliveryUpdateBody(req.body);

  const { result } = await updateDeliveryOrderWorkflow(req.scope).run({
    input: { order_id: id, ...input },
  });

  res.json(result);
}
```

- [ ] **Step 4: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build
git add backend/packages/api/src/api/admin/delivery-orders/
git commit -m "feat(delivery): admin list/detail/update routes"
```

---

## Task 12: Backend integration test (store + admin)

**Files:**
- Create: `backend/packages/api/integration-tests/http/delivery-orders.spec.ts`

- [ ] **Step 1: Write the integration test**

Mirrors `vault-buyback.spec.ts` setup (publishable key, gacha fixtures, customer register/login, `mintSuperAdmin` from `utils.ts` for admin calls). Covers: unauth 401; request happy path (pulls → delivering, order created); foreign pull 404; non-vaulted reject; admin list + status filter; transition packing→shipped(requires tracking)→delivered (pulls → delivered); cancel reverts pulls to vaulted; address edit pre-ship; address edit blocked post-ship.

```typescript
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { PACKS_MODULE } from "../../src/modules/packs";
import type PacksModuleService from "../../src/modules/packs/service";
import { unwrapResponse, mintSuperAdmin } from "./utils";

jest.setTimeout(240 * 1000);

const PASSWORD = "del-test-password-1";
const PACK_SLUG = "del-pack";
const CARD_HANDLE = "del-card";
const FMV = 25;
const PACK_PRICE = 5;
const TOPUP = 5 * PACK_PRICE;

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe("delivery orders", () => {
      let storeHeaders: Record<string, string>;

      beforeEach(async () => {
        const container = getContainer();
        const apiKeyModule = container.resolve(Modules.API_KEY);
        const key = await apiKeyModule.createApiKeys({
          title: "delivery-test",
          type: "publishable",
          created_by: "delivery-test",
        });
        storeHeaders = { "x-publishable-api-key": key.token };

        const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
        await packs.createPacks([
          {
            slug: PACK_SLUG,
            title: "Del Test Pack",
            category: "pokemon",
            price: PACK_PRICE,
            image: "/cdn/test-pack.webp",
            buyback_percent: 90,
          },
        ]);
        await packs.createCards([
          {
            handle: CARD_HANDLE,
            name: "Del Test Card",
            set: "Test Set",
            grader: "PSA",
            grade: "10",
            market_value: FMV,
            image: "/cdn/test-card.webp",
          },
        ]);
        await packs.createPackOdds([
          {
            pack_id: PACK_SLUG,
            card_id: CARD_HANDLE,
            weight: 100,
            locked: false,
            rarity: "Rare" as const,
          },
        ]);
      });

      const authed = (token: string) => ({
        ...storeHeaders,
        authorization: `Bearer ${token}`,
      });
      const reqApi = (
        method: "get" | "post",
        path: string,
        headers: Record<string, string>,
        body?: unknown,
      ) =>
        unwrapResponse(
          method === "get"
            ? api.get(path, { headers })
            : api.post(path, body ?? {}, { headers }),
        );

      const registerCustomer = async (email: string): Promise<string> => {
        const reg = await api.post("/auth/customer/emailpass/register", {
          email,
          password: PASSWORD,
        });
        await api.post(
          "/store/customers",
          { email },
          { headers: { ...storeHeaders, authorization: `Bearer ${reg.data.token}` } },
        );
        const login = await api.post("/auth/customer/emailpass", {
          email,
          password: PASSWORD,
        });
        return login.data.token;
      };

      // Create a vaulted pull for `token` via the real open flow; returns pull id.
      const openOne = async (token: string): Promise<string> => {
        await api.post(
          "/store/credits/topup",
          { amount: TOPUP },
          { headers: authed(token) },
        );
        const open = await reqApi(
          "post",
          `/store/packs/${PACK_SLUG}/open`,
          authed(token),
        );
        return open.data.pull.id as string;
      };

      // Add a Medusa customer address; returns its id.
      const addAddress = async (token: string): Promise<string> => {
        const res = await api.post(
          "/store/customers/me/addresses",
          {
            first_name: "Ada",
            last_name: "Lovelace",
            address_1: "1 Analytical Way",
            city: "London",
            postal_code: "EC1",
            country_code: "gb",
          },
          { headers: authed(token) },
        );
        const list = res.data.customer.addresses;
        return list[list.length - 1].id as string;
      };

      it("rejects unauthenticated access with 401", async () => {
        expect((await reqApi("get", "/store/delivery-orders", storeHeaders)).status).toBe(401);
        expect((await reqApi("post", "/store/delivery-orders", storeHeaders)).status).toBe(401);
      });

      it("request → delivering, lists order; foreign + non-vaulted rejected; admin ships + delivers", async () => {
        const tokenA = await registerCustomer("del-a@test.dev");
        const tokenB = await registerCustomer("del-b@test.dev");
        const pullId = await openOne(tokenA);
        const addressId = await addAddress(tokenA);

        // Foreign customer cannot deliver A's pull → 404.
        const foreign = await reqApi("post", "/store/delivery-orders", authed(tokenB), {
          pull_ids: [pullId],
          address_id: addressId,
        });
        expect(foreign.status).toBe(404);

        // Owner requests delivery.
        const created = await reqApi("post", "/store/delivery-orders", authed(tokenA), {
          pull_ids: [pullId],
          address_id: addressId,
        });
        expect(created.status).toBe(201);
        const orderId = created.data.order_id;

        // Pull left the vault (status delivering) — re-requesting it now rejects.
        const reReq = await reqApi("post", "/store/delivery-orders", authed(tokenA), {
          pull_ids: [pullId],
          address_id: addressId,
        });
        expect(reReq.status).toBe(409); // NOT_ALLOWED → 409 (not_vaulted)

        // List shows the order with one item.
        const list = await reqApi("get", "/store/delivery-orders", authed(tokenA));
        expect(list.status).toBe(200);
        expect(list.data.items).toHaveLength(1);
        expect(list.data.items[0]).toMatchObject({ id: orderId, status: "requested" });
        expect(list.data.items[0].items[0].pull_id).toBe(pullId);

        // Admin: list + filter + advance status.
        const adminToken = await mintSuperAdmin(
          getContainer(),
          api,
          "del-admin@test.dev",
          "admin-pass-1",
        );
        const adminHeaders = { authorization: `Bearer ${adminToken}` };
        const adminList = await reqApi(
          "get",
          "/admin/delivery-orders?status=requested",
          adminHeaders,
        );
        expect(adminList.status).toBe(200);
        expect(adminList.data.orders.some((o: { id: string }) => o.id === orderId)).toBe(true);

        // requested → packing
        expect(
          (await reqApi("post", `/admin/delivery-orders/${orderId}`, adminHeaders, { status: "packing" })).status,
        ).toBe(200);
        // packing → shipped WITHOUT tracking → 400
        expect(
          (await reqApi("post", `/admin/delivery-orders/${orderId}`, adminHeaders, { status: "shipped" })).status,
        ).toBe(400);
        // packing → shipped WITH tracking → 200
        expect(
          (await reqApi("post", `/admin/delivery-orders/${orderId}`, adminHeaders, { status: "shipped", tracking_number: "TRACK123" })).status,
        ).toBe(200);
        // shipped → delivered → 200, pull becomes delivered
        expect(
          (await reqApi("post", `/admin/delivery-orders/${orderId}`, adminHeaders, { status: "delivered" })).status,
        ).toBe(200);

        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const [pull] = await packs.listPulls({ id: pullId }, { take: 1 });
        expect(pull.status).toBe("delivered");
      });

      it("cancel returns the pulls to the vault; address edit blocked post-ship", async () => {
        const token = await registerCustomer("del-c@test.dev");
        const pullId = await openOne(token);
        const addressId = await addAddress(token);
        const created = await reqApi("post", "/store/delivery-orders", authed(token), {
          pull_ids: [pullId],
          address_id: addressId,
        });
        const orderId = created.data.order_id;

        // Address edit allowed while requested.
        const edit = await reqApi(
          "post",
          `/store/delivery-orders/${orderId}/address`,
          authed(token),
          { address_id: addressId },
        );
        expect(edit.status).toBe(200);

        const adminToken = await mintSuperAdmin(
          getContainer(),
          api,
          "del-admin2@test.dev",
          "admin-pass-2",
        );
        const adminHeaders = { authorization: `Bearer ${adminToken}` };
        await reqApi("post", `/admin/delivery-orders/${orderId}`, adminHeaders, { status: "canceled" });

        const packs = getContainer().resolve<PacksModuleService>(PACKS_MODULE);
        const [pull] = await packs.listPulls({ id: pullId }, { take: 1 });
        expect(pull.status).toBe("vaulted"); // returned to the vault
      });
    });
  },
});
```

> **MedusaError → HTTP mapping note:** `NOT_ALLOWED` maps to **409**, `INVALID_DATA` to **400**, `NOT_FOUND` to **404** (confirm against `vault-buyback.spec.ts`, where the repeat-sell `NOT_ALLOWED` asserted **400** via the duplicate path — adjust the `409` expectations to whatever the framework actually returns for `NOT_ALLOWED` on first run, then lock it in).

- [ ] **Step 2: Run the integration test**

```
cd backend/packages/api && corepack yarn test:integration:http -- delivery-orders
```
Expected: PASS. If it wedges before output (known flake), kill node and rerun with `--forceExit` (already in the script). Confirm `pokenic-postgres` + `pokenic-redis` are up.

- [ ] **Step 3: Commit**

```
git add backend/packages/api/integration-tests/http/delivery-orders.spec.ts
git commit -m "test(delivery): store + admin integration coverage"
```

---

## Task 13: Storefront — schemas + server actions

**Files:**
- Modify: `src/lib/data/schemas.ts`
- Create: `src/lib/actions/delivery.ts`

- [ ] **Step 1: Add schemas to `schemas.ts`**

Append (mirrors the existing `looseObject` + `finite` style):

```typescript
// --- actions/delivery.ts ----------------------------------------------------

/** GET /store/delivery-orders item — id + status + items[]. */
export const DeliveryOrderSchema = z.looseObject({
  id: z.string(),
  status: z.enum(["requested", "packing", "shipped", "delivered", "canceled"]),
  created_at: z.string(),
});

/** A Medusa customer address as the delivery picker needs it. */
export const DeliveryAddressSchema = z.looseObject({
  id: z.string(),
  address_1: z.string(),
  city: z.string(),
  postal_code: z.string(),
  country_code: z.string(),
});
```

- [ ] **Step 2: Write `src/lib/actions/delivery.ts`**

Mirrors `actions/vault.ts` (result unions, `getAuthToken`, `sdk.client.fetch` with Bearer, `friendlyError`). Address read/create uses the built-in Medusa SDK on the customer.

```typescript
'use server';

/**
 * Delivery server actions. Run server-side so the customer JWT stays in the
 * httpOnly cookie; the backend derives the customer id from the bearer token.
 *
 * Backend routes (customer-authenticated):
 *   POST /store/delivery-orders            — request batch delivery
 *   GET  /store/delivery-orders            — the caller's orders
 *   POST /store/delivery-orders/:id/address — edit address pre-ship
 */
import type { HttpTypes } from '@medusajs/types';
import { sdk } from '@/lib/medusa';
import { logger } from '@/lib/logger';
import { getAuthToken, getCustomer } from '@/lib/data/customer';
import { friendlyError, isAuthError, type ErrorRule } from '@/lib/errors';

export type DeliveryOrderItemView = {
  pullId: string;
  card: { handle: string; name: string; image: string } | null;
};
export type DeliveryOrderView = {
  id: string;
  status: 'requested' | 'packing' | 'shipped' | 'delivered' | 'canceled';
  trackingNumber: string | null;
  createdAt: string;
  items: DeliveryOrderItemView[];
  address: { name: string; city: string; countryCode: string };
};

export type DeliveryOrdersResult =
  | { ok: true; orders: DeliveryOrderView[] }
  | { ok: false; error: string; needsAuth?: boolean };

export type RequestDeliveryResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; needsAuth?: boolean };

export type AddressView = {
  id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string | null;
  postalCode: string;
  countryCode: string;
  phone: string | null;
};

const DELIVERY_RULES: ErrorRule[] = [
  [/too many|rate.?limit|429/i, 'Too many requests — give it a moment and try again.'],
  [/unauthorized|not authenticated|401/i, 'Please log in to manage deliveries.'],
  [/no longer available|not allowed|409/i, 'One or more cards are no longer available to deliver.'],
  [/not found|404/i, 'That card or address was not found.'],
  [/required|invalid|400/i, 'Check your selection and address, then try again.'],
];
const FALLBACK = 'Something went wrong. Please try again.';

interface BackendDeliveryOrder {
  id: string;
  status: DeliveryOrderView['status'];
  tracking_number: string | null;
  created_at: string;
  address: { name: string; city: string; country_code: string };
  items: { pull_id: string; card: { handle: string; name: string; image: string } | null }[];
}

export async function getDeliveryOrders(): Promise<DeliveryOrdersResult> {
  const token = await getAuthToken();
  if (!token) {
    return { ok: false, error: 'Please log in to view your orders.', needsAuth: true };
  }
  try {
    const res = await sdk.client.fetch('/store/delivery-orders', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const raw = (res as { items?: BackendDeliveryOrder[] }).items ?? [];
    const orders: DeliveryOrderView[] = raw.map((o) => ({
      id: o.id,
      status: o.status,
      trackingNumber: o.tracking_number,
      createdAt: o.created_at,
      address: {
        name: o.address?.name ?? '',
        city: o.address?.city ?? '',
        countryCode: o.address?.country_code ?? '',
      },
      items: (o.items ?? []).map((it) => ({ pullId: it.pull_id, card: it.card })),
    }));
    return { ok: true, orders };
  } catch (error) {
    logger.error('[delivery] list failed:', error);
    return {
      ok: false,
      error: friendlyError(error, DELIVERY_RULES, FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}

export async function requestDelivery(
  pullIds: string[],
  addressId: string,
): Promise<RequestDeliveryResult> {
  if (!Array.isArray(pullIds) || pullIds.length === 0) {
    return { ok: false, error: 'Select at least one card.' };
  }
  if (typeof addressId !== 'string' || addressId.trim() === '') {
    return { ok: false, error: 'Choose a shipping address.' };
  }
  const token = await getAuthToken();
  if (!token) return { ok: false, error: 'Please log in first.', needsAuth: true };

  try {
    const res = await sdk.client.fetch('/store/delivery-orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { pull_ids: pullIds, address_id: addressId },
    });
    const orderId = (res as { order_id?: string }).order_id;
    if (!orderId) {
      return { ok: false, error: 'Got an unexpected response. Please try again.' };
    }
    return { ok: true, orderId };
  } catch (error) {
    logger.error('[delivery] request failed:', error);
    return {
      ok: false,
      error: friendlyError(error, DELIVERY_RULES, FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}

// Read the customer's address book (built-in Medusa field — no custom route).
export async function getAddresses(): Promise<AddressView[]> {
  const customer = await getCustomer();
  if (!customer) return [];
  return (customer.addresses ?? []).map((a: HttpTypes.StoreCustomerAddress) => ({
    id: a.id,
    name: [a.first_name, a.last_name].filter(Boolean).join(' '),
    line1: a.address_1 ?? '',
    line2: a.address_2 ?? null,
    city: a.city ?? '',
    province: a.province ?? null,
    postalCode: a.postal_code ?? '',
    countryCode: a.country_code ?? '',
    phone: a.phone ?? null,
  }));
}

export type AddAddressInput = {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  postalCode: string;
  countryCode: string;
  phone?: string;
};
export type AddAddressResult =
  | { ok: true; addressId: string }
  | { ok: false; error: string; needsAuth?: boolean };

// Create an address in the Medusa customer address book via the built-in SDK.
// Returns the new address id for immediate selection in the delivery flow.
export async function addAddress(input: AddAddressInput): Promise<AddAddressResult> {
  const token = await getAuthToken();
  if (!token) return { ok: false, error: 'Please log in first.', needsAuth: true };
  if (!input.address1?.trim() || !input.city?.trim() || !input.postalCode?.trim() || !input.countryCode?.trim()) {
    return { ok: false, error: 'Fill in the required address fields.' };
  }
  try {
    const { customer } = await sdk.store.customer.createAddress(
      {
        first_name: input.firstName,
        last_name: input.lastName,
        address_1: input.address1,
        address_2: input.address2 || undefined,
        city: input.city,
        province: input.province || undefined,
        postal_code: input.postalCode,
        country_code: input.countryCode,
        phone: input.phone || undefined,
      },
      {},
      { Authorization: `Bearer ${token}` },
    );
    const list = customer.addresses ?? [];
    const created = list[list.length - 1];
    if (!created?.id) {
      return { ok: false, error: 'Address was not saved. Please try again.' };
    }
    return { ok: true, addressId: created.id };
  } catch (error) {
    logger.error('[delivery] add address failed:', error);
    return {
      ok: false,
      error: friendlyError(error, DELIVERY_RULES, FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}
```

> Confirm `sdk.store.customer.createAddress` signature against the installed `@medusajs/js-sdk` types at implement time (Medusa v2 exposes `createAddress`/`updateAddress`/`deleteAddress`/`listAddress` on `sdk.store.customer`). If the response doesn't include the full `addresses` array, fall back to `sdk.store.customer.listAddress` and pick the newest by `created_at`.

- [ ] **Step 3: Typecheck + commit**

```
npm run typecheck
git add src/lib/data/schemas.ts src/lib/actions/delivery.ts
git commit -m "feat(delivery): storefront schemas + delivery server actions"
```

---

## Task 14: Storefront — `RequestDeliveryModal` + vault multi-select

**Files:**
- Create: `src/components/account/RequestDeliveryModal.tsx`
- Modify: `src/app/(account)/vault/VaultClient.tsx`

- [ ] **Step 1: Write `RequestDeliveryModal.tsx`**

A controlled modal: shows the selected cards, an address picker (existing addresses + an "add new" inline form), and a submit. Reuses the visual idiom of `SellConfirmModal` (full-screen overlay; check that file for the exact wrapper classes and reuse them). Props:

```typescript
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { usd } from '@/lib/format';
import {
  requestDelivery,
  addAddress,
  type AddressView,
  type AddAddressInput,
} from '@/lib/actions/delivery';
import type { VaultItem } from '@/lib/actions/vault';

type Props = {
  open: boolean;
  items: VaultItem[]; // the selected cards
  addresses: AddressView[];
  onClose: () => void;
  onSubmitted: (pullIds: string[]) => void; // parent removes them from the vault
};

export default function RequestDeliveryModal({
  open,
  items,
  addresses,
  onClose,
  onSubmitted,
}: Props) {
  const [addrList, setAddrList] = useState<AddressView[]>(addresses);
  const [selectedAddr, setSelectedAddr] = useState<string>(addresses[0]?.id ?? '');
  const [adding, setAdding] = useState(addresses.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AddAddressInput>({
    firstName: '', lastName: '', address1: '', city: '', postalCode: '', countryCode: '',
  });

  if (!open) return null;

  async function saveAddress() {
    setBusy(true);
    setError(null);
    const res = await addAddress(form);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    // Optimistic: append + select. (A full refresh would re-fetch getAddresses.)
    const view: AddressView = {
      id: res.addressId, name: `${form.firstName} ${form.lastName}`.trim(),
      line1: form.address1, line2: form.address2 ?? null, city: form.city,
      province: form.province ?? null, postalCode: form.postalCode,
      countryCode: form.countryCode, phone: form.phone ?? null,
    };
    setAddrList((p) => [...p, view]);
    setSelectedAddr(res.addressId);
    setAdding(false);
  }

  async function submit() {
    if (!selectedAddr) { setError('Choose a shipping address.'); return; }
    setBusy(true);
    setError(null);
    const pullIds = items.map((i) => i.pullId);
    const res = await requestDelivery(pullIds, selectedAddr);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    onSubmitted(pullIds);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-5">
        <h2 className="font-heading text-lg font-bold text-white">Request delivery</h2>
        <p className="mt-1 text-[13px] text-white/55">
          Ship {items.length} card{items.length === 1 ? '' : 's'} to your address. No charge in this beta.
        </p>

        {/* Selected cards */}
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {items.map((i) => (
            <div key={i.pullId} className="relative h-20 w-15 shrink-0 overflow-hidden rounded">
              <Image src={i.card.image} alt={i.card.name} fill sizes="60px" className="object-contain" />
            </div>
          ))}
        </div>

        {/* Address picker / add form */}
        {!adding ? (
          <div className="mt-4 space-y-2">
            {addrList.map((a) => (
              <label key={a.id} className="flex items-start gap-2 rounded-xl border border-white/10 p-3 text-[13px] text-white/80">
                <input type="radio" name="addr" checked={selectedAddr === a.id} onChange={() => setSelectedAddr(a.id)} />
                <span>{a.name} — {a.line1}, {a.city} {a.postalCode} {a.countryCode.toUpperCase()}</span>
              </label>
            ))}
            <button type="button" onClick={() => setAdding(true)} className="text-[12px] font-semibold text-emerald-400">
              + Add a new address
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {/* Minimal required-field form; bind each input to `form`. Reuse the
                input classes from SettingsForm.tsx for visual consistency. */}
            {/* first_name, last_name, address_1, city, postal_code, country_code */}
            {/* ...inputs calling setForm(...)... */}
            <div className="col-span-2 flex gap-2">
              <button type="button" disabled={busy} onClick={saveAddress} className="rounded-lg bg-emerald-500 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50">
                Save address
              </button>
              {addrList.length > 0 && (
                <button type="button" onClick={() => setAdding(false)} className="text-[13px] text-white/60">Cancel</button>
              )}
            </div>
          </div>
        )}

        {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] text-white/60">Cancel</button>
          <button type="button" disabled={busy || adding || !selectedAddr} onClick={submit} className="rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
            {busy ? 'Requesting…' : 'Request delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

> The add-address form inputs are abbreviated above — bind the 6 required fields (`firstName`, `lastName`, `address1`, `city`, `postalCode`, `countryCode`) to `form` with `onChange={(e) => setForm((f) => ({ ...f, field: e.target.value }))}`, copying the input className from `src/components/account/SettingsForm.tsx`.

- [ ] **Step 2: Wire multi-select into `VaultClient.tsx`**

Add state + a selection toggle + a "Request delivery" bar. Concretely:

1. Add imports:
```typescript
import { getAddresses, type AddressView } from '@/lib/actions/delivery';
import RequestDeliveryModal from '@/components/account/RequestDeliveryModal';
```
2. Change the component signature to also receive addresses (fetched in the server page — see Step 3):
```typescript
export default function VaultClient({
  initial,
  addresses,
}: {
  initial: VaultResult;
  addresses: AddressView[];
}) {
```
3. Add state near the other `useState`s:
```typescript
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deliverOpen, setDeliverOpen] = useState(false);

  const toggleSelect = (pullId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pullId)) next.delete(pullId);
      else next.add(pullId);
      return next;
    });
  const selectedItems = items.filter((i) => selected.has(i.pullId));
```
4. In the header area (below `<AddCreditsPanel/>` or near the grid), add a toggle button:
```tsx
      {items.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => { setSelectMode((s) => !s); setSelected(new Set()); }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-white/70 hover:text-white"
          >
            {selectMode ? 'Cancel selection' : 'Select cards to ship'}
          </button>
          {selectMode && (
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => setDeliverOpen(true)}
              className="rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
            >
              Request delivery ({selected.size})
            </button>
          )}
        </div>
      )}
```
5. In each card cell, when `selectMode`, show a selection checkbox/overlay (toggling `toggleSelect(item.pullId)`) and hide the Sell/Feature buttons. Minimal: wrap the card image in a clickable container that calls `toggleSelect` and renders a ring when `selected.has(item.pullId)`.
6. Render the modal at the end (next to `SellConfirmModal`):
```tsx
      <RequestDeliveryModal
        open={deliverOpen}
        items={selectedItems}
        addresses={addresses}
        onClose={() => setDeliverOpen(false)}
        onSubmitted={(pullIds) => {
          setItems((prev) => prev.filter((i) => !pullIds.includes(i.pullId)));
          setSelected(new Set());
          setSelectMode(false);
          setDeliverOpen(false);
        }}
      />
```

- [ ] **Step 3: Pass addresses from the vault server page**

Find the vault server page (`src/app/(account)/vault/page.tsx`) that renders `<VaultClient initial={...} />`, and pass addresses:
```tsx
import { getAddresses } from '@/lib/actions/delivery';
// ...
const [initial, addresses] = await Promise.all([getVault(), getAddresses()]);
return <VaultClient initial={initial} addresses={addresses} />;
```

- [ ] **Step 4: Typecheck + commit**

```
npm run typecheck
git add src/components/account/RequestDeliveryModal.tsx "src/app/(account)/vault/VaultClient.tsx" "src/app/(account)/vault/page.tsx"
git commit -m "feat(delivery): vault multi-select + request-delivery modal"
```

---

## Task 15: Storefront — Orders tab → delivery orders

**Files:**
- Modify: `src/app/(account)/orders/page.tsx`

- [ ] **Step 1: Swap the data source + row mapping**

Replace the `getOrders()` read with `getDeliveryOrders()`, and remap the table to delivery semantics (Order id, cards, date, status, tracking). Keep `AccountHeader`, `MockTable`, `Badge`, `EmptyState`, `Panel`. Replace the body:

```tsx
import { getDeliveryOrders, type DeliveryOrderView } from '@/lib/actions/delivery';

const STATUS_TONE: Record<DeliveryOrderView['status'], Tone> = {
  requested: 'amber',
  packing: 'amber',
  shipped: 'sky',
  delivered: 'green',
  canceled: 'neutral',
};

function DeliveryItems({ items }: { items: DeliveryOrderView['items'] }) {
  const first = items[0];
  const extra = items.length - 1;
  return (
    <span className="flex items-center gap-2">
      {first?.card?.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={first.card.image} alt="" width={24} height={32}
          className="h-8 w-6 shrink-0 rounded object-contain" />
      )}
      <span className="max-w-[220px] truncate">{first?.card?.name ?? '—'}</span>
      {extra > 0 && <span className="text-white/45">+{extra} more</span>}
    </span>
  );
}

export default async function OrdersPage() {
  const res = await getDeliveryOrders();
  const orders = res.ok ? res.orders : [];

  if (orders.length === 0) {
    return (
      <>
        <AccountHeader title="Orders" sub="Your delivery requests and shipments." />
        <EmptyState />
      </>
    );
  }

  const rows = orders.map((o) => [
    <span key="o" className="font-mono text-[12px] text-white/60">#{o.id.slice(-6)}</span>,
    <DeliveryItems key="i" items={o.items} />,
    orderDate(o.createdAt),
    o.trackingNumber ? (
      <span key="t" className="font-mono text-[12px] text-white/70">{o.trackingNumber}</span>
    ) : (
      <span key="t" className="text-white/35">—</span>
    ),
    <Badge key="s" tone={STATUS_TONE[o.status] ?? 'neutral'}>{humanize(o.status)}</Badge>,
  ]);

  return (
    <>
      <AccountHeader title="Orders" sub="Your delivery requests and shipments." />
      <MockTable head={['Order', 'Cards', 'Requested', 'Tracking', 'Status']} rows={rows} />
    </>
  );
}
```
Remove the now-unused `getOrders`, `OrderItems`, `money`, `FULFILLMENT`, and the `HttpTypes`/`features` imports if they become unused (the typecheck/lint hook will flag leftovers — clean them).

- [ ] **Step 2: Typecheck + commit**

```
npm run typecheck
git add "src/app/(account)/orders/page.tsx"
git commit -m "feat(delivery): Orders tab shows delivery orders"
```

---

## Task 16: Admin — client fetchers + query hooks

**Files:**
- Modify: `backend/apps/admin/src/lib/admin-rest.ts`
- Modify: `backend/apps/admin/src/lib/query-keys.ts`
- Modify: `backend/apps/admin/src/lib/queries.ts`

- [ ] **Step 1: Add fetchers to `admin-rest.ts`**

Append (mirrors `getCustomerGacha` / `adjustCustomerCredits` — direct fetch with `credentials: 'include'`; raw `fetch` so `JSON.stringify` is correct here):

```typescript
// ── Delivery orders ──────────────────────────────────────────────────────────

export type DeliveryStatus =
  | 'requested' | 'packing' | 'shipped' | 'delivered' | 'canceled';

export interface AdminDeliveryItem {
  pull_id: string;
  card: { handle: string; name: string; image: string } | null;
}
export interface AdminDeliveryOrder {
  id: string;
  customer_id: string;
  customer_email: string | null;
  status: DeliveryStatus;
  address: {
    name: string; address_1: string; address_2: string | null;
    city: string; province: string | null; postal_code: string;
    country_code: string; phone: string | null;
  };
  tracking_number: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  items: AdminDeliveryItem[];
}

export async function listDeliveryOrders(
  status?: DeliveryStatus,
): Promise<AdminDeliveryOrder[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await getJson<{ orders: AdminDeliveryOrder[] }>(
    `/admin/delivery-orders${qs}`,
  );
  return data.orders;
}

export async function getDeliveryOrder(id: string): Promise<AdminDeliveryOrder> {
  const data = await getJson<{ order: AdminDeliveryOrder }>(
    `/admin/delivery-orders/${encodeURIComponent(id)}`,
  );
  return data.order;
}

export async function updateDeliveryOrder(
  id: string,
  body: { status?: DeliveryStatus; tracking_number?: string | null },
): Promise<{ order_id: string; status: DeliveryStatus }> {
  const res = await fetch(
    `${__BACKEND_URL__}/admin/delivery-orders/${encodeURIComponent(id)}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    throw new Error(await errorMessage(res));
  }
  return (await res.json()) as { order_id: string; status: DeliveryStatus };
}
```

- [ ] **Step 2: Add query keys to `query-keys.ts`**

Add to the `qk` object:
```typescript
  deliveryOrders: (status?: string) =>
    ['admin', 'delivery-orders', status ?? 'all'] as const,
  deliveryOrder: (id: string) => ['admin', 'delivery-order', id] as const,
```

- [ ] **Step 3: Add hooks to `queries.ts`**

Add the import:
```typescript
import {
  // ...existing...
  listDeliveryOrders,
  updateDeliveryOrder,
  type AdminDeliveryOrder,
  type DeliveryStatus,
} from './admin-rest';
```
and the hooks:
```typescript
export const useDeliveryOrders = (
  status?: DeliveryStatus,
): UseQueryResult<AdminDeliveryOrder[]> =>
  useQuery({
    queryKey: qk.deliveryOrders(status),
    queryFn: () => listDeliveryOrders(status),
  });

export const useUpdateDeliveryOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      status?: DeliveryStatus;
      tracking_number?: string | null;
    }) => updateDeliveryOrder(vars.id, {
      status: vars.status,
      tracking_number: vars.tracking_number,
    }),
    // Status filters vary, so drop the whole delivery-orders namespace.
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['admin', 'delivery-orders'] }),
  });
};
```

- [ ] **Step 4: Typecheck + commit**

```
cd backend/packages/api && corepack yarn build   # the api build also typechecks _generated; admin tsc runs in Task 17
git add backend/apps/admin/src/lib/admin-rest.ts backend/apps/admin/src/lib/query-keys.ts backend/apps/admin/src/lib/queries.ts
git commit -m "feat(delivery): admin client fetchers + RQ hooks"
```

---

## Task 17: Admin — Deliveries page

**Files:**
- Create: `backend/apps/admin/src/routes/deliveries/page.tsx`

- [ ] **Step 1: Write the page**

Mirrors `routes/cards/page.tsx` structure: `RouteConfig` with a `Truck`-style icon, status-filter `Select`, `Table` of orders, a `FocusModal` detail/edit (status `Select` + tracking `Input` + Save via `useUpdateDeliveryOrder`), error/loading/empty/success states, `toast`. Status options come from `DELIVERY_STATUSES`; the Save button maps the chosen status through the mutation. Use semantic colors + `size="small"` buttons per the admin design rules.

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Container, Heading, Text, Table, Button, Badge, Select, Input,
  FocusModal, StatusBadge, toast,
} from '@medusajs/ui';
import { Truck } from '@medusajs/icons';
import type { RouteConfig } from '@mercurjs/dashboard-sdk';
import { useDeliveryOrders, useUpdateDeliveryOrder } from '../../lib/queries';
import type { AdminDeliveryOrder, DeliveryStatus } from '../../lib/admin-rest';
import { resolveImageUrl } from '../../lib/image-url';

export const config: RouteConfig = { label: 'Deliveries', icon: Truck };

const STATUSES: DeliveryStatus[] = ['requested', 'packing', 'shipped', 'delivered', 'canceled'];
const TONE: Record<DeliveryStatus, 'orange' | 'blue' | 'green' | 'grey'> = {
  requested: 'orange', packing: 'orange', shipped: 'blue', delivered: 'green', canceled: 'grey',
};

const DeliveriesPage = () => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<DeliveryStatus | undefined>(undefined);
  const { data: orders = null, isError } = useDeliveryOrders(filter);
  const update = useUpdateDeliveryOrder();
  const [detail, setDetail] = useState<AdminDeliveryOrder | null>(null);
  const [nextStatus, setNextStatus] = useState<DeliveryStatus>('packing');
  const [tracking, setTracking] = useState('');

  const openDetail = (o: AdminDeliveryOrder) => {
    setDetail(o);
    setNextStatus(o.status);
    setTracking(o.tracking_number ?? '');
  };

  const save = async () => {
    if (!detail) return;
    try {
      await update.mutateAsync({
        id: detail.id,
        status: nextStatus !== detail.status ? nextStatus : undefined,
        tracking_number: tracking.trim() || null,
      });
      toast.success('Delivery updated');
      setDetail(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <Heading level="h2">Deliveries</Heading>
          <Text className="text-ui-fg-subtle mt-1" size="small">
            Physical shipment requests for vaulted cards.
          </Text>
        </div>
        <Select
          value={filter ?? 'all'}
          onValueChange={(v) => setFilter(v === 'all' ? undefined : (v as DeliveryStatus))}
        >
          <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="all">All statuses</Select.Item>
            {STATUSES.map((s) => <Select.Item key={s} value={s}>{s}</Select.Item>)}
          </Select.Content>
        </Select>
      </div>

      {isError ? (
        <div className="px-6 py-8"><Text className="text-ui-fg-subtle">Failed to load deliveries.</Text></div>
      ) : orders === null ? (
        <div className="px-6 py-8"><Text className="text-ui-fg-subtle">…</Text></div>
      ) : orders.length === 0 ? (
        <div className="px-6 py-8"><Text className="text-ui-fg-subtle">No delivery orders.</Text></div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Cards</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {orders.map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell className="font-mono text-xs">#{o.id.slice(-6)}</Table.Cell>
                <Table.Cell className="text-ui-fg-subtle">{o.customer_email ?? o.customer_id}</Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1">
                    {o.items.slice(0, 4).map((it) =>
                      it.card ? (
                        <img key={it.pull_id} src={resolveImageUrl(it.card.image)} alt=""
                          className="h-8 w-6 rounded object-contain" />
                      ) : null,
                    )}
                    {o.items.length > 4 && <span className="text-ui-fg-subtle text-xs">+{o.items.length - 4}</span>}
                  </div>
                </Table.Cell>
                <Table.Cell><StatusBadge color={TONE[o.status]}>{o.status}</StatusBadge></Table.Cell>
                <Table.Cell className="text-right">
                  <Button size="small" variant="secondary" onClick={() => openDetail(o)}>Manage</Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <FocusModal open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
        <FocusModal.Content>
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <Button size="small" variant="secondary" onClick={() => setDetail(null)}>Cancel</Button>
              <Button size="small" onClick={save} isLoading={update.isPending}>Save</Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-col items-center overflow-auto p-10">
            {detail && (
              <div className="flex w-full max-w-[560px] flex-col gap-y-5">
                <FocusModal.Title asChild><Heading level="h2">Delivery #{detail.id.slice(-6)}</Heading></FocusModal.Title>
                <Text className="text-ui-fg-subtle" size="small">
                  {detail.address.name} — {detail.address.address_1}, {detail.address.city}{' '}
                  {detail.address.postal_code} {detail.address.country_code.toUpperCase()}
                </Text>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">Status</Text>
                  <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as DeliveryStatus)}>
                    <Select.Trigger><Select.Value /></Select.Trigger>
                    <Select.Content>
                      {STATUSES.map((s) => <Select.Item key={s} value={s}>{s}</Select.Item>)}
                    </Select.Content>
                  </Select>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Text size="small" weight="plus">Tracking number</Text>
                  <Input value={tracking} onChange={(e) => setTracking(e.target.value)}
                    placeholder="Required to mark shipped" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail.items.map((it) =>
                    it.card ? (
                      <img key={it.pull_id} src={resolveImageUrl(it.card.image)} alt={it.card.name}
                        className="h-24 w-16 rounded object-contain" />
                    ) : null,
                  )}
                </div>
              </div>
            )}
          </FocusModal.Body>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  );
};

export default DeliveriesPage;
```

> i18n: the existing pages use `t('scope.key')`. For v1 the literal strings above match the lighter copy in `economy`/`support` pages; if the reviewer requires full i18n, add a `deliveries.*` namespace to the locale files mirroring `cards.*`. Confirm `Truck` is exported by `@medusajs/icons` — if not, use `ArrowRightOnRectangle`/`Buildings` or another present icon (the cards page uses `Sparkles`).

- [ ] **Step 2: Typecheck/lint the admin app + commit**

```
cd backend/apps/admin && corepack yarn lint
```
Expected: clean (or only the 5 pre-existing config-export lint warnings noted in memory `admin-react-query-seam`). Then:
```
git add backend/apps/admin/src/routes/deliveries/page.tsx
git commit -m "feat(delivery): admin Deliveries page"
```

---

## Task 18: Full verification

**Files:** none (verify the whole feature)

- [ ] **Step 1: Backend unit + integration green**

```
cd backend/packages/api && corepack yarn test:unit -- delivery && corepack yarn test:integration:http -- delivery-orders
```
Expected: all PASS. (If integration wedges pre-output, kill node processes and rerun.)

- [ ] **Step 2: Backend build green**

```
cd backend/packages/api && corepack yarn build
```

- [ ] **Step 3: Storefront standalone build + serve**

```
npm run build
pwsh scripts/serve-standalone.ps1 -Port 4000   # run in background; NEVER `next dev`
```
From this deep worktree, the standalone bundle nests at `.next/standalone/.claude/worktrees/busy-lovelace-5a3521/server.js` — `serve-standalone.ps1` copies `.next/static` + `public` into the nested dir and boots that `server.js` on `PORT=4000`. Kill any storefront server before rebuilding (it locks `.next/standalone`).

- [ ] **Step 4: Start backend + admin for the live flow**

```
cd backend/packages/api && corepack yarn dev      # medusa develop, :9000 — NOT `yarn start`
# admin (separate shell): node ../../node_modules/vite/bin/vite.js   # :7000
```

- [ ] **Step 5: Playwright capture — `scripts/capture-delivery.mjs`**

Write a capture script modeled on `scripts/capture-pack-open.mjs`: log in as `test@pokenic.app` / `PokenicTest123!`, fund credits + open packs so the vault has cards, enter select mode, choose ≥1 card, open the delivery modal, pick/add an address, submit, then assert the Orders tab shows the new order with status `requested`. Screenshot to `docs/research/phase3/`. Read the PNGs back with the Read tool. (Per memory `verify-flow-before-recording`: assert each step headless+fast before any screencast.)

```
node scripts/capture-delivery.mjs
```
Expected JSON verdict: `PASS` — vault select → modal → submit → order appears in Orders tab; admin Deliveries page lists it.

- [ ] **Step 6: Manual admin check**

At `http://localhost:7000/dashboard` (admin login), open **Deliveries**, confirm the test order is listed, open **Manage**, set status `packing` → `shipped` (with tracking) → `delivered`, and confirm the storefront Orders tab reflects the status + tracking and the card leaves the vault.

- [ ] **Step 7: Commit any verification scripts**

```
git add scripts/capture-delivery.mjs
git commit -m "test(delivery): playwright capture of the request + orders flow"
```

---

## Task 19: PR + review

- [ ] **Step 1: Push the branch**

```
git push -u origin claude/busy-lovelace-5a3521
```

- [ ] **Step 2: Open the PR**

```
gh pr create --base master --title "feat: Phase 3 — delivery & orders" --body "<summary of the lifecycle, API surface, and what was verified>"
```

- [ ] **Step 3: CodeRabbit + autofix**

Wait for the CodeRabbit review, then apply with the `coderabbit:autofix` skill (per the handoff process). Address CRITICAL/HIGH; re-run unit + integration after fixes.

- [ ] **Step 4: Merge (merge commit) + clean up**

`gh pr merge <N> --merge --delete-branch` (the local checkout-to-master step errors from inside a worktree but the remote merge still succeeds — then delete the remote branch + remove the worktree manually per the handoff's Windows cleanup note).

---

## Self-Review (against the spec §"Phase 3" + Data Model / API Surface / Decisions tables)

- **Models** — `DeliveryOrder` (status enum, denormalized snapshot, nullable tracking/fee/shipped_at/delivered_at) + `DeliveryOrderItem` join + `Pull.status += delivering, delivered` → Tasks 1–3. ✅
- **Workflow** — `requestDeliveryWorkflow(customer_id, pull_ids[], address_id)`, validate owned + vaulted, snapshot address, create order+items, flip pulls, compensation reverts + deletes; reject empty/already-delivering/sold → Task 6 + pure validators Task 4. Admin transitions `packing→shipped(tracking)→delivered`, `canceled→vaulted` → Task 7 + validator Task 5. ✅
- **Storefront** — multi-select → Request delivery → address step (select/add via Medusa address book) → review → `POST /store/delivery-orders` (Task 14); Orders tab swaps to `GET /store/delivery-orders` (Task 15); pre-ship address edit `POST .../:id/address` (Task 9, surfaced in modal/order edit — extend Task 14/15 if a per-order edit affordance is wanted). ✅
- **Admin** — `routes/deliveries/page.tsx` (RouteConfig + Truck icon) via `qk` + RQ seam, no 2nd QueryClientProvider (Task 16–17); backend `GET /admin/delivery-orders` (status filter), `GET /:id`, `POST /:id` (status + tracking) (Task 11); hooks `useDeliveryOrders(status?)` / `useUpdateDeliveryOrder()` + `qk.deliveryOrders`/`qk.deliveryOrder` (Task 16). ✅
- **API surface** — every row of the spec's API table is covered; the spec's two `PATCH` rows are implemented as POST (repo convention). ✅
- **Decisions** — batch cart ✅; address-only v1 (`shipping_fee` nullable, no charge) ✅; reuse Medusa address book + pre-ship edit ✅; pull lifecycle (leaves vault while delivering, can't sell, cancel→vaulted, delivered terminal) ✅.
- **Testing** — pure logic unit-tested (TDD, Tasks 4–5); workflow validation/transition/compensation + ownership via integration (Task 12); UI via Playwright (Task 18). ✅
- **Type consistency** — `DeliveryStatus` defined once in `delivery.ts` and imported everywhere (backend + admin re-declares the same string-union in `admin-rest.ts` since the admin app can't import backend module code; the literals match exactly). Workflow input/result types (`RequestDeliveryInput`/`Result`, `UpdateDeliveryOrderInput`/`Result`) are consistent between step and workflow files. `serializeDeliveryOrders` shape matches the storefront `BackendDeliveryOrder` and admin `AdminDeliveryOrder` interfaces.

**Open items to confirm at execution (not blockers):**
- `MedusaError.Types.NOT_ALLOWED` → exact HTTP code (409 vs 400) — lock the integration-test expectations to the framework's actual mapping on first run.
- `sdk.store.customer.createAddress` exact signature/response (Medusa v2 `@medusajs/js-sdk`).
- `Truck` icon presence in `@medusajs/icons`.
- Whether the reviewer wants full `deliveries.*` i18n keys in the admin page (v1 uses literals like `economy`/`support`).
