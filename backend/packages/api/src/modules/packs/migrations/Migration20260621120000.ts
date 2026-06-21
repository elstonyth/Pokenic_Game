import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Phase 1b — external-funded spend basis. Adds a signed integer-sen column to
// the credit ledger: top-up rows store +external_in, pack_open rows store the
// −external_consumed snapshot, buyback/adjustment store 0. NULL on existing
// rows (forward-only; read as 0). Additive + nullable = online-safe on the live
// money table (no rewrite, no lock beyond the brief catalog update).
export class Migration20260621120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "credit_transaction" add column if not exists "external_funded_cents" integer null;`,
    );
  }

  override async down(): Promise<void> {
    // Pure additive column — safe to drop on rollback (no money history lost;
    // the signed amounts that ARE money live in the untouched "amount" column).
    this.addSql(
      `alter table if exists "credit_transaction" drop column if exists "external_funded_cents";`,
    );
  }
}
