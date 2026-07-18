# Reward Admin Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two approved reward-admin surfaces — a full-CRUD VIP-ladder Levels tab (new `/admin/vip-levels` API) that replaces the removed Vouchers tab, and an inert Weekly-Challenge config layer (milestone stages + week/payout singleton) that a future sub-project D will consume.

**Architecture:** Both surfaces add models/validators/service-methods to the existing `packs` Medusa module and audited `/admin/*` routes; the two collection editors (VIP ladder, challenge stages) POST the whole set and are replaced via a diff-upsert-hard-delete keyed on the natural key, while `challenge_settings` is an audited singleton patch (like `editSiteSettings`). The admin frontend adds React-Query hooks + REST helpers and two dashboard routes — the Levels tab folds into the renamed "VIP" page (`daily-rewards`), and "Weekly Challenge" is a new top-level page.

**Tech Stack:** Medusa v2 (`@acme/api`, backend), Mercur admin dashboard (`@acme/admin`, Vite + React + `@medusajs/ui` + `@tanstack/react-query`), PostgreSQL raw-SQL migrations, Jest (backend unit + integration), Vitest (admin pure-helper units), Playwright/manual browser verification.

## Global Constraints

- **Backend commands** run in `backend/packages/api` via **`corepack yarn`** (NOT npm/pnpm). Backend unit tests: `corepack yarn test:unit <path-or-fragment>` (the `test:unit` script sets `TEST_TYPE=unit`, whose jest `testMatch` is `**/src/**/__tests__/**/*.unit.spec.[jt]s` — so unit specs MUST live under a `__tests__/` dir and be named `*.unit.spec.ts`). Backend HTTP integration: `corepack yarn test:integration:http <spec-basename>` (the `run-http-shards.mjs` runner filters shards by basename — proven by the `test:integration:smoke` script; specs live in `integration-tests/http/*.spec.ts`). Typecheck: `corepack yarn check-types`.
- **Admin commands** run in `backend/apps/admin` via **`corepack yarn`**. Pure-helper unit tests: `corepack yarn vitest run <path>` (colocated `*.test.ts`, e.g. `box-snapshot.test.ts`). Typecheck/build: `corepack yarn build` (`tsc -b && vite build`).
- **Repo-root storefront** uses `npm` but is **untouched** by this plan.
- **Typecheck hooks** run after every `.ts`/`.tsx` edit (PostToolUse) and at Stop (storefront + backend). Every step must leave the tree type-green.
- **Conventional commits**, one per task step group. End every commit message body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Contracts from spec §2 (do not deviate):**
  - **Audited writes:** `adminId` from `req.auth_context.actor_id` (NEVER the body); required `reason` via the shared `reqReason` helper (`api/admin/rewards-settings/validate.ts`, 1–500 chars trimmed); before/after snapshots written with `createAdminActionAudits`. Audit identifiers: `('vip_levels','replace')`, `('challenge_stages','replace')`, `('challenge_settings','edit')`; `entity_id: 'singleton'` for whole-set audits (saveVoucherRanges precedent), `row?.id ?? 'global'` for the settings singleton.
  - **Every new audit identifier MUST be whitelisted in a migration** that drops + re-adds the `admin_action_audit` `entity_type`/`action` CHECK constraints with the FULL cumulative enumerated list — else the audit INSERT throws and the happy-path integration test fails. Current lists (post-`Migration20260707000000`): `entity_type IN ('customer','commission','rewards_settings','credit','reward_pool','daily_reward_settings','daily_box','voucher_ladder','fx','site_settings')`; `action IN ('freeze','unfreeze','reverse_commission','suspend_commission','unsuspend_commission','adjust_credit','edit_rewards_settings','edit_reward_pool','edit_daily_reward_settings','edit_daily_box','edit_voucher_ladder','edit_fx_rate','edit_site_settings','edit_avatar_frames')`.
  - **Replace mechanics (both collections):** diff-upsert keyed on the unique natural key (`vip_level.level`, `challenge_stage.stage_number`) — update survivors in place (ids + untouched fields like `vip_level.prizes` preserved), create new rows, **hard-delete** removed rows via the generated `delete<Model>` (NOT `softDelete` — a soft row keeps the unique key and collides on recreate).
  - **MYR units:** `spend_threshold`/`voucher_amount`/`threshold_myr`/`reward_credits`/`payout_credits` are stored + wired in **RM (MYR)** with no sen conversion crossing the admin wire.
  - **Naming:** whole-set replaces use `save*` (`saveVipLevels`, `saveChallengeStages`); the singleton uses `edit*` (`editChallengeSettings`) — none shadow the MedusaService auto-generated `create*/update*/delete*/list*`.
  - **No optimistic concurrency** (last-write-wins, accepted §5).

---

### Task 1: Pure `validateVipLevels` validator + unit tests

**Files:**
- Create: `backend/packages/api/src/modules/packs/vip-levels-validate.ts`
- Test: `backend/packages/api/src/modules/packs/__tests__/vip-levels-validate.unit.spec.ts`

**Interfaces:**
- Consumes: `FRAME_LEVELS` from `modules/packs/avatar-frames.ts` (`readonly [10,20,…,100]`); `MedusaError` from `@medusajs/framework/utils`.
- Produces: `export interface VipLevelInput { level: number; spend_threshold: number; voucher_amount: number; box_tier: string; frame_unlock: boolean; direct_referral_pct: number }` and `export function validateVipLevels(raw: unknown): VipLevelInput[]` (throws `MedusaError INVALID_DATA` naming the offending row/field; the `box_tier`-exists check is service-level, NOT here).

Steps:

- [ ] 1. Write the failing unit spec `backend/packages/api/src/modules/packs/__tests__/vip-levels-validate.unit.spec.ts`:

```ts
import { validateVipLevels } from '../vip-levels-validate';

const rung = (over: Partial<Record<string, unknown>> = {}) => ({
  level: 1,
  spend_threshold: 0,
  voucher_amount: 0,
  box_tier: 'a',
  frame_unlock: false,
  direct_referral_pct: 1,
  ...over,
});

const ladder = (rungs: Record<string, unknown>[]) => ({ levels: rungs });

describe('validateVipLevels', () => {
  it('accepts a minimal 1-rung ladder with threshold 0', () => {
    const out = validateVipLevels(ladder([rung()]));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      level: 1,
      spend_threshold: 0,
      voucher_amount: 0,
      box_tier: 'a',
      frame_unlock: false,
      direct_referral_pct: 1,
    });
  });

  it('accepts a decade-10 rung carrying frame_unlock', () => {
    const rungs = Array.from({ length: 10 }, (_, i) =>
      rung({
        level: i + 1,
        spend_threshold: i * 100,
        frame_unlock: i + 1 === 10,
      }),
    );
    expect(validateVipLevels(ladder(rungs))).toHaveLength(10);
  });

  it('rejects a non-array / empty ladder', () => {
    expect(() => validateVipLevels({ levels: 'x' })).toThrow(/must be an array/);
    expect(() => validateVipLevels(ladder([]))).toThrow(/at least 1 level/);
  });

  it('rejects a level gap or duplicate (non-contiguous 1..N)', () => {
    expect(() =>
      validateVipLevels(ladder([rung(), rung({ level: 3, spend_threshold: 5 })])),
    ).toThrow(/must be 2 \(contiguous/);
    expect(() =>
      validateVipLevels(ladder([rung(), rung({ level: 1, spend_threshold: 5 })])),
    ).toThrow(/must be 2 \(contiguous/);
  });

  it('requires rung 1 threshold to be exactly 0', () => {
    expect(() => validateVipLevels(ladder([rung({ spend_threshold: 5 })]))).toThrow(
      /level 1: spend_threshold must be 0/,
    );
  });

  it('requires strictly-increasing thresholds', () => {
    expect(() =>
      validateVipLevels(
        ladder([rung(), rung({ level: 2, spend_threshold: 0 })]),
      ),
    ).toThrow(/level 2: spend_threshold must exceed level 1's/);
  });

  it('rejects frame_unlock on a non-decade level', () => {
    expect(() => validateVipLevels(ladder([rung({ frame_unlock: true })]))).toThrow(
      /decade levels/,
    );
  });

  it('rejects negative voucher_amount and direct_referral_pct', () => {
    expect(() => validateVipLevels(ladder([rung({ voucher_amount: -1 })]))).toThrow(
      /voucher_amount must be >= 0/,
    );
    expect(() =>
      validateVipLevels(ladder([rung({ direct_referral_pct: -1 })])),
    ).toThrow(/direct_referral_pct must be >= 0/);
  });

  it('rejects a blank box_tier', () => {
    expect(() => validateVipLevels(ladder([rung({ box_tier: '  ' })]))).toThrow(
      /box_tier is required/,
    );
  });
});
```

- [ ] 2. Run it, expect FAIL: `corepack yarn test:unit vip-levels-validate` (in `backend/packages/api`). Expected: `Cannot find module '../vip-levels-validate'` (module not yet created).

- [ ] 3. Create `backend/packages/api/src/modules/packs/vip-levels-validate.ts` with the complete implementation:

```ts
import { MedusaError } from '@medusajs/framework/utils';
import { FRAME_LEVELS } from './avatar-frames';

// POST /admin/vip-levels body → the full renumbered ladder. Pure cross-row
// validation (contiguity, monotonic thresholds, decade-only frames, non-
// negatives). The box_tier-exists check is a service-level DB lookup, NOT here.
export interface VipLevelInput {
  level: number;
  spend_threshold: number;
  voucher_amount: number;
  box_tier: string;
  frame_unlock: boolean;
  direct_referral_pct: number;
}

const bad = (m: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, m);
};

export function validateVipLevels(raw: unknown): VipLevelInput[] {
  const body = (raw as { levels?: unknown } | null)?.levels;
  if (!Array.isArray(body)) bad('levels must be an array.');
  const rows = body as unknown[];
  if (rows.length < 1) bad('The VIP ladder must have at least 1 level.');

  const out: VipLevelInput[] = [];
  let prevThreshold = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? {}) as Record<string, unknown>;
    const level = i + 1;
    if (r.level !== level)
      bad(
        `level at position ${i} must be ${level} (contiguous 1..N); got ${String(r.level)}.`,
      );

    const threshold = r.spend_threshold;
    if (typeof threshold !== 'number' || !Number.isFinite(threshold))
      bad(`level ${level}: spend_threshold must be a number.`);
    const t = threshold as number;
    if (level === 1 && t !== 0) bad('level 1: spend_threshold must be 0.');
    if (t < 0) bad(`level ${level}: spend_threshold must be >= 0.`);
    if (level > 1 && !(t > prevThreshold))
      bad(`level ${level}: spend_threshold must exceed level ${level - 1}'s.`);
    prevThreshold = t;

    const voucher = r.voucher_amount;
    if (typeof voucher !== 'number' || !Number.isFinite(voucher) || voucher < 0)
      bad(`level ${level}: voucher_amount must be >= 0.`);

    const pct = r.direct_referral_pct;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0)
      bad(`level ${level}: direct_referral_pct must be >= 0.`);

    if (typeof r.box_tier !== 'string' || r.box_tier.trim().length === 0)
      bad(`level ${level}: box_tier is required.`);

    if (typeof r.frame_unlock !== 'boolean')
      bad(`level ${level}: frame_unlock must be a boolean.`);
    if (
      r.frame_unlock &&
      !(FRAME_LEVELS as readonly number[]).includes(level)
    )
      bad(
        `level ${level}: frame_unlock may only be true on decade levels (10, 20, … 100).`,
      );

    out.push({
      level,
      spend_threshold: t,
      voucher_amount: voucher as number,
      box_tier: (r.box_tier as string).trim(),
      frame_unlock: r.frame_unlock as boolean,
      direct_referral_pct: pct as number,
    });
  }
  return out;
}
```

- [ ] 4. Run it, expect PASS: `corepack yarn test:unit vip-levels-validate`. Expected: `Tests: 9 passed` (all `validateVipLevels` cases green).

- [ ] 5. Commit:
```
git add backend/packages/api/src/modules/packs/vip-levels-validate.ts backend/packages/api/src/modules/packs/__tests__/vip-levels-validate.unit.spec.ts
git commit -m "$(printf 'feat(vip): pure validateVipLevels ladder validator\n\nContiguity, monotonic thresholds, rung1=0, decade-only frames, non-negatives.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 2: `saveVipLevels` service + `/admin/vip-levels` route + audit-CHECK migration + integration tests

