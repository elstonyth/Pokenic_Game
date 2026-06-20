// Loads key routes against the running standalone storefront and fails if the
// browser reports ANY CSP violation. Run after `npm run build && serve :4000`.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const ROUTES = ['/', '/claw', '/leaderboard', '/how-it-works', '/about'];

const browser = await chromium.launch();
const page = await browser.newPage();
const violations = [];
page.on('console', (msg) => {
  const t = msg.text();
  if (/Content Security Policy|Refused to/i.test(t)) violations.push(t);
});

for (const route of ROUTES) {
  violations.length = 0;
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  if (violations.length) {
    console.error(`CSP violations on ${route}:`);
    violations.forEach((v) => console.error('  ' + v));
    await browser.close();
    process.exit(1);
  }
  console.log(`OK ${route}`);
}
await browser.close();
console.log('No CSP violations.');
