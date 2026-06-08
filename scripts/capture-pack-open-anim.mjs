// Capture the /claw/[slug] pack-opening overlay through its live-matched stages
// (3D pack carousel -> tap -> face-down slab -> tap -> reveal) via the free demo
// spin. Motion ON. Verifies each stage + the final card.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:4000";
const OUT = "docs/research/phase6/open-anim";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); // motion ON
const page = await ctx.newPage();
const r = { checks: {} };
const ok = (k, c, d) => (r.checks[k] = c ? "PASS" : `FAIL${d ? " — " + d : ""}`);

await page.goto(`${BASE}/claw/pokemon-mythic`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Try a free demo spin/i }).click();
await page.waitForTimeout(700);

const dlg = page.locator('[role="dialog"][aria-modal="true"]');
ok("overlay_open", await dlg.isVisible().catch(() => false));

// Stage 1: pack carousel
let txt = await dlg.innerText().catch(() => "");
ok("stage_packs", /tap to select a pack|shuffle/i.test(txt));
await page.screenshot({ path: `${OUT}/01-carousel.png` });

// tap -> slab
await dlg.click({ position: { x: 720, y: 470 } });
await page.waitForTimeout(500);
txt = await dlg.innerText().catch(() => "");
ok("stage_slab", /tap to reveal|1 of 1/i.test(txt));
await page.screenshot({ path: `${OUT}/02-slab.png` });

// tap -> metadata (auto -> card)
await dlg.click({ position: { x: 720, y: 470 } });
await page.waitForTimeout(450);
await page.screenshot({ path: `${OUT}/03-metadata.png` });
await page.waitForTimeout(1600); // metadata -> card
await page.screenshot({ path: `${OUT}/04-card.png` });

txt = await dlg.innerText().catch(() => "");
ok("stage_card", /value:/i.test(txt));
ok("shows_continue", /Continue/i.test(txt));
ok("shows_open_another", /Open another/i.test(txt));
ok("has_card_img", (await dlg.locator("img").count()) >= 1);

// Continue closes
await page.getByRole("button", { name: /^Continue$/ }).click().catch(() => {});
await page.waitForTimeout(400);
ok("continue_closes", !(await dlg.isVisible().catch(() => false)));

await browser.close();
r.verdict = Object.values(r.checks).every((v) => v === "PASS") ? "PASS" : "FAIL";
console.log(JSON.stringify(r, null, 2));
