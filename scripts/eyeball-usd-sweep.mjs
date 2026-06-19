// One-off visual check for the admin currency→usd() sweep. Reuses the saved
// operator session (no re-login → no auth rate-limit). Screenshots + dumps the
// price/subtitle text so the $X.00 normalization is verifiable, not just visual.
// Run: node scripts/eyeball-usd-sweep.mjs
import { chromium } from 'playwright';

const ADMIN = process.env.ADMIN_BASE || 'http://localhost:7000/dashboard';
const STORAGE = 'tests/e2e/.auth/admin.json';
const PACK = 'pokemon-rookie';

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();

  // ── Packs list: price column should now read $X.00 (was $X) ────────────────
  await page.goto(`${ADMIN}/packs`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/login'))
    throw new Error(
      'storageState expired — re-run the e2e suite to refresh tests/e2e/.auth/admin.json',
    );
  await page.locator('table tbody tr').first().waitFor({ timeout: 20_000 });
  const priceCells = await page
    .locator('tbody tr td.tabular-nums')
    .allInnerTexts();
  console.log(
    'PACKS price column cells:',
    JSON.stringify(priceCells.map((s) => s.trim())),
  );
  await page.screenshot({
    path: 'docs/research/usd-packs-list.png',
    fullPage: true,
  });

  // ── Prize-pool picker: card subtitle should read "· $X.00" ─────────────────
  await page.goto(`${ADMIN}/packs/${PACK}`, { waitUntil: 'domcontentloaded' });
  await page.locator('tbody tr').first().waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Manage cards' }).click();
  await page.getByRole('checkbox').first().waitFor({ timeout: 15_000 });
  const subtitles = await page
    .locator('span.text-ui-fg-subtle.text-xs')
    .allInnerTexts();
  const moneyLines = subtitles
    .map((s) => s.trim())
    .filter((s) => s.includes('·'));
  console.log('PICKER subtitle lines:', JSON.stringify(moneyLines.slice(0, 6)));
  await page.screenshot({ path: 'docs/research/usd-pool-picker.png' });

  console.log(
    'OK — screenshots written to docs/research/usd-packs-list.png + usd-pool-picker.png',
  );
} finally {
  await browser.close();
}
