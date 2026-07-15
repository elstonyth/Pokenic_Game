// 1) Rapid-equip stress: swap frames 12x back-to-back — the degraded notice
//    must NEVER appear (equips no longer refetch the page) and each equip
//    applies instantly. 2) Rarity: darkrai tile border must compute to the
//    Mythical purple (168,85,247).
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.OUT_DIR ?? '.';
mkdirSync(OUT, { recursive: true });
const kv = Object.fromEntries(
  readFileSync(path.join(process.cwd(), 'scripts', '.dev-logins'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [
      l.slice(0, l.indexOf('=')).trim(),
      l.slice(l.indexOf('=') + 1).trim(),
    ]),
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:4000/', { waitUntil: 'domcontentloaded' });
const loginBtn = page
  .locator('header')
  .getByRole('button', { name: /^login$/i });
await loginBtn.waitFor({ state: 'visible', timeout: 60000 });
await loginBtn.click();
const email = page.locator('input[name="email"]');
await email.waitFor({ state: 'visible', timeout: 20000 });
await email.fill(kv.CUST_EMAIL || 'test@polycards.app');
await page.fill('input[name="password"]', kv.CUST_PW);
await page.keyboard.press('Enter');
await loginBtn.waitFor({ state: 'detached', timeout: 20000 });
console.log('login: ok');

await page.goto('http://127.0.0.1:4000/me', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// -- rapid equip stress: 3 rounds over LV 10..40 --
let noticeSeen = 0;
let equipsDone = 0;
for (let round = 0; round < 3; round++) {
  for (const lv of [10, 20, 30, 40]) {
    const btn = page.locator(`button[aria-label="Equip LV ${lv} frame"]`);
    if ((await btn.count()) === 0) continue; // currently equipped one
    await btn.click();
    // equipped badge must move to this tile without a page refetch
    await page
      .locator(`button[aria-label="LV ${lv} frame (equipped)"]`)
      .waitFor({ state: 'visible', timeout: 8000 });
    equipsDone++;
    if ((await page.getByText(/Couldn.t load your VIP level/).count()) > 0) {
      noticeSeen++;
    }
  }
}
console.log(
  `stress: ${equipsDone} rapid equips, degraded notice seen ${noticeSeen}x ${noticeSeen === 0 ? '— PASS' : '— FAIL'}`,
);
await page.screenshot({ path: `${OUT}/stress-after.png` });

// wallet + VIP card should still be healthy on a fresh navigation
await page.goto('http://127.0.0.1:4000/me', { waitUntil: 'networkidle' });
const walletBroken = await page.getByText(/Couldn.t load your balance/).count();
const vipBroken = await page.getByText(/Couldn.t load your VIP level/).count();
console.log(
  `post-stress /me: wallet broken=${walletBroken}, vip broken=${vipBroken} ${walletBroken + vipBroken === 0 ? '— PASS' : '— FAIL'}`,
);

// -- rarity: darkrai tile border color on the diamond pack --
await page.goto('http://127.0.0.1:4000/slots/pokemon-diamond', {
  waitUntil: 'networkidle',
});
await page.waitForTimeout(800);
const tile = page.locator('button[aria-label*="Darkrai" i]').first();
if (await tile.count()) {
  const border = await tile
    .locator('span')
    .first()
    .evaluate((el) => getComputedStyle(el).borderColor);
  console.log(
    `darkrai tile border: ${border} ${border.includes('168, 85, 247') ? '— MYTHICAL PURPLE: PASS' : '— unexpected'}`,
  );
  await tile.screenshot({ path: `${OUT}/darkrai-tile.png` });
} else {
  console.log('darkrai tile not found on diamond pack page');
}
await browser.close();
