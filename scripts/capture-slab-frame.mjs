// QA capture for the slab-frame overlay + top-hit ordering:
//   1. /slots/pokemon-black  — Top Hits strip (2 admin-ordered framed slabs)
//   2. /slots/pokemon-trainer — NO top hits ⇒ section must be ABSENT
//   3. /activity             — framed thumbnails in the pull ledger
// Usage: node scripts/capture-slab-frame.mjs  (storefront on :4000, backend :9000)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:4000';
const OUT = 'docs/research';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// 1 — pack WITH ordered top hits
await page.goto(`${BASE}/slots/pokemon-black`, { waitUntil: 'networkidle' });
const topHits = page.locator('h2', { hasText: 'Top Hits' });
const hasSection = (await topHits.count()) > 0;
if (hasSection) await topHits.scrollIntoViewIfNeeded();
await page.waitForTimeout(1200); // reveal animation + images
await page.screenshot({ path: `${OUT}/qa-slab-tophits-black.png` });
console.log('pokemon-black Top Hits section present:', hasSection);

// order check: first tile should be darkrai (order 1), second gengar (order 2)
const values = await page
  .locator('section:has(h2:has-text("Top Hits")) img[alt]')
  .evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt')));
console.log('Top Hits card alts (order):', values.filter(Boolean).slice(0, 4));

// 2 — pack WITHOUT top hits: section must be gone
await page.goto(`${BASE}/slots/pokemon-trainer`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const count = await page.locator('h2', { hasText: 'Top Hits' }).count();
console.log('pokemon-trainer Top Hits section count (want 0):', count);
await page.screenshot({ path: `${OUT}/qa-slab-tophits-trainer.png` });

// 3 — public activity ledger with framed thumbnails
await page.goto(`${BASE}/activity`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/qa-slab-activity.png`, fullPage: false });

await browser.close();
console.log('done');
