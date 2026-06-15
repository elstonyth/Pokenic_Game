# Postgres: hot-column indexes + pack price → decimal

**Date:** 2026-06-15
**Module:** `backend/packages/api/src/modules/packs`
**Status:** design approved, pending spec review

## Context

The `packs` module's five tables (`pull`, `credit_transaction`, `pack_odds`,
`pack`, `card`) carry **only** the indexes Medusa auto-generates: the `id`
primary key, the `IDX_*_deleted_at` partial indexes, and the unique indexes on
`pull_id` / `pack.slug` / `card.handle`. No hot read column is indexed, so every
filtered/ordered read is a sequential scan.

This was verified against the live DB (`pokenic-postgres`, db `medusa`):

```
EXPLAIN (ANALYZE) SELECT * FROM credit_transaction
  WHERE customer_id = 'x' AND deleted_at IS NULL ORDER BY created_at ASC LIMIT 1000;
-> Seq Scan on credit_transaction  (Filter: deleted_at IS NULL AND customer_id) Rows Removed: 153
```

Current row counts: `pull=115`, `credit_transaction=153`, `pack_odds=128`,
`pack=8`, `card=16`.

**Scale-honesty:** at these counts the planner will _not_ use the new indexes
(each table is ~5–8 pages; a seq scan is cheaper than an index scan). Their value
is **forward-looking** — they keep every per-customer / feed / leaderboard read
off an O(n) full-table scan as the ledger grows, and they cost effectively
nothing now. This is hygiene + correctness, not a measurable speedup today, and
the commit message will say so.

## Verified query → index mapping

| Read                     | Site                                    | Filter / order                                     | Index                                          |
| ------------------------ | --------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Credit balance Σ         | `credit-balance.ts:18`                  | `customer_id`, order `created_at`                  | `credit_transaction (customer_id, created_at)` |
| Customer credits feed    | `store/credits/route.ts`                | `customer_id`, order `created_at`                  | (same)                                         |
| Vault                    | `store/vault/route.ts:30`               | `customer_id, status='vaulted'`, order `rolled_at` | `pull (customer_id, rolled_at)`                |
| Public profile pulls     | `store/profiles/[handle]/route.ts:40`   | `customer_id`, order `rolled_at`                   | (same)                                         |
| Admin customer gacha     | `admin/customers/[id]/gacha/route.ts`   | `customer_id` (+ vaulted)                          | (same)                                         |
| Live "recent pulls" feed | `store/pulls/recent/route.ts:18`        | order `rolled_at` (global)                         | `pull (rolled_at)`                             |
| Leaderboard window       | `store/leaderboard/route.ts:36`         | `rolled_at >= now-7d` (global)                     | (same)                                         |
| Gacha-table build        | `roll-pack.ts:49`, odds editor, members | `pack_id`                                          | `pack_odds (pack_id)`                          |
| Card enrichment joins    | `recent:33`, `vault:46`, `profiles:57`  | `card_id IN (...)`                                 | `pack_odds (card_id)`                          |

**Refuted from the original P1 list:** `pull(pack_id)` and `pull(card_id)`. No
query filters `pull` by those columns — they are only _projected_ (read as
output columns) from customer/`rolled_at`-filtered result sets
(`leaderboard.ts:69`, `recent.ts:52`). Indexing them would be speculative. The
per-card lookups the original analysis attributed to `pull` actually hit
`pack_odds.card_id`, which is in the set above.

## Design

### 1. Indexes (model-declarative)

