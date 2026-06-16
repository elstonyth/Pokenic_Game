# Phase 2 — Vault Showcase / Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cards in the vault are private by default; the customer opts individual vaulted cards into a public profile showcase via a per-card toggle, and the public profile Collection tab shows only showcased cards.

**Architecture:** One new `showcased boolean` column on `Pull`; one new `POST /store/vault/:id/showcase` route to toggle it (customer-owned, vaulted-only); the profile route splits its payload into `collection` (showcased-only) and `recent` (activity feed, ungated); the vault UI adds a star toggle per card with optimistic update; the profile Collection tab renders the showcased set with a "nothing showcased yet" empty state.

**Tech Stack:** Medusa v2 (MikroORM, `@medusajs/framework`), `corepack yarn` (backend), Next.js 16 App Router, Tailwind CSS v4, TypeScript strict, Vitest (unit), Playwright (E2E).

**Work directory:** `C:\Users\PC\Desktop\Projects\Pokenic_Game\.claude\worktrees\feat+vault-showcase-privacy`  
**Backend commands:** run from `backend/` with `corepack yarn`  
**Branch:** `worktree-feat+vault-showcase-privacy`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/packages/api/src/modules/packs/models/pull.ts` | Modify | Add `showcased boolean default false` |
| `backend/packages/api/src/modules/packs/migrations/Migration20260616200000.ts` | Create | ALTER TABLE pull ADD COLUMN showcased |
| `backend/packages/api/src/api/store/vault/[id]/showcase/route.ts` | Create | `POST /store/vault/:id/showcase` toggle handler |
| `backend/packages/api/src/api/middlewares.ts` | Modify | Register auth for `/store/vault/*/showcase` |
| `backend/packages/api/src/modules/packs/__tests__/showcase-toggle.unit.spec.ts` | Create | Unit tests for ownership + status guard logic |
| `backend/packages/api/src/api/store/profiles/[handle]/route.ts` | Modify | Add `collection` (showcased-only); keep `recent` as activity |
| `src/lib/data/schemas.ts` | Modify | Add `VaultShowcaseSchema`; add `showcased` to `VaultItemSchema` |
| `src/lib/data/profiles.ts` | Modify | Add `collection: PublicProfileCard[]` to `PublicProfile` |
| `src/lib/profile-view.ts` | Modify | `toProfileView` maps `profile.collection` → `collection` (not `recent`) |
| `src/lib/actions/vault.ts` | Modify | Add `showcased` to `VaultItem`; add `toggleShowcase` action |
| `src/app/(account)/vault/VaultClient.tsx` | Modify | Per-card showcase toggle with optimistic update |
| `src/app/profile/[user]/ProfileClient.tsx` | Modify | Empty-state copy when collection is empty |

---

## Per-task conventions

- **Work dir:** the worktree root (paths relative to it above).
- **TypeScript check:** the PostToolUse hook runs `tsc` after every `.ts`/`.tsx` edit — confirm zero errors in the hook output before committing.
- **Lint (storefront):** `npm run lint` from the worktree root.
- **Lint (backend):** `cd backend && corepack yarn workspace @acme/api run lint`.
- **Unit tests:** `cd backend/packages/api && corepack yarn test:unit` (Vitest, watches `*.unit.spec.ts` files).
- **Build (storefront):** `npm run build` — only needed at Task 9 verification.
- **Never** add a second `QueryClientProvider` — the admin dashboard already provides one.

---

## Task 1: Add `showcased` to Pull model

**Files:**
- Modify: `backend/packages/api/src/modules/packs/models/pull.ts`

- [ ] **Step 1: Add the `showcased` field after `buyback_at`**

The field goes after `buyback_at` to keep the schema additions grouped at the bottom:

```ts
// After the buyback_at line, before the closing `  })`:
    // Customer opt-in to the public profile showcase (false = private).
    // Only pulls with status "vaulted" can be showcased; the toggle route
    // enforces this. The profile route filters to showcased:true for the
    // Collection display; the activity feed stays ungated.
    showcased: model.boolean().default(false),
```

Full `pull.ts` after the change — only the new line differs:

```ts
import { model } from "@medusajs/framework/utils";

export const Pull = model
  .define("pull", {
    id: model.id().primaryKey(),
    customer_id: model.text(),
    pack_id: model.text(),
    card_id: model.text(),
    order_id: model.text().nullable(),
    rolled_at: model.dateTime(),
    revealed_at: model.dateTime().nullable(),
    stock_earmarked: model.boolean().default(false),
    status: model.enum(["vaulted", "bought_back"]).default("vaulted"),
    buyback_amount: model.bigNumber().nullable(),
    buyback_at: model.dateTime().nullable(),
    showcased: model.boolean().default(false),
  })
  .indexes([
    {
      name: "IDX_pull_customer_id_rolled_at",
      on: ["customer_id", "rolled_at"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_pull_rolled_at",
      on: ["rolled_at"],
      where: "deleted_at IS NULL",
    },
  ]);

export default Pull;
```

- [ ] **Step 2: Verify tsc (PostToolUse hook)**

Expected: zero type errors. The new field is `boolean`, no callers yet.

---

## Task 2: Write and apply the migration

**Files:**
- Create: `backend/packages/api/src/modules/packs/migrations/Migration20260616200000.ts`

- [ ] **Step 1: Create the migration file**

```ts
import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Adds Pull.showcased — customer opt-in to the public profile Collection.
// Additive + non-null default false: existing pulls are private (not showcased).
export class Migration20260616200000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `ALTER TABLE "pull" ADD COLUMN IF NOT EXISTS "showcased" boolean NOT NULL DEFAULT false;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`ALTER TABLE "pull" DROP COLUMN IF EXISTS "showcased";`);
  }
}
```

- [ ] **Step 2: Apply the migration**

With the backend running (or stopped — `db:migrate` applies without starting the server):

```bash
cd backend
corepack yarn workspace @acme/api exec medusa db:migrate
```

Expected output contains: `Migration20260616200000` in the applied list, exit 0.

- [ ] **Step 3: Verify column exists**

```bash
cd backend
corepack yarn workspace @acme/api exec medusa exec -- node -e "
const { createMedusaApp } = require('@medusajs/framework');
createMedusaApp({ workerMode: 'shared' }).then(({ pgConnection }) =>
  pgConnection.raw('SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = \'pull\' AND column_name = \'showcased\'')
).then(r => { console.log(r.rows); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
"
```

Expected: `[{ column_name: 'showcased', data_type: 'boolean', column_default: 'false' }]`

If the exec approach is awkward, connect directly:

```bash
docker exec -it pokenic-postgres psql -U postgres -d pokenic_dev -c "\d pull" | grep showcased
```

Expected: `showcased  | boolean  | not null | false`

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/modules/packs/models/pull.ts \
        backend/packages/api/src/modules/packs/migrations/Migration20260616200000.ts
git commit -m "feat(pull): add showcased boolean for opt-in profile collection"
```

---

## Task 3: New `POST /store/vault/:id/showcase` route + middleware

**Files:**
- Create: `backend/packages/api/src/api/store/vault/[id]/showcase/route.ts`
- Modify: `backend/packages/api/src/api/middlewares.ts`

- [ ] **Step 1: Create the showcase route**

```ts
import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { MedusaError } from "@medusajs/framework/utils";
import PacksModuleService from "../../../../../modules/packs/service";
import { PACKS_MODULE } from "../../../../../modules/packs";

// POST /store/vault/:id/showcase — toggle whether a vaulted pull appears on the
// customer's public profile Collection.
//
// Body:   { showcased: boolean }
// 200:    { pull_id: string, showcased: boolean }
// 403:    pull doesn't belong to this customer
// 422:    pull is not currently vaulted (bought_back pulls can't be showcased)
//
// AUTH: registered in middlewares.ts — authenticate('customer', ['bearer']).
// The customer id comes ONLY from the verified token.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const pullId = req.params.id;
  const body = req.body as { showcased?: unknown };

  if (typeof body.showcased !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      '`showcased` must be a boolean',
    );
  }

  const packs: PacksModuleService = req.scope.resolve(PACKS_MODULE);
  const [pull] = await packs.listPulls({ id: pullId }, { take: 1 });

  if (!pull) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pull not found");
  }
  if (pull.customer_id !== customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Forbidden");
  }
  if (pull.status !== "vaulted") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only vaulted pulls can be showcased",
    );
  }

  await packs.updatePulls({ id: pullId }, { showcased: body.showcased });

  res.json({ pull_id: pullId, showcased: body.showcased });
}
```

- [ ] **Step 2: Register the middleware**

In `backend/packages/api/src/api/middlewares.ts`, add the showcase entry immediately after the buyback entry (around line 141):

```ts
    {
      // Showcase toggle (POST /store/vault/:id/showcase).
      matcher: '/store/vault/*/showcase',
      middlewares: [authenticate('customer', ['bearer'])],
    },
