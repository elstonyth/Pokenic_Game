import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Move rarity from Card to PackOdds: rarity is a property of the pack↔card link
// (the same card can be a different tier in different packs), not of the card.
// Order matters — pack_odds.rarity is backfilled from card.rarity BEFORE the
// card column is dropped, so existing pools keep their tiers.
export class Migration20260611031134 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack_odds" add column if not exists "rarity" text check ("rarity" in ('Legendary', 'Epic', 'Rare', 'Uncommon', 'Common')) not null default 'Common';`);

    this.addSql(`update "pack_odds" set "rarity" = c."rarity" from "card" c where c."handle" = "pack_odds"."card_id";`);

    this.addSql(`alter table if exists "card" drop column if exists "rarity";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "card" add column if not exists "rarity" text check ("rarity" in ('Legendary', 'Epic', 'Rare', 'Uncommon', 'Common')) not null default 'Common';`);

    // Best-effort restore: a card takes its rarity from one of its odds rows.
    this.addSql(`update "card" set "rarity" = po."rarity" from (select distinct on ("card_id") "card_id", "rarity" from "pack_odds" order by "card_id", "updated_at" desc) po where po."card_id" = "card"."handle";`);

    this.addSql(`alter table if exists "pack_odds" drop column if exists "rarity";`);
  }

}
