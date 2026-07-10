# scripts/sim/PILOT.md — 2-day pilot runbook

Prove the harness end-to-end before any 30-day run.

## Preconditions

- Docker containers up: `docker ps` shows pokenic-postgres, pokenic-redis.
- Backend env available: `DATABASE_URL` exported in the shell (source backend/packages/api env; do NOT print it).

## Steps

1. `npm run sim:test` → all unit tests green.
2. `node scripts/sim/provision.mjs pilot` → recreates pixelslot_sim, seeds, writes
   runs/pilot/pk.txt, and provisions admin `sim-admin@pixelslot.local` /
   `SimAdmin2026!` (also written to runs/pilot/diary/admin.md — log in via
   POST /auth/user/emailpass to get the admin token).
3. Start the sim backend (built) on :9000 against the sim DB with
   ALLOW_MOCK_TOPUP=true AND REWARDS_REDEMPTION_ENABLED=true (the latter gates
   `POST /store/daily/draw` — see rewards-gate.ts — and is read at request time
   by the backend process, not by provisioning):
   `cd backend/packages/api && DATABASE_URL=<sim url> ALLOW_MOCK_TOPUP=true REWARDS_REDEMPTION_ENABLED=true corepack yarn build && DATABASE_URL=<sim url> ALLOW_MOCK_TOPUP=true REWARDS_REDEMPTION_ENABLED=true corepack yarn start`
   Health: `curl -s localhost:9000/health` → ok.
4. Start the viewer: `node scripts/sim/viewer.mjs pilot` → open http://localhost:4500.
5. Run the loop via the Workflow tool: `Workflow({ scriptPath: 'scripts/sim/run-month.workflow.mjs', args: { runId: 'pilot', days: 2 } })`.

## Pass criteria (the gate for Phase 1)

- [ ] Both customers registered + acted; events.jsonl has arrived/played_pack for each.
- [ ] A refund_request reached inbox.jsonl and the admin either resolved it or filed a `missing-capability` finding.
- [ ] Day 1 daily draw succeeded; after `shiftDay(1)`, Day 2 daily draw succeeded again (proves the text-day shift works). If Day 2 is blocked "already drew today", add the missing column to SIM.TIME_SHIFT_TARGETS and re-run.
- [ ] Auditor produced day-1.md and day-2.md and at least ran invariants.
- [ ] Viewer showed sprites moving and (if any) a finding in the feed.
- [ ] No infra errors misfiled as findings.
