// Showcase recording — GUEST flow (no login) on the prod storefront (:4000).
// home → browse packs → pack detail → free Demo Spin reveal → sign-up CTA.
// Run: node scripts/showcase/record-guest.mjs   → docs/showcase/guest.{webm,mp4}
import {
  startSession,
  finishSession,
  caption,
  moveClick,
  moveXY,
  sleep,
} from './lib.mjs';

const BASE = 'http://localhost:4000';
const s = await startSession();
const { page } = s;

try {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await caption(page, 'Polycards — rip real, graded trading-card packs');
  await sleep(page, 1500);
  await page.mouse.move(960, 540, { steps: 10 });
  await page.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' }));
  await sleep(page, 1600);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await sleep(page, 900);

  await caption(page, 'Browse the packs');
  await moveClick(page, page.locator('nav a[href="/claw"]').first());
  await page.waitForURL(/\/claw/, { timeout: 15000 }).catch(() => {});
  await sleep(page, 1400);

  await caption(page, 'Pick a pack');
  const card = page.locator('a[href^="/claw/"]').first();
  if (await card.count()) await moveClick(page, card);
  else
    await page.goto(`${BASE}/claw/pokemon-rookie`, {
      waitUntil: 'domcontentloaded',
    });
  await page
    .getByRole('button', { name: /demo spin/i })
    .waitFor({ timeout: 15000 });
  await sleep(page, 1200);

  await caption(page, 'Try it free — Demo Spin (no account needed)');
  await moveClick(page, page.getByRole('button', { name: /demo spin/i }));
  await sleep(page, 2600); // cylinder shuffles in
  await moveXY(page, 960, 520); // tap pack → slab rises
  await sleep(page, 900);
  await moveXY(page, 960, 520); // tap slab → metadata
  await sleep(page, 700);
  await moveXY(page, 960, 110); // background tap → card stage
  await page
    .getByText('Demo', { exact: true })
    .waitFor({ timeout: 25000 })
    .catch(() => {});
  await sleep(page, 1800);

  await caption(page, 'Sign up to keep what you pull');
  const cta = page.getByRole('button', { name: /sign up to keep/i });
  if (await cta.count()) {
    await cta.scrollIntoViewIfNeeded().catch(() => {});
    const box = await cta.boundingBox();
    if (box)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
        steps: 26,
      });
  }
  await sleep(page, 2600);
  await caption(page, '');
  await sleep(page, 600);

  console.log('guest flow recorded');
} finally {
  await finishSession(s, 'guest');
}
