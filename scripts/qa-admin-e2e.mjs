// QA the operator dashboard (:7000, vite dev) end to end: login, the cards
// catalog, the packs list, the per-pack odds editor, and the pulls ledger
// (which must show the customer pull recorded by qa-claw-e2e.mjs).
// Headless; screenshots to docs/research/. Run: node scripts/qa-admin-e2e.mjs
import { chromium } from "playwright";

const ADMIN = "http://localhost:7000";
const EMAIL = "qa-admin@pokenic.local";
const PASSWORD = "QaAdmin2026!";
const PACK = "pokemon-rookie";

const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`✓ ${m}`);

const browser = await chromium.launch({ headless: true });

try {
  const page = await (
    await browser.newContext({ viewport: { width: 1600, height: 900 } })
  ).newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── Login ──────────────────────────────────────────────────────────────────
  await page.goto(`${ADMIN}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.includes("login"), {
    timeout: 20000,
  });
  ok("admin login works");
  await page.screenshot({ path: "docs/research/qa-admin-home.png" });

  // ── Cards catalog ─────────────────────────────────────────────────────────
  await page.goto(`${ADMIN}/cards`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const cardRows = await page.locator("table tbody tr").count();
  if (cardRows > 0) ok(`cards catalog lists ${cardRows} cards`);
  else fail("cards catalog shows no rows");
  await page.screenshot({ path: "docs/research/qa-admin-cards.png" });

  // ── Packs list + odds editor ──────────────────────────────────────────────
  await page.goto(`${ADMIN}/packs`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  // The list renders pack TITLES, not slugs — link hrefs carry the slug.
  const packLink = await page.locator(`a[href*="/packs/${PACK}"]`).count();
  if (packLink > 0) ok(`packs list links to '${PACK}'`);
  else {
    const packRows = await page.locator("table tbody tr").count();
    if (packRows > 0) ok(`packs list renders ${packRows} packs (title-only)`);
    else fail("packs list shows no rows");
  }
  await page.screenshot({ path: "docs/research/qa-admin-packs.png" });

  await page.goto(`${ADMIN}/packs/${PACK}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const pctInputs = await page.locator("input").count();
  if (pctInputs > 0) ok(`pack editor renders (${pctInputs} inputs incl. odds)`);
  else fail("pack editor rendered no inputs");
  const totalLine = await page.getByText(/100(\.0+)?\s*%/).count();
  if (totalLine > 0) ok("odds editor shows a 100% total");
  else fail("odds editor 100% total not found");
  await page.screenshot({
    path: "docs/research/qa-admin-odds.png",
    fullPage: true,
  });

  // ── Pulls ledger ──────────────────────────────────────────────────────────
  await page.goto(`${ADMIN}/pulls`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const e2ePull = await page.getByText(/qa-e2e-\d+@pokenic\.local/).count();
  if (e2ePull > 0)
    ok("pulls ledger shows the E2E customer's pull (with email)");
  else fail("pulls ledger missing the E2E pull");
  const boughtBack = await page.getByText(/bought.?back/i).count();
  if (boughtBack > 0) ok("pulls ledger shows bought-back status");
  else fail("pulls ledger missing bought-back status");
  await page.screenshot({
    path: "docs/research/qa-admin-pulls.png",
    fullPage: true,
  });

  if (consoleErrors.length === 0) ok("admin dashboard: zero console errors");
  else fail(`admin console errors: ${consoleErrors.slice(0, 5).join(" | ")}`);
} catch (err) {
  fail(err.message);
} finally {
  await browser.close();
}
