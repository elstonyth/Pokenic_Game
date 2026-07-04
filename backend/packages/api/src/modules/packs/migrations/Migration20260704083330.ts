import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260704083330 extends Migration {

  override async up(): Promise<void> {
    // Task 7 — delete the legacy backend (7-day streak, reward pools, the
    // pack-backed box draw). The replacement (reward_box/reward_box_prize +
    // getDailyState/drawDailyBox, Tasks 1-6) is the sole daily-rewards path.

    // Old reward-box packs and their odds are dead data once the new
    // reward_box/reward_box_prize model serves draws (drawDailyBox never reads
    // Pack/PackOdds). IRREVERSIBLE — down() does not restore these rows.
    this.addSql(`delete from "pack_odds" where "pack_id" in (select "id" from "pack" where "category" = 'reward_box');`);
    this.addSql(`delete from "pack" where "category" = 'reward_box';`);

    this.addSql(`drop table if exists "daily_claim" cascade;`);

    this.addSql(`drop table if exists "daily_reward_settings" cascade;`);
  }

  override async down(): Promise<void> {
    // NOTE: the reward_box-category pack + pack_odds deletes in up() are NOT
    // reversed here — that data is gone for good. down() only restores the two
    // dropped tables' shape (empty), matching the original migrations that
    // created daily_claim/daily_reward_settings.
    this.addSql(`create table if not exists "daily_claim" ("id" text not null, "customer_id" text not null, "claim_day" text not null, "streak_day" integer not null, "amount" numeric not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "daily_claim_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_daily_claim_deleted_at" ON "daily_claim" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_daily_claim_customer_day" ON "daily_claim" ("customer_id", "claim_day") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "daily_reward_settings" ("id" text not null, "enabled" boolean not null default true, "amounts" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "daily_reward_settings_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_daily_reward_settings_deleted_at" ON "daily_reward_settings" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

}
