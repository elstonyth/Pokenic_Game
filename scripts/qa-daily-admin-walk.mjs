// Task 15 deferred admin-UI verifies (Tasks 9/10/11) against the vite-dev
// admin on :7000. Bounded gotos only (domcontentloaded — networkidle hangs on
// the HMR websocket). Screenshots land in docs/research/.
//
//   QA_ADMIN_EMAIL=… QA_ADMIN_PASSWORD=… node scripts/qa-daily-admin-walk.mjs [3a|3b|3c|all]
//
// 3a  Boxes tab: author tier a (credit RM5 locked 90% + nothing), save with a
//     reason, chip turns green, reload round-trips the saved state.
//     NOT idempotent (adds prize rows) — run once per authored state.
// 3b  Vouchers tab: rendered ranges match the API's collapsed ladder; edit
//     ranges; save with a reason; reload; confirm the collapse round-trip;
//     restore. Environment note: this dev DB carries the REAL VIP ladder
//     (L90=12000, L100=15000) which exceeds the editor's RM 10,000 ceiling —
//     Save is disabled until those are lowered, so the round-trip lowers them
//     to 10000 via the UI and restores the originals via the admin API
//     (whose fold has no ceiling).
// 3c  Sidebar: "Daily Rewards" present, "Reward Pools" gone.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const EMAIL = process.env.QA_ADMIN_EMAIL;
const PW = process.env.QA_ADMIN_PASSWORD;
if (!EMAIL || !PW) {
  console.error('Set QA_ADMIN_EMAIL and QA_ADMIN_PASSWORD.');
  process.exit(1);
}
const SECTION = process.argv[2] ?? 'all';
const run = (s) => SECTION === 'all' || SECTION === s;
const BASE = 'http://localhost:7000/dashboard';
const API = 'http://localhost:9000';
mkdirSync('docs/research', { recursive: true });

let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

// Auth + admin routes are rate-limited — retry 429s with a pause.
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

