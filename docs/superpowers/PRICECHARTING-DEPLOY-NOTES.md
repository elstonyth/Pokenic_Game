# PriceCharting live market-price — deploy notes

Prod deploy of this feature (Cards `pc_*` fields, `fx_rate` table, `sync-market-prices`
daily job) needs three things:

1. **Run the migration.** `medusa db:migrate` (adds the Card `pc_product_id` /
   `pc_grade` / `market_value` / etc. fields plus the new `fx_rate` table). Nothing
   in this feature works until this runs.
2. **Set `PRICECHARTING_API_TOKEN` in the backend env** (paid PriceCharting
   subscription token, the `t` query param — see
   `backend/packages/api/src/api/admin/pricecharting/client.ts`). This value must be
   **regenerated**, not reused — the token was previously shared in a chat transcript
   during spec review and should be treated as compromised. Never commit a real value;
   `.env.template` only documents the empty key.
3. **Optionally set `FX_USD_MYR_URL`** to override the USD→MYR feed (defaults to
   Frankfurter — see `fetchUsdMyr` in `backend/packages/api/src/modules/packs/pricing.ts`).

## Failure mode if the token is absent or wrong

- The `/admin/pricecharting/*` proxy routes (`search`, `product`) return `503` with
  a `PC_TOKEN_MISSING` message. The "Add from PriceCharting" admin page falls back to
  manual entry — it does not crash.
- The `sync-market-prices` daily job (`0 3 * * *`) no-ops per card it can't refresh and
  keeps the last-known `market_value` (see `refreshCardPrice` /
  `src/modules/packs/sync-market-prices.ts` — failures are logged and skipped, not
  thrown). FX refresh failure is handled the same way: keep the last-known rate.

## Image handling

Auto-pulling a product image from PriceCharting was investigated and rejected — see
Task 15 report. The Prices API returns no image field, and PriceCharting's public
product pages return `403` to generic fetchers. The "Add from PriceCharting" flow
stays **upload-only** (Task 10's image upload seam); no `/admin/pricecharting/image`
endpoint exists.
