import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Card.slab_image / slab_image_key — the baked graded-slab composite
// (graded-slab baked image feature). Nullable: raw cards and not-yet-baked
// graded cards render the bare photo.
export class Migration20260707130000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "card" add column if not exists "slab_image" text null, add column if not exists "slab_image_key" text null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "card" drop column if exists "slab_image", drop column if exists "slab_image_key";`,
    );
  }
}