// Admin API session (for the voucher-ladder snapshot + post-test restore).
const auth = await call(`${API}/auth/user/emailpass`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PW }),
}).then((r) => r.json());
if (!auth.token) throw new Error('admin API auth failed');
const AH = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${auth.token}`,
};

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });

  // --- login ---
  await page.goto(`${BASE}/login`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForSelector('input[name="email"]', { timeout: 45000 });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PW);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.includes('login'), {
    timeout: 30000,
  });
  console.log('admin logged in:', page.url());

  // --- open Daily Rewards page ---
  const openDailyRewards = async () => {
    await page.goto(`${BASE}/daily-rewards`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    await page.waitForSelector('h2:has-text("Daily Rewards")', {
      timeout: 30000,
    });
  };
  await openDailyRewards();
  const rows = page.locator('table tbody tr');

  if (run('3c')) {
    // 3c: sidebar — Daily Rewards present, Reward Pools gone (checked over the
    // whole rendered DOM: the nav is part of it, and "Reward Pools" must appear
    // nowhere at all).
    const bodyText = await page.locator('body').innerText();
    check(
      /Daily Rewards/.test(bodyText),
      '3c sidebar/page shows "Daily Rewards"',
    );
    check(
      !/Reward Pools/i.test(bodyText),
      '3c "Reward Pools" absent from the rendered app',
    );
    await page.screenshot({ path: 'docs/research/task15-admin-sidebar.png' });
  }

  if (run('3a')) {
    // --- 3a: author tier a ---
    await page.waitForSelector('button:has-text("LV 1–9")', { timeout: 30000 });

    // Two prize rows: credit RM5 locked 90 (default kind/amount, lock + pct), then nothing.
    await page.click('button:has-text("Add prize")');
    const row1 = rows.nth(0);
    await row1.locator('button[role="switch"]').click(); // lock (captures live 100%)
    await row1.locator('input[type="number"]').nth(1).fill('90'); // pct input
    await page.click('button:has-text("Add prize")');
    const row2 = rows.nth(1);
    await row2.locator('button[role="combobox"]').first().click();
    await page.locator('[role="option"]:has-text("Nothing")').click();

    await page.fill('#box-name', 'Box A');
    await page
      .locator('label:has(span:text("Enabled")) button[role="switch"]')
      .click();
    await page.fill('#box-reason', 'task-15 e2e verify: author tier a');
    await page.locator('button:text-is("Save")').click();

    // Chip turns green: enabled + prize_count>0 → bg-ui-tag-green-icon dot.
    await page
      .locator('button:has-text("LV 1–9") span.bg-ui-tag-green-icon')
      .waitFor({ timeout: 20000 });
    check(true, '3a tier-A chip turned green after save');
    await page.screenshot({
      path: 'docs/research/task15-admin-box-a-authored.png',
    });

    // Round-trip: reload, tier a is the default selection again.
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('button:has-text("LV 1–9")', { timeout: 30000 });
    await page.waitForSelector('table tbody tr', { timeout: 20000 });
    check(
      (await rows.count()) === 2,
      '3a round-trip: 2 prize rows after reload',
    );
    const r1 = rows.nth(0);
    check(
      (
        await r1.locator('button[role="combobox"]').first().innerText()
      ).includes('Credit'),
      '3a round-trip: row 1 kind = Credit',
    );
    check(
      (await r1.locator('input[type="number"]').nth(0).inputValue()) === '5',
      '3a round-trip: row 1 amount = RM 5',
    );
    check(
      (await r1
        .locator('button[role="switch"]')
        .getAttribute('aria-checked')) === 'true',
      '3a round-trip: row 1 locked',
    );
    check(
      (await r1.locator('input[type="number"]').nth(1).inputValue()) === '90',
      '3a round-trip: row 1 pct = 90',
    );
    check(
      (
        await rows.nth(1).locator('button[role="combobox"]').first().innerText()
      ).includes('Nothing'),
      '3a round-trip: row 2 kind = Nothing',
    );
    check(
      (await page
        .locator('label:has(span:text("Enabled")) button[role="switch"]')
        .getAttribute('aria-checked')) === 'true',
      '3a round-trip: box enabled',
    );
    await page.screenshot({
      path: 'docs/research/task15-admin-box-a-roundtrip.png',
    });
  }

  if (run('3b')) {
    // --- 3b: vouchers ladder ---
    const ladder = await call(`${API}/admin/daily-rewards/vouchers`, {
      headers: AH,
    }).then((r) => r.json());
    const originalRanges = ladder.ranges; // [{from,to,amount_myr}] — restore target

    const readRanges = async () => {
      const out = [];
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const inputs = rows.nth(i).locator('input[type="number"]');
        out.push({
          from: Number(await inputs.nth(0).inputValue()),
          to: Number(await inputs.nth(1).inputValue()),
          amount_myr: Number(await inputs.nth(2).inputValue()),
        });
      }
      return out.sort((a, b) => a.from - b.from);
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    const openVouchersTab = async () => {
      await page.locator('button:text-is("Vouchers")').click();
      await page.waitForSelector('#voucher-reason', { timeout: 20000 });
      await page.waitForSelector('table tbody tr', { timeout: 20000 });
    };

    await openVouchersTab();
    check(
      same(await readRanges(), originalRanges),
      '3b rendered ranges match the API collapsed ladder',
    );
    await page.screenshot({
      path: 'docs/research/task15-admin-vouchers-seeded.png',
    });

    // Known environment condition: L90/L100 exceed the editor's RM 10,000
    // ceiling, so the ceiling error must be shown and Save must be disabled.
    const overCeiling = originalRanges.filter((r) => r.amount_myr > 10000);
    if (overCeiling.length > 0) {
      const errText = await page
        .locator('text=/exceeds the RM 10,000 ceiling/')
        .count();
      check(
        errText > 0,
        '3b UI shows the RM 10,000 ceiling error for the seeded L90/L100 values',
      );
      check(
        await page.locator('button:text-is("Save")').isDisabled(),
        '3b Save is disabled while over-ceiling rows exist (pre-existing data!)',
      );
      await page.screenshot({
        path: 'docs/research/task15-admin-vouchers-ceiling-block.png',
      });
    }

    // Set a range's amount in the buffer (no save).
    const fillRange = async (from, amount) => {
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const inputs = rows.nth(i).locator('input[type="number"]');
        if (Number(await inputs.nth(0).inputValue()) === from) {
          await inputs.nth(2).fill(String(amount));
          return;
        }
      }
      throw new Error(`no range starting at level ${from}`);
    };
    const saveWithReason = async (reason) => {
      await page.fill('#voucher-reason', reason);
      await page.locator('button:text-is("Save")').click();
      // Success clears the reason field (setReason('') runs after mutateAsync resolves).
      await page.waitForFunction(
        () => document.querySelector('#voucher-reason')?.value === '',
        { timeout: 20000 },
      );
    };

    // Edit: 7–9 → RM 7 (the brief's "edit one range"), plus lower the
    // over-ceiling rows to RM 10,000 so Save becomes possible at all.
    await fillRange(7, 7);
    for (const r of overCeiling) await fillRange(r.from, 10000);
    await saveWithReason(
      'task-15 e2e verify: bump 7-9 to RM 7 (+cap L90/L100 to pass UI ceiling)',
    );

    await openDailyRewards();
    await openVouchersTab();
    const expectedEdited = originalRanges.map((r) =>
      r.from === 7
        ? { ...r, amount_myr: 7 }
        : r.amount_myr > 10000
          ? { ...r, amount_myr: 10000 }
          : r,
    );
    check(
      same(await readRanges(), expectedEdited),
      '3b edit round-trip: 7–9 = RM 7 (and capped rows) persisted across reload',
    );
    await page.screenshot({
      path: 'docs/research/task15-admin-vouchers-edited.png',
    });

    // Restore 7–9 via the UI (now savable — everything is within the ceiling)…
    await fillRange(7, originalRanges.find((r) => r.from === 7).amount_myr);
    await saveWithReason('task-15 e2e verify: restore 7-9 to RM 5');

    // …and restore the over-ceiling originals via the admin API (backend fold
    // has no RM 10,000 ceiling — only the UI does).
    const restore = await call(`${API}/admin/daily-rewards/vouchers`, {
      method: 'POST',
      headers: AH,
      body: JSON.stringify({
        ranges: originalRanges,
        reason:
          'task-15 e2e verify: restore original ladder (L90/L100 back over UI ceiling)',
      }),
    });
    check(
      restore.ok,
      `3b API restore of the original ladder (HTTP ${restore.status})`,
    );

    await openDailyRewards();
    await openVouchersTab();
    check(
      same(await readRanges(), originalRanges),
      '3b restored: ladder back to original values',
    );
    await page.screenshot({
      path: 'docs/research/task15-admin-vouchers-restored.png',
    });
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
