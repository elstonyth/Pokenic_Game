/**
 * backfill-recorded-pull-value.ts
 *
 * One-shot backfill for the Recorded Pull Value follow-up (spec 2026-07-19
 * Iteration 3): stamps `pull.recorded_value_usd` on pre-existing rows from the
 * CURRENT card values (FMV × multiplier) — the exact expression the
 * leaderboard/challenge aggregates fall back to for null rows, so running it
 * changes no displayed total; it only pins those rows against future
 * PriceCharting price syncs. New pulls are stamped at draw time by the
 * open-pack / open-batch workflows.
 *
 * Skips reward pulls (excluded from every pulled-value board) and pulls whose
 * card row is gone (their fallback contribution is 0/NULL either way).
 *
 * RUN (backend must be up):
 *   corepack yarn medusa exec ./src/scripts/backfill-recorded-pull-value.ts
 *
 * Run this in the SAME window as the deploy that ships the stamping code:
 * historical rows get pinned at whatever the cards are worth WHEN THIS RUNS,
 * so any price sync landing in the gap bakes post-sync prices into history.
 *
 * Idempotent: only rows with recorded_value_usd IS NULL are touched.
 */
import { ExecArgs } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import PacksModuleService from '../modules/packs/service';
import { PACKS_MODULE } from '../modules/packs';

export default async function backfillRecordedPullValue({
  container,
}: ExecArgs): Promise<void> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

  const stamped = await packs.backfillRecordedPullValues();
  logger.info(
    `[backfill-recorded-pull-value] Stamped ${stamped} pull row(s). Done.`,
  );
}
