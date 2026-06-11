import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Two-tier buyback: vault_buyback_percent applies to sells from the vault
// (buyback_percent stays the instant/on-the-spot rate). Existing packs start
// with vault % = instant % (operator choice: no silent behavior change until
// each pack is edited in the admin).
export class Migration20260611061611 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "pack" add column if not exists "vault_buyback_percent" integer not null default 90;`);

    this.addSql(`update "pack" set "vault_buyback_percent" = "buyback_percent";`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "pack" drop column if exists "vault_buyback_percent";`);
  }

}
