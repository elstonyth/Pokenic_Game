// Live capture of the NEW vault bulk sell-back on the PROD build (:4000),
// backend on :9000. Seeds a fresh customer with several vaulted cards via the
// API (fast, no reveal theater), logs into the UI, then drives the vault
// multi-select → "Sell (N)" → confirm flow, recording a video + screenshots.
// Output → docs/research/bulk-sell/ (01-vault … 05-after-sell + bulk-sell.webm).
// Run: node scripts/capture-bulk-sell.mjs
import { chromium } from 'playwright';
import { mkdirSync, renameSync } from 'node:fs';

const BASE = 'http://localhost:4000';
const BACKEND = 'http://localhost:9000';
const PK =
  process.env.PW_PK ||
  'pk_a23d4482ee6673a760097f3d013aab59679ceaebab54f987638cbeeb0132863c';
const PACK = 'pokemon-rookie';
const OUT = 'docs/research/bulk-sell';
mkdirSync(OUT, { recursive: true });

let failed = false;
const ok = (m) => console.log(`✓ ${m}`);
const soft = (m) => console.log(`• ${m}`);
const fail = (m) => {
  console.error(`✗ ${m}`);
  failed = true;
};
const shot = (page, name) =>
  page
    .screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
    .catch(() => {});

// Minimal backend client (mirrors tests/e2e/helpers/api.ts; honors 429 backoff).
async function api(path, { method = 'GET', body, token, headers: extra } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-publishable-api-key': PK,
    ...extra,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${BACKEND}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (res.status === 429 && attempt < 5) {
      const secs = Number(text.match(/again in (\d+)s/)?.[1] ?? '8');
      await new Promise((r) => setTimeout(r, (secs + 1) * 1000));
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  throw new Error(`${method} ${path} still rate-limited`);
}

// ── Seed: fresh customer with 3 vaulted cards ─────────────────────────────────
const email = `pw-bulksell-${Date.now()}@polycards.local`;
const password = 'PwE2e2026!';
const reg = await api('/auth/customer/emailpass/register', {
  method: 'POST',
  body: { email, password },
});
await api('/store/customers', {
  method: 'POST',
  token: reg.token,
  body: { email, first_name: 'PW' },
});
const login = await api('/auth/customer/emailpass', {
  method: 'POST',
  body: { email, password },
});
const token = login.token;
await api('/store/credits/topup', {
  method: 'POST',
  token,
  headers: { 'Idempotency-Key': `capture-bulk-sell-${Date.now()}` },
  body: { amount: 300 },
});
for (let i = 0; i < 3; i++)
  await api(`/store/packs/${PACK}/open`, { method: 'POST', token, body: {} });
ok('seeded fresh customer with 3 vaulted cards');

const browser = await chromium.launch({ headless: true });
let video;
try {
  const ctx = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 1000 } },
  });
  const page = await ctx.newPage();
  video = page.video();
  page.on('pageerror', (e) => soft(`pageerror: ${e.message}`));

  // ── Log in through the UI ───────────────────────────────────────────────────
  // The header click races React hydration on a cold standalone build and the
  // auth action can be briefly rate-limited, so retry the whole login until the
  // CTA flips to "Open Pack" (mirrors tests/e2e/helpers/storefront.ts).
  await page.goto(`${BASE}/claw/${PACK}`, { waitUntil: 'domcontentloaded' });
  const loginBtn = page.getByRole('button', { name: /^login$/i }).first();
  const openCta = page.getByRole('button', { name: /open pack/i });
  let loggedIn = false;
  for (let attempt = 0; attempt < 5 && !loggedIn; attempt++) {
    if (await openCta.isVisible().catch(() => false)) {
      loggedIn = true;
      break;
    }
    // (Re)open the modal until the email field is actually present.
    await loginBtn.waitFor({ timeout: 20000 });
    for (let open = 0; open < 5; open++) {
      await loginBtn.click().catch(() => {});
      try {
        await page.locator('input[name="email"]').waitFor({ timeout: 3000 });
        break;
      } catch {
        await page.waitForTimeout(1000);
      }
    }
    await page.fill('input[name="email"]', email).catch(() => {});
    await page.fill('input[name="password"]', password).catch(() => {});
    await page.press('input[name="password"]', 'Enter').catch(() => {});
    try {
      await openCta.waitFor({ timeout: 12000 });
      loggedIn = true;
    } catch {
      await page.waitForTimeout(6000); // clear the short sign-in rate window
      await page.goto(`${BASE}/claw/${PACK}`, {
        waitUntil: 'domcontentloaded',
      });
    }
  }
  if (!loggedIn)
    throw new Error('login never completed — CTA never "Open Pack"');
  ok('logged in');

  // ── Vault: multi-select → bulk sell ──────────────────────────────────────────
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await shot(page, '01-vault');
  const before = await page
    .getByRole('button', { name: /^Sell for RM/ })
    .count();
  soft(`vault cards before: ${before}`);

  await page.getByRole('button', { name: /^Select cards$/i }).click();
  await page.waitForTimeout(600);
  await shot(page, '02-select-mode');

  // Select 2 cards. Clicking one flips its label Select→Deselect, so clicking
  // the first remaining "Select …" twice selects two distinct cards.
  const unselected = page.getByRole('button', { name: /^Select / });
  await unselected.first().waitFor({ timeout: 8000 });
  for (let i = 0; i < 2; i++) {
    await unselected.first().click();
    await page.waitForTimeout(400);
  }
  await shot(page, '03-selected'); // both "Sell (2)" and "Request delivery (2)" visible

  // Bulk sell → shared confirm dialog (aria-label "Confirm sell-back").
  await page.getByRole('button', { name: /^Sell \(\d+\)/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm sell-back' });
  await dialog.waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, '04-confirm'); // "Sell 2 cards?" + total credit
  await dialog.getByRole('button', { name: /^Sell for RM/i }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 20000 });
  await page.waitForTimeout(1000);
  await shot(page, '05-after-sell');

  const after = await page
    .getByRole('button', { name: /^Sell for RM/ })
    .count();
  if (after === before - 2)
    ok(`vault dropped ${before} → ${after} after bulk sell of 2`);
  else fail(`expected ${before - 2} cards left, got ${after}`);

  // Ground truth: two buyback rows landed on the ledger.
  const credits = await api('/store/credits', { token });
  const buybacks = credits.transactions.filter(
    (t) => t.reason === 'buyback',
  ).length;
  if (buybacks >= 2) ok(`ledger has ${buybacks} buyback rows`);
  else fail(`expected >=2 buyback ledger rows, got ${buybacks}`);

  await ctx.close(); // flush the video to disk
  if (video) {
    const p = await video.path();
    renameSync(p, `${OUT}/bulk-sell.webm`);
    ok(`video saved → ${OUT}/bulk-sell.webm`);
  }
} catch (err) {
  fail(err.stack || err.message);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
