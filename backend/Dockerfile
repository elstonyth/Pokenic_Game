# Mercur/Medusa backend image for DigitalOcean App Platform (git-based build).
#
# Build context MUST be the backend monorepo root (this dir): the Yarn 4
# workspace (packages/api + apps/admin + apps/vendor) is built together by
# turbo, and the running server resolves the admin/vendor dashboards from the
# SOURCE `apps/*/dist` via medusa-config's `appDir: __dirname/../../apps/*`.
# That relative path only resolves when the whole monorepo is preserved in the
# image — verified locally (medusa start serves /dashboard + /seller). Do NOT
# try to ship only `packages/api/.medusa/server`; the dashboards would 404
# ("Dashboard not built").
#
# Node 22 LTS: Medusa 2.13 targets Node 20/22; satisfies engines ">=20". Bump
# to 24 only if a parity issue surfaces (the local baseline runs 24).
ARG NODE_VERSION=22-slim

# ============================================================
# Stage 1: build the whole workspace (api .medusa + apps dist)
# ============================================================
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

# Toolchain for any native addon rebuilds (node-gyp deps); removed with the
# stage — never reaches the runtime image.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Yarn 4 via corepack (pinned by package.json "packageManager": yarn@4.5.0).
RUN corepack enable

# Copy only manifests first so `yarn install` is cached until a dependency
# actually changes. Every workspace package.json must be present before install.
COPY package.json yarn.lock .yarnrc.yml turbo.json ./
COPY packages/api/package.json ./packages/api/
COPY apps/admin/package.json ./apps/admin/
COPY apps/vendor/package.json ./apps/vendor/
RUN corepack yarn install --immutable

# Backend origin baked into the admin/vendor vite bundles at build time (the
# vite configs read process.env.MERCUR_BACKEND_URL; turbo.json `env` lets it
# through to the build task). App Platform does NOT reliably pass build-time
# env as docker build-args, so this default IS the prod value — the Dockerfile
# is the prod artifact (local dev uses `medusa develop`, not this image).
# Update this if the backend gets a custom domain.
ARG MERCUR_BACKEND_URL=https://pokenic-backend-tltfm.ondigitalocean.app
ENV MERCUR_BACKEND_URL=$MERCUR_BACKEND_URL

# Full source, then build (turbo: medusa build -> packages/api/.medusa,
# vite build -> apps/{admin,vendor}/dist). No DB/Redis needed at build time.
COPY . .
RUN corepack yarn build

# ============================================================
# Stage 2: runtime — preserve the built monorepo, start the API
# ============================================================
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production
WORKDIR /app

# Pre-activate Yarn 4 at build time so container start needs no network.
RUN corepack enable && corepack prepare yarn@4.5.0 --activate

# Copy the entire built workspace (node_modules + .medusa + apps/*/dist +
# sources). Large but correct — matches the verified-working local layout.
# TODO(optimize): prune dev deps / slim to .medusa/server + apps/*/dist later.
COPY --from=builder /app ./

# Medusa listens on :9000; App Platform routes to http_port: 9000 (see app.yaml).
# Worker instances override the run command with MEDUSA_WORKER_MODE=worker.
WORKDIR /app/packages/api
EXPOSE 9000
CMD ["corepack", "yarn", "start"]
