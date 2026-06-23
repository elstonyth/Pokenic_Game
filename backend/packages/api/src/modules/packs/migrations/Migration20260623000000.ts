import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Phase 3a — freeze state + admin audit tables.
export class Migration20260623000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "customer_account_state" ("id" text not null, "customer_id" text not null, "frozen" boolean not null default false, "cause" text check ("cause" in ('auto','manual')) null, "frozen_reason" text null, "frozen_by" text null, "frozen_at" timestamptz null, "unfrozen_at" timestamptz null, "unfreeze_cause" text check ("unfreeze_cause" in ('repaid','admin')) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "customer_account_state_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_account_state_customer_id_unique" ON "customer_account_state" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_customer_account_state_frozen" ON "customer_account_state" ("customer_id") WHERE frozen = true AND deleted_at IS NULL;`);

    this.addSql(`create table if not exists "admin_action_audit" ("id" text not null, "admin_id" text not null, "entity_type" text check ("entity_type" in ('customer','commission','rewards_settings','credit')) not null, "entity_id" text not null, "action" text check ("action" in ('freeze','unfreeze','reverse_commission','suspend_commission','unsuspend_commission','adjust_credit','edit_rewards_settings')) not null, "before" jsonb null, "after" jsonb null, "reason" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "admin_action_audit_pkey" primary key ("id"), constraint "admin_action_audit_reason_check" check (char_length(btrim("reason")) between 1 and 500));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_admin_action_audit_admin_id" ON "admin_action_audit" ("admin_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_admin_action_audit_entity" ON "admin_action_audit" ("entity_type","entity_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_admin_action_audit_created_at" ON "admin_action_audit" ("created_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    // Audit + freeze history is operator evidence — refuse to drop live rows.
    this.addSql(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "admin_action_audit" WHERE deleted_at IS NULL) THEN RAISE EXCEPTION 'refusing to drop admin_action_audit: % live rows exist', (SELECT count(*) FROM "admin_action_audit" WHERE deleted_at IS NULL); END IF; END $$;`);
    this.addSql(`drop table if exists "admin_action_audit" cascade;`);
    this.addSql(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "customer_account_state" WHERE deleted_at IS NULL) THEN RAISE EXCEPTION 'refusing to drop customer_account_state: % live rows exist', (SELECT count(*) FROM "customer_account_state" WHERE deleted_at IS NULL); END IF; END $$;`);
    this.addSql(`drop table if exists "customer_account_state" cascade;`);
  }
}
