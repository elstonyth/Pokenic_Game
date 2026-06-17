import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260616151508 extends Migration {

  override async up(): Promise<void> {
    // New tables
    this.addSql(`create table if not exists "delivery_order" ("id" text not null, "customer_id" text not null, "status" text check ("status" in ('requested', 'packing', 'shipped', 'delivered', 'canceled')) not null default 'requested', "ship_name" text not null, "ship_address_1" text not null, "ship_address_2" text null, "ship_city" text not null, "ship_province" text null, "ship_postal_code" text not null, "ship_country_code" text not null, "ship_phone" text null, "tracking_number" text null, "shipping_fee" numeric null, "shipped_at" timestamptz null, "delivered_at" timestamptz null, "raw_shipping_fee" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_deleted_at" ON "delivery_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_customer_id_created_at" ON "delivery_order" ("customer_id", "created_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_status" ON "delivery_order" ("status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "delivery_order_item" ("id" text not null, "delivery_order_id" text not null, "pull_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_order_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_item_deleted_at" ON "delivery_order_item" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_item_order_id" ON "delivery_order_item" ("delivery_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_order_item_pull_id" ON "delivery_order_item" ("pull_id") WHERE deleted_at IS NULL;`);

    // Widen the Pull status CHECK constraint (drop + recreate).
    this.addSql(`alter table if exists "pull" drop constraint if exists "pull_status_check";`);
    this.addSql(`alter table if exists "pull" add constraint "pull_status_check" check ("status" in ('vaulted', 'bought_back', 'delivering', 'delivered'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_order_item" cascade;`);
    this.addSql(`drop table if exists "delivery_order" cascade;`);

    // Narrow the constraint back; existing delivering/delivered rows would
    // violate it, so settle them to vaulted first (mirrors the reason-enum
    // down() pattern in Migration20260612002121).
    this.addSql(`alter table if exists "pull" drop constraint if exists "pull_status_check";`);
    this.addSql(`update "pull" set "status" = 'vaulted' where "status" in ('delivering', 'delivered');`);
    this.addSql(`alter table if exists "pull" add constraint "pull_status_check" check ("status" in ('vaulted', 'bought_back'));`);
  }

}
