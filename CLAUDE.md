# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> `AGENTS.md` (imported above) is the source-of-truth for tech stack, code style, design
> principles, and the generic clone-website template structure. **Don't repeat it here.**
> Everything below is what's specific to _this_ repo and not derivable from the code alone.

## What this repo actually is

Despite the name `Pokenic_Game`, this is a **pixel-perfect clone of [phygitals.com](https://www.phygitals.com/)** — a physical/digital trading-card-pack collectibles site — built on top of the AI Website Cloner Template. The page metadata, copy, fonts (Nekst), and assets all target phygitals. When matching "the original," that's the site. Reference specs live in `docs/research/` (`PAGE_TOPOLOGY.md`, `BEHAVIORS.md`, per-component `components/*.spec.md`).

## Running & verifying (read before starting a server)

These are hard-won constraints from `docs/HANDOFF.md`, not preferences:

- **Verify against the production server, not `next dev`.** `next dev` serves images slowly on this machine and makes a correct build _look_ broken. Use:
  ```
  npm run build
  npx next start -p 4000   # run in background
  ```
- **Verify with the Playwright scripts in `scripts/*.mjs`, NOT Chrome MCP.** Chrome MCP caused hours of false "still broken" from port/cache confusion. Scripts screenshot to `docs/research/*.png`; read those PNGs back with the Read tool.
- **Watch for runaway node processes** (this has hit thousands of processes / 90+ GB). Check `@(Get-Process node).Count`; kill all with `Get-Process node | Stop-Process -Force`.
- **Worktrees are OK and preferred for isolated feature work** (user adopted the superpowers `using-git-worktrees` skill 2026-06-11 — consent pre-granted): native `EnterWorktree` tool first, else `git worktree add .worktrees/<branch> -b <branch>` (gitignored; verified working). Run `npm install` in fresh worktrees. The old "worktree isolation fails" note applied only to _background-agent_ isolation (`worktree.bgIsolation: none` in settings.local.json — leave that as is).

Standard scripts: `npm run dev | build | start | lint | typecheck`, and `npm run check` (lint + typecheck + build). Docker: `docker compose up app --build` (prod) / `dev --build` (port 3001).

## Architecture

**Routes** (`src/app/`, App Router): `/` (home), `/claw`, `/how-it-works`, `/leaderboard`, `/marketplace`, `/pack-party`. The home page (`src/app/page.tsx`) is a thin composition of section components.

**Section composition + scroll-in animation is the core pattern.** `src/app/page.tsx` stacks section components, wrapping most in `<Reveal>` (fade-up on scroll-into-view). The animation engine is:

- `src/lib/use-reveal.ts` — `useInView` (fire-once IntersectionObserver, unobserves after first reveal) + `usePrefersReducedMotion` (SSR-safe).
- `src/components/Reveal.tsx` — wrapper that applies the fade-up and **renders content visible immediately under `prefers-reduced-motion`**.

Sections with their **own** internal scroll animation — `HowItWorksSection` (via `HowItWorksSteps`) and `LeaderboardSection` (staggered row reveal) — are intentionally **not** wrapped in `<Reveal>`. Don't double-wrap them. Any new scroll-triggered behavior should reuse `useInView`/`usePrefersReducedMotion` so reduced-motion stays honored everywhere.

**Server/client split.** Route `page.tsx` files stay server components and export `metadata`; interactivity moves to a sibling `'use client'` component. Canonical example: `marketplace/page.tsx` (server, metadata) → `marketplace/MarketplaceClient.tsx` (client). Follow this when a route needs state.

**Global shell & styling.**

- `src/app/layout.tsx` forces dark mode (`<html className="dark">`) and wraps every page in `SiteHeader` + `SiteFooter`. The palette is hardcoded Tailwind neutrals to match phygitals (`bg-neutral-900`, `text-neutral-50`), **not** the shadcn oklch tokens in `globals.css` (those exist but the clone mostly bypasses them).
- Fonts: **Nekst Black** (self-hosted, `public/fonts/Nekst-Black.woff2`, via `--font-nekst` → `font-heading`) for headings; **Geist** for body.
- **`.px-fluid`** (defined in `globals.css`) is the site-wide horizontal gutter: `clamp(1rem, 1.6vw, 4.5rem)`. The clone is **full-bleed by design — no `max-w-*` caps anywhere** (page, header, footer). Use `px-fluid` on new page/section wrappers instead of breakpoint-stepped padding so layout scales continuously from mobile to 4K.

**UI primitives.** shadcn-style components in `src/components/ui/` built on `@base-ui/react` (not Radix directly). Icons are Lucide. `cn()` from `src/lib/utils.ts` for class merging.

## The clone workflow

Reverse-engineering is measurement-driven, not eyeballed: `scripts/*.mjs` are one-off Playwright capture/measure/QA scripts (e.g. `recon-howitworks.mjs`, `measure-hero*.mjs`, `qa-*.mjs`, `hover-audit*.mjs`) that read computed styles / `getBoundingClientRect` from the live site and the clone, dumping screenshots and JSON into `docs/research/`. Per-component specs (exact computed CSS, states, content, responsive breakpoints) go in `docs/research/components/*.spec.md`; builder sub-agents are dispatched from those spec files.

**`AGENTS.md` is a source-of-truth file that regenerates platform copies — edit it, then run `bash scripts/sync-agent-rules.sh`.** (The clone-website skill and its `sync-skills.mjs` pipeline were removed 2026-06-11.)

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Graph freshness: git `post-commit`/`post-checkout` hooks (installed 2026-06-11 via `graphify hook install`) auto-rebuild the graph on every commit/checkout. Run `graphify update .` manually only when you need uncommitted changes reflected (AST-only, no API cost).

## Running services (default local setup)

The Radmin-VPN PM2 preview stack was torn down 2026-06-12 (apps deleted, logon
`pm2 resurrect` entry uninstalled, `ecosystem.config.cjs` removed; admin/vendor
`backendUrl` and the DB card-image URLs reverted to localhost). Start servers
manually when needed:

- **Storefront (verify):** `npm run build` then `npx next start -p 4000` — never verify on `next dev`.
- **Backend:** `corepack yarn dev` from `backend/packages/api` (`medusa develop`; health check `:9000/health`).
- **Admin dashboard:** vite in `backend/apps/admin` (`:7000`, backendUrl `http://localhost:9000`).
- **Infra:** `pokenic-postgres` / `pokenic-redis` Docker containers stay up (`--restart unless-stopped`).

`medusa develop`'s Windows watcher restart is **locally patched** in
`backend/packages/api/node_modules/@medusajs/medusa/dist/commands/develop.js`
(`windowsHide` + try/catch around the `taskkill`) — without it, every backend
file save flashes a terminal window and a stale-PID taskkill wedges the watcher
into a listener-less boot loop. node_modules patches don't survive a reinstall;
re-apply per `backend/.claude/lessons.md`.
