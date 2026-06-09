# Backend Lessons

### `medusa start` fails: "Could not find index.html in the admin build directory"
After editing a Pack model field + `medusa build` + restarting, `medusa start`
aborts with *"Could not find index.html in the admin build directory. Make sure
to run 'medusa build'…"* — even though `.medusa/server/public/admin/index.html`
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

### Backend build + restart pattern
- Build from the **backend root**: `corepack yarn build` (turbo builds
  `packages/api` + `apps/*` together). The admin step finishes slightly after
  the main process exits 0, so wait a beat before starting.
- Restart: find the `:9000` listener PID and `Stop-Process` it, then
  `corepack yarn start` from `packages/api`.
- The pack seed (`src/scripts/seed.ts`) is **idempotent by slug** — a re-run only
  CREATES new slugs; it never updates existing rows. New model fields with
  defaults cover existing rows; only NEW packs pick up non-default seed values.
