import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Recorded Pull Value (spec 2026-07-19 Iteration 3 follow-up): nullable USD
// value snapshot stamped at draw time so the challenge/leaderboard pulled-value
// aggregates stop recomputing from live card FMV. raw_ jsonb twin mirrors the
// bigNumber convention (see buyback_amount, Migration20260611043441). Existing
// rows stay null until src/scripts/backfill-recorded-pull-value.ts runs;
// readers COALESCE to live pricing meanwhile.
export class Migration20260719020000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "pull" add column if not exists "recorded_value_usd" numeric null, add column if not exists "raw_recorded_value_usd" jsonb null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "pull" drop column if exists "recorded_value_usd", drop column if exists "raw_recorded_value_usd";`,
    );
  }
}
