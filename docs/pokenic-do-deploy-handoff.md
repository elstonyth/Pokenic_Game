# Pokenic — DigitalOcean App Platform Deploy Handoff

> **Status:** T1 + T3a DONE & VERIFIED (preflight PASSED, see §7); T2 pending decisions.
> Reconstructed from the **live DO specs** + `Dockerfile` / `backend/Dockerfile`,
> which is the real source of truth — there was no checked-in app spec.
>
> **Goal:** make deploys *faster* (build/push time) and *smoother* (stop the
> push-to-debug loop). Authored 2026-06-14, branch `feat/do-app-platform-deploy`.

---

## 1. Current state (live, from `doctl apps spec get`)

Two **separate** App Platform apps, region `sgp`, both `deploy_on_push: true` on
branch `feat/do-app-platform-deploy`, repo `elstonyth/Pokenic_Game`.

### `pokenic-storefront` — `a3625ff4-64b3-41e8-8677-d08b65b9bbba`
- Ingress: `https://pokenic-storefront-ijfiu.ondigitalocean.app`
- 1 service `storefront`, root `Dockerfile` (Next standalone), `basic-xxs`, port 3000.
- Envs (RUN_AND_BUILD_TIME): `NODE_ENV=production`,
  `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://pokenic-backend-tltfm.ondigitalocean.app` (hardcoded),
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_…` (hardcoded).

### `pokenic-backend` — `9011b06c-9908-4223-bf64-f96f66d702fa`
- Ingress: `https://pokenic-backend-tltfm.ondigitalocean.app`
- Managed DBs (production): `pokenic-pg` (PG), `pokenic-valkey` (REDIS).
- **Three** components, **all** `dockerfile_path: backend/Dockerfile`, `source_dir: backend`:
  - **job `migrate`** — `PRE_DEPLOY`, `basic-xxs`, `run_command: corepack yarn medusa db:migrate`.
  - **service `backend`** — `:9000`, `basic-xs`, health `/health`, `MEDUSA_WORKER_MODE=server`.
  - **worker `worker`** — `basic-xxs`, `MEDUSA_WORKER_MODE=worker`, `run_command: corepack yarn start`.
- Secret envs: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET` (DO `EV[…]` encrypted).
- CORS: `ADMIN_CORS`/`AUTH_CORS`/`VENDOR_CORS=${APP_URL}`,
  `STORE_CORS=https://pokenic-storefront-ijfiu.ondigitalocean.app`.

Admin + vendor dashboards are **served by the backend image** (medusa-config
`appDir → apps/*/dist`), not separate components — this is why the backend
Dockerfile must ship the whole monorepo (see `backend/Dockerfile:1-10`).

---

## 2. Root causes of slow + painful

| # | Problem | Evidence | Cost |
|---|---------|----------|------|
| 1 | **Same fat image built 3×/deploy** — `migrate` + `backend` + `worker` each carry their own `dockerfile_path`; App Platform builds per-component | live backend spec (3 components, same Dockerfile) | biggest raw build-time sink |
| 2 | **Backend runtime = whole monorepo** (node_modules + `.medusa` + `apps/*/dist` + sources) | `backend/Dockerfile:63-66` + its own `TODO(optimize)` | slow build/push/cold-start, large image |
| 3 | **No IaC** — specs live only in DO; every fix is a blind push | the 10 `fix(deploy):` commits `88790ea..ef650ce` are this loop | hours of round-trips |
| 4 | **Slow feedback loop** — redis-nesting, self-signed CA, vite-base, blank-dashboard all surfaced only AFTER a full cloud deploy; repo `docker-compose.yml` covers storefront-dev only | commits `03f5b00`, `e94b16f`, `fc9578d`, `bd4d396` | each bug = one ~5–10 min cloud cycle |
| 5 | **Hardcoded cross-refs** — backend URL baked as `backend/Dockerfile:45` ARG *and* in storefront spec; vite base hardcoded | `backend/Dockerfile:39-46` | brittle on any domain change |

The headline: **#3 + #4 turned a handful of config bugs into ten
commit→cloud-build cycles.** Fixing the feedback loop is worth more than any
single config fix.

