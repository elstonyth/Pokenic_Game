// Screenshot QA for the tier-less "RIP A PACK" shelf on the home page.
//   node scripts/qa-pack-tiers.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const FRONT = process.env.PW_BASE ?? 'http://localhost:4000';
mkdirSync('docs/research', { recursive: true });

const browser = await chromium.launch({ headless: true });
let failures = 0;

async function shoot(tag, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const resp = await page.goto(`${FRONT}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2500);
  await page
    .locator('button:has-text("Reject")')
    .first()
    .click({ timeout: 1000 })
    .catch(() => {});
  await page.waitForTimeout(300);
  // Scroll the RIP A PACK shelf into view.
  await page
    .locator('#shelf-heading')
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page.waitForTimeout(600);
  const file = `docs/research/pack-tiers-${tag}.png`;
  await page.screenshot({ path: file, fullPage: true });
  // Prove the requirement, not just page health: no rarity-tier word may
  // appear inside the RIP A PACK shelf. Pack names ("Diamond Pack" etc.) and
  // chase values never contain these words, so a hit means a badge leaked back.
  const shelfText = await page
    .locator('section[aria-labelledby="shelf-heading"]')
    .innerText()
    .catch(() => '');
  const tierHit =
    /\b(immortal|legendary|mythical|rare|uncommon|common)\b/i.test(shelfText);
  const ok = (resp?.status() ?? 0) < 400 && pageErrors.length === 0 && !tierHit;
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'} [${tag}] / doc=${resp?.status()} pageErrors=${pageErrors.length} tierBadge=${tierHit} -> ${file}`,
  );
  for (const pe of pageErrors) console.log('   ', pe.slice(0, 200));
  await ctx.close();
}

await shoot('desktop', { width: 1280, height: 900 });
await shoot('mobile', { width: 390, height: 844 });

await browser.close();
process.exit(failures ? 1 : 0);
