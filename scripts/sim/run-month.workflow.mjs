// scripts/sim/run-month.workflow.mjs
export const meta = {
  name: 'virtual-month-sim',
  description:
    'Run the adversarial virtual-month simulation against the sim backend',
  phases: [{ title: 'Day' }],
};

// args: { runId, days, activePersonas?: string[] }
const runId = args?.runId;
const days = args?.days ?? 2;
if (!runId) throw new Error('args.runId is required');

const CUSTOMERS = args?.activePersonas ?? ['honest', 'refund-seeker'];

for (let day = 1; day <= days; day++) {
  phase('Day');
  log(`Day ${day} — customers acting`);

  // Customers act concurrently (cap 4 — Knex pool). Each returns its summary.
  const customerSummaries = await parallel(
    CUSTOMERS.map(
      (p) => () =>
        agent(customerPrompt(p, runId, day), {
          label: `cust:${p}:d${day}`,
          phase: 'Day',
          model: 'opus',
        }),
    ),
  );

  log(`Day ${day} — admin working the inbox`);
  const adminSummary = await agent(adminPrompt(runId, day), {
    label: `admin:d${day}`,
    phase: 'Day',
    model: 'opus',
  });

  log(`Day ${day} — auditor closing the day`);
  const audit = await agent(auditorPrompt(runId, day), {
    label: `audit:d${day}`,
    phase: 'Day',
    model: 'opus',
    schema: AUDIT_SCHEMA,
  });

  if (audit?.showstopper) {
    log(`Day ${day} — SHOWSTOPPER declared; pausing the run for a hotfix`);
    return { stoppedAt: day, reason: 'showstopper', audit };
  }

  if (day < days) {
    log(`Day ${day} — time-shifting the world back one day`);
    const { shiftDay } = await import('./time-shift-exec.mjs');
    shiftDay(1);
  }
}

return { runId, days, complete: true };

// --- prompt builders: each reads the charter file and pins the run context ---
function base(runId, day) {
  return `Run id: ${runId}. Simulated day: ${day}. Artifacts under scripts/sim/runs/${runId}/. Backend: http://localhost:9000. Publishable key: read runs/${runId}/pk.txt.`;
}
function customerPrompt(p, runId, day) {
  return `${base(runId, day)}\n\nFollow your charter exactly: scripts/sim/personas/${p}.md`;
}
function adminPrompt(runId, day) {
  return `${base(runId, day)}\n\nFollow your charter exactly: scripts/sim/personas/admin.md`;
}
function auditorPrompt(runId, day) {
  return `${base(runId, day)}\n\nFollow your charter exactly: scripts/sim/personas/auditor.md`;
}
const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'day',
    'invariantsPassed',
    'confirmed',
    'unverified',
    'showstopper',
  ],
  properties: {
    day: { type: 'integer' },
    invariantsPassed: { type: 'boolean' },
    confirmed: { type: 'integer' },
    unverified: { type: 'integer' },
    showstopper: { type: 'boolean' },
  },
};
