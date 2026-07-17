import { Migration } from '@medusajs/framework/mikro-orm/migrations';

// Card.label_year / label_note — operator-editable graded-slab label fields
// (dynamic-label spec §8). Nullable + blank-by-default: a blank field renders
// nothing on the label, no layout shift.
export class Migration20260716150000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "card" add column if not exists "label_year" text null, add column if not exists "label_note" text null;`,
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "card" drop column if exists "label_year", drop column if exists "label_note";`,
    );
  }
}