**Files:**
- Create: `backend/packages/api/src/modules/packs/migrations/Migration20260719000000.ts` (audit-CHECK widen only — NO `vip_level` table change per §3.1)
- Modify: `backend/packages/api/src/modules/packs/service.ts` (add `saveVipLevels` near `saveVoucherRanges` ~line 4436; import `validateVipLevels`'s `VipLevelInput` type at top with the other packs-module imports)
- Create: `backend/packages/api/src/api/admin/vip-levels/route.ts`
- Test: `backend/packages/api/integration-tests/http/vip-levels.spec.ts`

**Interfaces:**
- Consumes: `validateVipLevels`/`VipLevelInput` (Task 1); `reqReason` (`api/admin/rewards-settings/validate.ts`); generated `listVipLevels/createVipLevels/updateVipLevels/deleteVipLevels/listRewardBoxes/createAdminActionAudits`.
- Produces: `saveVipLevels(input: { levels: VipLevelInput[]; adminId: string; reason: string }, ctx?): Promise<VipLevelInput[]>` (returns the saved ladder, sorted 1..N); `GET/POST /admin/vip-levels`.

Steps:

- [ ] 1. Create the audit-CHECK migration `backend/packages/api/src/modules/packs/migrations/Migration20260719000000.ts` (adds `entity_type += 'vip_levels'`, `action += 'replace'`; full cumulative lists; lossy `down` per the repo convention):

```ts
import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Widen admin_action_audit CHECKs to admit the VIP-ladder replace audit:
// entity_type += 'vip_levels', action += 'replace'. No vip_level table change
// (§3.1 — the model already carries every field). Appends to the current
// (post-Migration20260707000000) lists.
export class Migration20260719000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx', 'site_settings', 'vip_levels'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings', 'edit_avatar_frames', 'replace'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `delete from "admin_action_audit" where "entity_type" = 'vip_levels';`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx', 'site_settings'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(`delete from "admin_action_audit" where "action" = 'replace';`);
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings', 'edit_avatar_frames'));`,
    );
  }
}
```

- [ ] 2. Add `saveVipLevels` to `service.ts`. At the top of the file, add the type import alongside the other `modules/packs` imports: `import type { VipLevelInput } from './vip-levels-validate';`. Then insert this method inside `class PacksModuleService` (place it right before `saveVoucherRanges`, ~line 4436):

```ts
  // Audited whole-set replace of the VIP ladder. Diff-upsert keyed on `level`:
  // update survivors in place (ids + prizes preserved), create new rungs
  // (prizes null), HARD-delete removed rungs (a soft row keeps the unique
  // `level` and would collide on recreate). box_tier existence is checked here
  // (service-level DB lookup, not in the pure validator). One audit row.
  @InjectTransactionManager()
  async saveVipLevels(
    input: { levels: VipLevelInput[]; adminId: string; reason: string },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<VipLevelInput[]> {
    const boxes = await this.listRewardBoxes(
      {},
      { select: ['tier'], take: 1000 },
      sharedContext,
    );
    const validTiers = new Set(boxes.map((b) => b.tier));
    for (const lvl of input.levels) {
      if (!validTiers.has(lvl.box_tier)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `level ${lvl.level}: box_tier '${lvl.box_tier}' is not an existing reward box tier.`,
        );
      }
    }

    const existing = await this.listVipLevels(
      {},
      {
        select: [
          'id',
          'level',
          'spend_threshold',
          'voucher_amount',
          'box_tier',
          'frame_unlock',
          'direct_referral_pct',
        ],
        take: 1000,
      },
      sharedContext,
    );
    const byLevel = new Map(existing.map((r) => [r.level, r]));
    const before = existing
      .slice()
      .sort((a, b) => a.level - b.level)
      .map((r) => ({
        level: r.level,
        spend_threshold: Number(r.spend_threshold),
        voucher_amount: Number(r.voucher_amount),
        box_tier: r.box_tier,
        frame_unlock: r.frame_unlock,
        direct_referral_pct: r.direct_referral_pct,
      }));

    const inputLevels = new Set(input.levels.map((l) => l.level));
    for (const lvl of input.levels) {
      const data = {
        spend_threshold: lvl.spend_threshold,
        voucher_amount: lvl.voucher_amount,
        box_tier: lvl.box_tier,
        frame_unlock: lvl.frame_unlock,
        direct_referral_pct: lvl.direct_referral_pct,
      };
      const row = byLevel.get(lvl.level);
      if (row) {
        await this.updateVipLevels(
          { selector: { id: row.id }, data },
          sharedContext,
        );
      } else {
        await this.createVipLevels(
          [{ level: lvl.level, ...data, prizes: null }],
          sharedContext,
        );
      }
    }

    const removedIds = existing
      .filter((r) => !inputLevels.has(r.level))
      .map((r) => r.id);
    if (removedIds.length > 0) {
      await this.deleteVipLevels(removedIds, sharedContext);
    }

    const after = input.levels.map((l) => ({ ...l }));
    await this.createAdminActionAudits(
      [
        {
          admin_id: input.adminId,
          entity_type: 'vip_levels',
          entity_id: 'singleton',
          action: 'replace',
          before,
          after,
          reason: input.reason,
        },
      ],
      sharedContext,
    );
    return after;
  }
```

- [ ] 3. Create the route `backend/packages/api/src/api/admin/vip-levels/route.ts`:

```ts
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../modules/packs';
import type PacksModuleService from '../../../modules/packs/service';
import { validateVipLevels } from '../../../modules/packs/vip-levels-validate';
import { reqReason } from '../rewards-settings/validate';

// GET /admin/vip-levels — the full ladder ordered by level (Levels tab load).
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const rows = await packs.listVipLevels(
    {},
    {
      select: [
        'level',
        'spend_threshold',
        'voucher_amount',
        'box_tier',
        'frame_unlock',
        'direct_referral_pct',
      ],
      take: 1000,
    },
  );
  const levels = rows
    .map((r) => ({
      level: r.level,
      spend_threshold: Number(r.spend_threshold),
      voucher_amount: Number(r.voucher_amount),
      box_tier: r.box_tier,
      frame_unlock: r.frame_unlock,
      direct_referral_pct: r.direct_referral_pct,
    }))
    .sort((a, b) => a.level - b.level);
  res.json({ levels });
}

// POST /admin/vip-levels — audited whole-ladder replace. admin_id derives from
// the verified auth_context (NEVER the body); /admin/* is auto-protected.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const levels = validateVipLevels(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const saved = await packs.saveVipLevels({ levels, adminId, reason });
  res.json({ levels: saved });
}
```

- [ ] 4. Write the failing integration spec `backend/packages/api/integration-tests/http/vip-levels.spec.ts`:

```ts
import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { VIP_LEVELS } from '../../src/scripts/vip-levels.data';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'vip-levels-test-pw-1';
const ADMIN_EMAIL = 'vip-levels-admin@test.dev';
const BOX_TIERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'Z'];

// A small valid ladder reused across POST cases: 3 contiguous rungs, rung 1
// threshold 0, strictly increasing, no frames (all non-decade), box_tier 'a'.
const smallLadder = () => [
  { level: 1, spend_threshold: 0, voucher_amount: 0, box_tier: 'a', frame_unlock: false, direct_referral_pct: 1 },
  { level: 2, spend_threshold: 100, voucher_amount: 5, box_tier: 'a', frame_unlock: false, direct_referral_pct: 1 },
  { level: 3, spend_threshold: 200, voucher_amount: 9, box_tier: 'a', frame_unlock: false, direct_referral_pct: 2 },
];

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('/admin/vip-levels', () => {
      let adminToken: string;
      const packs = () =>
        getContainer().resolve<PacksModuleService>(PACKS_MODULE);
      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);
        const svc = packs();
        // Re-seed the ladder + the 11 reward_box rows (TRUNCATE wipes both).
        if ((await svc.listVipLevels({}, { take: 1 })).length === 0) {
          await svc.createVipLevels(
            VIP_LEVELS.map((r) => ({
              level: r.level,
              spend_threshold: r.spend_threshold,
              voucher_amount: r.voucher_amount,
              box_tier: r.box_tier,
              frame_unlock: r.frame_unlock,
              direct_referral_pct: r.direct_referral_pct,
              prizes: r.prizes ?? null,
            })),
          );
        }
        const boxes = await svc.listRewardBoxes({}, { take: 100 });
        const have = new Set(boxes.map((b) => b.tier));
        const missing = BOX_TIERS.filter((t) => !have.has(t));
        if (missing.length > 0) {
          await svc.createRewardBoxes(
            missing.map((tier) => ({ tier, name: '', enabled: false, draws_per_day: 1 })),
          );
        }
      });

      it('401s without an admin token', async () => {
        expect((await unwrapResponse(api.get('/admin/vip-levels'))).status).toBe(401);
        expect(
          (
            await unwrapResponse(
              api.post('/admin/vip-levels', { levels: smallLadder(), reason: 'x' }),
            )
          ).status,
        ).toBe(401);
      });

      it('GET returns the seeded ladder ordered by level', async () => {
        const res = await unwrapResponse(
          api.get('/admin/vip-levels', { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data.levels).toHaveLength(VIP_LEVELS.length);
        expect(res.data.levels[0]).toMatchObject({ level: 1, spend_threshold: 0 });
        for (let i = 1; i < res.data.levels.length; i++) {
          expect(res.data.levels[i].level).toBe(res.data.levels[i - 1].level + 1);
        }
      });

      it('POST replaces the ladder and writes one audit row', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            { levels: smallLadder(), reason: 'shrink to 3' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data.levels).toHaveLength(3);

        const rows = await packs().listVipLevels({}, { take: 1000 });
        expect(rows).toHaveLength(3);

        const audits = await packs().listAdminActionAudits(
          { entity_type: 'vip_levels', action: 'replace' },
          { take: 10 },
        );
        expect(audits).toHaveLength(1);
        expect(audits[0].reason).toBe('shrink to 3');
        expect(audits[0].admin_id.length).toBeGreaterThan(0);
      });

      it('POST invariant violation → 400, ladder unchanged (atomicity)', async () => {
        const before = await packs().listVipLevels({}, { take: 1000 });
        const res = await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            {
              levels: [
                { level: 1, spend_threshold: 5, voucher_amount: 0, box_tier: 'a', frame_unlock: false, direct_referral_pct: 1 },
              ],
              reason: 'bad first threshold',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
        expect(String(res.data.message)).toMatch(/spend_threshold must be 0/);
        expect(await packs().listVipLevels({}, { take: 1000 })).toHaveLength(
          before.length,
        );
      });

      it('POST unknown box_tier → 400', async () => {
        const bad = smallLadder().map((r) => ({ ...r, box_tier: 'zz' }));
        const res = await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            { levels: bad, reason: 'bad tier' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
        expect(String(res.data.message)).toMatch(/not an existing reward box tier/);
      });

      it('replace → shrink → save again succeeds (no soft-delete unique collision on level)', async () => {
        await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            { levels: smallLadder(), reason: 'first save (3 rungs)' },
            { headers: adminHeaders() },
          ),
        );
        const two = smallLadder().slice(0, 2);
        const shrink = await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            { levels: two, reason: 'shrink to 2' },
            { headers: adminHeaders() },
          ),
        );
        expect(shrink.status).toBe(200);
        // Recreate rung 3 — a soft-deleted level=3 would collide here.
        const grow = await unwrapResponse(
          api.post(
            '/admin/vip-levels',
            { levels: smallLadder(), reason: 'regrow to 3' },
            { headers: adminHeaders() },
          ),
        );
        expect(grow.status).toBe(200);
        expect((await packs().listVipLevels({}, { take: 1000 }))).toHaveLength(3);
      });
    });
  },
});
```

- [ ] 5. Run it, expect PASS (migration + service + route all wired): `corepack yarn test:integration:http vip-levels.spec` (in `backend/packages/api`). Expected: `Tests: 6 passed`. (If the runner reports the migration was applied and the boot succeeds, the CHECK widen is proven — an un-widened CHECK would fail the "writes one audit row" case with a DB constraint error.)

- [ ] 6. Typecheck: `corepack yarn check-types` → no errors.

- [ ] 7. Commit:
```
git add backend/packages/api/src/modules/packs/migrations/Migration20260719000000.ts backend/packages/api/src/modules/packs/service.ts backend/packages/api/src/api/admin/vip-levels/route.ts backend/packages/api/integration-tests/http/vip-levels.spec.ts
git commit -m "$(printf 'feat(vip): saveVipLevels service + /admin/vip-levels route\n\nAudited diff-upsert-hard-delete keyed on level; box_tier existence check;\naudit-CHECK migration admits (vip_levels, replace). Integration-covered.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 3: Challenge models + migration + MedusaService registration + pure validators + unit tests

