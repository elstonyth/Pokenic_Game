import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Cap pack_odds.credit_amount (security audit 2026-06-30, Batch A item 3). The
// column is an unbounded numeric and settleRewardDraw pays a 'credit' prize
// straight to the ledger, so a fat-fingered authoring value (or a direct seed)
// could mint an absurd prize. The authoring validator + the settle-site guard
// both enforce MAX_REWARD_CREDIT_MYR (10000) in app code; this CHECK makes an
// over-cap row unrepresentable at the DB level too. The existing
// pack_odds_kind_payout_check already enforces the lower bound (credit rows >
// 0); this adds only the ceiling (and allows NULL for non-credit rows).
const MAX_REWARD_CREDIT_MYR = 10000;

export class Migration20260630120000 extends Migration {
  override async up(): Promise<void> {
    // Clamp any pre-existing over-cap row down to the ceiling before the
    // constraint would reject it. The reward economy is dormant (pools gated
    // off), so in practice this is a no-op — but it keeps the migration safe to
    // apply against any data (mirrors Migration20260625120000's normalize step).
    this.addSql(
      `UPDATE "pack_odds" SET "credit_amount" = ${MAX_REWARD_CREDIT_MYR} WHERE "credit_amount" > ${MAX_REWARD_CREDIT_MYR};`,
    );
    this.addSql(
      `ALTER TABLE "pack_odds" DROP CONSTRAINT IF EXISTS "pack_odds_credit_amount_max_check";`,
    );
    this.addSql(
      `ALTER TABLE "pack_odds" ADD CONSTRAINT "pack_odds_credit_amount_max_check" CHECK ("credit_amount" IS NULL OR "credit_amount" <= ${MAX_REWARD_CREDIT_MYR});`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `ALTER TABLE "pack_odds" DROP CONSTRAINT IF EXISTS "pack_odds_credit_amount_max_check";`,
    );
  }
}
