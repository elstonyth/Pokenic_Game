// Phase 6c — admin Pull Ledger UI verification (Playwright against :7000).
//
// Logs into the admin SPA, opens the Pull Ledger page, and confirms it loaded
// live data from GET /admin/pulls (in-browser via the typed client + cookie
// auth): the total count, the recent-pulls table, and the rollups. DOM-evaluate
// reads are used because this admin's headless flex layout mis-targets
// Playwright hit-testing (built-in pages render the same way).
import { chromium } from 'playwright';

// Admin vite serves under base '/dashboard/' (see apps/admin/vite.config.ts).
const ADMIN = process.env.ADMIN_BASE || 'http://localhost:7000/dashboard';
const API = 'http://localhost:9000';
const r = { checks: {} };
const ok = (k, c, d) =>
  (r.checks[k] = c ? 'PASS' : `FAIL${d ? ' — ' + d : ''}`);

// Ground truth from the API for comparison.
const token = (
  await (
    await fetch(`${API}/auth/user/emailpass`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@polycards.local',
        password: 'polycardsadmin2026',
      }),
    })
  ).json()
).token;
const api = await (
  await fetch(`${API}/admin/pulls`, {
    headers: { Authorization: `Bearer ${token}` },
  })
).json();

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on(
  'console',
  (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 140)),
);

await page
  .goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' })
  .catch(() => {});
await page.waitForSelector('input[name="email"]', { timeout: 15000 });
await page.fill('input[name="email"]', 'admin@polycards.local');
await page.fill('input[name="password"]', 'polycardsadmin2026');
await page.click('button[type="submit"]');
// login redirects away from /login once auth succeeds
await page
  .waitForFunction(() => !/\/login/.test(location.pathname), { timeout: 15000 })
  .catch(() => {});

await page.goto(`${ADMIN}/pulls`, { waitUntil: 'domcontentloaded' });
// wait for the live-loaded ledger TABLE ROWS to render (the title paints before
// the data loads), polling the DOM directly since this admin's flex layout
// mis-targets Playwright hit-testing.
await page
  .waitForFunction(
    () =>
      /Pull Ledger/i.test(document.body.innerText) &&
      document.querySelectorAll('table tbody tr').length > 0,
    null,
    { timeout: 15000 },
  )
  .catch(() => {});

const dom = await page.evaluate(() => ({
  bodyHasTitle: /Pull Ledger/i.test(document.body.innerText),
  bodyHasTotalLabel: /Total pulls/i.test(document.body.innerText),
  recentRows: document.querySelectorAll('table tbody tr').length,
  hasRarityBadge: /Common|Uncommon|Rare|Epic|Legendary/.test(
    document.body.innerText,
  ),
  bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
}));

ok('ledger_title', dom.bodyHasTitle);
ok('ledger_total_label', dom.bodyHasTotalLabel);
// The recent-pulls table should render exactly the API's ledger rows.
ok(
  'ledger_rows_match_api',
  dom.recentRows === api.pulls.length,
  `dom ${dom.recentRows} vs api ${api.pulls.length}`,
);
ok('ledger_rarities_shown', api.topRarities.length === 0 || dom.hasRarityBadge);
ok('no_console_errors', consoleErrors.length === 0, consoleErrors.join(' | '));

await browser.close();
r.apiTotal = api.total;
r.apiLedgerRows = api.pulls.length;
r.verdict = Object.values(r.checks).every((v) => v === 'PASS')
  ? 'PASS'
  : 'FAIL';
console.log(JSON.stringify(r, null, 2));
