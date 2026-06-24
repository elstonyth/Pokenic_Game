import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260624221128 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`);

    this.addSql(`alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup', 'pack_open', 'adjustment', 'direct_referral', 'team_override', 'commission_reversal', 'cashout', 'voucher_claim', 'reward_credit'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "credit_transaction" drop constraint if exists "credit_transaction_reason_check";`);

    this.addSql(`alter table if exists "credit_transaction" add constraint "credit_transaction_reason_check" check("reason" in ('buyback', 'topup', 'pack_open', 'adjustment', 'direct_referral', 'team_override', 'commission_reversal', 'cashout'));`);
  }

}
