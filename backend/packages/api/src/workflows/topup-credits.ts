import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  topUpCreditsStep,
  type TopUpCreditsInput,
} from "./steps/topup-credits";

// topup-credits — buy site credit through the (mock) payment gateway: charge
// the gateway, append a positive ledger row. Single compensated step; the
// pure composition body leaves room for a real-gateway capture/audit step.
export const topUpCreditsWorkflow = createWorkflow(
  "topup-credits",
  function (input: TopUpCreditsInput) {
    const result = topUpCreditsStep(input);
    return new WorkflowResponse(result);
  }
);

export default topUpCreditsWorkflow;
