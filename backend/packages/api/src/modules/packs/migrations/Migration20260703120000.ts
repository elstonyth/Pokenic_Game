import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Data fix: demote ACTIVE packs whose prize pool cannot be rolled (no card
// odds row with weight > 0) back to draft. Such packs render on the storefront
// and look spinnable, but every open fails with an opaque error. The
// activation guard (create/update-pack workflows) prevents new ones; this
// cleans up any already live. reward_box packs are internal draw pools whose
// odds rows carry card_id NULL by design — they are exempt.
export class Migration20260703120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `UPDATE "pack" p SET "status" = 'draft'
        WHERE p."status" = 'active'
          AND p."category" <> 'reward_box'
          AND p."deleted_at" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "pack_odds" o
             WHERE o."pack_id" = p."slug"
               AND o."deleted_at" IS NULL
               AND o."card_id" IS NOT NULL
               AND o."weight" > 0
          );`,
    );
  }

  override async down(): Promise<void> {
    // Irreversible data fix — the pre-migration status is not recorded, and
    // re-activating unopenable packs would reintroduce the bug.
  }
}
