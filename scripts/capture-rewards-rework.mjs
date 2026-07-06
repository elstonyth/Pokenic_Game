// Capture the reworked reward surfaces on the standalone build (:4000).
// Usage: node scripts/capture-rewards-rework.mjs
// Logs in as the shared dev customer, screenshots /daily, /vip, /vouchers,
// /me, and /leaderboard into docs/research/.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PW_REWARD_EMAIL ?? 'test@pokenic.app';
const PASSWORD = process.env.PW_REWARD_PASSWORD ?? 'PokenicTest123!';
const OUT = 'docs/research';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });

// Login via the global header auth modal (name-attribute selectors, per
// tests/e2e/helpers/storefront.ts). Success signal = the header balance chip
// ("Balance RM X — top up"), which is pack-independent — an "Open Pack" CTA
// flip needs a pack slug that exists in the target DB, and a bare RM-text
// wait can match public pack prices while still logged out.
let loggedIn = false;
for (let attempt = 0; attempt < 4 && !loggedIn; attempt++) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  // Cookie consent renders late and its overlay intercepts clicks — wait for
  // it properly on the first pass (absent on later passes once accepted).
  const accept = page.getByRole('button', { name: 'Accept' });
  if (
    await accept
      .waitFor({ state: 'visible', timeout: 8_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await accept.click();
    await accept.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
  await page
    .getByRole('button', { name: /^login$/i })
    .first()
    .click();
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.press('input[name="password"]', 'Enter');
  loggedIn = await page
    .getByRole('button', { name: /Balance .* top up/i })
    .waitFor({ timeout: 12_000 })
    .then(() => true)
    .catch(() => false);
  if (!loggedIn) await page.waitForTimeout(8_000); // 429 backoff, then retry
}
if (!loggedIn) throw new Error('login never completed — no balance chip');

for (const path of ['daily', 'vip', 'vouchers', 'me', 'leaderboard']) {
  await page.goto(`${BASE}/${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // let Reveal animations settle
  await page.screenshot({
    path: `${OUT}/rework-${path}.png`,
    fullPage: true,
  });
  console.log(`captured ${path}`);
}

await browser.close();
