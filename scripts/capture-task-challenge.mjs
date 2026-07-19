// capture-task-challenge.mjs — screenshot the data-driven /task Weekly Challenge.
// Usage: node scripts/capture-task-challenge.mjs [baseUrl] [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4000';
const OUT = process.argv[3] ?? 'docs/research/task-challenge';
mkdirSync(OUT, { recursive: true });

// Mobile-first sweep: the small-phone floor (SE), the Android/iPhone middle,
// the Pro Max ceiling, tablet, and desktop.
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'se-320', width: 320, height: 568 },
  { name: 'android-360', width: 360, height: 800 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'promax-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
];

const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // Accept the cookie banner once so it doesn't overlay the shot.
  await page.goto(BASE + '/', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page
    .getByRole('button', { name: 'Accept' })
    .click({ timeout: 5000 })
    .catch(() => {});
  // networkidle so backend-hosted featured-card art has loaded before capture.
  for (const route of [
    { name: 'task', path: '/task' },
    { name: 'leaderboard', path: '/leaderboard' },
  ]) {
    await page.goto(BASE + route.path, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    // Scroll-prime loading=lazy images (fullPage alone never enters their
    // viewport, so below-fold art captures as empty gaps).
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1200);
    const file = path.join(OUT, `${route.name}-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log('ok', file);
  }
  // Prove the stage rail swipes: advance one card via the desktop chevron
  // (drag and chevron share the same onIndexChange path) and reshoot it.
  if (vp.name === 'desktop') {
    await page.goto(BASE + '/task', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(800);
    const next = page.getByRole('button', { name: 'Next card' });
    if (await next.isVisible().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(600);
      const rail = page
        .locator('section', { hasText: 'Weekly reward stages' })
        .last();
      const file = path.join(OUT, 'task-rail-swiped.png');
      await rail.screenshot({ path: file });
      console.log('ok', file);
    } else {
      console.log('SKIP rail swipe — chevron not visible');
    }
  }
  await ctx.close();
}
await browser.close();
