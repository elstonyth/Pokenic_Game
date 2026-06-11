import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { buybackPullWorkflow } from "../../../../../workflows/buyback-pull";

// POST /store/vault/:id/buyback — instant sell-back of a vaulted pull: credits
// the customer current-FMV × the pack's buyback %, flips the pull to
// bought_back, and returns the physical unit to stock.
//
// AUTH + RATE LIMIT: registered in src/api/middlewares.ts (authenticate() then
// the vault-buyback limiter). The customer id comes ONLY from the verified
// token; ownership is enforced in the workflow (foreign pull ids 404). The
// once-only guarantee is DB-enforced (unique credit per pull), so retries and
// double-clicks are safe.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;

  const { result } = await buybackPullWorkflow(req.scope).run({
    input: { pull_id: id, customer_id: customerId },
  });

  res.json(result);
}
