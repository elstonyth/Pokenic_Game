import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Credit top-ups (Task A1): the ledger gains gateway-backed rows. pull_id
// goes nullable (top-ups have no pull; the unique index keeps guarding
// buyback duplicates — Postgres ignores NULLs), "topup" joins the reason
// check, and "reference" stores the payment-gateway reference.
export class Migration20260611232039 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`);

    this.addSql(`alter table if exists "credit_transaction" add column if not exists "reference" text null;`);
    this.addSql(`alter table if exists "credit_transaction" alter column "pull_id" type text using ("pull_id"::text);`);
    this.addSql(`alter table if exists "credit_transaction" alter column "pull_id" drop not null;`);
    this.addSql(`alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`);

    // The pre-topup schema cannot represent topup rows (pull_id NOT NULL):
    // remove them first or the SET NOT NULL below dies mid-rollback.
    this.addSql(`delete from "credit_transaction" where "reason" = 'topup' or "pull_id" is null;`);

    this.addSql(`alter table if exists "credit_transaction" drop column if exists "reference";`);

    this.addSql(`alter table if exists "credit_transaction" alter column "pull_id" type text using ("pull_id"::text);`);
    this.addSql(`alter table if exists "credit_transaction" alter column "pull_id" set not null;`);
    this.addSql(`alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback'));`);
  }

}
