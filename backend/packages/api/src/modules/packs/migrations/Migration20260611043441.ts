import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260611043441 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_pull_id_unique";`);
    this.addSql(`create table if not exists "credit_transaction" ("id" text not null, "customer_id" text not null, "amount" numeric not null, "reason" text check ("reason" in ('buyback')) not null, "pull_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "credit_transaction_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_credit_transaction_pull_id_unique" ON "credit_transaction" ("pull_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_credit_transaction_deleted_at" ON "credit_transaction" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "pull" add column if not exists "status" text check ("status" in ('vaulted', 'bought_back')) not null default 'vaulted', add column if not exists "buyback_amount" numeric null, add column if not exists "buyback_at" timestamptz null, add column if not exists "raw_buyback_amount" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "credit_transaction" cascade;`);

    this.addSql(`alter table if exists "pull" drop column if exists "status", drop column if exists "buyback_amount", drop column if exists "buyback_at", drop column if exists "raw_buyback_amount";`);
  }

}
