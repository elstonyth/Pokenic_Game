import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260619134056 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "card" add column if not exists "pokemon_dex" integer null, add column if not exists "sprite_image" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "card" drop column if exists "pokemon_dex", drop column if exists "sprite_image";`);
  }

}
