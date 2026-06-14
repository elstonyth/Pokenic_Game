# `.do/` — DigitalOcean App Platform specs (IaC)

Single source of truth for the two App Platform apps. **Edit these files, then
apply** — never edit the apps in the DO web UI (that silently drifts from git).

| App                     | Spec                  | App ID                                 | URL                                                 |
| ----------------------- | --------------------- | -------------------------------------- | --------------------------------------------------- |
| Backend (Medusa/Mercur) | `backend.app.yaml`    | `9011b06c-9908-4223-bf64-f96f66d702fa` | https://pokenic-backend-tltfm.ondigitalocean.app    |
| Storefront (Next.js)    | `storefront.app.yaml` | `a3625ff4-64b3-41e8-8677-d08b65b9bbba` | https://pokenic-storefront-ijfiu.ondigitalocean.app |

## Secrets

`storefront.app.yaml` has **no secrets** (the backend URL + publishable key are
`NEXT_PUBLIC_*`, public by design) — it is committed verbatim.

`backend.app.yaml` has 4 secret env values (`DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `COOKIE_SECRET`) redacted to `__SECRET__<KEY>__` placeholders. The real
values live in **gitignored `deploy/.env.deploy`** and are injected at apply time
by `scripts/do-apply.ps1`. Never put a real secret in `.do/`.

If `deploy/.env.deploy` is lost, recreate it from the DO managed-DB connection
strings (Postgres + Valkey) plus the generated `JWT_SECRET` / `COOKIE_SECRET`
(rotate them if unknown).

## Apply

```pwsh
pwsh scripts/do-apply.ps1 backend -Validate     # validate only, no live change
pwsh scripts/do-apply.ps1 backend               # validate + REDEPLOY prod
pwsh scripts/do-apply.ps1 storefront            # storefront has no secrets
```

The script injects secrets, writes a resolved spec to gitignored
`deploy/<app>.app.yaml`, runs `doctl apps spec validate`, then (without
`-Validate`) `doctl apps update`.

> **`deploy_on_push: true`** — both apps also auto-deploy on every push to
> `feat/do-app-platform-deploy`. So a `git push` redeploys prod just like
> `do-apply.ps1` does. Pushing spec/Dockerfile changes = a live deploy.

## One-time admin user

To create the `/dashboard` admin: temporarily set the `migrate` job
`run_command` to `corepack yarn deploy:migrate-user`, add `ADMIN_EMAIL` +
`ADMIN_PASSWORD` (`type: SECRET`) envs, apply once, then **revert both** — the
script errors if the user already exists and would fail the PRE_DEPLOY job,
blocking all future deploys.
