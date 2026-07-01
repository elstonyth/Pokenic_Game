import { model } from "@medusajs/framework/utils";

// FxRate — one row per currency pair (e.g. "USD_MYR") used to convert
// PriceCharting's raw USD price for display. `rate` is the last fetched
// value; `manual_override` lets an admin pin `manual_rate` instead (e.g. the
// upstream FX source is down or wrong) without losing the fetched history.
export const FxRate = model.define("fx_rate", {
  id: model.id().primaryKey(),
  pair: model.text().unique(),
  rate: model.bigNumber(),
  source: model.text(),
  fetched_at: model.dateTime().nullable(),
  manual_override: model.boolean().default(false),
  manual_rate: model.bigNumber().nullable(),
});

export default FxRate;
