// QA: admin Frames tab — upload a frame for LV 10, save with reason, verify.
// Usage: node scripts/qa-admin-frames.mjs <path-to-frame.png>
// Admin creds: PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD (defaults = local dev admin).
import { chromium } from 'playwright';

const FRAME = process.argv[2];
if (!FRAME)
  throw new Error('usage: node scripts/qa-admin-frames.mjs <frame.png>');
const BASE = process.env.ADMIN_BASE ?? 'http://localhost:7000/dashboard';
const API_BASE = process.env.API_BASE ?? 'http://localhost:9000';
const EMAIL = process.env.PW_ADMIN_EMAIL ?? 'admin@pokenic.local';
const PASSWORD = process.env.PW_ADMIN_PASSWORD ?? 'pokenicadmin2026';
const SHOTS = 'docs-local-qa';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
// Vite-dev admin: bounded domcontentloaded goto (networkidle hangs on HMR ws).
const go = (url) =>
  page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });

await go(BASE);
// Login form (skips if a session cookie already exists).
const emailBox = page
  .locator('input[name="email"], input[type="email"]')
  .first();
// waitFor (not isVisible — that returns immediately, no waiting) so the
// Vite-dev SPA has time to render the form after domcontentloaded.
const hasLoginForm = await emailBox
  .waitFor({ state: 'visible', timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
if (hasLoginForm) {
  await emailBox.fill(EMAIL);
  await page
    .locator('input[name="password"], input[type="password"]')
    .first()
    .fill(PASSWORD);
  await page
    .getByRole('button', { name: /continue|log ?in|sign ?in/i })
    .first()
    .click();
  // Login lands on /orders once the session is live — wait for the URL flip,
  // not a fixed delay (goto too early races the auth cookie/SPA bootstrap).
  await page.waitForURL((u) => !u.pathname.includes('login'), {
    timeout: 20_000,
  });
}
await page.waitForTimeout(4000);

await go(`${BASE}/daily-rewards`);
try {
  await page
    .getByRole('heading', { name: /daily rewards/i })
    .waitFor({ timeout: 30_000 });
} catch (err) {
  console.log('FAIL at heading; url =', page.url());
  await page.screenshot({ path: `${SHOTS}/admin-frames-FAIL.png` });
  throw err;
}

// Frames tab
await page.getByRole('tab', { name: /frames/i }).click();
await page
  .getByText(/One frame per 10 VIP levels/i)
  .waitFor({ timeout: 10_000 });
await page.screenshot({
  path: `${SHOTS}/admin-frames-tab.png`,
  fullPage: true,
});
console.log(
  'frames tab rendered: 10 rows =',
  await page
    .getByRole('row')
    .filter({ hasText: /^LV \d+/ })
    .count(),
);

// Upload for LV 10 (first Upload button in the LV 10 row)
const lv10Row = page.getByRole('row').filter({ hasText: 'LV 10' }).first();
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 10_000 }),
  lv10Row.getByRole('button', { name: /upload|replace/i }).click(),
]);
await chooser.setFiles(FRAME);
// Wait for the preview image to appear in the LV 10 row (upload round-trip done).
await lv10Row.locator('img').waitFor({ timeout: 30_000 });
console.log('LV 10 preview visible after upload');

// Save requires a reason — verify disabled first, then fill and save.
const saveBtn = page.getByRole('button', { name: /save frames/i });
if (!(await saveBtn.isDisabled()))
  throw new Error('Save enabled without a reason — audit gate broken');
await page.getByLabel(/reason/i).fill('QA: seed LV 10 frame');
await saveBtn.click();
await page.getByText(/avatar frames saved/i).waitFor({ timeout: 15_000 });
console.log('saved with audit reason; success toast shown');
await page.screenshot({
  path: `${SHOTS}/admin-frames-saved.png`,
  fullPage: true,
});

// Verify persisted via the admin endpoint (page.request shares the browser's
// authed session cookies; the store endpoint would need the publishable key).
const res = await page.request.get(`${API_BASE}/admin/avatar-frames`);
const body = await res.json();
console.log('store catalog:', JSON.stringify(body));
if (!body.frames?.['10'])
  throw new Error('catalog missing level 10 after save');

await browser.close();
console.log('ADMIN FRAMES QA PASS');
