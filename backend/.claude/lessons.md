# Backend Lessons

### `medusa start` fails: "Could not find index.html in the admin build directory"

After editing a Pack model field + `medusa build` + restarting, `medusa start`
aborts with _"Could not find index.html in the admin build directory. Make sure
to run 'medusa build'…"_ — even though `.medusa/server/public/admin/index.html`
exists and is valid. The bundled Medusa `/app` admin loader
(`@medusajs/medusa/dist/loaders/admin.js`) computes
`outDir = path.join(rootDirectory, "./public/admin")`, and the `rootDirectory`
it resolves at `medusa start` time doesn't line up with where the build emits
the admin, so the check fails.

**Fix:** this project does NOT need the bundled `/app` admin. Mercur serves its
own **admin** (`/dashboard`) and **vendor** (`/seller`) dashboards via the
`@mercurjs/core/modules/{admin-ui,vendor-ui}` modules (and the standalone
apps/admin + apps/vendor dev servers, e.g. :7000 / :7001). Set
`admin: { disable: true }` at the top level of `defineConfig({...})` in
`medusa-config.ts` — the admin loader early-returns (`if (disable) return app`),
the server boots, and `/health`, `/dashboard`, `/seller`, and all `/store/*`
routes keep working. Only the redundant `/app` 404s.

Note: a config change only takes effect after a rebuild (`medusa start` runs the
compiled `.medusa/server/medusa-config.js`). For a quick restore without a full
rebuild you can also patch that built file, but always make the change in the
`medusa-config.ts` source too.

### Uploaded /static files are transient — a rebuild can wipe them while the DB keeps the URLs

The local file provider stores uploads in `<cwd>/static` and the DB keeps ABSOLUTE
`http://localhost:9000/static/<epoch>-<name>` URLs. After a backend rebuild the
static dir was gone → every referenced image 404'd (storefront showed broken
card/pack art) while the DB rows still looked fine. `reupload-images.ts` does NOT
self-heal this: it skips rows whose image is already an absolute URL.

**Fix:** `node scripts/restore-backend-static.mjs` (repo root) — queries the DB for
every referenced `/static/` URL, maps `<epoch>-<basename>` back to the source file
under the storefront's `public/`, and copies it into `backend/packages/api/static/`
(idempotent). The dir is gitignored (runtime data). Sanity probe:
`GET :9000/static/<file>` → 200, and the home page audit reports `broken=0`.

### Backend build + restart pattern

- Build from the **backend root**: `corepack yarn build` (turbo builds
  `packages/api` + `apps/*` together). The admin step finishes slightly after
  the main process exits 0, so wait a beat before starting.
- Restart: find the `:9000` listener PID and `Stop-Process` it, then
  `corepack yarn start` from `packages/api`.
- The pack seed (`src/scripts/seed.ts`) is **idempotent by slug** — a re-run only
  CREATES new slugs; it never updates existing rows. New model fields with
  defaults cover existing rows; only NEW packs pick up non-default seed values.

### Integration suites: run via the package scripts, never raw jest

Raw `TEST_TYPE=integration:http ... jest <spec>` HANGS after the tests pass —
the rate limiters' ioredis connections hold the process open ("Jest did not
exit one second after the test run"). The `package.json` scripts carry
`--forceExit --runInBand` for exactly this; use
`corepack yarn test:integration:http <spec>` from `packages/api`. Piping the
run through `tail` also buffers ALL output until exit, so a finished-but-hung
run looks identical to a stuck run (0 bytes of output) — check for the jest
process + its CPU before assuming the tests are slow.

### `medusa develop` watcher can wedge into a listener-less boot loop

PM2 says `online` and logs say "Server is ready on port: 9000" while NOTHING
listens on :9000. Cause: the dev watcher restarts on file change by taskkilling
its previous child; when that PID is already gone (e.g. after a `corepack yarn
build` storm of change events), taskkill exits 128, chokidar throws, and the
restart cycle never re-binds the port. Symptom set: `↺` count climbing,
repeated `ERROR: The process "<pid>" not found.` in logs, `curl :9000/health`
→ 000. Fix: `pm2 restart pokenic-backend` (fresh parent), then re-probe
health AND a real route — "online" in pm2 status proves nothing here.

### New rate limiter ⇒ park it in .env.test

Every `createEnvRateLimit`-style limiter added to `src/api/middlewares.ts`
needs an effectively-unlimited `<NAME>_RATE_*` block in `.env.test` (existing
pattern: AUTH / STORE_READ / CREDIT_TOPUP). Otherwise production-default
budgets 429 unrelated integration tests — rapid same-customer/same-IP calls
are normal inside a suite, and Redis `rl:*` state persists across the
per-test DB resets.