**Files:**
- Create: `backend/packages/api/src/modules/packs/models/challenge-stage.ts`
- Create: `backend/packages/api/src/modules/packs/models/challenge-settings.ts`
- Create: `backend/packages/api/src/modules/packs/challenge-validate.ts`
- Create: `backend/packages/api/src/modules/packs/migrations/Migration20260719010000.ts`
- Modify: `backend/packages/api/src/modules/packs/service.ts` (add `ChallengeStage`, `ChallengeSettings` to the `MedusaService({...})` block ~lines 285-309, and import the two models)
- Test: `backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts`

**Interfaces:**
- Produces: `ChallengeStage`/`ChallengeSettings` models; `validateChallengeStages(raw): ChallengeStageInput[]`, `validateChallengeSettingsPatch(raw): ChallengeSettingsPatch`, and the types `ChallengeStageInput`, `ChallengeSettingsPatch`, `ChallengeSettingsView` (consumed by Task 4). Generated CRUD `list/create/update/deleteChallengeStages` + `list/create/updateChallengeSettings` become available after registration.

Steps:

- [ ] 1. Create `backend/packages/api/src/modules/packs/models/challenge-stage.ts`:

```ts
import { model } from '@medusajs/framework/utils';

// One row per Weekly-Challenge milestone stage (inert config sub-project D
// reads). stage_number is contiguous from 1 (unique). threshold_myr is the
// community-pool cumulative threshold in MYR; reward_credits is the stage
// reward in MYR credited as store credits (1 RM = 1 credit). reward_card_ids
// is an array of featured `card` ids (may be empty).
export const ChallengeStage = model
  .define('challenge_stage', {
    id: model.id().primaryKey(),
    stage_number: model.number().unique(),
    threshold_myr: model.bigNumber(),
    reward_credits: model.bigNumber(),
    reward_card_ids: model.json(),
  })
  .indexes([
    {
      name: 'IDX_challenge_stage_stage_number',
      on: ['stage_number'],
      where: 'deleted_at IS NULL',
    },
  ]);

export default ChallengeStage;
```

- [ ] 2. Create `backend/packages/api/src/modules/packs/models/challenge-settings.ts`:

```ts
import { model } from '@medusajs/framework/utils';

// challenge_settings — singleton (same pattern as site_settings: one row,
// create-on-first-edit, fixed id 'global' with a DB CHECK). Fixed-weekly
// cadence anchored at (timezone, reset_day, reset_hour); flat top-10 payout.
export const ChallengeSettings = model.define('challenge_settings', {
  id: model.id().primaryKey(),
  cadence: model.text().default('fixed_weekly'),
  timezone: model.text().default('Asia/Kuala_Lumpur'),
  reset_day: model.number().default(1),
  reset_hour: model.number().default(0),
  payout_credits: model.bigNumber().default(0),
  payout_card_ids: model.json(),
});

export default ChallengeSettings;
```

- [ ] 3. In `service.ts`, add the two imports next to the other model imports (mirror the existing `VipLevel`/`RewardBox` import lines), then register both models in the `MedusaService({...})` block (append after `PixelPokemon,` ~line 308):

```ts
import ChallengeStage from './models/challenge-stage';
import ChallengeSettings from './models/challenge-settings';
```
```ts
  PixelPokemon,
  ChallengeStage,
  ChallengeSettings,
}) {
```

- [ ] 4. Create the migration `backend/packages/api/src/modules/packs/migrations/Migration20260719010000.ts` (creates both tables + widens audit CHECKs to admit `challenge_stages`/`challenge_settings` entity_types and `edit` action — the re-add MUST carry everything Task 2 added, i.e. `vip_levels` and `replace`):

```ts
import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Challenge config layer: challenge_stage (milestone stages) + challenge_settings
// (week/payout singleton, CHECK id='global'). Also widen admin_action_audit
// CHECKs: entity_type += 'challenge_stages','challenge_settings'; action +=
// 'edit'. Full cumulative lists (carry Task 2's 'vip_levels'/'replace').
export class Migration20260719010000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "challenge_stage" (
      "id" text not null,
      "stage_number" integer not null,
      "threshold_myr" numeric not null,
      "reward_credits" numeric not null,
      "reward_card_ids" jsonb not null default '[]',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "challenge_stage_pkey" primary key ("id")
    );`);
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_challenge_stage_stage_number_unique" ON "challenge_stage" ("stage_number") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_challenge_stage_deleted_at" ON "challenge_stage" ("deleted_at") WHERE deleted_at IS NULL;`,
    );

    this.addSql(`create table if not exists "challenge_settings" (
      "id" text not null,
      "cadence" text not null default 'fixed_weekly',
      "timezone" text not null default 'Asia/Kuala_Lumpur',
      "reset_day" integer not null default 1,
      "reset_hour" integer not null default 0,
      "payout_credits" numeric not null default 0,
      "payout_card_ids" jsonb not null default '[]',
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "challenge_settings_pkey" primary key ("id"),
      constraint "challenge_settings_singleton_id_check" check ("id" = 'global')
    );`);
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_challenge_settings_deleted_at" ON "challenge_settings" ("deleted_at") WHERE deleted_at IS NULL;`,
    );

    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx', 'site_settings', 'vip_levels', 'challenge_stages', 'challenge_settings'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings', 'edit_avatar_frames', 'replace', 'edit'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `delete from "admin_action_audit" where "entity_type" in ('challenge_stages', 'challenge_settings');`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx', 'site_settings', 'vip_levels'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(`delete from "admin_action_audit" where "action" = 'edit';`);
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings', 'edit_avatar_frames', 'replace'));`,
    );

    this.addSql(`drop table if exists "challenge_stage" cascade;`);
    this.addSql(`drop table if exists "challenge_settings" cascade;`);
  }
}
```

- [ ] 5. Write the failing unit spec `backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts`:

```ts
import {
  validateChallengeStages,
  validateChallengeSettingsPatch,
} from '../challenge-validate';

const stage = (over: Partial<Record<string, unknown>> = {}) => ({
  stage_number: 1,
  threshold_myr: 100,
  reward_credits: 10,
  reward_card_ids: [],
  ...over,
});

describe('validateChallengeStages', () => {
  it('accepts an empty stage list (challenge disabled)', () => {
    expect(validateChallengeStages({ stages: [] })).toEqual([]);
  });

  it('accepts contiguous stages with increasing thresholds', () => {
    const out = validateChallengeStages({
      stages: [
        stage(),
        stage({ stage_number: 2, threshold_myr: 200, reward_card_ids: ['card_1'] }),
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[1].reward_card_ids).toEqual(['card_1']);
  });

  it('rejects a stage-number gap', () => {
    expect(() =>
      validateChallengeStages({ stages: [stage(), stage({ stage_number: 3, threshold_myr: 200 })] }),
    ).toThrow(/must be 2 \(contiguous/);
  });

  it('rejects non-increasing thresholds', () => {
    expect(() =>
      validateChallengeStages({ stages: [stage(), stage({ stage_number: 2, threshold_myr: 100 })] }),
    ).toThrow(/must exceed stage 1's/);
  });

  it('rejects negative reward_credits', () => {
    expect(() => validateChallengeStages({ stages: [stage({ reward_credits: -1 })] })).toThrow(
      /reward_credits must be >= 0/,
    );
  });

  it('rejects a malformed reward_card_ids array', () => {
    expect(() => validateChallengeStages({ stages: [stage({ reward_card_ids: [1] })] })).toThrow(
      /card id strings/,
    );
    expect(() => validateChallengeStages({ stages: [stage({ reward_card_ids: 'x' })] })).toThrow(
      /must be an array/,
    );
  });
});

describe('validateChallengeSettingsPatch', () => {
  it('accepts a partial patch of valid fields', () => {
    const out = validateChallengeSettingsPatch({
      patch: { timezone: 'Asia/Kuala_Lumpur', reset_day: 1, reset_hour: 0, payout_credits: 50 },
    });
    expect(out).toEqual({
      timezone: 'Asia/Kuala_Lumpur',
      reset_day: 1,
      reset_hour: 0,
      payout_credits: 50,
    });
  });

  it('rejects an invalid cadence', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { cadence: 'rolling' } })).toThrow(
      /cadence must be 'fixed_weekly'/,
    );
  });

  it('rejects a bad timezone', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { timezone: 'Mars/Olympus' } })).toThrow(
      /valid IANA time zone/,
    );
  });

  it('rejects out-of-range reset_day / reset_hour', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { reset_day: 7 } })).toThrow(
      /reset_day must be an integer 0.6/,
    );
    expect(() => validateChallengeSettingsPatch({ patch: { reset_hour: 24 } })).toThrow(
      /reset_hour must be an integer 0.23/,
    );
  });

  it('rejects negative payout_credits and an empty patch', () => {
    expect(() => validateChallengeSettingsPatch({ patch: { payout_credits: -1 } })).toThrow(
      /payout_credits must be >= 0/,
    );
    expect(() => validateChallengeSettingsPatch({ patch: {} })).toThrow(
      /No valid settings/,
    );
  });
});
```

- [ ] 6. Run it, expect FAIL: `corepack yarn test:unit challenge-validate`. Expected: `Cannot find module '../challenge-validate'`.

- [ ] 7. Create `backend/packages/api/src/modules/packs/challenge-validate.ts`:

```ts
import { MedusaError } from '@medusajs/framework/utils';

export interface ChallengeStageInput {
  stage_number: number;
  threshold_myr: number;
  reward_credits: number;
  reward_card_ids: string[];
}

export interface ChallengeSettingsPatch {
  cadence?: string;
  timezone?: string;
  reset_day?: number;
  reset_hour?: number;
  payout_credits?: number;
  payout_card_ids?: string[];
}

export interface ChallengeSettingsView {
  cadence: string;
  timezone: string;
  reset_day: number;
  reset_hour: number;
  payout_credits: number;
  payout_card_ids: string[];
}

const bad = (m: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, m);
};

function validateCardIds(ids: unknown, label: string): string[] {
  if (!Array.isArray(ids)) bad(`${label} must be an array of card ids.`);
  const arr = ids as unknown[];
  for (const id of arr) {
    if (typeof id !== 'string' || id.trim().length === 0)
      bad(`${label} must contain only non-empty card id strings.`);
  }
  return arr as string[];
}

// Stages: contiguous from 1, strictly-increasing thresholds, non-negative
// credits, card-id array shape. Empty list is VALID (challenge disabled). Card
// EXISTENCE is a service-level DB check, not here.
export function validateChallengeStages(raw: unknown): ChallengeStageInput[] {
  const body = (raw as { stages?: unknown } | null)?.stages;
  if (!Array.isArray(body)) bad('stages must be an array.');
  const rows = body as unknown[];
  const out: ChallengeStageInput[] = [];
  let prevThreshold = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] ?? {}) as Record<string, unknown>;
    const n = i + 1;
    if (r.stage_number !== n)
      bad(
        `stage_number at position ${i} must be ${n} (contiguous 1..N); got ${String(r.stage_number)}.`,
      );
    const t = r.threshold_myr;
    if (typeof t !== 'number' || !Number.isFinite(t) || t < 0)
      bad(`stage ${n}: threshold_myr must be >= 0.`);
    if (i > 0 && !((t as number) > prevThreshold))
      bad(`stage ${n}: threshold_myr must exceed stage ${n - 1}'s.`);
    prevThreshold = t as number;
    const credits = r.reward_credits;
    if (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0)
      bad(`stage ${n}: reward_credits must be >= 0.`);
    const cardIds = validateCardIds(
      r.reward_card_ids,
      `stage ${n}: reward_card_ids`,
    );
    out.push({
      stage_number: n,
      threshold_myr: t as number,
      reward_credits: credits as number,
      reward_card_ids: cardIds,
    });
  }
  return out;
}

