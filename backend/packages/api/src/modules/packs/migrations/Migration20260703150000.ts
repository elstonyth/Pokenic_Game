import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Partial index for the leaderboard's spend aggregate: it scans
// credit_transaction by reason='pack_open' (optionally windowed on
// created_at) with NO customer filter, which the existing
// (customer_id, created_at) index cannot serve. The partial index keeps the
// weekly window and the all-time reason-scan off a full-ledger seq scan.
export class Migration20260703150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_credit_transaction_pack_open_created_at"
         ON "credit_transaction" ("created_at")
         WHERE reason = 'pack_open' AND deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `DROP INDEX IF EXISTS "IDX_credit_transaction_pack_open_created_at";`,
    );
  }
}
