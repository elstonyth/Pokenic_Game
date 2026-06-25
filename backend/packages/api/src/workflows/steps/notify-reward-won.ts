import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { notifyFeed } from "../../modules/packs/notify-feed";
import type { DrawnPrize } from "./draw-prize";

export type NotifyRewardWonInput = {
  customer_id: string;
  status: "drawn" | "unavailable" | "capped";
  prize?: DrawnPrize;
  draw_ordinal?: number;
  draw_day?: string;
};

// notify-reward-won — best-effort feed notification for a successful reward-box
// draw. Runs after settleRewardDraw commits in the draw-reward-box workflow. A
// notification failure MUST NOT fail the workflow (the draw is already durable).
// No-ops silently for capped/unavailable results (no prize to announce).
export const notifyRewardWonStep = createStep(
  "notify-reward-won",
  async (input: NotifyRewardWonInput, { container }) => {
    if (input.status !== "drawn" || !input.prize) {
      return new StepResponse({ notified: false });
    }

    const prize = input.prize;
    const data: Record<string, unknown> = { prize_kind: prize.kind };
    if (prize.kind === "product") {
      data.title = prize.title;
    } else if (prize.kind === "credit") {
      data.amount_myr = prize.amount_myr;
    }

    // Idempotency key mirrors the partial-unique tuple on reward_draw:
    // (customer_id, draw_day, draw_ordinal) — a workflow retry emits exactly one
    // notification for a given draw row. draw_day comes from the committed DB row
    // (threaded from settleRewardDraw) so the key is stable across retries even if
    // the retry runs after midnight.
    const drawDay = input.draw_day ?? new Date().toISOString().slice(0, 10);
    const ordinal = input.draw_ordinal ?? 0;

    try {
      await notifyFeed(container, {
        receiverId: input.customer_id,
        template: "reward_won",
        data,
        idempotencyKey: `reward_won:${input.customer_id}:${drawDay}:${ordinal}`,
      });
    } catch {
      // Notification failure is non-fatal — the draw is already committed.
    }

    return new StepResponse({ notified: true });
  }
);

export default notifyRewardWonStep;