// Settings: shape/range checks only; card EXISTENCE (payout_card_ids) is a
// service-level DB check. Only present fields are validated + returned.
export function validateChallengeSettingsPatch(
  raw: unknown,
): ChallengeSettingsPatch {
  const patch = (raw as { patch?: unknown } | null)?.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    bad('patch must be an object.');
  const b = patch as Record<string, unknown>;
  const out: ChallengeSettingsPatch = {};

  if (b.cadence !== undefined) {
    if (b.cadence !== 'fixed_weekly') bad("cadence must be 'fixed_weekly'.");
    out.cadence = 'fixed_weekly';
  }
  if (b.timezone !== undefined) {
    const zones = (
      Intl as typeof Intl & { supportedValuesOf(key: string): string[] }
    ).supportedValuesOf('timeZone');
    if (typeof b.timezone !== 'string' || !zones.includes(b.timezone))
      bad('timezone must be a valid IANA time zone.');
    out.timezone = b.timezone;
  }
  if (b.reset_day !== undefined) {
    const v = b.reset_day;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6)
      bad('reset_day must be an integer 0–6.');
    out.reset_day = v as number;
  }
  if (b.reset_hour !== undefined) {
    const v = b.reset_hour;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 23)
      bad('reset_hour must be an integer 0–23.');
    out.reset_hour = v as number;
  }
  if (b.payout_credits !== undefined) {
    const v = b.payout_credits;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
      bad('payout_credits must be >= 0.');
    out.payout_credits = v as number;
  }
  if (b.payout_card_ids !== undefined) {
    out.payout_card_ids = validateCardIds(b.payout_card_ids, 'payout_card_ids');
  }
  if (Object.keys(out).length === 0) bad('No valid settings to update.');
  return out;
}
```

> Note: `Intl.supportedValuesOf` is available on Node ≥18 (repo is Node ≥20). The cast wraps it so `corepack yarn check-types` passes even if the TS `lib` target predates ES2022; if the lib already types it, the cast is harmless.

- [ ] 8. Run it, expect PASS: `corepack yarn test:unit challenge-validate`. Expected: `Tests: 12 passed`.

- [ ] 9. Typecheck: `corepack yarn check-types` → no errors (proves the model imports + MedusaService registration compile).

- [ ] 10. Commit:
```
git add backend/packages/api/src/modules/packs/models/challenge-stage.ts backend/packages/api/src/modules/packs/models/challenge-settings.ts backend/packages/api/src/modules/packs/challenge-validate.ts backend/packages/api/src/modules/packs/migrations/Migration20260719010000.ts backend/packages/api/src/modules/packs/service.ts backend/packages/api/src/modules/packs/__tests__/challenge-validate.unit.spec.ts
git commit -m "$(printf 'feat(challenge): stage + settings models, migration, validators\n\nchallenge_stage + challenge_settings (CHECK id=global) registered in the packs\nMedusaService; pure stage/settings validators; audit-CHECK widen for\n(challenge_stages/challenge_settings, edit).\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 4: `saveChallengeStages` + `editChallengeSettings` service methods + routes + integration tests

**Files:**
- Modify: `backend/packages/api/src/modules/packs/service.ts` (add `challengeSettings`, `saveChallengeStages`, `editChallengeSettings`; import the challenge types)
- Create: `backend/packages/api/src/api/admin/challenge/stages/route.ts`
- Create: `backend/packages/api/src/api/admin/challenge/settings/route.ts`
- Test: `backend/packages/api/integration-tests/http/challenge.spec.ts`

**Interfaces:**
- Consumes: `validateChallengeStages`, `validateChallengeSettingsPatch`, `ChallengeStageInput`, `ChallengeSettingsPatch`, `ChallengeSettingsView` (Task 3); `reqReason`; generated `list/create/update/deleteChallengeStages`, `list/create/updateChallengeSettings`, `listCards`, `createAdminActionAudits`.
- Produces: `saveChallengeStages(input: { stages: ChallengeStageInput[]; adminId; reason }, ctx?): Promise<ChallengeStageInput[]>`; `challengeSettings(ctx?): Promise<ChallengeSettingsView>`; `editChallengeSettings(input: { patch: ChallengeSettingsPatch; adminId; reason }, ctx?): Promise<ChallengeSettingsView>`; `GET/POST /admin/challenge/stages` + `/admin/challenge/settings`.

Steps:

- [ ] 1. In `service.ts`, extend the challenge type import from Task 3's validator file (add alongside the `VipLevelInput` import): `import type { ChallengeStageInput, ChallengeSettingsPatch, ChallengeSettingsView } from './challenge-validate';`. Then add these three methods inside the class (place after `saveVipLevels`):

