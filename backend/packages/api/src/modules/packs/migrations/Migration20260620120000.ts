import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Add the `Immortal` apex tier to pack_odds.rarity. The column is text with a
// CHECK constraint (Postgres auto-names an unnamed column check
// `<table>_<column>_check`), so widening the allowed set = swap the constraint.
// No data change: existing rows keep their rarity; `Immortal` becomes selectable.
export class Migration20260620120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack_odds" drop constraint if exists "pack_odds_rarity_check";`);
    this.addSql(`alter table if exists "pack_odds" add constraint "pack_odds_rarity_check" check ("rarity" in ('Immortal', 'Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'));`);
  }

  override async down(): Promise<void> {
    // Revert to the 5-tier set. Any row left at 'Immortal' would violate the old
    // constraint, so settle those back to 'Legendary' (the next-rarest) first.
    this.addSql(`update "pack_odds" set "rarity" = 'Legendary' where "rarity" = 'Immortal';`);
    this.addSql(`alter table if exists "pack_odds" drop constraint if exists "pack_odds_rarity_check";`);
    this.addSql(`alter table if exists "pack_odds" add constraint "pack_odds_rarity_check" check ("rarity" in ('Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'));`);
  }

}
