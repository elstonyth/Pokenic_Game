import { defineMiddlewares, authenticate } from "@medusajs/framework/http";
import { createPackOpenRateLimit } from "./utils/rate-limit";

// Custom-route middleware. /store/* is NOT a default customer-protected prefix
// (only /store/customers/me/* is), so the open-pack route must opt in to customer
// auth explicitly. The matcher targets only the `/open` sub-path so the public,
// publishable-key-scoped GET /store/packs/:slug (5a detail) and GET /store/packs
// (catalog) stay anonymous — verified by the middleware-regression probe.
//
// The rate limiter MUST stay after authenticate(): the array order is the
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
  ],
});
