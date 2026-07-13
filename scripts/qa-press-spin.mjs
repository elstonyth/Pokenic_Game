// scripts/qa-press-spin.mjs
// Verify the PRESS-launched spin on the PROD build (:4000), signed out (demo
// spin — no login, no charge):
//   1. idle drift is running, then SPIN accelerates it CONTINUOUSLY — the
//      per-frame velocity stays physical (no teleport to a fresh offset)
//   2. the cells visible at press time keep their content (seamless swap-in)
//   3. the strip travels far (a real spin), blurs, then rests sharp
//   4. the landed (winner) cell is centered on the winning line
//   5. the runway the spin streamed through is NOT the periodic idle tiling
//      (per-spin randomized decoys — no 1-2-3 sequence)
//   6. no page errors
// Run: node scripts/qa-press-spin.mjs
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:4000';
const PACK = process.env.QA_PACK ?? 'pokemon-black';
const STRIP = '.will-change-transform';

let failed = false;
const ok = (m) => console.log(`✓ ${m}`);
const fail = (m) => {
  console.error(`✗ ${m}`);
  failed = true;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ reducedMotion: 'no-preference' });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

await page.goto(`${BASE}/slots/${PACK}/spin?demo=1`, {
  waitUntil: 'domcontentloaded',
});
await page.waitForSelector(STRIP, { timeout: 20_000 });
await page.waitForTimeout(2000); // sprites paint + auth mode resolves (demo)

const readStrip = () =>
  page.evaluate((sel) => {
    const strip = document.querySelector(sel);
    const cs = getComputedStyle(strip);
    const x = new DOMMatrixReadOnly(cs.transform).m41;
    const a = strip.children[0].getBoundingClientRect();
    const b = strip.children[1].getBoundingClientRect();
    return { x, filter: cs.filter, pitch: b.left - a.left };
  }, STRIP);

const readSrcs = () =>
  page.evaluate((sel) => {
    const strip = document.querySelector(sel);
    return [...strip.children].map(
      (c) => c.querySelector('img')?.getAttribute('src') ?? '?',
    );
  }, STRIP);

// ---- 0. idle is drifting --------------------------------------------------
const i0 = await readStrip();
await page.waitForTimeout(800);
const i1 = await readStrip();
if (i1.x < i0.x) ok(`idle drift running (dx=${(i1.x - i0.x).toFixed(1)}px)`);
else fail(`idle not drifting: ${i0.x} -> ${i1.x}`);

const prePressSrcs = await readSrcs();
const { pitch } = i1;

// ---- 1. press SPIN with a per-frame sampler already running ---------------
await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  window.__qa = { samples: [], stop: false };
  const tick = (now) => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    window.__qa.samples.push([now, m.m41]);
    if (!window.__qa.stop) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, STRIP);

const spinBtn = page.getByRole('button', { name: /spin/i }).first();
await spinBtn.click();

// ---- 2. content visible at press is preserved (seamless strip swap) -------
await page.waitForTimeout(120); // well inside the wind-up, after React commits
const postPressSrcs = await readSrcs();
const KEEP_PROBE = 10;
const prefixSame = prePressSrcs
  .slice(0, KEEP_PROBE)
  .every((s, i) => postPressSrcs[i] === s);
if (prefixSame) ok('cells visible at press keep their content (no pop)');
else fail('visible cell content CHANGED at press (teleport of content)');

// mid-spin blur sanity (peak speed ~1.7px/ms → a real blur radius)
await page.waitForTimeout(1200);
const mid = await readStrip();
if (mid.filter.startsWith('blur')) ok(`blurred at speed (${mid.filter})`);
else fail(`no motion blur mid-spin: ${mid.filter}`);

// ---- 3. wait out the spin, stop the sampler --------------------------------
await page.waitForTimeout(5500);
const samples = await page.evaluate(() => {
  window.__qa.stop = true;
  return window.__qa.samples;
});

let maxV = 0; // px/ms between consecutive frames
let maxJump = 0; // raw px between consecutive frames
for (let i = 1; i < samples.length; i++) {
  const dt = Math.max(1, samples[i][0] - samples[i - 1][0]);
  const dx = Math.abs(samples[i][1] - samples[i - 1][1]);
  maxV = Math.max(maxV, dx / dt);
  maxJump = Math.max(maxJump, dx);
}
const travel = Math.abs(samples[samples.length - 1][1] - samples[0][1]);
// Physics peak is the accel→friction handoff (~1.7px/ms); allow headroom for
// frame jitter. The OLD teleport was a >1000px single-frame jump.
if (maxV < 5 && maxJump < 250) {
  ok(
    `continuous launch: max ${maxV.toFixed(2)}px/ms, biggest frame step ${maxJump.toFixed(0)}px`,
  );
} else {
  fail(
    `TELEPORT: max ${maxV.toFixed(2)}px/ms, biggest frame step ${maxJump.toFixed(0)}px`,
  );
}
if (travel > 800) ok(`real spin travel: ${travel.toFixed(0)}px`);
else fail(`barely moved: ${travel.toFixed(0)}px`);

// ---- 4. landed: sharp, at rest, winner centered on the line ----------------
const s0 = await readStrip();
await page.waitForTimeout(500);
const s1 = await readStrip();
if (s1.filter === 'none' && s1.x === s0.x)
  ok(`landed sharp and at rest (x=${s1.x.toFixed(1)})`);
else fail(`still moving/blurred after settle: dx=${s1.x - s0.x}, ${s1.filter}`);

const centering = await page.evaluate((sel) => {
  const strip = document.querySelector(sel);
  const win = strip.parentElement.getBoundingClientRect();
  const center = win.left + win.width / 2;
  let best = Infinity;
  for (const c of strip.children) {
    const r = c.getBoundingClientRect();
    best = Math.min(best, Math.abs(r.left + r.width / 2 - center));
  }
  return best;
}, STRIP);
if (centering < 3)
  ok(`winner centered on the line (off by ${centering.toFixed(2)}px)`);
else
  fail(`nothing centered on the line (best off by ${centering.toFixed(1)}px)`);

// ---- 5. the runway is randomized, not the periodic tiling ------------------
const landedSrcs = await readSrcs();
// The idle tiling repeats with period = pool size; a randomized runway must not
// be periodic for ANY small p (the old strip repeated every pool-length cells).
const runway = landedSrcs.slice(KEEP_PROBE, landedSrcs.length - 6);
let periodic = 0;
for (let p = 1; p <= Math.min(24, Math.floor(runway.length / 2)); p++) {
  let match = true;
  for (let i = 0; i + p < runway.length && match; i++)
    if (runway[i + p] !== runway[i]) match = false;
  if (match) {
    periodic = p;
    break;
  }
}
if (periodic === 0)
  ok(`runway is non-periodic across ${runway.length} cells (randomized route)`);
else fail(`runway repeats every ${periodic} cells (still a 1-2-3 sequence)`);

// ---- 6. page errors ---------------------------------------------------------
if (pageErrors.length === 0) ok('no page errors during the spin');
else fail(`page errors: ${pageErrors.join(' | ')}`);

await ctx.close();
await browser.close();
process.exitCode = failed ? 1 : 0;
console.log(failed ? '\nFAILED' : '\nALL PASS');
