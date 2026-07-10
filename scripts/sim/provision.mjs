// scripts/sim/provision.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM, simDatabaseUrl, runDir } from './config.mjs';

const runId = process.argv[2];
if (!runId) {
  console.error('usage: node scripts/sim/provision.mjs <runId>');
  process.exit(1);
}
if (!/^[\w-]+$/.test(runId)) {
  console.error('runId must be [A-Za-z0-9_-]');
  process.exit(1);
}
const base = process.env.DATABASE_URL;
if (!base) {
  console.error('DATABASE_URL not set (source backend env first)');
  process.exit(1);
}

const simUrl = simDatabaseUrl(base);
// Derive the psql role / password / maintenance-db from DATABASE_URL so we
// always connect the way the backend does — the container superuser is NOT
// necessarily "postgres". DROP/CREATE run against the existing base db
// (pixelslot_sim does not exist yet), passing PGPASSWORD via the container env
// (never argv/logs) in case socket auth isn't trust.
const dbu = new URL(base);
const pgUser = decodeURIComponent(dbu.username) || 'postgres';
const pgPass = decodeURIComponent(dbu.password);
const maintenanceDb =
  decodeURIComponent(dbu.pathname.replace(/^\//, '')) || 'postgres';
const psql = (sql) =>
  execFileSync(
    'docker',
    [
      'exec',
      ...(pgPass ? ['-e', `PGPASSWORD=${pgPass}`] : []),
      'pokenic-postgres',
      'psql',
      '-U',
      pgUser,
      '-d',
      maintenanceDb,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { stdio: 'inherit' },
  );

console.log('[sim] recreating database', SIM.dbName);
psql(`DROP DATABASE IF EXISTS ${SIM.dbName} WITH (FORCE);`);
psql(`CREATE DATABASE ${SIM.dbName};`);

const env = {
  ...process.env,
  DATABASE_URL: simUrl,
  ALLOW_MOCK_TOPUP: 'true',
  // Harmless here; the load-bearing setting is on the backend process itself
  // (see PILOT.md step 3) since the daily-draw gate reads it at request time.
  REWARDS_REDEMPTION_ENABLED: 'true',
};
const api = join(process.cwd(), 'backend', 'packages', 'api');
const yarn = (args) =>
  execFileSync('corepack', ['yarn', ...args], {
    cwd: api,
    env,
    stdio: ['inherit', 'pipe', 'inherit'],
  });

console.log('[sim] migrating + seeding');
execFileSync('corepack', ['yarn', 'medusa', 'db:migrate'], {
  cwd: api,
  env,
  stdio: 'inherit',
});
execFileSync('corepack', ['yarn', 'medusa', 'exec', './src/scripts/seed.ts'], {
  cwd: api,
  env,
  stdio: 'inherit',
});

console.log('[sim] provisioning admin user');
const adminEnv = {
  ...env,
  ADMIN_EMAIL: 'sim-admin@pixelslot.local',
  ADMIN_PASSWORD: 'SimAdmin2026!',
};
execFileSync(
  'corepack',
  ['yarn', 'medusa', 'exec', './src/scripts/create-admin.ts'],
  { cwd: api, env: adminEnv, stdio: 'inherit' },
);

const out = yarn([
  'medusa',
  'exec',
  './src/scripts/print-publishable-key.ts',
]).toString();
const token = (out.match(/token=(pk_[A-Za-z0-9]+)/) || [])[1];
if (!token) {
  console.error('[sim] could not capture publishable key from:\n' + out);
  process.exit(1);
}

const dir = runDir(runId);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'pk.txt'), token, 'utf8');

const diaryDir = join(dir, 'diary');
mkdirSync(diaryDir, { recursive: true });
writeFileSync(
  join(diaryDir, 'admin.md'),
  [
    '# Admin credentials',
    '',
    'email: sim-admin@pixelslot.local',
    'password: SimAdmin2026!',
    '',
    'Log in via POST /auth/user/emailpass to get your admin token.',
    '',
  ].join('\n'),
  'utf8',
);

console.log('[sim] provisioned. publishable key saved to', join(dir, 'pk.txt'));
console.log('[sim] admin creds written to', join(diaryDir, 'admin.md'));