```

- [ ] **Step 3: Verify tsc**

Expected: zero type errors. `updatePulls` accepts a partial — `{ showcased: boolean }` is valid.

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/api/store/vault/[id]/showcase/route.ts \
        backend/packages/api/src/api/middlewares.ts
git commit -m "feat(store): POST /store/vault/:id/showcase — opt-in to profile collection"
```

---

## Task 4: Unit tests for showcase toggle validation logic

**Files:**
- Create: `backend/packages/api/src/modules/packs/__tests__/showcase-toggle.unit.spec.ts`

The route handler performs three guard checks before the DB write. Extract the logic into a pure function so it can be tested without standing up a Medusa context.

- [ ] **Step 1: Write the tests**

```ts
// Unit-test the three guard checks that the showcase route enforces,
// without any Medusa/DB setup.

type PullRow = { customer_id: string; status: string };

function validateShowcaseRequest(
  pull: PullRow | undefined,
  callerId: string,
): "ok" | "not_found" | "forbidden" | "not_vaulted" {
  if (!pull) return "not_found";
  if (pull.customer_id !== callerId) return "forbidden";
  if (pull.status !== "vaulted") return "not_vaulted";
  return "ok";
}

describe("showcase toggle validation", () => {
  const CUSTOMER = "cust_abc";
  const OTHER = "cust_xyz";

  it("returns ok for a vaulted pull owned by the caller", () => {
    const pull: PullRow = { customer_id: CUSTOMER, status: "vaulted" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("ok");
  });

  it("returns not_found when the pull does not exist", () => {
    expect(validateShowcaseRequest(undefined, CUSTOMER)).toBe("not_found");
  });

  it("returns forbidden when the pull belongs to a different customer", () => {
    const pull: PullRow = { customer_id: OTHER, status: "vaulted" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("forbidden");
  });

  it("returns not_vaulted when the pull is bought_back", () => {
    const pull: PullRow = { customer_id: CUSTOMER, status: "bought_back" };
    expect(validateShowcaseRequest(pull, CUSTOMER)).toBe("not_vaulted");
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL (function not defined yet)**

```bash
cd backend/packages/api
corepack yarn test:unit --reporter=verbose 2>&1 | tail -20
```

Expected: test fails with `validateShowcaseRequest is not defined` or similar.

- [ ] **Step 3: Add the exported helper to the showcase route**

At the top of `route.ts`, above the `POST` handler, add:

```ts
// Pure validation logic — extracted so it can be unit-tested without Medusa.
export function validateShowcaseRequest(
  pull: { customer_id: string; status: string } | undefined,
  callerId: string,
): "ok" | "not_found" | "forbidden" | "not_vaulted" {
  if (!pull) return "not_found";
  if (pull.customer_id !== callerId) return "forbidden";
  if (pull.status !== "vaulted") return "not_vaulted";
  return "ok";
}
```

Then update the `POST` handler to use it:

```ts
  const validation = validateShowcaseRequest(pull, customerId);
  if (validation === "not_found") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Pull not found");
  }
  if (validation === "forbidden") {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, "Forbidden");
  }
  if (validation === "not_vaulted") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only vaulted pulls can be showcased",
    );
  }
