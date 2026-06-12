import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Manual credit adjustments: operators can grant/refund/claw back credit from
// the support view. "adjustment" joins the reason check; the operator's note
// rides in the existing nullable "reference" column (gateway ref for top-ups,
// audit note here) — no new columns.
export class Migration20260612190000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`,
    );
    this.addSql(
      `alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup', 'pack_open', 'adjustment'));`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`,
    );

    // The pre-adjustment schema cannot represent adjustment rows: remove them
    // first or the tightened check below dies mid-rollback.
    this.addSql(
      `delete from "credit_transaction" where "reason" = 'adjustment';`,
    );

    this.addSql(
      `alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup', 'pack_open'));`,
    );
  }
}
