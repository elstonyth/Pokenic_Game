import { Migration } from '@mikro-orm/migrations';

// DB hygiene (2026-07-07 audit LOW batch): the hourly maturity sweep + wallet
// next-unlock CTE filter commission on (status='pending', matures_at) — give
// them a partial index; drop the exact-duplicate reward_box.tier index (the
// unique() on tier already creates IDX_reward_box_tier_unique with the same
// predicate); add sign CHECKs so a negative weight can never corrupt a roll
// distribution.
export class Migration20260707140000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create index if not exists "IDX_commission_pending_matures_at" on "commission" ("matures_at") where (status = 'pending' and deleted_at is null);`,
    );
    this.addSql(`drop index if exists "IDX_reward_box_tier";`);
    this.addSql(
      `alter table if exists "pack_odds" add constraint "pack_odds_weight_nonneg" check (weight >= 0);`,
    );
    this.addSql(
      `alter table if exists "reward_box_prize" add constraint "reward_box_prize_weight_nonneg" check (weight >= 0);`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "reward_box_prize" drop constraint if exists "reward_box_prize_weight_nonneg";`,
    );
    this.addSql(
      `alter table if exists "pack_odds" drop constraint if exists "pack_odds_weight_nonneg";`,
    );
    this.addSql(
      `create index if not exists "IDX_reward_box_tier" on "reward_box" ("tier") where (deleted_at is null);`,
    );
    this.addSql(`drop index if exists "IDX_commission_pending_matures_at";`);
  }
}
