import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Per-pack hero art: `display_image` is the wide pack-page stage render (the
// "factory" scene), separate from `image` (the pack shot used on tiles and in
// the selector). Nullable — packs without one keep falling back to `image`.
export class Migration20260714000000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack" add column if not exists "display_image" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pack" drop column if exists "display_image";`);
  }

}
