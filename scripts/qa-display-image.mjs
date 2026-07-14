// One-off QA: screenshot the /slots/pikachu hero stage with the new
// display_image (factory scene) set, desktop + mobile.
import { chromium } from 'playwright';

const BASE = process.env.PW_BASE ?? 'http://127.0.0.1:4000';

const browser = await chromium.launch();
for (const [name, viewport] of [
  ['desktop-1440', { width: 1440, height: 900 }],
  ['mobile-390', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${BASE}/slots/pikachu`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `docs/research/qa-display-image-${name}.png` });
  // Log the stage box + rendered hero img facts.
  const facts = await page.evaluate(() => {
    const img = document.querySelector('img[alt="pikachu 123"]');
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
