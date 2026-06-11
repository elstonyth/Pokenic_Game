import { defineMiddlewares, authenticate } from "@medusajs/framework/http";
import {
  createPackOpenRateLimit,
  createVaultBuybackRateLimit,
} from "./utils/rate-limit";

// Custom-route middleware. /store/* is NOT a default customer-protected prefix
// (only /store/customers/me/* is), so every customer-owned route here must opt
// in to auth explicitly. Matchers stay narrow so the public, publishable-key-
// scoped GET /store/packs[/:slug] (catalog/detail) stay anonymous — verified by
// the middleware-regression probe.
//
// Rate limiters MUST stay after authenticate(): the array order is the
// execution order, so auth_context.actor_id is populated for keying, and
// unauthenticated requests are rejected with 401 before consuming any budget.
export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/packs/*/open",
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        createPackOpenRateLimit(),
      ],
    },
    {
      // The customer's vault list (GET /store/vault).
      matcher: "/store/vault",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      // Instant sell-back (POST /store/vault/:id/buyback).
      matcher: "/store/vault/*/buyback",
      middlewares: [
        authenticate("customer", ["session", "bearer"]),
        createVaultBuybackRateLimit(),
      ],
    },
    {
      // Credit balance + ledger (GET /store/credits).
      matcher: "/store/credits",
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
  ],
});
