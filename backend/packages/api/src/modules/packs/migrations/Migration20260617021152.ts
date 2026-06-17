import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260617021152 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "delivery_order_item" drop constraint if exists "delivery_order_item_order_pull_unique";`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_order_item_order_pull_unique" ON "delivery_order_item" ("delivery_order_id", "pull_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_delivery_order_item_order_pull_unique";`);
  }

}
