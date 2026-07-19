import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PACKS_MODULE } from "../../modules/packs";
import type PacksModuleService from "../../modules/packs/service";

type RecordPullInput = {
  customer_id: string;
  pack_id: string; // = Pack.slug
  card_id: string; // = Card.handle (the won card)
  recorded_value_usd: number; // draw-time USD pulled value snapshot (roll-pack)
};

// record-pull — the one mutation in the open-pack workflow: append a row to the
// Pull ledger. Compensated by delete, so if a LATER step throws (e.g. the future
// payment step that slots in before this one is reordered, or the event step
// fails) the orphaned Pull is rolled back. order_id is null until checkout is
// wired with payment; rolled_at is stamped at execution time (new Date() is fine
// inside a step — the load-time ban only applies to the composition body).
export const recordPullStep = createStep(
  "record-pull",
  async (input: RecordPullInput, { container }) => {
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);

    const [pull] = await packs.createPulls([
      {
        customer_id: input.customer_id,
        pack_id: input.pack_id,
        card_id: input.card_id,
        order_id: null,
        rolled_at: new Date(),
        recorded_value_usd: input.recorded_value_usd,
      },
    ]);

    return new StepResponse(pull, pull.id);
  },
  async (id, { container }) => {
    if (!id) return;
    const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
    await packs.deletePulls(id);
  }
);

export default recordPullStep;