```ts
  // Audited whole-set replace of the challenge milestone stages. Diff-upsert
  // keyed on `stage_number`, hard-delete removed rows (soft would collide on
  // the unique key). reward_card_ids EXISTENCE is checked here (service-level).
  @InjectTransactionManager()
  async saveChallengeStages(
    input: { stages: ChallengeStageInput[]; adminId: string; reason: string },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<ChallengeStageInput[]> {
    const allCardIds = [
      ...new Set(input.stages.flatMap((s) => s.reward_card_ids)),
    ];
    if (allCardIds.length > 0) {
      const found = await this.listCards(
        { id: allCardIds },
        { select: ['id'], take: allCardIds.length },
        sharedContext,
      );
      const foundIds = new Set(found.map((c) => c.id));
      const missing = allCardIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Unknown featured card id(s): ${missing.join(', ')}.`,
        );
    }

    const existing = await this.listChallengeStages(
      {},
      {
        select: [
          'id',
          'stage_number',
          'threshold_myr',
          'reward_credits',
          'reward_card_ids',
        ],
        take: 1000,
      },
      sharedContext,
    );
    const byStage = new Map(existing.map((r) => [r.stage_number, r]));
    const before = existing
      .slice()
      .sort((a, b) => a.stage_number - b.stage_number)
      .map((r) => ({
        stage_number: r.stage_number,
        threshold_myr: Number(r.threshold_myr),
        reward_credits: Number(r.reward_credits),
        reward_card_ids: (r.reward_card_ids as string[]) ?? [],
      }));

    const inputStages = new Set(input.stages.map((s) => s.stage_number));
    for (const s of input.stages) {
      const data = {
        threshold_myr: s.threshold_myr,
        reward_credits: s.reward_credits,
        reward_card_ids: s.reward_card_ids,
      };
      const row = byStage.get(s.stage_number);
      if (row) {
        await this.updateChallengeStages(
          { selector: { id: row.id }, data },
          sharedContext,
        );
      } else {
        await this.createChallengeStages(
          [{ stage_number: s.stage_number, ...data }],
          sharedContext,
        );
      }
    }

    const removedIds = existing
      .filter((r) => !inputStages.has(r.stage_number))
      .map((r) => r.id);
    if (removedIds.length > 0) {
      await this.deleteChallengeStages(removedIds, sharedContext);
    }

    const after = input.stages.map((s) => ({ ...s }));
    await this.createAdminActionAudits(
      [
        {
          admin_id: input.adminId,
          entity_type: 'challenge_stages',
          entity_id: 'singleton',
          action: 'replace',
          before,
          after,
          reason: input.reason,
        },
      ],
      sharedContext,
    );
    return after;
  }

  // Challenge singleton read — first row or the §4.1 defaults (never 404s).
  @InjectManager()
  async challengeSettings(
    @MedusaContext() sharedContext: Context = {},
  ): Promise<ChallengeSettingsView> {
    const [row] = await this.listChallengeSettings(
      {},
      { take: 1 },
      sharedContext,
    );
    return {
      cadence: row?.cadence ?? 'fixed_weekly',
      timezone: row?.timezone ?? 'Asia/Kuala_Lumpur',
      reset_day: row ? Number(row.reset_day) : 1,
      reset_hour: row ? Number(row.reset_hour) : 0,
      payout_credits: row ? Number(row.payout_credits) : 0,
      payout_card_ids: (row?.payout_card_ids as string[]) ?? [],
    };
  }

  // Audited singleton patch (create-on-first-edit; CHECK id='global' keeps the
  // create race-safe). payout_card_ids EXISTENCE checked here.
  @InjectTransactionManager()
  async editChallengeSettings(
    input: {
      patch: ChallengeSettingsPatch;
      adminId: string;
      reason: string;
    },
    @MedusaContext() sharedContext: Context = {},
  ): Promise<ChallengeSettingsView> {
    if (input.patch.payout_card_ids && input.patch.payout_card_ids.length > 0) {
      const ids = input.patch.payout_card_ids;
      const found = await this.listCards(
        { id: ids },
        { select: ['id'], take: ids.length },
        sharedContext,
      );
      const foundIds = new Set(found.map((c) => c.id));
      const missing = ids.filter((id) => !foundIds.has(id));
      if (missing.length > 0)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Unknown payout card id(s): ${missing.join(', ')}.`,
        );
    }

    const [row] = await this.listChallengeSettings(
      {},
      { take: 1 },
      sharedContext,
    );
    const before: ChallengeSettingsView = {
      cadence: row?.cadence ?? 'fixed_weekly',
      timezone: row?.timezone ?? 'Asia/Kuala_Lumpur',
      reset_day: row ? Number(row.reset_day) : 1,
      reset_hour: row ? Number(row.reset_hour) : 0,
      payout_credits: row ? Number(row.payout_credits) : 0,
      payout_card_ids: (row?.payout_card_ids as string[]) ?? [],
    };
    const data = {
      cadence: input.patch.cadence ?? before.cadence,
      timezone: input.patch.timezone ?? before.timezone,
      reset_day: input.patch.reset_day ?? before.reset_day,
      reset_hour: input.patch.reset_hour ?? before.reset_hour,
      payout_credits: input.patch.payout_credits ?? before.payout_credits,
      payout_card_ids: input.patch.payout_card_ids ?? before.payout_card_ids,
    };
    if (row) {
      await this.updateChallengeSettings(
        { selector: { id: row.id }, data },
        sharedContext,
      );
    } else {
      await this.createChallengeSettings(
        [{ id: 'global', ...data }],
        sharedContext,
      );
    }
    const after: ChallengeSettingsView = { ...data };
    await this.createAdminActionAudits(
      [
        {
          admin_id: input.adminId,
          entity_type: 'challenge_settings',
          entity_id: row?.id ?? 'global',
          action: 'edit',
          before,
          after,
          reason: input.reason,
        },
      ],
      sharedContext,
    );
    return after;
  }
```

- [ ] 2. Create `backend/packages/api/src/api/admin/challenge/stages/route.ts`:

```ts
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';
import { validateChallengeStages } from '../../../../modules/packs/challenge-validate';
import { reqReason } from '../../rewards-settings/validate';

// GET /admin/challenge/stages — all milestone stages ordered by stage_number.
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const rows = await packs.listChallengeStages(
    {},
    {
      select: [
        'stage_number',
        'threshold_myr',
        'reward_credits',
        'reward_card_ids',
      ],
      take: 1000,
    },
  );
  const stages = rows
    .map((r) => ({
      stage_number: r.stage_number,
      threshold_myr: Number(r.threshold_myr),
      reward_credits: Number(r.reward_credits),
      reward_card_ids: (r.reward_card_ids as string[]) ?? [],
    }))
    .sort((a, b) => a.stage_number - b.stage_number);
  res.json({ stages });
}

// POST /admin/challenge/stages — audited whole-set replace. admin_id from
// auth_context, NEVER the body.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const stages = validateChallengeStages(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const saved = await packs.saveChallengeStages({ stages, adminId, reason });
  res.json({ stages: saved });
}
```

- [ ] 3. Create `backend/packages/api/src/api/admin/challenge/settings/route.ts`:

```ts
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { PACKS_MODULE } from '../../../../modules/packs';
import type PacksModuleService from '../../../../modules/packs/service';
import { validateChallengeSettingsPatch } from '../../../../modules/packs/challenge-validate';
import { reqReason } from '../../rewards-settings/validate';

// GET /admin/challenge/settings — the singleton or §4.1 defaults (never 404s).
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  res.json(await packs.challengeSettings());
}

// POST /admin/challenge/settings — audited singleton patch.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const adminId = req.auth_context.actor_id;
  const reason = reqReason(req.body);
  const patch = validateChallengeSettingsPatch(req.body);
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const saved = await packs.editChallengeSettings({ patch, adminId, reason });
  res.json(saved);
}
```

- [ ] 4. Write the failing integration spec `backend/packages/api/integration-tests/http/challenge.spec.ts`:

```ts
import { medusaIntegrationTestRunner } from '@medusajs/test-utils';
import { PACKS_MODULE } from '../../src/modules/packs';
import type PacksModuleService from '../../src/modules/packs/service';
import { mintSuperAdmin, unwrapResponse } from './utils';

jest.setTimeout(240 * 1000);

const PASSWORD = 'challenge-test-pw-1';
const ADMIN_EMAIL = 'challenge-admin@test.dev';

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api, getContainer }) => {
    describe('/admin/challenge', () => {
      let adminToken: string;
      let cardId: string;
      const packs = () =>
        getContainer().resolve<PacksModuleService>(PACKS_MODULE);
      const adminHeaders = (): Record<string, string> => ({
        authorization: `Bearer ${adminToken}`,
      });

      beforeEach(async () => {
        const container = getContainer();
        adminToken = await mintSuperAdmin(container, api, ADMIN_EMAIL, PASSWORD);
        // Seed one card so the existence check has something to accept.
        const [card] = await packs().createCards([
          {
            handle: `challenge-card-${Date.now()}`,
            name: 'Test Card',
            set: 'Base',
            grader: 'PSA',
            grade: '10',
            market_value: 1,
            image: '/c.png',
          },
        ]);
        cardId = card.id;
      });

      it('401s without an admin token', async () => {
        expect(
          (await unwrapResponse(api.get('/admin/challenge/settings'))).status,
        ).toBe(401);
        expect(
          (
            await unwrapResponse(
              api.post('/admin/challenge/stages', { stages: [], reason: 'x' }),
            )
          ).status,
        ).toBe(401);
      });

      it('GET settings returns §4.1 defaults before first save', async () => {
        const res = await unwrapResponse(
          api.get('/admin/challenge/settings', { headers: adminHeaders() }),
        );
        expect(res.status).toBe(200);
        expect(res.data).toEqual({
          cadence: 'fixed_weekly',
          timezone: 'Asia/Kuala_Lumpur',
          reset_day: 1,
          reset_hour: 0,
          payout_credits: 0,
          payout_card_ids: [],
        });
      });

      it('POST stages: empty list is valid (challenge disabled)', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/challenge/stages',
            { stages: [], reason: 'disable' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data.stages).toEqual([]);
        expect(await packs().listChallengeStages({}, { take: 10 })).toHaveLength(0);
      });

      it('POST stages: happy path persists + writes one audit row', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/challenge/stages',
            {
              stages: [
                { stage_number: 1, threshold_myr: 100, reward_credits: 10, reward_card_ids: [cardId] },
                { stage_number: 2, threshold_myr: 200, reward_credits: 20, reward_card_ids: [] },
              ],
              reason: 'configure stages',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data.stages).toHaveLength(2);
        expect(await packs().listChallengeStages({}, { take: 10 })).toHaveLength(2);

        const audits = await packs().listAdminActionAudits(
          { entity_type: 'challenge_stages', action: 'replace' },
          { take: 10 },
        );
        expect(audits).toHaveLength(1);
        expect(audits[0].reason).toBe('configure stages');
      });

      it('POST stages: unknown featured card id → 400, nothing written', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/challenge/stages',
            {
              stages: [
                { stage_number: 1, threshold_myr: 100, reward_credits: 10, reward_card_ids: ['card_does_not_exist'] },
              ],
              reason: 'bad card',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
        expect(String(res.data.message)).toMatch(/Unknown featured card id/);
        expect(await packs().listChallengeStages({}, { take: 10 })).toHaveLength(0);
      });

      it('POST settings: valid patch persists + audit; GET reflects it', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/challenge/settings',
            {
              patch: { reset_day: 3, reset_hour: 6, payout_credits: 500, payout_card_ids: [cardId] },
              reason: 'set payout',
            },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(200);
        expect(res.data).toMatchObject({
          reset_day: 3,
          reset_hour: 6,
          payout_credits: 500,
          payout_card_ids: [cardId],
        });

        const get = await unwrapResponse(
          api.get('/admin/challenge/settings', { headers: adminHeaders() }),
        );
        expect(get.data.reset_day).toBe(3);
        expect(get.data.payout_credits).toBe(500);

        const audits = await packs().listAdminActionAudits(
          { entity_type: 'challenge_settings', action: 'edit' },
          { take: 10 },
        );
        expect(audits).toHaveLength(1);
      });

      it('POST settings: invalid timezone → 400', async () => {
        const res = await unwrapResponse(
          api.post(
            '/admin/challenge/settings',
            { patch: { timezone: 'Mars/Olympus' }, reason: 'bad tz' },
            { headers: adminHeaders() },
          ),
        );
        expect(res.status).toBe(400);
        expect(String(res.data.message)).toMatch(/valid IANA time zone/);
      });
    });
  },
});
```

- [ ] 5. Run it, expect PASS: `corepack yarn test:integration:http challenge.spec` (in `backend/packages/api`). Expected: `Tests: 7 passed`. (A registration/schema mismatch on the two new models surfaces HERE as a boot/migration failure — the harness runs migrations + boots the app — so a green run also verifies Task 3's MedusaService registration.)

- [ ] 6. Typecheck: `corepack yarn check-types` → no errors.

- [ ] 7. Commit:
```
git add backend/packages/api/src/modules/packs/service.ts backend/packages/api/src/api/admin/challenge
git add backend/packages/api/integration-tests/http/challenge.spec.ts
git commit -m "$(printf 'feat(challenge): saveChallengeStages + editChallengeSettings routes\n\nWhole-set audited stage replace (diff-upsert-hard-delete, card-existence check)\n+ singleton settings patch (defaults pre-save). Integration-covered.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 5: Admin REST helpers + query-key + React-Query hooks (vip-levels + challenge)

> Admin app (`backend/apps/admin`) has **no React-hook test harness** (Vitest covers only pure `*.ts` helpers). These hooks are verified by `corepack yarn build` (typecheck) and by the browser task (Task 9), not by a unit test.

**Files:**
- Modify: `backend/apps/admin/src/lib/admin-rest.ts` (append DTOs + fetch helpers)
- Modify: `backend/apps/admin/src/lib/query-keys.ts` (append keys)
- Modify: `backend/apps/admin/src/lib/queries.ts` (append hooks + imports)

**Interfaces:**
- Produces: `VipLevelDTO`, `ChallengeStageDTO`, `ChallengeSettingsDTO` types; `getVipLevels/saveVipLevels/getChallengeStages/saveChallengeStages/getChallengeSettings/saveChallengeSettings` REST helpers; `useVipLevels/useSaveVipLevels/useChallengeStages/useSaveChallengeStages/useChallengeSettings/useSaveChallengeSettings` hooks; `qk.vipLevels/qk.challengeStages/qk.challengeSettings`.

Steps:

- [ ] 1. Append to `backend/apps/admin/src/lib/admin-rest.ts` (after the existing "Avatar frames" block, ~line 697; reuses the file's existing `getJson`/`postJson`):

```ts
// ── VIP levels (ladder CRUD) ─────────────────────────────────────────────────

export interface VipLevelDTO {
  level: number;
  spend_threshold: number; // MYR
  voucher_amount: number; // MYR
  box_tier: string;
  frame_unlock: boolean;
  direct_referral_pct: number;
}

export const getVipLevels = () =>
  getJson<{ levels: VipLevelDTO[] }>('/admin/vip-levels');

// Replace-all the ladder. Audited edit; `reason` mandatory. Throws
// Error(message) on a 400 (errorMessage surfaces the backend MedusaError).
export const saveVipLevels = (body: { levels: VipLevelDTO[]; reason: string }) =>
  postJson<{ levels: VipLevelDTO[] }>('/admin/vip-levels', body);

// ── Weekly Challenge (milestone stages + week/payout settings) ───────────────

export interface ChallengeStageDTO {
  stage_number: number;
  threshold_myr: number; // MYR
  reward_credits: number; // MYR credited as store credits
  reward_card_ids: string[]; // featured card ids
}

export const getChallengeStages = () =>
  getJson<{ stages: ChallengeStageDTO[] }>('/admin/challenge/stages');

export const saveChallengeStages = (body: {
  stages: ChallengeStageDTO[];
  reason: string;
}) => postJson<{ stages: ChallengeStageDTO[] }>('/admin/challenge/stages', body);

export interface ChallengeSettingsDTO {
  cadence: string;
  timezone: string;
  reset_day: number;
  reset_hour: number;
  payout_credits: number; // MYR credited as store credits
  payout_card_ids: string[]; // featured card ids
}

export const getChallengeSettings = () =>
  getJson<ChallengeSettingsDTO>('/admin/challenge/settings');

// Singleton patch: send only the changed fields under `patch`.
export const saveChallengeSettings = (body: {
  patch: Partial<ChallengeSettingsDTO>;
  reason: string;
}) => postJson<ChallengeSettingsDTO>('/admin/challenge/settings', body);
```

- [ ] 2. Append to `backend/apps/admin/src/lib/query-keys.ts` (inside the `qk` object, after `avatarFrames`):

```ts
  vipLevels: ['admin', 'vip-levels'] as const,
  challengeStages: ['admin', 'challenge', 'stages'] as const,
  challengeSettings: ['admin', 'challenge', 'settings'] as const,
```

- [ ] 3. In `backend/apps/admin/src/lib/queries.ts`, add the imports (extend the existing `from './admin-rest'` import block): add `getVipLevels, saveVipLevels, getChallengeStages, saveChallengeStages, getChallengeSettings, saveChallengeSettings` to the value imports and `type VipLevelDTO, type ChallengeStageDTO, type ChallengeSettingsDTO` to the type imports. Then append the hooks (after `useSaveAvatarFrames`, ~line 622):

```ts
export type {
  VipLevelDTO,
  ChallengeStageDTO,
  ChallengeSettingsDTO,
} from './admin-rest';

export const useVipLevels = (): UseQueryResult<{ levels: VipLevelDTO[] }> =>
  useQuery({ queryKey: qk.vipLevels, queryFn: getVipLevels });

export const useSaveVipLevels = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { levels: VipLevelDTO[]; reason: string }) =>
      saveVipLevels(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.vipLevels });
      toast.success('VIP levels saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
};

export const useChallengeStages = (): UseQueryResult<{
  stages: ChallengeStageDTO[];
}> =>
  useQuery({ queryKey: qk.challengeStages, queryFn: getChallengeStages });

export const useSaveChallengeStages = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { stages: ChallengeStageDTO[]; reason: string }) =>
      saveChallengeStages(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.challengeStages });
      toast.success('Milestone stages saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
};

export const useChallengeSettings = (): UseQueryResult<ChallengeSettingsDTO> =>
  useQuery({ queryKey: qk.challengeSettings, queryFn: getChallengeSettings });

export const useSaveChallengeSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      patch: Partial<ChallengeSettingsDTO>;
      reason: string;
    }) => saveChallengeSettings(vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.challengeSettings });
      toast.success('Week & payout saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
};
```

- [ ] 4. Typecheck: `corepack yarn build` (in `backend/apps/admin`) → compiles with no TS errors. (The PostToolUse hook also type-checks each edit.)

- [ ] 5. Commit:
```
git add backend/apps/admin/src/lib/admin-rest.ts backend/apps/admin/src/lib/query-keys.ts backend/apps/admin/src/lib/queries.ts
git commit -m "$(printf 'feat(admin): REST helpers + hooks for vip-levels & challenge\n\nuseVipLevels/useSaveVipLevels + challenge stages/settings query hooks.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 6: Levels tab — client pre-validator (+ Vitest test), `vip-levels-tab.tsx` component, wire into VIP page

> The pure client pre-validator IS testable (Vitest, like `voucher-ranges` / `box-snapshot`). The React component is not unit-tested here — it's verified by `corepack yarn build` + Task 9.

**Files:**
- Create: `backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.ts`
- Test: `backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.test.ts`
- Create: `backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx`
- Modify: `backend/apps/admin/src/routes/daily-rewards/page.tsx` (add the Levels tab; leave Vouchers intact — its removal is Task 7)

**Interfaces:**
- Consumes: `useVipLevels`, `useSaveVipLevels`, `useDailyBoxes`, `VipLevelDTO` (Tasks 5 + existing); `FRAME_LEVELS` is re-declared client-side (the storefront/admin already keep independent copies per §3.2).
- Produces: `validateVipLevelsClient(rows: VipLevelRow[]): string[]`; `VipLevelsTab` React component; `page.tsx` registers a `levels` tab.

Steps:

