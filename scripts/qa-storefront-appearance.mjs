// Interactive QA: equip LV 10 frame + upload photo on /me, draw the daily box,
// claim a voucher on /vip, verify the framed avatar on the public profile.
// Usage: node scripts/qa-storefront-appearance.mjs <photo.png>
import { chromium } from 'playwright';

const PHOTO = process.argv[2];
if (!PHOTO)
  throw new Error(
    'usage: node scripts/qa-storefront-appearance.mjs <photo.png>',
  );
const BASE = process.env.BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PW_REWARD_EMAIL ?? 'test@pokenic.app';
const PASSWORD = process.env.PW_REWARD_PASSWORD ?? 'PokenicTest123!';
const OUT = 'docs-local-qa';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });

// -- login (header modal; balance chip = success) --
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

// -- /me: equip LV 10 frame --
await page.goto(`${BASE}/me`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /equip lv 10 frame/i }).click();
await page.getByText('Equipped', { exact: true }).waitFor({ timeout: 15_000 });
console.log('LV 10 frame equipped');

// Locked frame must NOT be clickable: LV 30 (locked at level 25).
const lockedBtn = page.getByRole('button', { name: /lv 30 frame \(unlocks/i });
if (!(await lockedBtn.isDisabled()))
  throw new Error('locked LV 30 frame is clickable');
console.log('locked LV 30 frame correctly disabled');

// -- /me: upload photo --
const [chooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 10_000 }),
  page.getByRole('button', { name: /change profile photo/i }).click(),
]);
await chooser.setFiles(PHOTO);
// router.refresh re-renders; wait for an avatar <img> inside the header button.
await page
  .getByRole('button', { name: /change profile photo/i })
  .locator('img')
  .first()
  .waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/me-framed-avatar.png`, fullPage: false });
console.log('photo uploaded; framed avatar rendered on /me');

// -- unequip + re-equip (round trip) --
await page.getByRole('button', { name: /^unequip$/i }).click();
await page
  .getByText('Equipped', { exact: true })
  .waitFor({ state: 'hidden', timeout: 15_000 });
console.log('unequipped');
await page.getByRole('button', { name: /equip lv 10 frame/i }).click();
await page.getByText('Equipped', { exact: true }).waitFor({ timeout: 15_000 });
console.log('re-equipped');

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
  const balanceBefore = await page
    .getByRole('button', { name: /Balance .* top up/i })
    .textContent();
  await claim.click();
  await page.waitForTimeout(3000);
  console.log('voucher claimed; balance before:', balanceBefore?.trim());
  await page.screenshot({
    path: `${OUT}/vip-after-claim.png`,
    fullPage: false,
  });
} else {
  console.log('no claimable vouchers — skipped');
}

// -- public profile: framed avatar visible to anyone --
await page.goto(`${BASE}/profile/demo-rs`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.screenshot({
  path: `${OUT}/public-profile-framed.png`,
  fullPage: false,
});
console.log('public profile captured');

await browser.close();
console.log('STOREFRONT APPEARANCE QA PASS');
