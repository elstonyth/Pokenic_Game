import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Pack opens charge the ledger (Task A2): "pack_open" joins the reason check
// (negative rows — the open-pack workflow's charge step).
export class Migration20260612002121 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`,
    );

    this.addSql(
      `alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup', 'pack_open'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`,
    );

    // The pre-A2 check cannot hold with pack_open rows present — remove them
    // first or the ADD CONSTRAINT below dies mid-rollback (same reasoning as
    // the topup migration's down()).
    this.addSql(
      `delete from "credit_transaction" where "reason" = 'pack_open';`,
    );

    this.addSql(
      `alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup'));`,
    );
  }
}