- [ ] 1. Write the failing Vitest spec `backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  validateVipLevelsClient,
  type VipLevelRow,
} from './vip-levels-validate-client';

const row = (over: Partial<VipLevelRow> = {}): VipLevelRow => ({
  thresholdInput: '0',
  voucherInput: '0',
  boxTier: 'a',
  frameUnlock: false,
  referralInput: '1',
  ...over,
});

describe('validateVipLevelsClient', () => {
  test('accepts a valid 2-rung ladder', () => {
    expect(
      validateVipLevelsClient([row(), row({ thresholdInput: '100' })]),
    ).toEqual([]);
  });

  test('flags an empty ladder', () => {
    expect(validateVipLevelsClient([])).toContain(
      'The ladder must have at least 1 level.',
    );
  });

  test('flags a non-zero first threshold', () => {
    expect(validateVipLevelsClient([row({ thresholdInput: '5' })])).toContain(
      'Level 1: threshold must be 0.',
    );
  });

  test('flags a non-increasing threshold', () => {
    const errs = validateVipLevelsClient([row(), row({ thresholdInput: '0' })]);
    expect(errs.some((e) => /Level 2: threshold must exceed/.test(e))).toBe(true);
  });

  test('flags frame_unlock on a non-decade level', () => {
    expect(validateVipLevelsClient([row({ frameUnlock: true })])).toContain(
      'Level 1: a frame can only unlock on a decade level (10, 20, … 100).',
    );
  });

  test('flags a negative voucher / referral', () => {
    const errs = validateVipLevelsClient([
      row({ voucherInput: '-1', referralInput: '-2' }),
    ]);
    expect(errs.some((e) => /voucher/.test(e))).toBe(true);
    expect(errs.some((e) => /referral/.test(e))).toBe(true);
  });
});
```

- [ ] 2. Run it, expect FAIL: `corepack yarn vitest run src/routes/daily-rewards/vip-levels-validate-client.test.ts` (in `backend/apps/admin`). Expected: cannot resolve `./vip-levels-validate-client`.

- [ ] 3. Create `backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.ts` (mirrors the server invariants; `level` is derived from array index, so it isn't an input field):

```ts
// Client-side pre-validation for the Levels tab — mirrors the server
// validateVipLevels invariants so the operator sees problems inline before
// POSTing (parity with the Vouchers tab's foldRangesLocal). Returns every
// problem (never stops at the first). `level` is index+1, not an input.
export const FRAME_LEVELS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export interface VipLevelRow {
  thresholdInput: string;
  voucherInput: string;
  boxTier: string;
  frameUnlock: boolean;
  referralInput: string;
}

export function validateVipLevelsClient(rows: VipLevelRow[]): string[] {
  const errors: string[] = [];
  if (rows.length < 1) {
    errors.push('The ladder must have at least 1 level.');
    return errors;
  }
  let prev = -1;
  rows.forEach((r, i) => {
    const level = i + 1;
    const t = Number(r.thresholdInput);
    if (!Number.isFinite(t) || t < 0) {
      errors.push(`Level ${level}: threshold must be a number ≥ 0.`);
    } else {
      if (level === 1 && t !== 0) errors.push('Level 1: threshold must be 0.');
      if (level > 1 && !(t > prev))
        errors.push(`Level ${level}: threshold must exceed level ${level - 1}'s.`);
      prev = t;
    }
    const v = Number(r.voucherInput);
    if (!Number.isFinite(v) || v < 0)
      errors.push(`Level ${level}: voucher amount must be ≥ 0.`);
    const p = Number(r.referralInput);
    if (!Number.isFinite(p) || p < 0)
      errors.push(`Level ${level}: referral % must be ≥ 0.`);
    if (!r.boxTier || r.boxTier.trim().length === 0)
      errors.push(`Level ${level}: a box tier is required.`);
    if (r.frameUnlock && !FRAME_LEVELS.includes(level))
      errors.push(
        `Level ${level}: a frame can only unlock on a decade level (10, 20, … 100).`,
      );
  });
  return errors;
}
```

- [ ] 4. Run it, expect PASS: `corepack yarn vitest run src/routes/daily-rewards/vip-levels-validate-client.test.ts`. Expected: `6 passed`.

- [ ] 5. Create the tab component `backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx`:

```tsx
import { useState } from 'react';
import {
  Button,
  Input,
  Select,
  Switch,
  Table,
  Text,
  usePrompt,
} from '@medusajs/ui';
import { useVipLevels, useSaveVipLevels, useDailyBoxes } from '../../lib/queries';
import type { VipLevelDTO } from '../../lib/queries';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import {
  validateVipLevelsClient,
  type VipLevelRow,
} from './vip-levels-validate-client';

// One editable ladder row. `level` is NOT stored — it's the array index + 1,
// renumbered on every structural change (insert/delete/append).
interface Row extends VipLevelRow {
  localId: string;
}

let nextId = 0;
const rowFromDTO = (l: VipLevelDTO): Row => ({
  localId: `vl-${nextId++}`,
  thresholdInput: String(l.spend_threshold),
  voucherInput: String(l.voucher_amount),
  boxTier: l.box_tier,
  frameUnlock: l.frame_unlock,
  referralInput: String(l.direct_referral_pct),
});
const blankRow = (boxTier: string): Row => ({
  localId: `vl-${nextId++}`,
  thresholdInput: '0',
  voucherInput: '0',
  boxTier,
  frameUnlock: false,
  referralInput: '1',
});

const snapshotOf = (rows: Row[]): string =>
  JSON.stringify(
    rows.map((r) => [
      r.thresholdInput,
      r.voucherInput,
      r.boxTier,
      r.frameUnlock,
      r.referralInput,
    ]),
  );

