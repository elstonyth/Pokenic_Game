import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { mercurDashboardPlugin } from '@mercurjs/dashboard-sdk';

// Backend origin baked into the vendor bundle. It must be a VALID ABSOLUTE URL
// — @mercurjs/client does `new URL(baseUrl)` with no fallback, so an
// empty/relative value throws "Invalid URL". Env-driven: the prod build (DO
// App Platform sets MERCUR_BACKEND_URL) targets the deployed backend; dev
// falls back to localhost. A hardcoded localhost ships a vendor bundle that
// calls localhost from the user's browser → blank/black dashboard.
const BACKEND_URL = process.env.MERCUR_BACKEND_URL || 'http://localhost:9000';

// https://vite.dev/config/
export default defineConfig(() => ({
  server: { port: 7001 },
  plugins: [
    react(),
    mercurDashboardPlugin({
      medusaConfigPath: '../../packages/api/medusa-config.ts',
      backendUrl: BACKEND_URL,
    }),
  ],
}));
