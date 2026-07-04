import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260704064454 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "reward_box" drop constraint if exists "reward_box_tier_unique";`);
    this.addSql(`create table if not exists "reward_box" ("id" text not null, "tier" text not null, "name" text not null default '', "enabled" boolean not null default false, "draws_per_day" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "reward_box_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_reward_box_tier_unique" ON "reward_box" ("tier") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reward_box_deleted_at" ON "reward_box" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reward_box_tier" ON "reward_box" ("tier") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "reward_box_prize" ("id" text not null, "box_id" text not null, "kind" text check ("kind" in ('credit', 'product', 'voucher', 'nothing')) not null, "payload" jsonb not null, "weight" integer not null, "locked" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "reward_box_prize_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reward_box_prize_deleted_at" ON "reward_box_prize" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_reward_box_prize_box" ON "reward_box_prize" ("box_id") WHERE deleted_at IS NULL;`);

    for (const tier of ['a','b','c','d','e','f','g','h','i','j','Z']) {
      this.addSql(`insert into "reward_box" ("id","tier","name","enabled","draws_per_day","created_at","updated_at")
        values ('rbox_${tier}','${tier}','','false','1',now(),now())
        on conflict do nothing;`);
    }
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "reward_box" cascade;`);

    this.addSql(`drop table if exists "reward_box_prize" cascade;`);
  }

}
