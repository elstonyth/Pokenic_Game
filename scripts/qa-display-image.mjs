// One-off QA: screenshot a pack page's hero stage with a display_image
// (factory scene) set, desktop + mobile. Pack slug via QA_PACK (default the
// local test pack).
import { chromium } from 'playwright';

const BASE = process.env.PW_BASE ?? 'http://127.0.0.1:4000';
const PACK = process.env.QA_PACK ?? 'pikachu';

const browser = await chromium.launch();
for (const [name, viewport] of [
  ['desktop-1440', { width: 1440, height: 900 }],
  ['mobile-390', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/slots/${PACK}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `docs/research/qa-display-image-${name}.png` });
  // Log the stage box + rendered hero img facts (stable test hook, not alt text).
  const facts = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="pack-hero-image"]');
    const box = img?.closest('div')?.getBoundingClientRect();
    return img
      ? {
          src: img.currentSrc || img.src,
          stage: box
            ? `${Math.round(box.width)}x${Math.round(box.height)}`
            : null,
        }
      : null;
  });
  console.log(name, JSON.stringify(facts));
  await page.close();
}
await browser.close();
