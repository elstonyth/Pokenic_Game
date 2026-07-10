// scripts/sim/time-shift-exec.mjs
import { execFileSync } from 'node:child_process';
import { SIM } from './config.mjs';
import { buildShiftSql } from './time-shift.mjs';

export function shiftDay(days = 1) {
  // Match how the backend connects (container superuser is not necessarily
  // "postgres"): derive role/password from DATABASE_URL when present. Run this
  // via `node scripts/sim/time-shift-exec.mjs <days>` from a shell that has
  // DATABASE_URL exported so the credentials are available.
  const base = process.env.DATABASE_URL || '';
  const dbu = base ? new URL(base) : null;
  const pgUser = (dbu && decodeURIComponent(dbu.username)) || 'postgres';
  const pgPass = dbu ? decodeURIComponent(dbu.password) : '';
  const sql = buildShiftSql(SIM.TIME_SHIFT_TARGETS, days).join('\n');
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
      SIM.dbName,
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { stdio: 'inherit' },
  );
  // Time-gated cooldowns/sessions also live in Redis; clear the sim index so a
  // shifted day is not blocked by a cached "already drew today".
  execFileSync(
    'docker',
    [
      'exec',
      'pokenic-redis',
      'redis-cli',
      '-n',
      String(SIM.redisIndex),
      'flushdb',
    ],
    { stdio: 'inherit' },
  );
}

if (process.argv[1] && process.argv[1].endsWith('time-shift-exec.mjs')) {
  shiftDay(Number(process.argv[2] || 1));
  console.log('[sim] shifted day');
}