```

Also update the test import:

```ts
import { validateShowcaseRequest } from "../../api/store/vault/[id]/showcase/route";

// Remove the local re-declaration of validateShowcaseRequest in the test file.
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
cd backend/packages/api
corepack yarn test:unit --reporter=verbose 2>&1 | grep -E "showcase|PASS|FAIL"
```

Expected: `✓ showcase toggle validation` — all 4 cases pass.

- [ ] **Step 5: Commit**

```bash
git add backend/packages/api/src/modules/packs/__tests__/showcase-toggle.unit.spec.ts \
        backend/packages/api/src/api/store/vault/[id]/showcase/route.ts
git commit -m "test(showcase): unit-test ownership + status guard for toggle route"
```

---

## Task 5: Profile route — add `collection` (showcased-only)

**Files:**
- Modify: `backend/packages/api/src/api/store/profiles/[handle]/route.ts`

Currently the route returns only `recent` (last 12 pulls, used for both Collection and Activity). Phase 2 adds a separate `collection` field with only showcased pulls.

- [ ] **Step 1: Add `collection` to the response — filter in-memory from the already-loaded pulls**

After the `recent` array is built (before `res.json`), add:

```ts
  // Collection: only pulls the customer has opted to showcase (showcased=true,
  // still vaulted). Computed from the already-loaded pull set — no extra query.
  // The activity feed (recent) stays ungated as decided at spec time.
  const collection = pulls
    .filter((p) => (p as unknown as { showcased: boolean }).showcased && p.status === "vaulted")
    .flatMap((p) => {
      const card = byHandle.get(p.card_id);
      if (!card) return [];
      return [
        {
          handle: card.handle,
          name: card.name,
          set: card.set,
          grader: card.grader,
          grade: card.grade,
          market_value: toMoney(card.market_value),
          image: card.image,
        },
      ];
    });
