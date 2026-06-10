# Gap-Closure Kickoff — branch `feat/gap-closure`

> Written 2026-06-10 after the housekeeping pass (tree clean, all branches pushed,
> stash rescued + archived as tag `archive/stash-epitaxy-2026-06-10`). This worktree
> (`Pokenic_Game-gap-closure`, branched from `clone/phygitals-v2` @ `8a7a772`) batches
> the remaining verified-open items. Every claim below was code-verified on 2026-06-10
> by a 5-agent audit — trust this brief over older docs (HANDOFF.md is stale).

## Worktree environment rules (read first)

- **Shared infra with the main checkout** (`C:\Users\PC\Desktop\Projects\Pokenic_Game`):
  Docker `pokenic-postgres` (PG16) + `pokenic-redis` (R7), and usually a running
  backend on **:9000** and prod storefront on **:4000** started from the MAIN checkout.
  **Do NOT start a second backend on :9000.** Reuse the running one, or stop it by PID
  first (`Get-NetTCPConnection -LocalPort 9000`). The DB is shared — seeds/data changes
  affect both checkouts.
- **Storefront verification in THIS worktree: use port :4100** (avoid clashing with the
  main checkout's :4000): `npm run build` then `npx next start -p 4100`. Never verify
  against `next dev` (slow images make a correct build look broken). `:3000` is occupied
  by an unrelated Docker container — never use it.
- Verify with **Playwright scripts in `scripts/*.mjs`, not Chrome MCP**. Screenshots go
  to `docs/research/`. Kill node **by PID only**, never `Get-Process node | Stop-Process`
  (it kills the backend too).
- `.env.local` (root) and `backend/packages/api/.env` were copied from the main checkout
  (gitignored — never commit them). `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` lives in
  `.env.local`; `/store/*` 400s without it.
- Quality gates: storefront `npm run check`; backend `corepack yarn build` from
  `backend/` (turbo; `medusa develop` is transpile-only and proves nothing).

---

## Task 1 — Rate-limit `POST /store/packs/[slug]/open` (backend, highest value)

**Gap (verified):** the route handler
(`backend/packages/api/src/api/store/packs/[slug]/open/route.ts`) runs
`openPackWorkflow` directly; the only middleware is
`authenticate("customer", ["session","bearer"])` on matcher `'/store/packs/*/open'` in
`backend/packages/api/src/api/middlewares.ts`. Zero throttling anywhere in the package
— an authenticated customer can hammer unlimited free pulls (compounded by the empty
PAYMENT SEAM in `src/workflows/open-pack.ts:29-35`; no inventory decrement either).

**Approach:**
- Key on `req.auth_context.actor_id` (the handler already trusts only this, never the
  body — verified sound). Sliding-window or token-bucket per customer (e.g. N opens/min
  + a burst cap), Redis-backed (`pokenic-redis` is already in the stack) so it survives
  restarts and multiple workers. Optional per-IP fallback for defense in depth.
- Wire it as an additional middleware on the existing `'/store/packs/*/open'` matcher.
  Return **429** with a Retry-After header.
- Search-first (repo rule): check what Medusa v2 / Mercur already ship for rate limiting
  before hand-rolling (e.g. an express-rate-limit-compatible layer in the middlewares
  chain).

**Verify:** `corepack yarn build` green → run backend → curl the open endpoint with a
session AND a bearer token: expect 200s up to the limit, then 429, then recovery after
the window. Confirm the storefront pack-open flow on :4100 still works under the limit.
TDD per repo rules — this is genuine backend logic (integration test of the middleware).

---

## Task 2 — Diff the ~16 never-audited routes against live

**Routes never compared to live** (from `docs/research/AUDIT_PUNCHLIST.md` "NOT YET
DIFFED", paused at a cost cap on 2026-06-07): `/contact`, `/series`, `/30th`, `/free`,
`/lucky-draw`, `/roulette`, `/clawmaker`, `/airdrop`, `/social`, `/orders`, `/messages`,
`/earnings`, `/referrals`, `/pokecoin`, `/nbacoin`, `/accelerate-claim`,
`/pokemon/generation/1`.

**Tooling (restored in commit `fc4bdbf` — it was stranded in a stash):**
`scripts/capture-live.mjs`, `scripts/capture-audit.mjs`, `scripts/route-qa.mjs`,
`scripts/audit-triage.mjs`. Output format examples:
`docs/research/audit/manifest-live.json`, `docs/research/route-qa/manifest.json`,
`docs/research/route-qa/VALIDATION_REPORT.md`.

**Process (same as the 2026-06-07 audit):**
1. Capture live + clone at 390/1440/3840 per route →
   `docs/research/audit/shots/<route>/{live,clone}-<bp>.png`.
   Live-site gotcha: the live page scrolls inside `main.overflow-y-auto`, not the body.
2. Triage each diff: BLOCKER / MAJOR / MINOR / match — measure computed styles, don't
   eyeball thumbnails (three "obvious" gaps were false under `getComputedStyle` last time).
3. Fix real gaps; record every disposition in `docs/research/AUDIT_PUNCHLIST.md`
   (including "claim STALE, no change" entries — they prevent re-audits).
4. Account-gated routes (`/orders`, `/messages`, `/earnings`, `/referrals`): live likely
   shows an auth wall anonymously — match THAT view, don't fabricate content (precedent:
   the `/fairness` fix).

Note: live buyback drift (85→90%) and the two missing baseball packs
(`platinum-baseball-pack`, `mythic-baseball-pack`) are tracked in the punchlist under
catalog/copy — fold them in here if touching those pages.

---

## Task 3 — Smaller items (independent, pick off in any order)

### 3a. Wordmark realism on claw banners
User feedback: the baked "pokenic" banner "looks flat/cheap" vs the plate's
printed/embossed material. Use the **`claw-rebrand` skill** (measurement-driven
pipeline — `scripts/rebrand_*.mjs`, `make_patch.py`, `rebake_ff.mjs`); machines live in
`public/images/claw/`. Bump `CLAW_REV` in `src/app/claw/packs-data.ts` after ANY pixel
change (filenames are stable → browsers cache stale images). Skill lessons: mask
strokes not blocks; measure positions from row-profiles, never eyeball; per-banner text
colour varies.

### 3b. Marketplace card height re-measure
`src/app/marketplace/MarketplaceClient.tsx:192` image area is `aspect-[3/4]`, last
touched 2026-06-05 and never re-measured against live (the 2026-06-08 fix only changed
grid gap to 16px). Measure the live card's computed aspect/height first; only change if
the numbers disagree. While there: the deferred low-confidence claims (slab-vs-raw card
art, mobile floating cart/scroll buttons) can be confirmed or dispositioned.

### 3c. Sealed $100 + Base Set $500 out-of-stock Pokémon tiers
Live `/claw` shows 3 out-of-stock pokemon tiers; clone has only Trainer $10
(`pokemon-trainer`, `inStock: false` in `src/app/claw/packs-data.ts` ~line 62 — that's
the pattern to copy). Add `pokemon-sealed` ($100) and `pokemon-base-set` ($500) entries
+ icons, and reseed the backend rows with `in_stock: false` (fields exist since
`Migration20260609112655`; reseed precedent: Black/Diamond/Trainer). Pool note: seed
skips packs that already have odds; out-of-stock packs may stay draft/odds-less.

### 3d. Stale-docs cleanup
- `docs/HANDOFF.md`: its ACTIVE TASK block (hero pack lowered; 4-step HowItWorks) is
  **debunked** — the punchlist explicitly says "do not chase it." Stamp a SUPERSEDED
  banner at the top pointing to `docs/research/AUDIT_PUNCHLIST.md` +
  `docs/research/RECLONE_KICKOFF.md`; keep the still-valid server/verify instructions.
- `docs/SECTION_REVIEW_PLAN.md`: all 14 checkboxes unchecked but the work was covered
  by the audit + motion passes. Stamp SUPERSEDED similarly (don't silently delete).

### 3e. Prod secrets/CORS checklist — ONLY if deploying (from `docs/note.md`)
- Rotate `JWT_SECRET` / `COOKIE_SECRET` in `backend/packages/api/.env` (both currently
  `supersecret`).
- `STORE_CORS`/`AUTH_CORS`/`ADMIN_CORS`/`VENDOR_CORS` are localhost(+VPN-IP)-only — set
  real origins.
- Confirm `NODE_ENV=production` so the `_pokenic_jwt` cookie gets `Secure`; consider
  rate-limiting the auth endpoints (none exist — Task 1's limiter can be reused).
- Stubbed auth (Google/Discord buttons, "Forgot password?") and the mock-data public
  profiles need ship/no-ship decisions.

---

## Done criteria

- `npm run check` green (storefront) + `corepack yarn build` green (backend).
- Every route disposition recorded in `AUDIT_PUNCHLIST.md`.
- One conventional commit per task (`fix(api): rate-limit pack opens`,
  `docs(research): route audit wave 2`, …); push `feat/gap-closure` and PR into
  `clone/phygitals-v2` (NOT master).
