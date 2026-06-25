import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Enforce withdrawals_per_day >= 1 in the persisted contract. The model only
// supplies a default (1); recordRewardWithdrawal and validateRewardPool both
// assume the value is a positive integer, so a 0/negative row would silently
// disable all withdrawals. A DB CHECK makes that unrepresentable.
export class Migration20260625120000 extends Migration {
  override async up(): Promise<void> {
    // Normalize any pre-existing out-of-range row up to the floor before the
    // constraint would reject it (the singleton row defaults to 1, but a manual
    // edit could have set 0).
    this.addSql(
      `UPDATE "rewards_settings" SET "withdrawals_per_day" = 1 WHERE "withdrawals_per_day" < 1;`,
    );
    this.addSql(
      `ALTER TABLE "rewards_settings" DROP CONSTRAINT IF EXISTS "rewards_settings_withdrawals_per_day_check";`,
    );
    this.addSql(
      `ALTER TABLE "rewards_settings" ADD CONSTRAINT "rewards_settings_withdrawals_per_day_check" CHECK ("withdrawals_per_day" >= 1);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `ALTER TABLE "rewards_settings" DROP CONSTRAINT IF EXISTS "rewards_settings_withdrawals_per_day_check";`,
    );
  }
}
