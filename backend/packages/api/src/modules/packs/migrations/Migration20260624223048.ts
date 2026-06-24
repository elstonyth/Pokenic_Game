import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260624223048 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "delivery_order" add column if not exists "is_reward" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "delivery_order" drop column if exists "is_reward";`);
  }

}
