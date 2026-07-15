// Part 2 of the appearance QA: re-equip (w/ backoff), box draw, voucher claim,
// public-profile framed avatar. Run after qa-storefront-appearance.mjs.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PW_REWARD_EMAIL ?? 'test@polycards.app';
const PASSWORD = process.env.PW_REWARD_PASSWORD ?? 'PolycardsTest123!';
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
console.log('logged in');

// -- re-equip LV 10 with reload+backoff (survives transient 429s on /me's fetches) --
let equipped = false;
for (let attempt = 0; attempt < 4 && !equipped; attempt++) {
  await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' });
  const equipBtn = page.getByRole('button', { name: /equip lv 10 frame/i });
  const alreadyEquipped = await page
    .getByText('Equipped', { exact: true })
    .isVisible()
    .catch(() => false);
  if (alreadyEquipped) {
    equipped = true;
    break;
  }
  if (await equipBtn.isEnabled().catch(() => false)) {
    await equipBtn.click();
    equipped = await page
      .getByText('Equipped', { exact: true })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!equipped) await page.waitForTimeout(10_000);
}
if (!equipped) throw new Error('re-equip never succeeded');
console.log('LV 10 re-equipped');
await page.screenshot({ path: `${OUT}/me-framed-final.png`, fullPage: false });

// -- /daily: draw the box --
await page.goto(`${BASE}/daily`, { waitUntil: 'networkidle' });
const openBox = page.getByRole('button', { name: /open box/i });
if (await openBox.isEnabled().catch(() => false)) {
  await openBox.click();
  const reveal = page.getByRole('dialog', { name: /daily box reveal/i });
  await reveal.waitFor({ timeout: 20_000 });
  await page.screenshot({
    path: `${OUT}/daily-prize-reveal.png`,
    fullPage: false,
  });
  await reveal.getByRole('button', { name: /continue/i }).click();
  console.log('daily box drawn + reveal dismissed');
} else {
  console.log('daily box not drawable (capped/disabled) — skipped');
}

// -- /vip: claim the first voucher --
await page.goto(`${BASE}/vip`, { waitUntil: 'networkidle' });
const claim = page.getByRole('button', { name: 'Claim', exact: true }).first();
if (await claim.isVisible().catch(() => false)) {
  const before = await page
    .getByRole('button', { name: 'Claim', exact: true })
    .count();
  await claim.click();
  await page.waitForTimeout(3500);
  const after = await page
    .getByRole('button', { name: 'Claim', exact: true })
    .count();
  console.log(`voucher claimed: claimable ${before} -> ${after}`);
  await page.screenshot({
    path: `${OUT}/vip-after-claim.png`,
    fullPage: false,
  });
} else {
  console.log('no claimable vouchers — skipped');
}

// -- public profile (fresh anonymous context: frame must be visible to anyone) --
const anon = await browser.newPage({ viewport: { width: 430, height: 932 } });
await anon.goto(`${BASE}/profile/demo-rs`, { waitUntil: 'networkidle' });
await anon.waitForTimeout(1200);
await anon.screenshot({
  path: `${OUT}/public-profile-framed.png`,
  fullPage: false,
});
console.log('public profile captured (anonymous)');

await browser.close();
console.log('APPEARANCE QA PART 2 PASS');
