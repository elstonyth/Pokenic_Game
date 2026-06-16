import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { PACKS_MODULE } from "../../../../../modules/packs";
import type PacksModuleService from "../../../../../modules/packs/service";

// POST /store/pulls/:id/reveal — stamp the first-seen time for a pull so the
// 30s instant-sell window counts from the reveal, not the pull. Idempotent:
// only the first call stamps; later calls return the same deadline.
//
// AUTH + RATE LIMIT: registered in src/api/middlewares.ts (authenticate() then
// the pull-reveal limiter). The customer id comes ONLY from the verified token;
// ownership is enforced in revealPull (foreign/unknown pull ids 404).
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const customerId = req.auth_context.actor_id;
  const { id } = req.params;
  const packs = req.scope.resolve<PacksModuleService>(PACKS_MODULE);
  const result = await packs.revealPull(id, customerId);
  res.json(result);
}