---

## 3. The plan (Tier 1 → 3, in rollout order)

### Tier 1 — stop the bleeding (fixes #3, #4) — DO FIRST

**1a. Commit the live specs as IaC.**
```bash
mkdir -p .do
doctl apps spec get 9011b06c-9908-4223-bf64-f96f66d702fa > .do/backend.app.yaml
doctl apps spec get a3625ff4-64b3-41e8-8677-d08b65b9bbba > .do/storefront.app.yaml
```
- Replace the `EV[…]` secret blobs with `type: SECRET` + a placeholder, and keep
  real values out of git (set once via the DO UI / `doctl`, or a `${VAR}` ref).
  The publishable key is publishable — fine to leave inline.
- From now on, change config by editing the yaml and:
  ```bash
  doctl apps update <APP_ID> --spec .do/backend.app.yaml
  ```
  No more UI drift; the spec is reviewable in PRs.

**1b. Prod-parity local stack — `docker-compose.prod.yml`.**
- Build **both prod Dockerfiles** (root `Dockerfile`, `backend/Dockerfile`)
  against a local `postgres` + `valkey`/`redis`, with the **same env shape** as
  the live spec (`DATABASE_URL`, `REDIS_URL`, `*_CORS`, `MEDUSA_WORKER_MODE`).
- Run `migrate` → `backend` → `worker` → `storefront` locally; hit
  `:9000/health`, `:9000/dashboard`, `:9000/seller`, storefront `:3000`.
- This catches the entire class of bugs that cost the 10 commits (redis options
  shape, self-signed CA handling, vite base 404s, blank dashboards, admin
  creation) in ~60s instead of a cloud round-trip.
- Add a `scripts/preflight.ps1` (or npm script) that builds + boots the prod
  compose and curls the health endpoints — run it before every push.

> Note: the self-signed-CA + redis-nesting fixes (`03f5b00`, `e94b16f`) are
> already committed and correct; prod-parity just prevents the *next* one.

### Tier 2 — faster builds (fixes #1, #2)

**2a. Build the backend image ONCE → DOCR → reference by `image:`.**
- Create a DOCR repo, build `backend/Dockerfile` once (CI or local), push a
  tagged image.
- Change all three backend components from `dockerfile_path: backend/Dockerfile`
  to `image: { registry_type: DOCR, repository: …, tag: … }`.
- Eliminates the 3× redundant build and decouples build from deploy (deploy =
  pull, not rebuild). Biggest single speed win.
- Trade-off: lose `deploy_on_push` auto-build; you now build+push deliberately
  (a GitHub Action on the branch is the clean version).

**2b. Slim the backend runtime image.**
- Current runtime copies the **entire** builder stage (`backend/Dockerfile:66`).
- Prune to what runtime needs: production deps (`yarn workspaces focus
  --production` or equivalent), `packages/api/.medusa`, `apps/{admin,vendor}/dist`,
  and the medusa-config + sources the running server resolves.
- **Constraint — verify, don't guess:** medusa-config resolves dashboards via
  `appDir: __dirname/../../apps/*` (see `backend/Dockerfile:5-10`). Whatever you
  prune, `medusa start` must still serve `/dashboard` + `/seller`. Validate with
  the Tier-1 prod compose **before** pushing.
- Drop from runtime: build toolchain (`python3 make g++` — already builder-only),
  `.git`, test files, source maps. Smaller image = faster push/pull/cold-start.

### Tier 3 — de-brittle cross-refs (fixes #5)

- **Backend URL:** remove the hardcoded default at `backend/Dockerfile:45`; pass
  `MERCUR_BACKEND_URL` as a build-time env via the spec instead. (Original note
  says App Platform build-args are unreliable — with the Tier-2 DOCR flow you
  control the build env directly, so this constraint goes away.)
- **Storefront** already reads `NEXT_PUBLIC_MEDUSA_BACKEND_URL` from spec env —
  keep it; just ensure both apps point at the same single source.
- A custom domain on the backend then becomes a **one-spec-line** change instead
  of a Dockerfile rebuild + storefront edit.

---

## 4. Verification per tier