```

Then in `res.json`, add `collection` to the payload:

```ts
  res.json({
    handle,
    name: first.length > 0 ? first : `Collector ${String(seed).slice(0, 4)}`,
    seed,
    joined_at: customer.created_at,
    stats: {
      pulls: pulls.length,
      volume: Math.round(volume * 100) / 100,
      points: Math.round(points),
      by_rarity: byRarity,
    },
    collection,   // ← new: showcased-only card cards
    recent,       // ← unchanged: last RECENT_N for activity feed
  });
```

Note on the type cast `(p as unknown as { showcased: boolean }).showcased`: the `listPulls` return type is inferred from the MikroORM entity — after the migration applies and Medusa regenerates types, the field will be typed directly. Until then, the cast lets us ship without changing generated type files.

- [ ] **Step 2: Verify tsc**

Expected: zero type errors. The `(p as unknown as {...}).showcased` cast is intentional.

- [ ] **Step 3: Start the backend and smoke-test manually**

```bash
cd backend
corepack yarn dev
```

In another terminal, call the profile route for a customer with known handle (e.g. the test customer's handle, visible after `/store/profiles/me` with the test token):

```bash
curl -s http://localhost:9000/store/profiles/<handle> | jq '{collection_count: .collection | length, recent_count: .recent | length}'
```

Expected: both counts present (collection is 0 since no pulls are showcased yet — correct).

- [ ] **Step 4: Commit**

```bash
git add backend/packages/api/src/api/store/profiles/[handle]/route.ts
git commit -m "feat(profiles): return showcased-only collection separate from activity feed"
```

---

## Task 6: Frontend schemas + types + `toggleShowcase` action

**Files:**
- Modify: `src/lib/data/schemas.ts`
- Modify: `src/lib/data/profiles.ts`
- Modify: `src/lib/actions/vault.ts`

- [ ] **Step 1: Add `VaultShowcaseSchema` and `showcased` to `VaultItemSchema` in `schemas.ts`**

Add after `VaultItemSchema`:

```ts
/** POST /store/vault/:id/showcase response — pull_id + final showcased state. */
export const VaultShowcaseSchema = z.looseObject({
  pull_id: z.string(),
  showcased: z.boolean(),
});
```

Update `VaultItemSchema` to include `showcased` (use `looseObject` — a missing field passes as undefined, keeping backward compat with backends that haven't migrated yet):

```ts
/** GET /store/vault item — pull_id + card.name + finite buyback.amount + showcased state. */
export const VaultItemSchema = z.looseObject({
  pull_id: z.string(),
  showcased: z.boolean().optional(),   // ← add this line
  card: z.looseObject({ name: z.string() }),
  buyback: z.looseObject({ amount: finite }),
});
```

- [ ] **Step 2: Add `collection` field to `PublicProfile` in `profiles.ts`**

```ts
// Existing type:
export interface PublicProfileCard {
  handle: string;
  name: string;
  set: string;
  grader: string;
  grade: string;
  market_value: number;
  image: string;
}

// Existing:
export interface PublicProfile {
  handle: string;
  name: string;
  seed: number;
  joined_at: string;
  stats: { ... };
  recent: PublicProfilePull[];
}

