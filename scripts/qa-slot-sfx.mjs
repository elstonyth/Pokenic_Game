// Verifies the slot SFX wiring on the PROD build (:4000), no backend required.
// 1. The 5 /sounds/slot-*.mp3 are served (200 + audio/mpeg).
// 2. The slots page actually constructs Audio() for all 5 (useSound mounted +
//    paths in the built bundle match the files on disk).
// 3. The mute toggle persists to localStorage (default unmuted → muted → unmuted).
// Full "spin → audible win" needs the live backend; this proves the plumbing.
// Run: node scripts/qa-slot-sfx.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4000';
const PACK = 'pokemon-rookie';
const EXPECTED = [
  '/sounds/slot-spin.mp3',
  '/sounds/slot-stop.mp3',
  '/sounds/slot-win.mp3',
  '/sounds/slot-bigwin.mp3',
  '/sounds/slot-sell.mp3',
];

const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exitCode = 1;
};
const ok = (m) => console.log(`✓ ${m}`);

mkdirSync('docs/research', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();

  // (2) Spy on Audio construction before any app code runs.
  await page.addInitScript(() => {
    window.__audioSrcs = [];
    const Orig = window.Audio;
    window.Audio = function (src) {
      if (src) window.__audioSrcs.push(src);
      return new Orig(src);
    };
  });

  await page.goto(`${BASE}/slots/${PACK}`, { waitUntil: 'networkidle' });

  // The control band proves SlotMachineClient mounted (and thus useSound ran).
  await page
    .getByRole('button', { name: /spin/i })
    .first()
    .waitFor({ timeout: 15000 });
  ok('slots page rendered (controller mounted)');

  // (1) Served files.
  for (const path of EXPECTED) {
    const res = await page.request.get(`${BASE}${path}`);
    const ct = res.headers()['content-type'] || '';
    if (res.status() === 200 && /audio\/(mpeg|mp3)/i.test(ct)) {
      ok(`served ${path} (200, ${ct})`);
    } else {
      fail(`${path} → status ${res.status()}, content-type "${ct}"`);
    }
  }

  // (2) useSound constructed all 5 Audio elements with the right srcs.
  const srcs = await page.evaluate(() => window.__audioSrcs || []);
  for (const path of EXPECTED) {
    if (srcs.some((s) => String(s).endsWith(path)))
      ok(`useSound preloaded ${path}`);
    else
      fail(
        `useSound did NOT construct Audio for ${path} (saw: ${srcs.join(', ')})`,
      );
  }

  // (3) Mute toggle persists. Default unmuted (no key or '0').
  const muteBtn = page.getByRole('button', { name: /^mute$/i });
  await muteBtn.waitFor({ timeout: 5000 });
  await muteBtn.click();
  const afterMute = await page.evaluate(() =>
    localStorage.getItem('polycards.slot.muted'),
  );
  if (afterMute === '1') ok('mute toggle persisted muted=1');
  else fail(`after mute click, localStorage = ${afterMute}`);

  const unmuteBtn = page.getByRole('button', { name: /^unmute$/i });
  await unmuteBtn.click();
  const afterUnmute = await page.evaluate(() =>
    localStorage.getItem('polycards.slot.muted'),
  );
  if (afterUnmute === '0') ok('mute toggle persisted muted=0');
  else fail(`after unmute click, localStorage = ${afterUnmute}`);

  await page.screenshot({ path: 'docs/research/slot-sfx-idle.png' });
  await browser.close();
  console.log(process.exitCode ? '\nFAILED' : '\nPASSED');
} catch (e) {
  await browser.close();
  fail(e.message);
  console.log('\nFAILED');
}
