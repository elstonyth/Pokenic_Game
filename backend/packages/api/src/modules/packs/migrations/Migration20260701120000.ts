import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Task 3 — PriceCharting linkage fields on Card + the FxRate model (live
// market-price tracking). card.market_multiplier is a bigNumber with a
// default (+20% display markup), so it materializes as a numeric column
// PLUS a raw_market_multiplier jsonb mirror (mirrors Migration20260622140000's
// rewards_settings.team_override_pct / raw_team_override_pct pattern).
export class Migration20260701120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "card" add column if not exists "pc_product_id" text null, add column if not exists "pc_grade" text null, add column if not exists "market_multiplier" numeric not null default 1.2, add column if not exists "raw_market_multiplier" jsonb not null default '{"value":"1.2","precision":20}', add column if not exists "pc_synced_at" timestamptz null;`,
    );
    this.addSql(
      `create table if not exists "fx_rate" ("id" text not null, "pair" text not null, "rate" numeric not null, "source" text not null, "fetched_at" timestamptz null, "manual_override" boolean not null default false, "manual_rate" numeric null, "raw_rate" jsonb not null, "raw_manual_rate" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fx_rate_pkey" primary key ("id"));`,
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_fx_rate_pair_unique" ON "fx_rate" ("pair") WHERE deleted_at IS NULL;`,
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_fx_rate_deleted_at" ON "fx_rate" ("deleted_at") WHERE deleted_at IS NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fx_rate" cascade;`);
    this.addSql(
      `alter table if exists "card" drop column if exists "pc_product_id", drop column if exists "pc_grade", drop column if exists "market_multiplier", drop column if exists "raw_market_multiplier", drop column if exists "pc_synced_at";`,
    );
  }
}
