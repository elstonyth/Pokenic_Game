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

// Login via the header AuthModal — the app has no standalone /login route
// (see src/components/AuthModal.tsx); the "Login" pill in AppHeader opens it.
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page
  .getByRole('button', { name: 'Accept' })
  .click({ timeout: 5_000 })
  .catch(() => {}); // cookie consent, best-effort
await page.getByRole('button', { name: 'Login' }).first().click();
await page.getByPlaceholder('Email').last().fill(EMAIL);
await page.getByPlaceholder('Password').fill(PASSWORD);
await page.keyboard.press('Enter');
// The modal closes itself on success (no URL change) — wait for the header
// balance chip, proof both login and the balance fetch landed.
await page.waitForSelector('text=/RM /', { timeout: 20_000 });

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