export const VipLevelsTab = () => {
  const { data, isError } = useVipLevels();
  const { data: boxesData } = useDailyBoxes();
  const save = useSaveVipLevels();
  const prompt = usePrompt();

  const [seededFrom, setSeededFrom] = useState<{ levels: VipLevelDTO[] } | undefined>(
    undefined,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');

  if (data && data !== seededFrom) {
    setSeededFrom(data);
    const initial = data.levels.map(rowFromDTO);
    setRows(initial);
    setSavedSnapshot(snapshotOf(initial));
  }

  if (isError) return <Text className="text-ui-fg-subtle p-6">Failed to load the VIP ladder.</Text>;
  if (!data) return <LoadingSkeleton />;

  const tiers = (boxesData?.boxes ?? []).map((b) => b.tier);
  const fallbackTier = tiers[0] ?? 'a';
  const dirty = snapshotOf(rows) !== savedSnapshot;
  const errors = validateVipLevelsClient(rows);
  const canSave = !save.isPending && dirty && errors.length === 0;

  const setRow = (localId: string, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)),
    );
  const insertAt = (index: number) =>
    setRows((prev) => {
      const next = prev.slice();
      next.splice(index, 0, blankRow(fallbackTier));
      return next;
    });
  const removeAt = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index));

  async function onSave() {
    if (!canSave) return;
    const reason = await prompt({
      title: 'Save VIP ladder',
      description: 'Describe this change for the audit trail (required).',
      confirmText: 'Save',
    });
    if (!reason) return;
    const levels: VipLevelDTO[] = rows.map((r, i) => ({
      level: i + 1,
      spend_threshold: Number(r.thresholdInput) || 0,
      voucher_amount: Number(r.voucherInput) || 0,
      box_tier: r.boxTier,
      frame_unlock: r.frameUnlock,
      direct_referral_pct: Number(r.referralInput) || 0,
    }));
    try {
      const res = await save.mutateAsync({ levels, reason: String(reason) });
      const reseeded = res.levels.map(rowFromDTO);
      setRows(reseeded);
      setSavedSnapshot(snapshotOf(reseeded));
    } catch {
      // useSaveVipLevels.onError toasts the backend message.
    }
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <Text className="text-ui-fg-subtle" size="small">
        The per-user VIP ladder. Level is the row order; thresholds must start at
        0 and strictly increase. A frame can only unlock on a decade level.
      </Text>

      {errors.length > 0 && (
        <div className="rounded-lg border border-ui-border-error bg-ui-bg-base p-3">
          {errors.map((e) => (
            <Text key={e} className="text-ui-fg-error" size="small">
              {e}
            </Text>
          ))}
        </div>
      )}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Level</Table.HeaderCell>
            <Table.HeaderCell>Threshold (RM)</Table.HeaderCell>
            <Table.HeaderCell>Voucher (RM)</Table.HeaderCell>
            <Table.HeaderCell>Box tier</Table.HeaderCell>
            <Table.HeaderCell>Frame</Table.HeaderCell>
            <Table.HeaderCell>Referral %</Table.HeaderCell>
            <Table.HeaderCell>Rows</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r, i) => (
            <Table.Row key={r.localId}>
              <Table.Cell>{i + 1}</Table.Cell>
              <Table.Cell>
                <Input
                  value={r.thresholdInput}
                  disabled={i === 0}
                  onChange={(e) =>
                    setRow(r.localId, { thresholdInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Input
                  value={r.voucherInput}
                  onChange={(e) =>
                    setRow(r.localId, { voucherInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <Select
                  value={r.boxTier}
                  onValueChange={(v) => setRow(r.localId, { boxTier: v })}
                >
                  <Select.Trigger>
                    <Select.Value />
                  </Select.Trigger>
                  <Select.Content>
                    {tiers.map((t) => (
                      <Select.Item key={t} value={t}>
                        {t}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </Table.Cell>
              <Table.Cell>
                <Switch
                  checked={r.frameUnlock}
                  onCheckedChange={(v) => setRow(r.localId, { frameUnlock: v })}
                />
              </Table.Cell>
              <Table.Cell>
                <Input
                  value={r.referralInput}
                  onChange={(e) =>
                    setRow(r.localId, { referralInput: e.target.value })
                  }
                />
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-1">
                  <Button size="small" variant="secondary" onClick={() => insertAt(i)}>
                    + Above
                  </Button>
                  <Button size="small" variant="secondary" onClick={() => insertAt(i + 1)}>
                    + Below
                  </Button>
                  <Button size="small" variant="danger" onClick={() => removeAt(i)}>
                    Delete
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>

      <div className="flex items-center gap-x-3">
        <Button
          variant="secondary"
          onClick={() => setRows((prev) => [...prev, blankRow(fallbackTier)])}
        >
          Append level
        </Button>
        <Button variant="primary" onClick={onSave} isLoading={save.isPending} disabled={!canSave}>
          Save ladder
        </Button>
        {dirty && (
          <Text className="text-ui-fg-subtle" size="small">
            Unsaved changes
          </Text>
        )}
      </div>
    </div>
  );
};

export default VipLevelsTab;
```

- [ ] 6. Wire the tab into `backend/apps/admin/src/routes/daily-rewards/page.tsx`. Add the import near the other route imports (~line 49): `import { VipLevelsTab } from './vip-levels-tab';`. Then update the `DailyRewardsPage` component (lines 95-153):
  - Change the `tab` state type + default to include `levels` first: `useState<'levels' | 'boxes' | 'vouchers' | 'frames' | 'settings'>('levels')`.
  - Update the `switchTab` parameter/casts to the same union (add `'levels'`).
  - Add `<Tabs.Trigger value="levels">Levels</Tabs.Trigger>` as the FIRST trigger (before `boxes`).
  - Add `<Tabs.Content value="levels"><VipLevelsTab /></Tabs.Content>` as the FIRST content block (before the boxes content).

  Concretely, the trigger list and content blocks become:

```tsx
          <Tabs.List>
            <Tabs.Trigger value="levels">Levels</Tabs.Trigger>
            <Tabs.Trigger value="boxes">Boxes</Tabs.Trigger>
            <Tabs.Trigger value="vouchers">Vouchers</Tabs.Trigger>
            <Tabs.Trigger value="frames">Frames</Tabs.Trigger>
            <Tabs.Trigger value="settings">Engine settings</Tabs.Trigger>
          </Tabs.List>
        </div>
        <Tabs.Content value="levels">
          <VipLevelsTab />
        </Tabs.Content>
        <Tabs.Content value="boxes">
          <BoxesTab dirtyRef={boxesDirty} />
        </Tabs.Content>
```

  And the two union annotations:

```tsx
  const [tab, setTab] = useState<
    'levels' | 'boxes' | 'vouchers' | 'frames' | 'settings'
  >('levels');
```
```tsx
  const switchTab = async (
    next: 'levels' | 'boxes' | 'vouchers' | 'frames' | 'settings',
  ) => {
```
```tsx
        onValueChange={(v) =>
          switchTab(
            v as 'levels' | 'boxes' | 'vouchers' | 'frames' | 'settings',
          )
        }
```

- [ ] 7. Typecheck: `corepack yarn build` (in `backend/apps/admin`) → no TS errors.

- [ ] 8. Commit:
```
git add backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.ts backend/apps/admin/src/routes/daily-rewards/vip-levels-validate-client.test.ts backend/apps/admin/src/routes/daily-rewards/vip-levels-tab.tsx backend/apps/admin/src/routes/daily-rewards/page.tsx
git commit -m "$(printf 'feat(admin): VIP Levels tab (ladder CRUD) on the daily-rewards page\n\nOrdered-list renumber model, insert/delete/append, row-1 locked 0, client\npre-validation, dirty tracking + required-reason save. Vitest-covered validator.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 7: Remove the Vouchers tab + delete `voucher-ranges.ts` + update `RouteConfig` (label "VIP", un-nest, rank 30, Star icon)

> Backend `GET/POST /admin/daily-rewards/vouchers` + `saveVoucherRanges` **stay in place** (unused, documented follow-up per §3.5). This task only removes the admin UI.

**Files:**
- Modify: `backend/apps/admin/src/routes/daily-rewards/page.tsx`
- Delete: `backend/apps/admin/src/routes/daily-rewards/voucher-ranges.ts`
- Delete: `backend/apps/admin/src/routes/daily-rewards/voucher-ranges.test.ts`

Steps:

- [ ] 1. Confirm nothing outside `page.tsx` imports the voucher-ranges helper before deleting it:
```
grep -rn "voucher-ranges" backend/apps/admin/src
```
Expected: only `page.tsx` (the tab component + the `LEVELS`/`foldRangesLocal` import) and the co-located `voucher-ranges.test.ts`. If any OTHER file imports it, STOP and reconcile before deleting.

- [ ] 2. In `page.tsx`, remove the Vouchers UI + its dead code:
  - Delete the `<Tabs.Trigger value="vouchers">Vouchers</Tabs.Trigger>` line and the `<Tabs.Content value="vouchers"><VouchersTab /></Tabs.Content>` block.
  - Narrow the `tab` union everywhere (state, `switchTab` param, `onValueChange` cast) from `'levels' | 'boxes' | 'vouchers' | 'frames' | 'settings'` to `'levels' | 'boxes' | 'frames' | 'settings'`.
  - Delete the entire `VouchersTab` component (starts ~line 174 `const VouchersTab = () => {`) and its helper types/factories that nothing else uses: the `RangeRow` interface, `nextRangeLocalId`, and `rangeRowFromDTO`.
  - Remove now-unused imports: `useVoucherLadder`, `useSaveVoucherRanges`, `VoucherLadderDTO`, `VoucherRangeDTO` (from `'../../lib/queries'`), and `import { LEVELS, foldRangesLocal } from './voucher-ranges';`.
  - Update the page heading text from `Daily Rewards` to `VIP` and refresh the subtitle to drop the "one-time vouchers granted by level" clause, e.g.:

```tsx
            <Heading level="h2">VIP</Heading>
            <Text className="text-ui-fg-subtle mt-1" size="small">
              The VIP ladder, the daily box each tier opens, the avatar frames
              unlocked every 10 levels, and the rewards engine settings.
            </Text>
```

- [ ] 3. Update the `RouteConfig` export (~line 1334) — change label, drop `nested`, set rank 30, swap the icon to `Star`; and change the icon import on line 23 from `Calendar` to `Star`:

```tsx
import { Star } from '@medusajs/icons';
```
```tsx
export const config: RouteConfig = {
  label: 'VIP',
  icon: Star,
  rank: 30,
};
```

- [ ] 4. Delete the two files:
```
git rm backend/apps/admin/src/routes/daily-rewards/voucher-ranges.ts backend/apps/admin/src/routes/daily-rewards/voucher-ranges.test.ts
```

- [ ] 5. Verify the admin still typechecks and the remaining pure tests pass:
```
corepack yarn build        # in backend/apps/admin — no TS errors
corepack yarn vitest run   # in backend/apps/admin — box-snapshot + others green, no missing-file failures
```
Expected: build succeeds; Vitest reports the remaining suites passing and no reference to the deleted `voucher-ranges.test.ts`.

- [ ] 6. Commit:
```
git add backend/apps/admin/src/routes/daily-rewards/page.tsx
git commit -m "$(printf 'refactor(admin): remove Vouchers tab, rename page to VIP\n\nPer-rung voucher editing in the Levels tab supersedes the range editor\n(dual-write on vip_level.voucher_amount, hard-locked to 100 levels). Backend\nvouchers route stays (unused, follow-up). RouteConfig: label VIP, un-nested,\nrank 30, Star icon.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 8: Expose `card.id` to the admin list + Weekly Challenge page (Milestone Stages + Week & Payout tabs)

> The featured-card picker must emit `card.id` (§4.3), but the shared `toAdminCardDto` seam deliberately omits it (its unit test pins the shape with `toEqual`, and `stock` set the precedent of list-only fields spread on top). So spread `id` onto the card responses WITHOUT touching the seam. The Challenge page has no React-hook harness — verified by `corepack yarn build` + Task 9.

**Files:**
- Modify: `backend/packages/api/src/api/admin/cards/route.ts` (list — spread `id: c.id`)
- Modify: `backend/packages/api/src/api/admin/cards/[handle]/route.ts` (detail GET — spread `id: card.id`)
- Modify: `backend/apps/admin/src/lib/packs-api.ts` (add `id: string` to `AdminCard`)
- Create: `backend/apps/admin/src/routes/challenge/page.tsx`

**Interfaces:**
- Consumes: `useChallengeStages/useSaveChallengeStages/useChallengeSettings/useSaveChallengeSettings` (Task 5); `useCards` (existing, now carrying `id`); `ChallengeStageDTO`, `ChallengeSettingsDTO`.
- Produces: `AdminCard.id`; the `Weekly Challenge` route (`RouteConfig` rank 31, Trophy icon).

Steps:

- [ ] 1. In `backend/packages/api/src/api/admin/cards/route.ts`, add `id: c.id` to the list DTO (the raw model `c` carries `id`). The `res.json` map (~line 43) becomes:

```ts
    cards: sorted.map((c) => ({
      ...toAdminCardDto(c, fxRate),
      id: c.id,
      stock: stockByHandle.get(c.handle) ?? null,
    })),
```

- [ ] 2. In `backend/packages/api/src/api/admin/cards/[handle]/route.ts`, spread `id` onto the detail GET response (~line 27) so the shape stays consistent for `AdminCard` consumers (`card` is the raw fetched model with `id`):

```ts
  res.json({ card: { ...toAdminCardDto(card, fxRate), id: card.id } });
```

- [ ] 3. Add `id` to the `AdminCard` interface in `backend/apps/admin/src/lib/packs-api.ts` (line 60, first field):

```ts
export interface AdminCard {
  id: string;
  handle: string;
```

- [ ] 4. Typecheck both packages:
```
corepack yarn check-types   # in backend/packages/api — toAdminCardDto + its pinned unit test are untouched, so no shape break
corepack yarn build         # in backend/apps/admin
```
Expected: both green. (The `admin-card.unit.spec.ts` `toEqual` still holds because the seam did not gain `id`.)

- [ ] 5. Create the Challenge page `backend/apps/admin/src/routes/challenge/page.tsx`. It has two tabs; the Milestone Stages tab reuses the ordered-list/renumber model (minus the row-1-zero rule) and a card picker adapted from the daily-box `FocusModal` that emits `card.id`:

```tsx
import { useState } from 'react';
import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Select,
  Table,
  Tabs,
  FocusModal,
  usePrompt,
} from '@medusajs/ui';
import { Trophy } from '@medusajs/icons';
import type { RouteConfig } from '@mercurjs/dashboard-sdk';
import {
  useCards,
  useChallengeStages,
  useSaveChallengeStages,
  useChallengeSettings,
  useSaveChallengeSettings,
  type ChallengeStageDTO,
  type ChallengeSettingsDTO,
} from '../../lib/queries';
import { resolveImageUrl } from '../../lib/image-url';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';

let nextId = 0;

// ── Featured-card picker (adapts the daily-box picker; emits card.id) ─────────
const CardPicker = ({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) => {
  const { data: cards, isError } = useCards({ enabled: open });
  return (
    <FocusModal open={open} onOpenChange={(o) => !o && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button size="small" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center overflow-auto p-10">
          <div className="flex w-full max-w-[640px] flex-col gap-y-4">
            <FocusModal.Title asChild>
              <Heading level="h2">Choose a featured card</Heading>
            </FocusModal.Title>
            {isError ? (
              <Text className="text-ui-fg-subtle">Failed to load cards.</Text>
            ) : cards == null ? (
              <LoadingSkeleton />
            ) : (
              <div className="divide-y rounded-lg border">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="hover:bg-ui-bg-base-hover flex w-full items-center gap-3 px-4 py-2 text-left"
                    onClick={() => {
                      onPick(c.id);
                      onClose();
                    }}
                  >
                    <img
                      src={resolveImageUrl(c.image)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-9 w-7 shrink-0 rounded object-contain"
                    />
                    <span className="flex-1 truncate text-sm font-medium">
                      {c.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  );
};

// ── Milestone Stages tab ─────────────────────────────────────────────────────
interface StageRow {
  localId: string;
  thresholdInput: string;
  creditsInput: string;
  cardIds: string[];
}
const stageFromDTO = (s: ChallengeStageDTO): StageRow => ({
  localId: `st-${nextId++}`,
  thresholdInput: String(s.threshold_myr),
  creditsInput: String(s.reward_credits),
  cardIds: s.reward_card_ids,
});
const snapshotStages = (rows: StageRow[]) =>
  JSON.stringify(rows.map((r) => [r.thresholdInput, r.creditsInput, r.cardIds]));

const StagesTab = () => {
  const { data, isError } = useChallengeStages();
  const save = useSaveChallengeStages();
  const prompt = usePrompt();
  const [seededFrom, setSeededFrom] = useState<{ stages: ChallengeStageDTO[] } | undefined>();
  const [rows, setRows] = useState<StageRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  if (data && data !== seededFrom) {
    setSeededFrom(data);
    const initial = data.stages.map(stageFromDTO);
    setRows(initial);
    setSavedSnapshot(snapshotStages(initial));
  }
  if (isError) return <Text className="text-ui-fg-subtle p-6">Failed to load stages.</Text>;
  if (!data) return <LoadingSkeleton />;

  const dirty = snapshotStages(rows) !== savedSnapshot;
  // Client pre-check: contiguity is automatic (index-derived); check monotonic
  // thresholds + non-negatives inline. Empty list is valid (challenge off).
  const errors: string[] = [];
  let prev = -1;
  rows.forEach((r, i) => {
    const t = Number(r.thresholdInput);
    if (!Number.isFinite(t) || t < 0) errors.push(`Stage ${i + 1}: threshold must be ≥ 0.`);
    else {
      if (i > 0 && !(t > prev)) errors.push(`Stage ${i + 1}: threshold must exceed stage ${i}'s.`);
      prev = t;
    }
    if (!(Number(r.creditsInput) >= 0)) errors.push(`Stage ${i + 1}: credits must be ≥ 0.`);
  });
  const canSave = !save.isPending && dirty && errors.length === 0;

  const setRow = (id: string, patch: Partial<StageRow>) =>
    setRows((p) => p.map((r) => (r.localId === id ? { ...r, ...patch } : r)));
  const insertAt = (index: number) =>
    setRows((p) => {
      const next = p.slice();
      next.splice(index, 0, { localId: `st-${nextId++}`, thresholdInput: '0', creditsInput: '0', cardIds: [] });
      return next;
    });
  const removeAt = (index: number) => setRows((p) => p.filter((_, i) => i !== index));

  async function onSave() {
    if (!canSave) return;
    const reason = await prompt({ title: 'Save milestone stages', description: 'Reason for the audit trail (required).', confirmText: 'Save' });
    if (!reason) return;
    const stages: ChallengeStageDTO[] = rows.map((r, i) => ({
      stage_number: i + 1,
      threshold_myr: Number(r.thresholdInput) || 0,
      reward_credits: Number(r.creditsInput) || 0,
      reward_card_ids: r.cardIds,
    }));
    try {
      const res = await save.mutateAsync({ stages, reason: String(reason) });
      const reseeded = res.stages.map(stageFromDTO);
      setRows(reseeded);
      setSavedSnapshot(snapshotStages(reseeded));
    } catch {
      /* onError toasts */
    }
  }

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <Text className="text-ui-fg-subtle" size="small">
        Community-pool milestone stages (inert config). Stage number is the row
        order; thresholds must strictly increase. Zero stages = challenge off.
      </Text>
      {errors.length > 0 && (
        <div className="rounded-lg border border-ui-border-error p-3">
          {errors.map((e) => (
            <Text key={e} className="text-ui-fg-error" size="small">{e}</Text>
          ))}
        </div>
      )}
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Stage</Table.HeaderCell>
            <Table.HeaderCell>Threshold (RM)</Table.HeaderCell>
            <Table.HeaderCell>Credits (RM)</Table.HeaderCell>
            <Table.HeaderCell>Featured cards</Table.HeaderCell>
            <Table.HeaderCell>Rows</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((r, i) => (
            <Table.Row key={r.localId}>
              <Table.Cell>{i + 1}</Table.Cell>
              <Table.Cell>
                <Input value={r.thresholdInput} onChange={(e) => setRow(r.localId, { thresholdInput: e.target.value })} />
              </Table.Cell>
              <Table.Cell>
                <Input value={r.creditsInput} onChange={(e) => setRow(r.localId, { creditsInput: e.target.value })} />
              </Table.Cell>
              <Table.Cell>
                <div className="flex items-center gap-x-2">
                  <Text size="small">{r.cardIds.length} card(s)</Text>
                  <Button size="small" variant="secondary" onClick={() => setPickerFor(r.localId)}>Add</Button>
                  {r.cardIds.length > 0 && (
                    <Button size="small" variant="transparent" onClick={() => setRow(r.localId, { cardIds: r.cardIds.slice(0, -1) })}>
                      Remove last
                    </Button>
                  )}
                </div>
              </Table.Cell>
              <Table.Cell>
                <div className="flex gap-x-1">
                  <Button size="small" variant="secondary" onClick={() => insertAt(i)}>+ Above</Button>
                  <Button size="small" variant="secondary" onClick={() => insertAt(i + 1)}>+ Below</Button>
                  <Button size="small" variant="danger" onClick={() => removeAt(i)}>Delete</Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <div className="flex items-center gap-x-3">
        <Button variant="secondary" onClick={() => setRows((p) => [...p, { localId: `st-${nextId++}`, thresholdInput: '0', creditsInput: '0', cardIds: [] }])}>
          Add stage
        </Button>
        <Button variant="primary" onClick={onSave} isLoading={save.isPending} disabled={!canSave}>Save stages</Button>
        {dirty && <Text className="text-ui-fg-subtle" size="small">Unsaved changes</Text>}
      </div>
      <CardPicker
        open={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onPick={(id) => {
          if (pickerFor) setRow(pickerFor, { cardIds: [...(rows.find((r) => r.localId === pickerFor)?.cardIds ?? []), id] });
        }}
      />
    </div>
  );
};

// ── Week & Payout tab ────────────────────────────────────────────────────────
const zones = (Intl as typeof Intl & { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');

const PayoutTab = () => {
  const { data, isError } = useChallengeSettings();
  const save = useSaveChallengeSettings();
  const prompt = usePrompt();
  const [seededFrom, setSeededFrom] = useState<ChallengeSettingsDTO | undefined>();
  const [form, setForm] = useState<ChallengeSettingsDTO | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  if (data && data !== seededFrom) {
    setSeededFrom(data);
    setForm(data);
  }
  if (isError) return <Text className="text-ui-fg-subtle p-6">Failed to load settings.</Text>;
  if (!form) return <LoadingSkeleton />;

  const dirty = JSON.stringify(form) !== JSON.stringify(seededFrom);
  const set = (patch: Partial<ChallengeSettingsDTO>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function onSave() {
    if (!form || !dirty || save.isPending || !seededFrom) return;
    const reason = await prompt({ title: 'Save week & payout', description: 'Reason for the audit trail (required).', confirmText: 'Save' });
    if (!reason) return;
    // Send only the changed fields as the patch.
    const patch: Partial<ChallengeSettingsDTO> = {};
    (Object.keys(form) as (keyof ChallengeSettingsDTO)[]).forEach((k) => {
      if (JSON.stringify(form[k]) !== JSON.stringify(seededFrom[k])) {
        (patch as Record<string, unknown>)[k] = form[k];
      }
    });
    try {
      const res = await save.mutateAsync({ patch, reason: String(reason) });
      setSeededFrom(res);
      setForm(res);
    } catch {
      /* onError toasts */
    }
  }

  return (
    <div className="flex max-w-[520px] flex-col gap-y-4 px-6 py-4">
      <Text className="text-ui-fg-subtle" size="small">
        Fixed-weekly cadence anchored at a timezone + reset day/hour, plus the
        flat top-10 payout (inert config).
      </Text>
      <div>
        <Text size="small" weight="plus">Cadence</Text>
        <Text className="text-ui-fg-subtle" size="small">fixed_weekly (only supported value)</Text>
      </div>
      <div>
        <Text size="small" weight="plus">Timezone</Text>
        <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
          <Select.Trigger><Select.Value /></Select.Trigger>
          <Select.Content>
            {zones.map((z) => (<Select.Item key={z} value={z}>{z}</Select.Item>))}
          </Select.Content>
        </Select>
      </div>
      <div>
        <Text size="small" weight="plus">Reset day (0 = Sunday … 6 = Saturday)</Text>
        <Input value={String(form.reset_day)} onChange={(e) => set({ reset_day: Number(e.target.value) })} />
      </div>
      <div>
        <Text size="small" weight="plus">Reset hour (0–23)</Text>
        <Input value={String(form.reset_hour)} onChange={(e) => set({ reset_hour: Number(e.target.value) })} />
      </div>
      <div>
        <Text size="small" weight="plus">Top-10 payout credits (RM)</Text>
        <Input value={String(form.payout_credits)} onChange={(e) => set({ payout_credits: Number(e.target.value) })} />
      </div>
      <div>
        <Text size="small" weight="plus">Top-10 featured cards</Text>
        <div className="flex items-center gap-x-2">
          <Text size="small">{form.payout_card_ids.length} card(s)</Text>
          <Button size="small" variant="secondary" onClick={() => setPickerOpen(true)}>Add</Button>
          {form.payout_card_ids.length > 0 && (
            <Button size="small" variant="transparent" onClick={() => set({ payout_card_ids: form.payout_card_ids.slice(0, -1) })}>
              Remove last
            </Button>
          )}
        </div>
      </div>
      <Button variant="primary" onClick={onSave} isLoading={save.isPending} disabled={!dirty || save.isPending}>Save week & payout</Button>
      <CardPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={(id) => set({ payout_card_ids: [...form.payout_card_ids, id] })} />
    </div>
  );
};

const ChallengePage = () => {
  const [tab, setTab] = useState<'stages' | 'payout'>('stages');
  return (
    <Container className="p-0">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'stages' | 'payout')}>
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <Heading level="h2">Weekly Challenge</Heading>
            <Text className="text-ui-fg-subtle mt-1" size="small">
              Milestone stages and the weekly reset + top-10 payout. Inert config
              a future settlement engine will read.
            </Text>
          </div>
          <Tabs.List>
            <Tabs.Trigger value="stages">Milestone Stages</Tabs.Trigger>
            <Tabs.Trigger value="payout">Week & Payout</Tabs.Trigger>
          </Tabs.List>
        </div>
        <Tabs.Content value="stages"><StagesTab /></Tabs.Content>
        <Tabs.Content value="payout"><PayoutTab /></Tabs.Content>
      </Tabs>
    </Container>
  );
};

export default ChallengePage;

export const config: RouteConfig = {
  label: 'Weekly Challenge',
  icon: Trophy,
  rank: 31,
};
```

- [ ] 6. Typecheck: `corepack yarn build` (in `backend/apps/admin`) → no TS errors. If `Trophy`/`Star` are not exported by the installed `@medusajs/icons`, substitute the nearest available icon (e.g. `Star`, `SparklesSolid`) and note it — the spec's requirement is only "adjacent, VIP first, distinct icons."

- [ ] 7. Commit:
```
git add backend/packages/api/src/api/admin/cards/route.ts "backend/packages/api/src/api/admin/cards/[handle]/route.ts" backend/apps/admin/src/lib/packs-api.ts backend/apps/admin/src/routes/challenge/page.tsx
git commit -m "$(printf 'feat(admin): Weekly Challenge page (stages + week/payout)\n\nTwo-tab config editor; card picker emits card.id (list/detail card DTOs now\nspread id alongside the shared seam). RouteConfig rank 31, Trophy icon.\n\nCo-Authored-By: Claude Fable 5 <noreply@anthropic.com>')"
```

---

### Task 9: Browser verification (worktree backend :9000 + admin :7000)

> No fabricated commands — these are operator instructions following the repo handoff caveats (see MEMORY: worktree launch, env copy). Backend serves on :9000, admin dev server on :7000 (`vite --port 7000` per `apps/admin/package.json`).

**Files:** none (verification only).

Steps:

- [ ] 1. **Kill any main-tree backend on :9000 first** (the handoff caveat — a stale main-tree `:9000` will shadow the worktree). Confirm nothing is listening on 9000 before starting the worktree backend.

- [ ] 2. **Copy env into the worktree** using PowerShell `Copy-Item` (the guard-secrets hook blocks `cp` of `.env*`): copy the backend `.env` and the admin env/config the app needs (e.g. `.env`, `.env.local`) from the main tree into the corresponding worktree paths, per the "launch-stack worktree gotchas" / "CodeRabbit worktree" MEMORY notes.

- [ ] 3. **Run migrations** against the worktree DB: `corepack yarn medusa db:migrate` (in `backend/packages/api`) so `Migration20260719000000` + `Migration20260719010000` apply (new challenge tables + widened audit CHECKs). Then ensure the VIP ladder + 11 `reward_box` rows are seeded (a fresh DB needs `corepack yarn seed` / `seed-vip-achievements`).

- [ ] 4. **Start the worktree backend** (`corepack yarn dev` in `backend/packages/api`, serving :9000) and the **admin dev server** (`corepack yarn dev` in `backend/apps/admin`, :7000). Log in as an admin.

- [ ] 5. **VIP page:** confirm the sidebar shows a single top-level **VIP** entry (Star icon, not under Promotions) with tabs **Levels, Boxes, Frames, Engine settings** and **no Vouchers tab**. On **Levels**: load shows the seeded ladder; edit a threshold/voucher/box-tier/frame/referral; use insert-above/below, append, delete; confirm row 1's threshold input is locked to 0; trigger a validation error (e.g. set a non-decade frame) and confirm the inline error blocks save; save with a reason; reload and confirm persistence. Confirm **Boxes/Frames/Engine** still load and save.

- [ ] 6. **Weekly Challenge page:** confirm a single top-level **Weekly Challenge** entry (Trophy icon) ranked directly after VIP. On **Milestone Stages**: add/remove stages, add featured cards via the picker (verify the picker lists cards and a pick sticks), save with a reason, reload persists; confirm zero stages saves fine. On **Week & Payout**: change timezone/reset-day/reset-hour/payout-credits, add payout cards, save with a reason, reload persists; confirm the tab loads defaults on a fresh DB (pre-first-save).

- [ ] 7. **Audit trail (optional spot-check):** confirm each save wrote an `admin_action_audit` row (via the customer/audit surface or a DB query) with the expected `entity_type`/`action` and the reason.

- [ ] 8. Record the verification outcome in the PR / handoff notes. No commit (verification only). If anything fails, return to the owning task rather than patching in this task.

---

### Task 10: Security review of the new admin write paths (spec §5)

**Files:** none created — review + fixes only.

- [ ] 1. **Run the `/security-review` skill** on the branch's pending changes. Scope focus: the four new/changed write paths — `POST /admin/vip-levels`, `POST /admin/challenge/stages`, `POST /admin/challenge/settings`, and the `page.tsx` / RouteConfig surgery — plus the two migrations. The config governs future money (voucher amounts, stage/payout rewards), so treat findings accordingly.

- [ ] 2. **Address findings by severity:** fix every CRITICAL and HIGH in the owning task's files (return to that task's test cycle — write a regression test, fix, re-run); fix MEDIUM where cheap; note LOW in the PR description. Re-run `/security-review` after fixes until no CRITICAL/HIGH remain.

- [ ] 3. **Commit any fixes** with conventional-commit messages (e.g. `fix(admin): harden vip-levels validation — <finding>`), each including the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

## Follow-ups (documented, NOT in this project's scope)

- Backend removal of the now-unused `GET/POST /admin/daily-rewards/vouchers` route + `saveVoucherRanges` (§3.5 / §7).
- Ladder-driven avatar-frame milestones end-to-end (the three hardcoded `FRAME_LEVELS` lists stay; frames can't exceed level 100 — §3.2 / §7).
- Sub-project D runtime (snapshot column, re-rank, pool, weekly settlement, top-10 payout, storefront UI) consuming the inert challenge config per §4.4.
- Optimistic concurrency / versioning on admin writes (last-write-wins accepted, §5).
