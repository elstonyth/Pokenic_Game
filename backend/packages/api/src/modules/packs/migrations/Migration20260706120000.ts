import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// site_settings singleton (slab-frame overlay URL) + widen admin_action_audit
// CHECKs to admit its edits: entity_type += 'site_settings', action +=
// 'edit_site_settings'. Appends to the current (post-Migration20260706000000)
// lists.
export class Migration20260706120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "site_settings" (
      "id" text not null,
      "slab_frame_url" text null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "site_settings_pkey" primary key ("id"),
      constraint "site_settings_singleton_id_check" check ("id" = 'global')
    );`);
    this.addSql(
      `create index if not exists "IDX_site_settings_deleted_at" on "site_settings" ("deleted_at") where deleted_at is null;`,
    );

    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx', 'site_settings'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );

    // Lossy rollback (same convention as Migration20260706000000): the prior
    // CHECK cannot represent 'site_settings' rows, so drop them first.
    this.addSql(
      `delete from "admin_action_audit" where "entity_type" = 'site_settings';`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder', 'fx'));`,
    );
    this.addSql(
      `delete from "admin_action_audit" where "action" = 'edit_site_settings';`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate'));`,
    );

    this.addSql(`drop table if exists "site_settings" cascade;`);
  }
}