Add `.indexes()` to three model definitions so `.snapshot-packs.json` tracks
them (a hand-written raw-SQL migration would drift — a later `db:generate` would
try to drop indexes the model doesn't declare). All partial on
`deleted_at IS NULL` to match the existing convention and exclude soft-deleted
rows (Medusa appends that predicate to every default query, confirmed in the
EXPLAIN).

```ts
// credit-transaction.ts
.indexes([{ on: ["customer_id", "created_at"], where: "deleted_at IS NULL" }])

// pull.ts
.indexes([
  { on: ["customer_id", "rolled_at"], where: "deleted_at IS NULL" },
  { on: ["rolled_at"],                where: "deleted_at IS NULL" },
])

// pack-odds.ts
.indexes([
  { on: ["pack_id"], where: "deleted_at IS NULL" },
  { on: ["card_id"], where: "deleted_at IS NULL" },
])
```

Composite column order: the filter column leads, the order-by column trails, so
each index satisfies both the `WHERE` and the `ORDER BY` (and pagination) of its
query without a separate sort. `pull (rolled_at)` is a second, separate index
because the global feed/leaderboard reads have no `customer_id` predicate and so
cannot use the leading-`customer_id` composite.

### 2. Pack price → decimal (P4)

`pack.price` is `model.number()` → an `integer` column, so a `$X.99` pack would
truncate. Switch to `model.bigNumber()` (USD decimal, never cents) to match every
other money field (`card.market_value`, `card.price`, `pull.buyback_amount`,
`credit_transaction.amount`). Current data (`25`, `5000`, `10`, …) is clean
whole-dollar integers, so the conversion is loss-free; this is forward-compat,
not a data repair.

`bigNumber` is stored as **two** columns — `price numeric` + `raw_price jsonb`
(`{"value":"25","precision":20}`, matching the live `raw_amount` shape). The
generated migration must therefore:

1. `ALTER TABLE pack ALTER COLUMN price TYPE numeric USING price::numeric;`
2. `ALTER TABLE pack ADD COLUMN raw_price jsonb;` _(nullable first)_
3. `UPDATE pack SET raw_price = jsonb_build_object('value', price::text, 'precision', 20);` _(hand-added backfill — the generator emits DDL only; without this the 8 existing rows violate the NOT NULL add and money reads return null)_
4. `ALTER TABLE pack ALTER COLUMN raw_price SET NOT NULL;`

Down migration reverses (drop `raw_price`, `ALTER COLUMN price TYPE integer USING price::integer`) — lossy by nature (truncates any future cents); documented in the migration.

### 3. Generation & files

Edit the four model files, then run `corepack yarn medusa db:generate packs`
from `backend/packages/api`. Inspect the single emitted migration; hand-add the
step-2/3/4 ordering + backfill for price. No route or workflow code changes —
`Number(pack.price)` reads identically off a numeric column.

**Files touched:**

- `src/modules/packs/models/credit-transaction.ts` — `.indexes([...])`
- `src/modules/packs/models/pull.ts` — `.indexes([...])`
- `src/modules/packs/models/pack-odds.ts` — `.indexes([...])`
- `src/modules/packs/models/pack.ts` — `price: model.bigNumber()` + intent comment
- `src/modules/packs/migrations/Migration<ts>.ts` — generated, then hand-edited
- `src/modules/packs/migrations/.snapshot-packs.json` — regenerated by the tool

## Verification (loop until green)

1. `corepack yarn build` (backend) → exit 0; Stop-hook typecheck passes.
2. `corepack yarn medusa db:migrate` applies cleanly.
3. `\d pull` / `\d credit_transaction` / `\d pack_odds` show the 5 new indexes;
   `\d pack` shows `price numeric` + `raw_price jsonb NOT NULL`.
4. `SET enable_seqscan=off; EXPLAIN <balance query>` → `Index Scan using
IDX_credit_transaction_customer_id_created_at` (proves the index is valid and
   usable; default plan still seq-scans at 153 rows — expected, not a failure).
5. `SELECT slug, price, raw_price FROM pack;` → prices unchanged, `raw_price`
   populated for all 8 rows.
6. `GET /store/packs` returns identical prices; existing economy/charge unit +
   integration specs still pass.

## Explicitly deferred (not in this change)

- **P2** referential integrity (FK / Medusa links vs immutable slug/handle) —
  bigger design decision; revisit separately.
- **P3** balance checkpoint/rollup — premature at 153 rows; the index covers
  reads for the foreseeable future.
- **P5** `pull` time-series partitioning / TimescaleDB — premature at 115 rows.

## Risks

- Generated migration may emit the `NOT NULL` add before a backfill — mitigated
  by inspecting and hand-ordering before applying (step 2/3/4 above).
- `db:generate` could fold in unrelated snapshot drift — mitigated by reading the
  full emitted migration before applying; abort if it touches anything outside
  these models.

## Implementation outcome (2026-06-15)

Shipped in four commits on `master`: `64d65c8` (indexes), `53d5d97` (price
decimal), `dba077a` (migration import + rollback-comment tidy), `c50c0f8`
(public-route shaping).

Two findings corrected the "no route/workflow code changes" assumption above:

1. **`db:generate` snapshot drift.** The index migration also re-emitted the
   `credit_transaction_reason_check` constraint (a prior `adjustment` enum value
   was never re-snapshotted). It was a verified no-op against the live DB, but
   the regenerated `down()` initially dropped a value; the migration was rewritten
   to be index-only (the constraint is owned by `Migration20260612190000`).

2. **`bigNumber` leaks a `raw_price` sidecar.** `pack.price` still serializes as a
   JSON **number** (so `formatPrice` / `Number.isFinite` consumers are unaffected —
   the "string" risk did not materialise, verified via live response). But the two
   public store routes (`store/packs`, `store/packs/[slug]`) spread the raw pack
   object and so began leaking the internal `raw_price` jsonb. Fixed by giving them
   explicit public DTOs (matching `admin/packs`). No `Number()` coercion was needed.
