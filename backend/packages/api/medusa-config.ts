import { loadEnv, defineConfig } from '@medusajs/framework/utils';
import { DashboardModuleOptions } from '@mercurjs/types';
import path from 'path';
loadEnv(process.env.NODE_ENV || 'development', process.cwd());

// Secrets pass through UNDEFINED when unset so Medusa's own ConfigManager
// gate stays live: it already fail-fasts in production on a missing
// jwtSecret/cookieSecret and applies the "supersecret" dev default (with a
// warning) otherwise — a local `|| "supersecret"` fallback here would feed it
// a "found" value and mute that gate. The one case the framework can't catch
// is a secret EXPLICITLY set to the known dev literal; reject that ourselves,
// using the framework's own definition of production ("production" or
// "prod"). Generation one-liner lives in .env.template's PROD CHECKLIST.
const isProduction = ['production', 'prod'].includes(
  process.env.NODE_ENV || '',
);

// File storage is env-gated: when S3/R2 credentials are present we register the
// S3 file provider (durable object storage + CDN), otherwise Medusa's built-in
// local provider is used (writes to static/ — fine for dev, lost on redeploy).
// Uploads always flow through POST /admin/media regardless of provider.
const s3Configured = Boolean(
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY,
);
const fileModule = s3Configured
  ? [
      {
        resolve: '@medusajs/medusa/file',
        options: {
          providers: [
            {
              resolve: '@medusajs/file-s3',
              id: 's3',
              options: {
                file_url: process.env.S3_FILE_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: process.env.S3_BUCKET,
                endpoint: process.env.S3_ENDPOINT,
                // Cloudflare R2 (and most S3-compatibles) need path-style URLs.
                additional_client_config: { forcePathStyle: true },
              },
            },
          ],
        },
      },
    ]
  : [];
const secretFromEnv = (
  name: 'JWT_SECRET' | 'COOKIE_SECRET',
): string | undefined => {
  const value = process.env[name];
  if (isProduction && value === 'supersecret') {
    throw new Error(
      `${name} must be set to a strong random value in production (see .env.template)`,
    );
  }
  return value;
};

module.exports = defineConfig({
  // Bundled Medusa admin (/app) disabled — this Mercur project serves its own
  // admin (/dashboard) + vendor (/seller) dashboards via the *-ui modules below
  // (and the apps/admin + apps/vendor dev servers). Disabling avoids the default
  // admin loader requiring a bundled index.html at `medusa start`.
  admin: { disable: true },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      // @ts-expect-error: vendorCors is not defined in medusa config module
      vendorCors: process.env.VENDOR_CORS!,
      jwtSecret: secretFromEnv('JWT_SECRET'),
      cookieSecret: secretFromEnv('COOKIE_SECRET'),
    },
  },
  featureFlags: {
    rbac: true,
    seller_registration: true,
  },
  modules: [
    // Empty in dev (built-in local file provider stays active); registers the
    // S3 provider in prod when S3_* env is set.
    ...fileModule,
    {
      resolve: '@medusajs/medusa/rbac',
    },
    {
      // Custom gacha Packs module — Phase 4 ships the Pack catalog model; the
      // gacha internals (odds/pulls) land in Phase 5. See src/modules/packs.
      resolve: './src/modules/packs',
    },
    {
      resolve: '@mercurjs/core/modules/admin-ui',
      options: {
        appDir: path.join(__dirname, '../../apps/admin'),
        path: '/dashboard',
      } as DashboardModuleOptions,
    },
    {
      resolve: '@mercurjs/core/modules/vendor-ui',
      options: {
        appDir: path.join(__dirname, '../../apps/vendor'),
        path: '/seller',
      } as DashboardModuleOptions,
    },
  ],
  plugins: [
    {
      resolve: '@mercurjs/core',
      options: {},
    },
  ],
});
