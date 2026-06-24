import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260624220240 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pull" add column if not exists "source" text check ("source" in ('pack', 'reward')) not null default 'pack';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pull" drop column if exists "source";`);
  }

}
