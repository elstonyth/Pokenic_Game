// Focused QA: claim one voucher on /vip and verify the balance credit.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PW_REWARD_EMAIL ?? 'test@pokenic.app';
const PASSWORD = process.env.PW_REWARD_PASSWORD ?? 'PokenicTest123!';
const OUT = 'docs-local-qa';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });

let loggedIn = false;
for (let attempt = 0; attempt < 4 && !loggedIn; attempt++) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const accept = page.getByRole('button', { name: 'Accept' });
  if (
    await accept
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
  ) {
    await accept.click();
    await accept.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
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
  if (!loggedIn) await page.waitForTimeout(8000);
}
if (!loggedIn) throw new Error('login failed');

const readBalance = async () => {
  const text = await page
    .getByRole('button', { name: /Balance .* top up/i })
    .textContent();
  const m = (text ?? '').match(/RM\s*([\d,.]+)/);
  return m ? Number(m[1].replace(/,/g, '')) : NaN;
};

// Vouchers section can hide when getDaily 429s under QA pressure — retry with
// backoff until the Claim buttons render.
let claim = null;
for (let attempt = 0; attempt < 5; attempt++) {
  await page.goto(`${BASE}/vip`, { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: 'Claim', exact: true }).first();
  if (await btn.isVisible().catch(() => false)) {
    claim = btn;
    break;
  }
  console.log(
    `attempt ${attempt + 1}: vouchers section absent, backing off 12s`,
  );
  await page.waitForTimeout(12_000);
}
if (!claim) throw new Error('vouchers section never rendered on /vip');

const before = await readBalance();
const countBefore = await page
  .getByRole('button', { name: 'Claim', exact: true })
  .count();
// The first row's label (e.g. "RM 120.00") tells us the expected credit.
const rowLabel = await page
  .locator('div', { has: claim })
  .locator('p.font-heading')
  .first()
  .textContent()
  .catch(() => null);
await claim.click();
await page.waitForTimeout(4000);
const countAfter = await page
  .getByRole('button', { name: 'Claim', exact: true })
  .count();
console.log(
  `claim rows: ${countBefore} -> ${countAfter}; row label: ${rowLabel}`,
);
if (countAfter !== countBefore - 1)
  throw new Error('claim row did not move to claimed');

// Balance updates on next fetch — reload and compare.
await page.goto(`${BASE}/vip`, { waitUntil: 'networkidle' });
const after = await readBalance();
console.log(`balance: RM ${before} -> RM ${after}`);
if (!(after > before))
  throw new Error('balance did not increase after voucher claim');
await page.screenshot({ path: `${OUT}/vip-after-claim.png`, fullPage: false });

await browser.close();
console.log('VIP CLAIM QA PASS');
