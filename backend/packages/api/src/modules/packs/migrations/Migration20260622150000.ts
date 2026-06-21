import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Phase 2a — the sponsor tree. customer_id unique (one sponsor per recruit);
// sponsor_id indexed for the upline walk. Acyclic + no-self-referral are enforced
// at write time in linkSponsor (a CHECK can't express recursion).
export class Migration20260622150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "referral_relationship" drop constraint if exists "referral_relationship_customer_id_unique";`,
    );
    this.addSql(`create table if not exists "referral_relationship" (
      "id" text not null,
      "customer_id" text not null,
      "sponsor_id" text not null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "referral_relationship_pkey" primary key ("id")
    );`);
    this.addSql(
      `create unique index if not exists "IDX_referral_relationship_customer_id_unique" on "referral_relationship" ("customer_id") where deleted_at is null;`,
    );
    this.addSql(
      `create index if not exists "IDX_referral_relationship_deleted_at" on "referral_relationship" ("deleted_at") where deleted_at is null;`,
    );
    this.addSql(
      `create index if not exists "IDX_referral_relationship_sponsor_id" on "referral_relationship" ("sponsor_id") where deleted_at is null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "referral_relationship" cascade;`);
  }
}
