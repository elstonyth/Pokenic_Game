import { Migration } from '@mikro-orm/migrations';

// Avatar-frame catalog on the site_settings singleton:
// {"10": "<url>", ..., "100": "<url>"} — admin-authored, storefront-public.
// Also widens admin_action_audit's action CHECK to admit 'edit_avatar_frames'
// (same discipline as Migration20260706120000's 'edit_site_settings' add —
// entity_type stays 'site_settings', already whitelisted, so only action
// needs widening here). Appends to the current (post-Migration20260706120000)
// list.
export class Migration20260707000000 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      `alter table if exists "site_settings" add column if not exists "avatar_frames" jsonb null;`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings', 'edit_avatar_frames'));`,
    );
  }

  async down(): Promise<void> {
    this.addSql(
      `alter table if exists "admin_action_audit" drop constraint if exists "admin_action_audit_action_check";`,
    );
    // Lossy rollback (same convention as Migration20260706120000): the prior
    // CHECK cannot represent 'edit_avatar_frames' rows, so drop them first.
    this.addSql(
      `delete from "admin_action_audit" where "action" = 'edit_avatar_frames';`,
    );
    this.addSql(
      `alter table if exists "admin_action_audit" add constraint "admin_action_audit_action_check" check("action" in ('freeze', 'unfreeze', 'reverse_commission', 'suspend_commission', 'unsuspend_commission', 'adjust_credit', 'edit_rewards_settings', 'edit_reward_pool', 'edit_daily_reward_settings', 'edit_daily_box', 'edit_voucher_ladder', 'edit_fx_rate', 'edit_site_settings'));`,
    );
    this.addSql(
      `alter table if exists "site_settings" drop column if exists "avatar_frames";`,
    );
  }
}