| Tier | Verify |
|------|--------|
| 1a | `doctl apps update … --spec` is a no-op diff against live (proves capture is faithful) before any further edits |
| 1b | prod compose: `:9000/health` 200, `/dashboard` + `/seller` render, storefront `:3000` loads, a demo spin works |
| 2a | deploy pulls image (build logs show pull, not build); all 3 components run the same tag |
| 2b | image size drop measured (`docker images`); `/dashboard` + `/seller` still served from the slim image |
| 3 | flip backend URL in spec only → storefront + dashboards still resolve, no Dockerfile change |

---

## 5. Risks / gotchas

- **Don't ship only `packages/api/.medusa/server`** — dashboards 404 ("Dashboard
  not built"). Slimming must keep `apps/*/dist` + the appDir layout (`backend/Dockerfile:5-10`).
- **Secrets in git:** the live spec embeds `EV[…]` (app-key-encrypted). Templatize
  before committing `.do/*.yaml`; rotate `JWT_SECRET`/`COOKIE_SECRET` if any
  plaintext ever lands in history.
- **`deploy_on_push` on a feature branch** deploys every WIP commit. After Tier 2
  (DOCR) builds become deliberate; until then, expect a deploy per push.
- **Local PG/Redis already run** as `pokenic-postgres` / `pokenic-redis`
  containers (per CLAUDE.md) — reuse or namespace to avoid port clashes with the
  prod compose.
- **doctl** is winget-installed v1.161.0 and authed (verified this session).

---

## 6. Suggested commit sequence (when implementing)

1. `chore(deploy): capture live app specs to .do/ (IaC)` — Tier 1a
2. `chore(deploy): prod-parity docker-compose + preflight script` — Tier 1b
3. `perf(deploy): build backend image once → DOCR, components reference image` — Tier 2a
4. `perf(deploy): slim backend runtime image (prune dev deps/sources)` — Tier 2b
5. `refactor(deploy): backend URL via spec env, drop Dockerfile ARG default` — Tier 3

Each step is independently verifiable via §4 — land them one at a time, prod
compose green before each push.

---

## 7. Implementation status (2026-06-14)

### DONE — Tier 1 (IaC + prod parity)

- **Committed specs as IaC** — `.do/backend.app.yaml`, `.do/storefront.app.yaml`,
  `.do/README.md`. Secrets redacted to `__SECRET__<KEY>__` placeholders in the
  backend spec; real values stay in gitignored `deploy/.env.deploy`.
- **`scripts/do-apply.ps1`** — injects secrets, writes a resolved spec to
  gitignored `deploy/`, runs `doctl apps spec validate`, then `doctl apps update`.
  Both specs **validate clean** (`-Validate`). `.gitignore` confirmed: secrets
  ignored, `.do/` + scripts tracked, no secret leaks into the committed spec.
- **Committed `.do/backend.app.yaml` mirrors LIVE steady state** — drops the
  stale one-time `ADMIN_*` envs + `deploy:migrate-user` that the gitignored
  `deploy/backend.app.yaml` still carried (the exact drift this fixes). One-time
  admin creation documented in the spec header + `.do/README.md`.
