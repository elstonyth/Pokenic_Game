// Showcase recording — ADMIN flow on the operator dashboard (:7000).
// login → economy & per-pack RTP → recent pulls ledger → customer support credit-adjust.
// Run: node scripts/showcase/record-admin.mjs → docs/showcase/admin.{webm,mp4}
import {
  startSession,
  finishSession,
  caption,
  moveClick,
  sleep,
} from './lib.mjs';

const ADMIN = 'http://localhost:7000';
const EMAIL = 'qa-admin@polycards.local';
const PASSWORD = 'QaAdmin2026!';
const SEARCH = 'stocktest';

const s = await startSession();
const { page } = s;

async function typeInto(target, text) {
  const el = typeof target === 'string' ? page.locator(target) : target;
  await moveClick(page, el);
  await el.fill('');
  await el.pressSequentially(text, { delay: 45 });
  await sleep(page, 300);
}

async function showScroll() {
  await page.evaluate(() => window.scrollTo({ top: 420, behavior: 'smooth' }));
  await sleep(page, 1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(page, 800);
}

try {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await caption(page, 'Operator dashboard — sign in');
  await sleep(page, 1000);
  await typeInto('input[name="email"]', EMAIL);
  await typeInto('input[name="password"]', PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL((u) => !u.pathname.includes('login'), {
    timeout: 20000,
  });
  await sleep(page, 1400);

  await caption(page, 'Economy — revenue, payouts & per-pack RTP');
  await page.goto(`${ADMIN}/economy`, { waitUntil: 'domcontentloaded' });
  await sleep(page, 2500);
  await showScroll();

  await caption(page, 'Recent pulls ledger — every open, verifiable');
  await page.goto(`${ADMIN}/pulls`, { waitUntil: 'domcontentloaded' });
  await sleep(page, 2500);
  await showScroll();

  await caption(page, 'Customer support — find a customer');
  await page.goto(`${ADMIN}/support`, { waitUntil: 'domcontentloaded' });
  await sleep(page, 1500);
  await typeInto('#support-q', SEARCH);
  await moveClick(page, page.getByRole('button', { name: /^search$/i }));
  const row = page.locator('table tbody tr').first();
  await row.waitFor({ timeout: 15000 });
  await sleep(page, 600);
  await moveClick(page, row);
  await page
    .getByText(/credit balance/i)
    .first()
    .waitFor({ timeout: 15000 });
  await sleep(page, 1200);

  await caption(page, "Adjust a customer's credit balance (audited)");
  await typeInto(page.getByLabel(/amount/i), '5');
  await typeInto(page.getByLabel(/note/i), 'Showcase goodwill credit');
  await moveClick(
    page,
    page.getByRole('button', { name: /apply adjustment/i }),
  );
  await moveClick(page, page.getByRole('button', { name: /^apply$/i }));
  await sleep(page, 2500);
  await caption(page, '');
  await sleep(page, 600);

  console.log('admin flow recorded');
} finally {
  await finishSession(s, 'admin');
}
