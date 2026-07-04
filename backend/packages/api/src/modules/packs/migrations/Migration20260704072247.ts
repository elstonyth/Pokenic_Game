import { Migration } from '@medusajs/framework/mikro-orm/migrations';

export class Migration20260704072247 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );

    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings', 'daily_box', 'voucher_ladder'));`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_entity_type_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );

    // Lossy rollback: the old entity_type/action CHECKs have no 'daily_box' /
    // 'voucher_ladder' / 'edit_daily_box' / 'edit_voucher_ladder' members.
    // Rolling back the box/ladder admin-authoring feature necessarily discards
    // audit rows written with those values — the old schema cannot represent
    // them, and re-adding the narrower constraint would otherwise abort on
    // any feature-written row.
    this.addSql(
      `delete from "admin_action_audit" where "entity_type" in ('daily_box', 'voucher_ladder');`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_entity_type_check" check("entity_type" in ('customer', 'commission', 'rewards_settings', 'credit', 'reward_pool', 'daily_reward_settings'));`,
    );

    this.addSql(
      `delete from "admin_action_audit" where "action" in ('edit_daily_box', 'edit_voucher_ladder');`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings'));`,
    );
  }
}
