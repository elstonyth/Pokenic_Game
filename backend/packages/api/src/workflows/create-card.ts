import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createCardStep, type RegisterCardInput } from "./steps/create-card";

// create-card — register an EXISTING inventory Product as a gacha Card (the
// product must be created in the catalog first; this only adds the gacha facts).
// Single compensated step today; the pure composition body leaves room to append
// an audit/event step without risking a half-applied create.
export const createCardWorkflow = createWorkflow(
  "create-card",
  function (input: RegisterCardInput) {
    const result = createCardStep(input);
    return new WorkflowResponse(result);
  }
);

export default createCardWorkflow;
