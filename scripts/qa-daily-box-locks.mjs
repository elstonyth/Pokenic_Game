// Task 15 lock proof: locked win rates drive real daily-box draws, and no
// store-facing response leaks the odds. Port of scripts/qa-locked-wins.mjs to
// the reward_box system.
//
// Authors tier-a via POST /admin/daily-rewards/boxes/a with two credit prizes
// (RM 1 locked 95% + RM 2 locked 5%), then N fresh customers each draw once
// (the box is once-per-customer-per-day, so distribution needs N distinct
// customers). Asserts the 95%-locked prize won >= 8/N (N=10) and that neither
// the draw responses nor GET /store/daily contain `weight`, `locked`, or
// `odds` (case-insensitive substring over the raw JSON). Restores the
// pre-test tier-a state afterwards.
//
//   QA_ADMIN_EMAIL=… QA_ADMIN_PASSWORD=… node scripts/qa-daily-box-locks.mjs
//
// The draw loop runs in a try/finally, so the restore call always fires even
// if an assertion throws mid-loop.
//
// ponytail: the restore snapshot is held in memory only — if the PROCESS
// itself is killed (not just a thrown assertion), the NEXT run snapshots the
// leftover QA state and "restores" that. In that case re-author tier a by
// hand (the admin_action_audit trail has the pre-test state's reason lines).
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.QA_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD (dev admin login).');
  process.exit(1);
}
const BASE = 'http://localhost:9000';
const N = 10;
const LOCK_PCT = 95;
const LOCKED_AMOUNT = 1; // RM — identifies the 95%-locked prize in draw results
const OTHER_AMOUNT = 2; // RM — the 5%-locked prize
const MIN_WINS = 8; // pass bar for N=10 seeded runs (exact 9.5 not expected)
const LEAK = /weight|locked|odds/i;

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

// Auth + store routes are rate-limited — retry 429s with a pause.
async function call(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    return res;
  }
}

// --- admin session + publishable key (same seam as qa-locked-wins) ---
const admin = await call(`${BASE}/auth/user/emailpass`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
}).then((r) => r.json());
if (!admin.token) throw new Error('admin auth failed — check QA_ADMIN_* env');
const AH = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${admin.token}`,
};
const keys = await call(`${BASE}/admin/api-keys?type=publishable`, {
  headers: AH,
}).then((r) => r.json());
const pub = keys.api_keys?.[0]?.token;
if (!pub) throw new Error('no publishable key');

// --- snapshot tier a for the post-test restore ---
const before = await call(`${BASE}/admin/daily-rewards/boxes/a`, {
  headers: AH,
}).then((r) => r.json());

// --- author tier a: RM1 locked 95% + RM2 locked 5% ---
const authored = await call(`${BASE}/admin/daily-rewards/boxes/a`, {
  method: 'POST',
  headers: AH,
  body: JSON.stringify({
    name: 'QA Lock Check',
    enabled: true,
    draws_per_day: 1,
    reason: 'qa-daily-box-locks: temporary 95/5 lock proof',
    prizes: [
      {
        kind: 'credit',
        locked: true,
        pct: LOCK_PCT,
        amount_myr: LOCKED_AMOUNT,
      },
      {
        kind: 'credit',
        locked: true,
        pct: 100 - LOCK_PCT,
        amount_myr: OTHER_AMOUNT,
      },
    ],
  }),
});
check(authored.ok, `author tier-a box 95/5 (HTTP ${authored.status})`);
if (!authored.ok) process.exit(1);

// --- N fresh customers, one draw each ---
const stamp = Date.now();
const tally = new Map(); // amount_myr -> wins
let leaked = false;
try {
  for (let i = 0; i < N; i++) {
    const email = `qa-boxlock-${stamp}-${i}@qa.polycards.dev`;
    const reg = await call(`${BASE}/auth/customer/emailpass/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'QaBoxLock123!' }),
    }).then((r) => r.json());
    if (!reg.token) throw new Error(`register ${i + 1} failed`);
    const CH = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${reg.token}`,
      'x-publishable-api-key': pub,
    };
    const created = await call(`${BASE}/store/customers`, {
      method: 'POST',
      headers: CH,
      body: JSON.stringify({ email }),
    });
    if (!created.ok)
      throw new Error(`create customer ${i + 1} failed: ${created.status}`);

    // Re-login: the register token carries no customer actor yet — only a
    // post-creation login token authenticates store routes (same as the
    // daily-box.spec registerCustomer helper).
    const login = await call(`${BASE}/auth/customer/emailpass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'QaBoxLock123!' }),
    }).then((r) => r.json());
    if (!login.token) throw new Error(`login ${i + 1} failed`);
    CH.Authorization = `Bearer ${login.token}`;

    const drawRes = await call(`${BASE}/store/daily/draw`, {
      method: 'POST',
      headers: CH,
      body: '{}',
    });
    if (!drawRes.ok) throw new Error(`draw ${i + 1} failed: ${drawRes.status}`);
    const raw = await drawRes.text();
    if (LEAK.test(raw)) {
      leaked = true;
      console.error(`draw ${i + 1} response leaks odds-ish keys: ${raw}`);
    }
    const j = JSON.parse(raw);
    const amt = j.prize?.amount_myr;
    tally.set(amt, (tally.get(amt) ?? 0) + 1);
    console.log(
      `draw ${i + 1}/${N}: ${j.status} RM ${amt}${amt === LOCKED_AMOUNT ? '  <-- locked-95 prize' : ''}`,
    );

    // The state read must not leak either (checked once per customer).
    const stateRaw = await call(`${BASE}/store/daily`, { headers: CH }).then(
      (r) => r.text(),
    );
    if (LEAK.test(stateRaw)) {
      leaked = true;
      console.error(
        `GET /store/daily for customer ${i + 1} leaks odds-ish keys: ${stateRaw}`,
      );
    }
    await new Promise((r) => setTimeout(r, 1200)); // pace the limiter
  }

  // --- distribution + leak verdicts ---
  console.log('---');
  for (const [amt, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(
      `RM ${amt}: ${n}/${N}${amt === LOCKED_AMOUNT ? `  (locked at ${LOCK_PCT}%)` : ''}`,
    );
  }
  const wins = tally.get(LOCKED_AMOUNT) ?? 0;
  check(
    wins >= MIN_WINS,
    `locked-${LOCK_PCT}% prize won ${wins}/${N} (pass bar >= ${MIN_WINS})`,
  );
  check(!leaked, 'no draw/state response body contains weight/locked/odds');
} finally {
  // --- restore tier a to its pre-test state (always runs, even on failure) ---
  const restore = await call(`${BASE}/admin/daily-rewards/boxes/a`, {
    method: 'POST',
    headers: AH,
    body: JSON.stringify({
      name: before.box.name,
      enabled: before.box.enabled,
      draws_per_day: before.box.draws_per_day,
      reason: 'qa-daily-box-locks: restore pre-test tier-a state',
      prizes: before.prizes.map((p) => ({
        kind: p.kind,
        locked: p.locked,
        pct: p.pct,
        ...(p.kind === 'credit' || p.kind === 'voucher'
          ? { amount_myr: p.payload.amount_myr }
          : {}),
        ...(p.kind === 'product'
          ? {
              product_handle: p.payload.product_handle,
              qty: p.payload.qty ?? 1,
            }
          : {}),
      })),
    }),
  });
  check(restore.ok, `restore pre-test tier-a state (HTTP ${restore.status})`);
}

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
