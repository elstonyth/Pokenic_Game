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
