import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Partial unique index guaranteeing one CARD odds row per (pack, card). The
// reconcile diff (set-pack-members → applyPackMemberDiff) computes membership
// from a paged read; a missed page or a racing edit must never silently create
// a duplicate row that doubles a card's draw weight. Scoped to card_id NOT NULL
// so reward_box packs keep holding multiple null-card prize rows.
export class Migration20260713130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pack_odds_pack_card" ON "pack_odds" ("pack_id", "card_id") WHERE deleted_at IS NULL AND card_id IS NOT NULL;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "UQ_pack_odds_pack_card";`);
  }
}
