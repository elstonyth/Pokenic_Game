import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { deleteCardStep, type DeleteCardInput } from "./steps/delete-card";

// delete-card — unregister a gacha Card and its PackOdds membership. The
// inventory Product is KEPT (inventory-first model); Pull history is kept.
export const deleteCardWorkflow = createWorkflow(
  "delete-card",
  function (input: DeleteCardInput) {
    const result = deleteCardStep(input);
    return new WorkflowResponse(result);
  }
);

export default deleteCardWorkflow;