// Update PublicProfile to include:
export interface PublicProfile {
  handle: string;
  name: string;
  seed: number;
  joined_at: string;
  stats: {
    pulls: number;
    volume: number;
    points: number;
    by_rarity: Record<ProfileRarity, number>;
  };
  collection: PublicProfileCard[];   // ← new: showcased-only cards
  recent: PublicProfilePull[];
}
```

- [ ] **Step 3: Add `showcased` to `VaultItem` type in `vault.ts`**

In the `VaultItem` type definition:

```ts
export type VaultItem = {
  pullId: string;
  rolledAt: string;
  packId: string;
  packTitle: string;
  showcased: boolean;   // ← add this
  card: {
    handle: string;
    name: string;
    image: string;
    rarity: string;
    marketValue: number;
  };
  buyback: {
    percent: number;
    amount: number;
  };
};
```

In `getVault`, update the mapping from backend item to `VaultItem`:

```ts
    const items = (
      parseList(VaultItemSchema, (vaultRes as { items?: unknown }).items) as unknown as BackendVaultItem[]
    ).map((i) => ({
      pullId: i.pull_id,
      rolledAt: i.rolled_at,
      packId: i.pack_id,
      packTitle: i.pack_title,
      showcased: (i as unknown as { showcased?: boolean }).showcased ?? false,  // ← add
      card: {
        handle: i.card.handle,
        name: i.card.name,
        image: i.card.image,
        rarity: i.card.rarity,
        marketValue: i.card.market_value,
      },
      buyback: { percent: i.buyback.percent, amount: i.buyback.amount },
    }));
```

- [ ] **Step 4: Add `toggleShowcase` action to `vault.ts`**

Add after `sellBackPull`:

```ts
export type ToggleShowcaseResult =
  | { ok: true; showcased: boolean }
  | { ok: false; error: string; needsAuth?: boolean };

// Toggle whether a vaulted pull is featured on the public profile Collection.
// Safe to retry: idempotent (writing the same boolean twice = same state).
export async function toggleShowcase(
  pullId: string,
  showcased: boolean,
): Promise<ToggleShowcaseResult> {
  if (typeof pullId !== 'string' || pullId.trim() === '') {
    return { ok: false, error: 'Invalid card.' };
  }

  const token = await getAuthToken();
  if (!token) {
    return { ok: false, error: 'Please log in first.', needsAuth: true };
  }

  try {
    const parsed = parseOne(
      VaultShowcaseSchema,
      await sdk.client.fetch(
        `/store/vault/${encodeURIComponent(pullId)}/showcase`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: { showcased },
        },
      ),
    );
    if (!parsed) {
      return { ok: false, error: 'Got an unexpected response. Please try again.' };
    }
    return { ok: true, showcased: parsed.showcased };
  } catch (error) {
    logger.error(`[vault] showcase toggle failed for '${pullId}':`, error);
    return {
      ok: false,
      error: friendlyError(error, VAULT_RULES, VAULT_FALLBACK),
      needsAuth: isAuthError(error),
    };
  }
}
```

Also add the `VaultShowcaseSchema` import at the top of `vault.ts`:

```ts
import {
  parseList,
  parseOne,
  VaultItemSchema,
  VaultShowcaseSchema,   // ← add
  BalanceSchema,
  AmountBalanceSchema,
} from '@/lib/data/schemas';
```

- [ ] **Step 5: Verify tsc — zero errors**

The `VaultItem.showcased` field is now typed. The `VaultClient` still references `VaultItem` without `showcased` in JSX — tsc may flag unused-but-required-field absence depending on the component usage; check and address any errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/schemas.ts \
        src/lib/data/profiles.ts \
        src/lib/actions/vault.ts
git commit -m "feat(vault): add showcased type + toggleShowcase action + VaultShowcaseSchema"
```

---

## Task 7: VaultClient — per-card showcase toggle

**Files:**
- Modify: `src/app/(account)/vault/VaultClient.tsx`

- [ ] **Step 1: Add the `toggleShowcase` import and `showcasingId` state**

Add to imports:

```ts
import {
  sellBackPull,
  toggleShowcase,
  type VaultItem,
  type VaultResult,
} from '@/lib/actions/vault';
import { Star } from 'lucide-react';
```

