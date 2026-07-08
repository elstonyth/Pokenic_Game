import { Migration } from '@mikro-orm/migrations';

// One-time data reconciliation (#4 — admin Stores → "House" shows Currency USD).
// The prod House (Mercur) seller was created before PR #54 (which added
// currency_code: 'myr' on create), so it kept Mercur's default 'usd'. Mercur's
// admin seller-update route deliberately excludes currency_code (create-only),
// so it can't be fixed via the API — this sets it at the DB.
//
// Idempotent + best-effort: guarded on the seller table existing, and the WHERE
// only touches a non-'myr' House seller — so a fresh install (already seeded
// 'myr') and a re-run are both no-ops.
export class Migration20260708140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      do $$
      begin
        if to_regclass('public.seller') is not null then
          update "seller" set "currency_code" = 'myr'
          where "handle" = 'house' and "currency_code" is distinct from 'myr';
        end if;
      end $$;
    `);
  }

  override async down(): Promise<void> {
    // No-op — we won't restore a stale 'usd' currency on the House seller.
  }
}
