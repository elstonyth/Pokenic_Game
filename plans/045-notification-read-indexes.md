# Plan 045: Index the notification unread-count path (notification_read customer index + verify the core notification table)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b5944e26..HEAD -- backend/packages/api/src/modules/packs/models/notification-read.ts backend/packages/api/src/modules/packs/migrations backend/packages/api/src/api/store/notifications/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `b5944e26`, 2026-07-20

## Why this matters

The storefront notification bell (`src/components/NotificationBell.tsx:13-29`) calls the unread count on **every SPA navigation and every window focus** for every logged-in user — the highest-frequency authenticated query in the app. That count (`GET /store/notifications`) runs two `listAndCount` queries: one on `notification_read` filtered by `customer_id` only, and one on the core `notification` table filtered by `(receiver_id, channel)`. The `notification_read` model's only index is the composite UNIQUE `(notification_id, customer_id)` — its leading column is not in the count's predicate, so Postgres cannot use it and scans the whole table. That table grows with every "mark read" by every customer forever; cost degrades linearly, paid per navigation. Part B verifies the core `notification` table (not project-owned, so we can't assume an index) and adds one only if missing.

## Current state

- `backend/packages/api/src/modules/packs/models/notification-read.ts` — the packs side-table (the base Medusa Notification Module stores no read state). Full current model:
  ```ts
  const NotificationRead = model
    .define('notification_read', {
      id: model.id().primaryKey(),
      notification_id: model.text(), // the noti_-prefixed Notification id
      customer_id: model.text(), // the reader (owner-scoped)
      read_at: model.dateTime().nullable(),
    })
    .indexes([
      {
        on: ['notification_id', 'customer_id'],
        unique: true,
        where: 'deleted_at IS NULL',
      },
    ]);
  ```
- `backend/packages/api/src/api/store/notifications/route.ts:63-66` — the hot count (no `notification_id` predicate):
  ```ts
  const [, readCount] = await packs.listAndCountNotificationReads(
    { customer_id: receiverId, read_at: { $ne: null } },
    { take: 1 },
  );
  ```
  and lines 48-53, the core-table query:
  ```ts
  const [rows, totalFeed] = await notif.listAndCountNotifications(
    { receiver_id: receiverId, channel: 'feed' },
    {
      take: limit + 1,
      skip: offset,
      order: { created_at: 'DESC', id: 'DESC' },
    },
  );
  ```
- Index-model convention exemplar — `backend/packages/api/src/modules/packs/models/pull.ts:62-75` uses named indexes with `where: 'deleted_at IS NULL'`:
  ```ts
  {
    name: 'IDX_pull_customer_id_rolled_at',
    on: ['customer_id', 'rolled_at'],
    where: 'deleted_at IS NULL',
  },
  ```
- Migration convention exemplar — `backend/packages/api/src/modules/packs/migrations/Migration20260713130000.ts`: hand-written class extending `Migration` from `@medusajs/framework/mikro-orm/migrations`, `CREATE ... IF NOT EXISTS` in `up()`, `drop index if exists` in `down()`, a comment explaining why. Newest existing migration: `Migration20260720140000.ts` — your new file must sort after it.
- The core `notification` table is created by Medusa's Notification Module — its schema/indexes are NOT declared anywhere in `backend/packages/api/src`. Whether `receiver_id` is indexed is unknown (that's Part B's job).
- Local DB for verification: Postgres 16 in Docker, container `pokenic-postgres`, user/password/db all `medusa` (README Quick Start). Integration suites run against it via `.env.test`.

## Commands you will need

| Purpose                              | Command                                                                                                                                                                                | Expected on success                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Backend deps (fresh worktree only)   | `cd backend && corepack yarn install --immutable`                                                                                                                                      | exit 0                                                                                                                   |
| Workspace dep build (fresh worktree) | `cd backend/packages/odds-math && corepack yarn build`                                                                                                                                 | exit 0                                                                                                                   |
| Typecheck                            | `cd backend/packages/api && corepack yarn check-types`                                                                                                                                 | exit 0                                                                                                                   |
| Run migrations locally               | `cd backend/packages/api && corepack yarn medusa db:migrate`                                                                                                                           | exit 0, lists your migration                                                                                             |
| Inspect indexes                      | `docker exec pokenic-postgres psql -U medusa -d medusa -c "\d notification_read"`                                                                                                      | shows the new index                                                                                                      |
| Explain the count                    | `docker exec pokenic-postgres psql -U medusa -d medusa -c "EXPLAIN SELECT count(*) FROM notification_read WHERE customer_id = 'cus_x' AND read_at IS NOT NULL AND deleted_at IS NULL"` | plan uses the new index (Index Only/Bitmap scan, not Seq Scan — on a tiny table Postgres may still seq-scan; see Step 3) |
| Notifications HTTP specs             | `cd backend/packages/api && corepack yarn test:integration:http -- store-notifications`                                                                                                | all pass                                                                                                                 |

## Scope

**In scope**:

- `backend/packages/api/src/modules/packs/models/notification-read.ts` (add one index)
- One NEW migration file `backend/packages/api/src/modules/packs/migrations/Migration<utc-timestamp>.ts` (indexes for Part A, and Part B only if verification shows the core index is missing)

**Out of scope** (do NOT touch):

- `store/notifications/route.ts` and the storefront bell — query shape is correct; only the index is missing.
- The core Notification Module model/source under `node_modules` — never edit vendored code; a missing core index is fixed by OUR raw-SQL migration against the table.
- The `.snapshot-packs.json` migration snapshot — regenerate only if the repo's migration tooling does it automatically; do not hand-edit.

## Git workflow

- Branch: `advisor/045-notification-indexes`
- Commit style: `perf(notifications): index the unread-count path`
- Do NOT push or open a PR unless instructed.
- NOTE (this machine): a global formatter hook may rewrite backend quote style on Edit/Write; check `git diff` for whole-file churn and re-apply via a node script if it appears.

## Steps

### Step 1: Add the customer index to the model

In `notification-read.ts`, append to `.indexes([...])` (keep the existing composite unique):

```ts
{
  // Unread-count path: GET /store/notifications counts this table by
  // customer_id alone (no notification_id predicate), so the composite
  // unique above can't serve it.
  name: 'IDX_notification_read_customer_id',
  on: ['customer_id'],
  where: 'deleted_at IS NULL',
},
```

**Verify**: `corepack yarn check-types` → exit 0.

### Step 2: Write the migration (Part A)

Create `Migration<UTC yyyymmddHHMMSS, later than 20260720140000>.ts` following the `Migration20260713130000.ts` pattern:

```sql
CREATE INDEX IF NOT EXISTS "IDX_notification_read_customer_id"
  ON "notification_read" ("customer_id") WHERE deleted_at IS NULL;
```

`down()`: `drop index if exists "IDX_notification_read_customer_id";`

**Verify**: `corepack yarn medusa db:migrate` → exit 0; `\d notification_read` shows `IDX_notification_read_customer_id`.

### Step 3: Part B — verify the core `notification` table's receiver index

Run `docker exec pokenic-postgres psql -U medusa -d medusa -c "\d notification"` and read the index list.

- If an index whose leading column is `receiver_id` exists → record the index name in your report; Part B is done, no migration addition.
- If absent → add to the SAME migration file (before running it, or a second migration if already applied):
  ```sql
  CREATE INDEX IF NOT EXISTS "IDX_notification_receiver_channel"
    ON "notification" ("receiver_id", "channel");
  ```
  (No `deleted_at` partial clause unless `\d` shows the core table has a `deleted_at` column — check first.) `down()` drops it.

**Verify**: re-run `\d notification` → index present (or report "core index already exists: <name>"). EXPLAIN the feed query analog: `EXPLAIN SELECT * FROM notification WHERE receiver_id = 'cus_x' AND channel = 'feed' ORDER BY created_at DESC LIMIT 21` → no Seq Scan on a table with data. Note: on a near-empty dev table Postgres may prefer a seq scan regardless — seed rows first (open the storefront, trigger a topup notification) or set `enable_seqscan = off` for the EXPLAIN session to confirm the index is _usable_.

### Step 4: Prove the suites still pass

**Verify**: `corepack yarn test:integration:http -- store-notifications` → all pass (both notifications suites). `corepack yarn test:integration:http -- store-notifications-read-all` if not matched by the first filter.

## Test plan

No new test file — index-only change; correctness is covered by the existing `store-notifications.spec.ts` / `store-notifications-read-all.spec.ts` HTTP suites, which must stay green. The EXPLAIN checks in Steps 2-3 are the performance verification.

## Done criteria

- [ ] `corepack yarn check-types` exits 0
- [ ] `corepack yarn medusa db:migrate` applies cleanly on a DB that already ran all prior migrations
- [ ] `\d notification_read` shows `IDX_notification_read_customer_id`
- [ ] Part B verdict recorded in the report: core index pre-existing (name) OR added by this migration
- [ ] `corepack yarn test:integration:http -- store-notifications` green
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The model excerpt doesn't match (someone already added an index).
- `db:migrate` fails on the new file (naming/ordering problem — do not force).
- `\d notification` shows the core table doesn't exist locally (migrations not run / wrong DB) — fix your env per README, don't improvise schema.
- The core table turns out to be partitioned or otherwise non-trivial — report instead of indexing blind.

## Maintenance notes

- If notification volume ever justifies it, the next lever is making the bell's count event-driven (invalidate on mark-read) instead of per-navigation — out of scope here.
- A future `challenge_stage` broadcast producer (see plan 056 / the notification-toasts spec) will multiply feed rows; this index is what keeps the badge cheap when that lands.
- Reviewer: confirm the migration timestamp sorts after `Migration20260720140000.ts` and that `down()` exists for every index added.
