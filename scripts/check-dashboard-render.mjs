// Browser render-check for the admin/vendor SPAs. An HTTP 200 on /dashboard is
// NOT enough — the SPA returns 200 while its client-side router can render its
// OWN 404 ("There is no page at this address") if the baked basename (__BASE__)
// doesn't match the mount path. This loads each URL in a real browser and fails
// if the SPA shows that 404 or if #root never populates.
//
//   node scripts/check-dashboard-render.mjs http://localhost:9000/dashboard/ http://localhost:9000/seller/
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node check-dashboard-render.mjs <url> [url...]');
  process.exit(2);
}

const browser = await chromium.launch();
let failed = false;
try {
  for (const url of urls) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      // Let the SPA router settle.
      await page.waitForTimeout(1500);
      const bodyText = (await page.locator('body').innerText()).slice(0, 4000);
      const rootChildren = await page.evaluate(
        () => document.getElementById('root')?.childElementCount ?? 0,
      );
      const is404 = /there is no page at this address/i.test(bodyText);
      const empty = rootChildren === 0;
      if (is404 || empty) {
        console.error(
          `  FAIL  ${url} -> ${is404 ? 'SPA 404 (basename mismatch)' : '#root empty (blank)'}`,
        );
        failed = true;
      } else {
        console.log(
          `  PASS  ${url} -> rendered (#root has ${rootChildren} children)`,
        );
      }
    } catch (e) {
      console.error(`  FAIL  ${url} -> ${e.message}`);
      failed = true;
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
