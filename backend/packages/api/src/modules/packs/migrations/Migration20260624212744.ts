import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260624212744 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack_odds" add column if not exists "kind" text check ("kind" in ('product', 'credit', 'nothing')) null, add column if not exists "product_handle" text null, add column if not exists "credit_amount" numeric null, add column if not exists "raw_credit_amount" jsonb null;`);
    this.addSql(`alter table if exists "pack_odds" alter column "card_id" type text using ("card_id"::text);`);
    this.addSql(`alter table if exists "pack_odds" alter column "card_id" drop not null;`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" drop default;`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" type text using ("rarity"::text);`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" drop not null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pack_odds" drop column if exists "kind", drop column if exists "product_handle", drop column if exists "credit_amount", drop column if exists "raw_credit_amount";`);

    this.addSql(`alter table if exists "pack_odds" alter column "card_id" type text using ("card_id"::text);`);
    this.addSql(`alter table if exists "pack_odds" alter column "card_id" set not null;`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" type text using ("rarity"::text);`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" set default 'Common';`);
    this.addSql(`alter table if exists "pack_odds" alter column "rarity" set not null;`);
  }

}
