#!/usr/bin/env node
// Runs the HTTP integration gate in sequential jest SHARDS.
//
// Why: every suite boots a full Medusa app via medusaIntegrationTestRunner and
// memory accumulates across suites in a single --runInBand process. At 66
// suites the run exhausts node's default ~4GB old-space ("Ineffective
// mark-compacts near heap limit") and dies without a jest summary — even 8GB
// only reached 62/66. Splitting into shards resets the heap per process while
// keeping --runInBand semantics inside each shard (suites still create their
// own DBs and run serially).
//
// Usage (via package.json):
//   corepack yarn test:integration:http                 -> all suites, SHARDS sequential shards
//   corepack yarn test:integration:http economy.spec …  -> filtered single run (no sharding)
import { spawnSync } from 'node:child_process';

// 3 shards ≈ 22 suites/process — roughly a third of the heap that OOM'd,
// comfortable headroom without paying 3× the per-shard startup cost.
// ponytail: bump this before reaching for --max-old-space-size again.
const SHARDS = 3;

const jestArgs = ['--silent=false', '--runInBand', '--forceExit'];
const env = {
  ...process.env,
  TEST_TYPE: 'integration:http',
  NODE_OPTIONS: [process.env.NODE_OPTIONS, '--experimental-vm-modules']
    .filter(Boolean)
    .join(' '),
};

const runJest = (extra) =>
  spawnSync(
    process.execPath,
    ['node_modules/jest/bin/jest.js', ...jestArgs, ...extra],
    { stdio: 'inherit', env },
  ).status ?? 1;

const patterns = process.argv.slice(2);
if (patterns.length > 0) {
  // A filtered run is small — no sharding, behaves like the old script.
  process.exit(runJest(patterns));
}

let failed = 0;
for (let i = 1; i <= SHARDS; i++) {
  console.log(`\n=== HTTP gate shard ${i}/${SHARDS} ===`);
  const status = runJest([`--shard=${i}/${SHARDS}`]);
  if (status !== 0) failed = status;
}
console.log(
  failed === 0
    ? `\nHTTP gate: all ${SHARDS} shards green.`
    : `\nHTTP gate: shard failure (exit ${failed}) — see summaries above.`,
);
process.exit(failed);
