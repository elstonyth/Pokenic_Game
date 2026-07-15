// Showcase recording — CUSTOMER flow (logged in) on the prod storefront (:4000).
// login → top up demo credits → open a pack (charged) → reveal → keep in vault → vault.
// Run: node scripts/showcase/record-customer.mjs → docs/showcase/customer.{webm,mp4}
import {
  startSession,
  finishSession,
  caption,
  moveClick,
  moveXY,
  sleep,
} from './lib.mjs';

const BASE = 'http://localhost:4000';
const EMAIL = 'stocktest-1@polycards.local';
const PASSWORD = 'stocktest2026!';
const PACK = 'pokemon-black';

const s = await startSession();
const { page } = s;

async function typeInto(selector, text) {
  await moveClick(page, selector);
  await page.locator(selector).fill('');
  await page.locator(selector).pressSequentially(text, { delay: 45 });
  await sleep(page, 300);
}

try {
  await page.goto(`${BASE}/claw/${PACK}`, { waitUntil: 'domcontentloaded' });
  await caption(page, 'Log in to open packs for real');
  await sleep(page, 1200);

  await moveClick(page, page.getByRole('button', { name: /^login$/i }).first());
  await typeInto('input[name="email"]', EMAIL);
  await typeInto('input[name="password"]', PASSWORD);
  await page.press('input[name="password"]', 'Enter');
  await page
    .getByRole('button', { name: /open pack/i })
    .waitFor({ timeout: 20000 });
  await sleep(page, 1200);

  await caption(page, 'Top up credits (demo gateway — no real money)');
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
  await sleep(page, 800);
  await moveClick(page, page.getByRole('button', { name: /add credits/i }));
  await typeInto('input[aria-label="Top-up amount in USD"]', '5000');
  await moveClick(
    page,
    page.getByRole('button', { name: /^Add \$5,000\.00$/ }),
  );
  await page.getByText(/added to your balance/i).waitFor({ timeout: 15000 });
  await sleep(page, 1500);

  await caption(page, 'Open a pack');
  await page.goto(`${BASE}/claw/${PACK}`, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: /open pack/i })
    .waitFor({ timeout: 20000 });
  await sleep(page, 800);
  await moveClick(page, page.getByRole('button', { name: /open pack/i }));
  await sleep(page, 2600); // cylinder settles
  await moveXY(page, 960, 520); // pack → slab
  await sleep(page, 1000);
  await moveXY(page, 960, 520); // slab → metadata → card
  await page
    .getByRole('button', { name: /keep in vault/i })
    .waitFor({ timeout: 25000 });
  await sleep(page, 1800);

  await caption(page, 'Keep it in your insured vault');
  await moveClick(page, page.getByRole('button', { name: /keep in vault/i }));
  await sleep(page, 1400);

  await caption(page, 'Your vault — balance & cards, sell back anytime');
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('button', { name: /sell for/i })
    .first()
    .waitFor({ timeout: 20000 })
    .catch(() => {});
  await sleep(page, 3000);
  await caption(page, '');
  await sleep(page, 600);

  console.log('customer flow recorded');
} finally {
  await finishSession(s, 'customer');
}