- **Prod-parity local stack** — `docker-compose.prod.yml` + `Dockerfile.pg-ssl`
  (self-signed-SSL Postgres mirroring DO) + Valkey, builds the real prod
  Dockerfiles. The backend image is built once and reused by migrate/backend/
  worker (previews T2's build-once). `scripts/preflight.ps1` boots it and asserts
  `/health` + `/dashboard` + `/seller` + storefront `/`, and scans logs for the
  `SELF_SIGNED_CERT_IN_CHAIN` / `KnexTimeoutError` / `MemoryStore` /
  `Cannot destructure` signatures.
  **VERIFIED 2026-06-14 — `preflight.ps1 -WithStorefront` PASSED (exit 0):** all
  4 HTTP checks 200 (dashboard 518B, seller 514B, storefront 173KB), zero error
  signatures; self-signed PG + all 4 Redis modules connected; seed produced 16
  cards / 8 packs / 128 odds. Ports: backend 9000, storefront 4010 (3000+4000
  were taken locally). Caught the real `docker compose --wait` + port-clash bugs
  in the harness itself — exactly the fast local loop this is for.

### DONE — Tier 3a (de-brittle, safe subset)

- Root `Dockerfile` now declares `ARG`/`ENV` for `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
  + `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` — reproducible build inputs (compose
  build-args locally; DO env in prod). Was implicitly relying on platform env.

### DECISION NEEDED — Tier 2a (build-once → DOCR)

Not auto-applied — it is a tradeoff, not a free win:
- **No DOCR registry exists** (`doctl registry get` → 404). Creating one is a
  billing decision; the backend image is **2.56 GB**, so the free 500 MB tier
  won't hold it — needs Basic (~$5/mo) **or** T2b slim first.
- It **removes `deploy_on_push`** (deploys become a deliberate build+push, ideally
  a GitHub Action). Good for control, worse for one-command iteration.
- Verdict: do this only after T2b shrinks the image, and only if you want
  push-to-deploy replaced by a build pipeline. Until then the 3-component build
  cost stands.

### DEFERRED — Tier 2b (slim runtime) + Tier 3b (backend URL via env)

- **T2b slim:** higher risk (the `medusa start` appDir → `apps/*/dist` layout is
  hard-won) and not turnkey — the `workspace-tools` yarn plugin (for
  `yarn workspaces focus --production`) is **not installed**. Now de-risked by
  the preflight harness: attempt the slim, re-run `preflight.ps1`, revert if
  `/dashboard` breaks.
- **T3b backend URL:** `backend/Dockerfile` hardcodes the prod URL because (per
  its own comment) App Platform doesn't reliably pass build-time env as
  build-args. De-hardcoding needs that assumption re-verified first.

---

## 8. Root cause: admin/vendor dashboard "not loaded" (404)

Found 2026-06-14 via `/systematic-debugging`. **Separate from deploys, which
actually succeed** (backend latest = manual ACTIVE 14/14, `/health` 200; the
CANCELED entries are commit-push auto-deploys superseded ~2s later by a manual
`create-deployment` — harmless; old true ERRORs were the PRE_DEPLOY migrate job's
non-idempotency, already mitigated).

**Symptom:** `/dashboard/` + `/seller/` load with no console errors and assets
200, but the SPA client-renders its **own** 404 ("There is no page at this
address", "Back to dashboard" → `/`).

**Root cause:** the React Router **basename is baked as `"/"` instead of
`"/dashboard"`** (live bundle contains `basename:"/"`). Chain:
1. `apps/admin/vite.config.ts` sets `base:'/dashboard/'` → fixes **asset URLs only**.
2. `@mercurjs/dashboard-sdk` `mercurDashboardPlugin` bakes the router basename via
   `define.__BASE__ = JSON.stringify(config.base || "/")`, where `config.base`
   comes from `loadMedusaConfig()` reading `medusa-config.ts`'s
   `admin_ui.options.path`.
3. `loadMedusaConfig()` has `} catch { return { pluginExtensions: [] }; }` — it
   **silently swallows** a load failure during the prod Docker `vite build` → no
   `base` → `__BASE__` falls back to `"/"`.
4. → SPA 404 at `/dashboard/`. Same for `/seller/`. (Bonus: that same catch
   returns `pluginExtensions: []`, so custom admin routes/menu items are also
   dropped in prod — fixing the loader at source would restore those; the
   override below does not.)

The dashboard has **never routed correctly in prod** — prior commits fixed
blank→assets, never the basename.

**Fix applied (robust override):** a `forceBasename` vite plugin added AFTER
`mercurDashboardPlugin` in both `apps/admin/vite.config.ts` (`/dashboard`) and
`apps/vendor/vite.config.ts` (`/seller`), returning
`{ define: { __BASE__: JSON.stringify(basename) } }` — wins the config merge,
independent of the failing loader.

**Preflight gap fixed:** the old HTTP-200 check passed even on a client-rendered
404. Added `scripts/check-dashboard-render.mjs` (real browser; fails on "There is
no page" or empty `#root`), wired into `preflight.ps1`. Verifying the fix on the
prod-parity stack before any redeploy.
