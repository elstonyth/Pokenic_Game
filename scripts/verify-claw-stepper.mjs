// Phase 1 verification — /claw per-card quantity stepper + inline Open.
// Verifies against the PROD build on :4000 (per repo workflow), screenshots to
// docs/research/route-qa/, and reads back the PNGs.
//
// Run: node scripts/verify-claw-stepper.mjs   (needs `npx next start -p 4000`)
import { chromium } from "playwright";
import { mkdirSync } from "fs";

const BASE = process.env.BASE_URL ?? "http://localhost:4000";
const OUT = "docs/research/route-qa";
mkdirSync(OUT, { recursive: true });

const results = [];
const pass = (name, ok) => results.push({ name, ok: !!ok });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // --- /claw desktop ---
  await page.goto(`${BASE}/claw`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByRole("button", { name: "Open", exact: true }).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${OUT}/claw-stepper-1440.png` });

  const dec = page.locator('button[aria-label="Decrease quantity"]');
  const inc = page.locator('button[aria-label="Increase quantity"]');
  const max = page.getByRole("button", { name: "Max", exact: true });
  const open = page.getByRole("button", { name: "Open", exact: true });
  pass("stepper − present", (await dec.count()) > 0);
  pass("stepper + present", (await inc.count()) > 0);
  pass("stepper MAX present", (await max.count()) > 0);
  pass("inline Open buttons present", (await open.count()) > 0);

  // First card's qty span sits inside the stepper container next to the − button.
  const stepper = page.locator('div:has(> button[aria-label="Decrease quantity"])').first();
  const qty = stepper.locator("span").first();
  const start = (await qty.innerText()).trim();
  pass("qty starts at 1", start === "1");

  await inc.first().click();
  await inc.first().click();
  const after = (await qty.innerText()).trim();
  pass("qty increments to 3", after === "3");

  await stepper.getByRole("button", { name: "Max", exact: true }).click();
  const maxed = (await qty.innerText()).trim();
  pass("MAX sets qty to 10", maxed === "10");

  // Inline Open (logged-out) → should open the auth modal, not navigate.
  const urlBefore = page.url();
  await open.first().click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/claw-open-click-1440.png` });
  pass("Open did not navigate away from /claw", page.url() === urlBefore || page.url().endsWith("/claw"));

  // --- /claw mobile (informs whether mobile rows need the stepper too) ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/claw`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/claw-stepper-390.png` });

  // --- /repacks regression (shared QtyStepper) ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/repacks`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/repacks-stepper-1440.png` });
  pass("repacks stepper still present", (await page.locator('button[aria-label="Increase quantity"]').count()) > 0);

  await ctx.close();
} finally {
  await browser.close();
}

let ok = 0;
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
  if (r.ok) ok++;
}
console.log(`\n${ok}/${results.length} checks passed`);
console.log(`screenshots → ${OUT}/claw-stepper-{1440,390}.png, claw-open-click-1440.png, repacks-stepper-1440.png`);
process.exit(ok === results.length ? 0 : 1);
