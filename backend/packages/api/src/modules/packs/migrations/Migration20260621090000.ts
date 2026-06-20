import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20260621090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "vip_level" (
      "id" text not null,
      "level" integer not null,
      "spend_threshold" numeric not null,
      "raw_spend_threshold" jsonb not null,
      "voucher_amount" numeric not null,
      "raw_voucher_amount" jsonb not null,
      "box_tier" text not null,
      "frame_unlock" boolean not null default false,
      "direct_referral_pct" integer not null,
      "prizes" jsonb null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "vip_level_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "IDX_vip_level_level" on "vip_level" ("level") where deleted_at is null;`,
    );
    this.addSql(
      `create index if not exists "IDX_vip_level_deleted_at" on "vip_level" ("deleted_at") where deleted_at is null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vip_level" cascade;`);
  }
}
