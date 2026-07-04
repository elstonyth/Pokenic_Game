import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260704070016 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reward_draw" drop constraint if exists "reward_draw_prize_kind_check";`);
    this.addSql(`alter table if exists "reward_draw" add constraint "reward_draw_prize_kind_check" check ("prize_kind" in ('product','credit','voucher','nothing'));`);
    this.addSql(`alter table if exists "reward_draw" add column if not exists "odds_snapshot" jsonb null;`);

    this.addSql(`alter table if exists "vip_reward_grant" add column if not exists "origin" text check ("origin" in ('ladder', 'box')) not null default 'ladder';`);

    this.addSql(`drop index if exists "UQ_vip_reward_grant_customer_level_kind";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vip_reward_grant_customer_level_kind" ON "vip_reward_grant" (customer_id, level, kind) WHERE deleted_at IS NULL AND origin = 'ladder';`);
  }

  override async down(): Promise<void> {
    // Lossy rollback: the old unscoped unique index (customer_id, level, kind)
    // cannot coexist with box-origin grants, which legitimately duplicate that
    // key (e.g. two same-day voucher wins). Rolling back the box feature
    // necessarily discards box-created grants — the old schema has no column
    // to hold them.
    this.addSql(`delete from "vip_reward_grant" where "origin" = 'box';`);
    this.addSql(`drop index if exists "UQ_vip_reward_grant_customer_level_kind";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_vip_reward_grant_customer_level_kind" ON "vip_reward_grant" (customer_id, level, kind) WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vip_reward_grant" drop column if exists "origin";`);

    // Lossy rollback: the old prize_kind check ('product','credit','nothing')
    // has no 'voucher' member. Rolling back the box feature necessarily
    // discards voucher draws — the old schema cannot represent them.
    this.addSql(`delete from "reward_draw" where "prize_kind" = 'voucher';`);
    this.addSql(`alter table if exists "reward_draw" drop constraint if exists "reward_draw_prize_kind_check";`);
    this.addSql(`alter table if exists "reward_draw" drop column if exists "odds_snapshot";`);
    this.addSql(`alter table if exists "reward_draw" add constraint "reward_draw_prize_kind_check" check ("prize_kind" in ('product','credit','nothing'));`);
  }

}