Add state after `confirmItem`:

```ts
  const [showcasingId, setShowcasingId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `handleToggleShowcase` function**

Add after the `sell` function:

```ts
  async function handleToggleShowcase(item: VaultItem) {
    if (showcasingId) return;
    setShowcasingId(item.pullId);
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.pullId === item.pullId ? { ...i, showcased: !item.showcased } : i,
      ),
    );
    try {
      const res = await toggleShowcase(item.pullId, !item.showcased);
      if (!res.ok) {
        // Revert on failure
        setItems((prev) =>
          prev.map((i) =>
            i.pullId === item.pullId ? { ...i, showcased: item.showcased } : i,
          ),
        );
        setError(res.error);
      }
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.pullId === item.pullId ? { ...i, showcased: item.showcased } : i,
        ),
      );
      setError('Something went wrong. Please try again.');
    } finally {
      setShowcasingId(null);
    }
  }
```

- [ ] **Step 3: Add the showcase toggle button to each vault card**

In the card grid, below the sell button (after the `</button>` for the sell action), add:

```tsx
              <button
                type="button"
                onClick={() => handleToggleShowcase(item)}
                disabled={showcasingId !== null}
                title={item.showcased ? 'Remove from profile showcase' : 'Feature on profile'}
                className={cn(
                  'mt-1.5 inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-50',
                  item.showcased
                    ? 'border border-yellow-400/50 bg-yellow-400/10 text-yellow-300 hover:bg-yellow-400/20'
                    : 'border border-white/10 bg-white/[0.03] text-white/40 hover:border-white/20 hover:text-white/60',
                )}
              >
                <Star
                  className={cn('h-3 w-3', item.showcased && 'fill-yellow-300')}
                />
                {showcasingId === item.pullId
                  ? '…'
                  : item.showcased
                  ? 'On profile'
                  : 'Feature on profile'}
              </button>
