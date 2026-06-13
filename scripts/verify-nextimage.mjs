// Visual verification of the next/image migration. Screenshots the pages that
// render card/pack art from LOCAL assets (no backend needed): home (hero packs
// + recent pulls), claw (pack grid), a pack detail (claw machine + top hits),
// activity (coin + card thumbs). Reads back as PNGs in docs/research/.
// Run: node scripts/verify-nextimage.mjs [packSlug]
import { chromium } from 'playwright';

const BASE = 'http://localhost:4000';
const slug = process.argv[2] || 'pokemon-black';
const shots = [
  ['/', 'verify-ni-home'],
  ['/claw', 'verify-ni-claw'],
  [`/claw/${slug}`, 'verify-ni-packdetail'],
  ['/activity', 'verify-ni-activity'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('response', (r) => {
  // next/image optimizer endpoint — confirm it serves the migrated images.
  if (r.url().includes('/_next/image') && r.status() >= 400) {
    errors.push(`IMG ${r.status()} ${r.url().slice(0, 120)}`);
  }
});

for (const [path, name] of shots) {
  const res = await page.goto(`${BASE}${path}`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `docs/research/${name}.png`, fullPage: true });
  // Count optimized images actually rendered (next/image rewrites src to /_next/image).
  const imgStats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img')];
    return {
      total: imgs.length,
      optimized: imgs.filter((i) => i.currentSrc.includes('/_next/image'))
        .length,
      broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
    };
  });
  console.log(
    `${path} → status ${res.status()} | imgs ${imgStats.total} (opt ${imgStats.optimized}, broken ${imgStats.broken}) → ${name}.png`,
  );
}

console.log(
  errors.length
    ? `\nCONSOLE/IMG ERRORS:\n${errors.join('\n')}`
    : '\nNo console/image errors.',
);
await browser.close();
