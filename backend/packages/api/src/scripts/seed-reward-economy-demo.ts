/**
 * seed-reward-economy-demo.ts
 *
 * Demo seed for the VIP reward economy (Phase G2; box authoring ported to the
 * reward_box/reward_box_prize model in Task 7).
 *
 * What this seeds:
 *   - A tier-'c' reward_box row (enabled, draws_per_day: 3) via saveDailyBoxWorkflow
 *     — the same path the admin authoring UI uses — with 3 prizes:
 *       1. kind:'product'  product_handle:'celebi'  10% locked
 *       2. kind:'credit'   amount_myr:5              20% locked
 *       3. kind:'nothing'                            70% locked
 *   - Ensures the demo test customer's vip_member_state.highest_level_ever
 *     maps to box_tier 'c' (level 20 is the first tier-c level).
 *     Uses upsertVipMemberState so the customer can reach tier-c without
 *     spending any real money.
 *
 * HOW TO RUN THE DEMO
 * -------------------
 *   1. Start the backend:
 *        cd backend/packages/api
 *        corepack yarn medusa develop
 *
 *   2. In a second terminal, run this seed:
 *        corepack yarn medusa exec ./src/scripts/seed-reward-economy-demo.ts
 *
 *   3. Enable the reward gate (required for draw + claim; withdraw is always on):
 *        export REWARDS_REDEMPTION_ENABLED=true
 *        # or set it in your .env and restart medusa develop
 *
 *   4. Log in as the test customer (test@pokenic.app / PokenicTest123!) on
 *      the storefront and exercise the reward routes:
 *
 *      GET  /store/daily                → daily-box + voucher state
 *      POST /store/daily/draw           → consume one of 3 daily box draws
 *      POST /store/rewards/claim/:id    → claim a voucher or frame grant
 *      POST /store/rewards/withdraw     → ship a vaulted product prize
 *
 *   5. To reset: delete reward_draw rows for the customer and re-run this seed
 *      (it is idempotent — an already-authored box is left alone).
 *
 * NOTES
 * -----
 *   - 'celebi' is a real product handle seeded by seed.ts. Run the main seed
 *     first (corepack yarn medusa exec ./src/scripts/seed.ts) so the product
 *     exists and the stock/existence gate in drawDailyBox passes.
 *   - amount_myr: 5 is stored as bigNumber decimal MYR — the draw credits the
 *     customer +5 MYR via mutateCreditAtomic('reward_credit').
 *   - The tier-c upsert uses lifetimeSen: 0 + currentLevel: 20 + highestLevelEver: 20.
 *     The real VIP ladder bases promotion on external-funded spend in MYR sen;
 *     for demo purposes we set the projection directly without touching the ledger.
 *     This is safe: upsertVipMemberState only writes vip_member_state — it does not
 *     create credit_transaction rows and does not affect the money basis.
 */

import { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys, Modules } from '@medusajs/framework/utils';
import PacksModuleService from '../modules/packs/service';
import { PACKS_MODULE } from '../modules/packs';
import { saveDailyBoxWorkflow } from '../workflows/save-daily-box';

// The first VIP level whose box_tier === 'c' (per vip-levels.data.ts).
// Setting highest_level_ever to 20 guarantees tier resolution returns 'c'.
const TIER_C_LEVEL = 20;
const TIER_C = 'c';

// A real product handle from the seeded catalog (seed.ts CARD_PRODUCTS).
const DEMO_PRODUCT_HANDLE = 'celebi';

export default async function seedRewardEconomyDemo({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

  // ── 1. Tier-c reward_box + prizes ────────────────────────────────────────────
  logger.info('[reward-demo] Seeding tier-c reward_box...');

  // A reward_box row for every tier pre-exists (seeded disabled, no prizes, by
  // the Task 5/6 migration) — "already authored" means it HAS PRIZES, not just
  // that the row exists, so this seed still runs on a fresh migrated DB.
  const [existingBox] = await packs.listRewardBoxes(
    { tier: TIER_C },
    { select: ['id', 'enabled'], take: 1 },
  );
  const existingPrizes = existingBox
    ? await packs.listRewardBoxPrizes(
        { box_id: existingBox.id },
        { select: ['id'], take: 1 },
      )
    : [];

  if (existingPrizes.length > 0) {
    logger.info(
      `[reward-demo] reward_box tier "${TIER_C}" already authored, skipping.`,
    );
  } else {
    await saveDailyBoxWorkflow(container).run({
      input: {
        tier: TIER_C,
        admin_id: 'seed-reward-economy-demo',
        body: {
          name: 'Tier C Reward Box',
          enabled: true,
          draws_per_day: 3,
          reason: 'Demo seed (seed-reward-economy-demo.ts)',
          prizes: [
            { kind: 'product', locked: true, pct: 10, product_handle: DEMO_PRODUCT_HANDLE, qty: 1 },
            { kind: 'credit', locked: true, pct: 20, amount_myr: 5 },
            { kind: 'nothing', locked: true, pct: 70 },
          ],
        },
      },
    });
    logger.info('[reward-demo] Created reward_box tier "c" with 3 prizes.');
  }

  // ── 2. Bump test customer to tier-c VIP state ───────────────────────────────
  logger.info('[reward-demo] Ensuring test customer VIP state = tier c...');

  const customerModule = container.resolve(Modules.CUSTOMER);

  const TEST_EMAIL = process.env.TEST_CUSTOMER_EMAIL ?? 'test@pokenic.app';

  const [testCustomer] = await customerModule.listCustomers(
    { email: TEST_EMAIL },
    { take: 1 },
  );

  if (!testCustomer) {
    logger.warn(
      `[reward-demo] Test customer "${TEST_EMAIL}" not found — run the main seed.ts first.`,
    );
  } else {
    // Read current state to avoid regressing highest_level_ever if it's already higher.
    const [existingState] = await packs.listVipMemberStates(
      { customer_id: testCustomer.id },
      { select: ['highest_level_ever', 'current_level'], take: 1 },
    );

    const currentHighest = existingState
      ? Number(existingState.highest_level_ever)
      : 0;

    if (currentHighest >= TIER_C_LEVEL) {
      logger.info(
        `[reward-demo] Customer already at level ${currentHighest} (>= ${TIER_C_LEVEL}), skipping upsert.`,
      );
    } else {
      await packs.upsertVipMemberState({
        customerId: testCustomer.id,
        lifetimeSen: 0, // ponytail: no real ledger spend needed for demo
        highestLevelEver: TIER_C_LEVEL,
        currentLevel: TIER_C_LEVEL,
      });
      logger.info(
        `[reward-demo] Upserted VIP state for "${TEST_EMAIL}" → highest_level_ever = ${TIER_C_LEVEL} (box_tier 'c').`,
      );
    }
  }

  logger.info(
    '[reward-demo] Done. Set REWARDS_REDEMPTION_ENABLED=true to exercise draw/claim routes.',
  );
}