```

- [ ] **Step 4: Verify tsc + lint**

```bash
npm run lint
```

Expected: no errors. The `Star` icon is from `lucide-react` (already a dep).

- [ ] **Step 5: Commit**

```bash
git add src/app/\(account\)/vault/VaultClient.tsx
git commit -m "feat(vault): per-card showcase toggle with optimistic update"
```

---

## Task 8: Update profile view mapper + ProfileClient empty state

**Files:**
- Modify: `src/lib/profile-view.ts`
- Modify: `src/app/profile/[user]/ProfileClient.tsx`

- [ ] **Step 1: Update `toProfileView` to use `profile.collection` for the Collection tab**

In `profile-view.ts`, update the `toProfileView` function:

```ts
export function toProfileView(profile: PublicProfile): ProfileViewUser {
  // Collection = showcased cards (opt-in). Activity = all recent pulls.
  const collectionCards: ProfileViewCard[] = profile.collection.map((c) => ({
    id: c.handle,
    name: c.name,
    image: c.image,
    grader: c.grader,
    grade: c.grade,
    price: c.market_value,
  }));

  const activityCards: ProfileViewCard[] = profile.recent.map((p) => ({
    id: p.card.handle,
    name: p.card.name,
    image: p.card.image,
    grader: p.card.grader,
    grade: p.card.grade,
    price: p.card.market_value,
  }));

  return {
    username: profile.name,
    pfp: avatarForSeed(profile.seed),
    rank: null,
    points: profile.stats.points,
    pulls: profile.stats.pulls,
    volume: profile.stats.volume,
    joined: joinedYear(profile.joined_at),
    collection: collectionCards,
    activity: profile.recent.map((p, i) => ({
      verb: 'pulled',
      time: relativeTime(p.rolled_at),
      card: activityCards[i],
    })),
  };
}
```

- [ ] **Step 2: Add empty-state copy to ProfileClient Collection tab**

In `src/app/profile/[user]/ProfileClient.tsx`, find the Collection tab render (where `user.collection` is mapped). Add a conditional empty state before or replacing the card grid:

Locate the existing collection render (search for `user.collection.map` or the Collection tab body). It looks like:

```tsx
// Current (no empty state):
{user.collection.map((card) => (
  // card grid item
))}
```

Replace with:

```tsx
{user.collection.length === 0 ? (
  <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
    <p className="text-sm font-medium text-white/60">No cards showcased yet.</p>
    <p className="mt-1 text-[13px] text-white/35">
      Cards featured from the vault appear here.
    </p>
  </div>
) : (
  user.collection.map((card) => (
    // existing card grid item — keep unchanged
  ))
)}
```

- [ ] **Step 3: Handle the case where `profile.collection` may be absent (backend not yet migrated)**

In `profiles.ts`, make `collection` optional in `PublicProfile` so existing responses without the field don't break the schema validation:

```ts
export interface PublicProfile {
  handle: string;
  name: string;
  seed: number;
  joined_at: string;
  stats: {
    pulls: number;
    volume: number;
    points: number;
    by_rarity: Record<ProfileRarity, number>;
  };
  collection?: PublicProfileCard[];   // optional: absent = empty (pre-migration backend)
  recent: PublicProfilePull[];
}
```

Update `toProfileView` to default `collection` to `[]` when absent:

```ts
  const collectionCards: ProfileViewCard[] = (profile.collection ?? []).map((c) => ({
```

- [ ] **Step 4: Verify tsc**

Expected: zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile-view.ts \
        src/app/profile/\[user\]/ProfileClient.tsx \
        src/lib/data/profiles.ts
git commit -m "feat(profile): collection shows showcased cards; empty state when none showcased"
```

---

## Task 9: Final verification

- [ ] **Step 1: Run all backend unit tests**

```bash
cd backend/packages/api
corepack yarn test:unit --reporter=verbose 2>&1 | tail -30
```

Expected: all tests pass including the new `showcase-toggle` suite.

- [ ] **Step 2: Run storefront lint + typecheck**

```bash
npm run lint && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 3: Build the storefront**

```bash
npm run build
```

Expected: build completes, zero errors.

- [ ] **Step 4: Start the backend + serve the standalone bundle**

```bash
# Terminal 1 — backend
cd backend && corepack yarn dev

# Terminal 2 — storefront (wait for backend to be ready first)
npm run build  # skip if already built above
pwsh scripts/serve-standalone.ps1 -Port 4000
```

Note: if working in a deep worktree, the standalone bundle may nest at `.next/standalone/.claude/worktrees/feat+vault-showcase-privacy/server.js`. Copy static assets and run that server.js directly if `serve-standalone.ps1` can't find it:

```powershell
$wt = ".next\standalone\.claude\worktrees\feat+vault-showcase-privacy"
Copy-Item -Recurse -Force ".next\static" "$wt\.next\static"
Copy-Item -Recurse -Force "public" "$wt\public"
$env:PORT = "4000"
node "$wt\server.js"
```

- [ ] **Step 5: Smoke-test vault showcase toggle**

Login as `test@pokenic.app` / `PokenicTest123!` at `http://localhost:4000`.

1. Navigate to `/account/vault`.
2. Confirm each card has the star/eye "Feature on profile" toggle button.
3. Click the toggle on one card — button state flips immediately (optimistic), then settles.
4. Navigate to `/profile/<your-handle>`.
5. Collection tab shows the showcased card; Activity tab still shows recent pulls.
6. Toggle the card off in the vault.
7. Reload the profile — Collection tab shows the empty state copy.

- [ ] **Step 6: Run the Phase 1 Playwright script to confirm no regressions**

```bash
node scripts/verify-phase1-sell.mjs
```

Expected: all steps pass (sell confirm modal, transactions page, etc. unchanged).

- [ ] **Step 7: Final commit**

No code changes needed if verification passes. If any fixes are needed, address them and commit. Then proceed to open a PR.

---

## Self-review against spec

| Spec requirement | Task covering it |
|---|---|
| `Pull.showcased boolean default false` + migration | Tasks 1 & 2 |
| `POST /store/vault/:id/showcase` toggle (customer-scoped) | Task 3 |
| 403 on foreign pull, reject non-`vaulted` pulls | Tasks 3 & 4 |
| `GET /store/profiles/:handle` Collection = showcased only | Task 5 |
| Activity feed stays ungated | Task 5 (recent unchanged) |
| Vault per-card "Feature on profile" toggle | Task 7 |
| Optimistic update + revert on failure | Task 7 |
| Profile Collection empty state | Task 8 |
| Backend unit tests: ownership guard + non-vaulted rejection | Task 4 |
| Playwright: vault toggle reflects on profile | Task 9, Step 5 |
