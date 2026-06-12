import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mercurDashboardPlugin } from "@mercurjs/dashboard-sdk";

// Backend origin baked into the admin bundle. It must be a VALID ABSOLUTE URL
// — @mercurjs/client does `new URL(baseUrl)` with no fallback, so an
// empty/relative value throws "Invalid URL".
const BACKEND_URL = "http://localhost:9000";

// https://vite.dev/config/
export default defineConfig(() => ({
  server: { port: 7000 },
  plugins: [
    react(),
    mercurDashboardPlugin({
      medusaConfigPath: "../../packages/api/medusa-config.ts",
      backendUrl: BACKEND_URL,
    }),
  ],
}));
