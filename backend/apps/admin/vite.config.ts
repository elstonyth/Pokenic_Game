import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk';

// Backend origin baked into the admin bundle. It must be a VALID ABSOLUTE URL
// — @mercurjs/client does `new URL(baseUrl)` with no fallback, so an
// empty/relative value throws "Invalid URL". Env-driven: the prod build (DO
// App Platform sets MERCUR_BACKEND_URL) targets the deployed backend; dev
// falls back to localhost. A hardcoded localhost ships an admin bundle that
// calls localhost from the user's browser → blank/black dashboard.
const BACKEND_URL = process.env.MERCUR_BACKEND_URL || 'http://localhost:9000';

// mercurDashboardPlugin bakes the SPA's React Router basename into `__BASE__`,
// derived from medusa-config's admin_ui.options.path. Its loader
// (loadMedusaConfig) SILENTLY catches a failure in the prod Docker build and
// returns no base, so `__BASE__` falls back to "/" → the SPA renders its own
// 404 ("There is no page at this address") when served at /dashboard/ (assets
// still resolve via `base` below). Force `__BASE__` to the real mount path,
// independent of that loader. Must run AFTER mercurDashboardPlugin so this
// `define` wins the config merge. See docs/pokenic-do-deploy-handoff.md.
const forceBasename = (basename: string) => ({
  name: 'pokenic:force-dashboard-basename',
  config: () => ({ define: { __BASE__: JSON.stringify(basename) } }),
});

// https://vite.dev/config/
export default defineConfig(() => ({
  // Served under /dashboard by the admin-ui module, so assets must resolve to
  // /dashboard/assets/* — without this, vite emits /assets/* (root) and the
  // SPA's JS/CSS 404 (blank dashboard). The mercurDashboardPlugin is supposed
  // to derive this from medusa-config but its loader fails in the prod build,
  // so set it explicitly.
  base: '/dashboard/',
  // Prod storefront origin baked into the bundle so the admin resolves
  // storefront-relative asset paths (/cdn, /home, /images) against the real
  // storefront domain instead of the admin host on :4000 (which 404s in prod).
  // Empty in local dev -> image-url.ts falls back to host:4000. See image-url.ts.
  define: {
    __STOREFRONT_URL__: JSON.stringify(process.env.MERCUR_STOREFRONT_URL || ''),
  },
  // @acme/odds-math ships CJS-only. Because it is a workspace symlink Rollup
  // resolves it to ../../packages/odds-math/dist/index.js — outside the default
  // /node_modules/ CJS-plugin scope. Extend the include list to cover it while
  // keeping the default node_modules coverage so React etc. still work.
  optimizeDeps: { include: ['@acme/odds-math'] },
  build: {
    commonjsOptions: {
      include: [/node_modules/, /packages[\\/]odds-math/],
    },
  },
  server: { port: 7000 },
  plugins: [
    react(),
    mercurDashboardPlugin({
      medusaConfigPath: '../../packages/api/medusa-config.ts',
      backendUrl: BACKEND_URL,
    }),
    forceBasename('/dashboard'),
  ],
}));
