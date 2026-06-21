import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Phase 2a — rewards_settings singleton (commission cooldown, override pct, gen
// cap). One row; the service falls back to column defaults when absent.
export class Migration20260622140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "rewards_settings" (
      "id" text not null,
      "commission_cooldown_days" integer not null default 3,
      "team_override_pct" numeric not null default 0.2,
      "raw_team_override_pct" jsonb not null default '{"value":"0.2","precision":20}',
      "override_generation_cap" integer not null default 100,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "rewards_settings_pkey" primary key ("id")
    );`);
    this.addSql(
      `create index if not exists "IDX_rewards_settings_deleted_at" on "rewards_settings" ("deleted_at") where deleted_at is null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "rewards_settings" cascade;`);
  }
}
