import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Top Hits: boolean flag → explicit display order (1 = leftmost on the pack
// page; null = not a Top Hit). Backfills existing flagged rows in the order
// the storefront used to render them (market value, high to low) so nothing
// visually reshuffles on deploy, then drops the flag column.
export class Migration20260706130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "pack_odds" add column if not exists "top_hit_order" integer null;`,
    );
    // Inner join is intentional: an odds row whose card is gone can't render
    // in Top Hits anyway, so it correctly ends up unordered. The deleted_at
    // filter keeps the row_number() deterministic if a soft-deleted card ever
    // shares a handle with a live one.
    this.addSql(`update "pack_odds" set "top_hit_order" = t."rn"
      from (
        select po."id", row_number() over (
          partition by po."pack_id"
          order by c."market_value" desc nulls last, po."id"
        ) as "rn"
        from "pack_odds" po
        join "card" c on c."handle" = po."card_id" and c."deleted_at" is null
        where po."top_hit" = true
      ) t
      where "pack_odds"."id" = t."id";`);
    this.addSql(
      `alter table if exists "pack_odds" drop column if exists "top_hit";`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "pack_odds" add column if not exists "top_hit" boolean not null default false;`,
    );
    this.addSql(
      `update "pack_odds" set "top_hit" = true where "top_hit_order" is not null;`,
    );
    this.addSql(
      `alter table if exists "pack_odds" drop column if exists "top_hit_order";`,
    );
  }
}
