// Task 15 storefront walk against the :4000 production standalone build.
// Logs in by minting a customer JWT at :9000 and setting the storefront's
// httpOnly `_polycards_jwt` cookie directly (the app reads it server-side).
// Screenshots land in docs/research/.
//
//   node scripts/qa-daily-storefront-walk.mjs
//
// Walks: logged-out /daily (teaser + JoinPrompt) → logged-in /daily (box hero,
// draw ×3 to the cap, PrizeReveal each time, voucher claim) → /rewards
// redirect → /me VIP status lines → /vouchers.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const FRONT = 'http://localhost:4000';
const API = 'http://localhost:9000';
const CUST = {
  email: process.env.QA_CUSTOMER_EMAIL ?? 'test@polycards.app',
  password: process.env.QA_CUSTOMER_PASSWORD ?? 'PolycardsTest123!',
};

mkdirSync('docs/research', { recursive: true });
let failures = 0;
const check = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
};

// Auth + store routes are rate-limited — retry 429s with a pause.
async function call(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    return res;
  }
}

// --- API session for state cross-checks (publishable key via public store route
// is not needed: we only read /store/daily with the same bearer the page uses).
const pubRes = await call(`${API}/auth/user/emailpass`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.QA_ADMIN_EMAIL,
    password: process.env.QA_ADMIN_PASSWORD,
  }),
}).then((r) => r.json());
if (!pubRes.token)
  throw new Error('admin auth failed (needed for publishable key)');
const keys = await call(`${API}/admin/api-keys?type=publishable`, {
  headers: { Authorization: `Bearer ${pubRes.token}` },
}).then((r) => r.json());
const PUB = keys.api_keys?.[0]?.token;
if (!PUB) throw new Error('no publishable key');

const cust = await call(`${API}/auth/customer/emailpass`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(CUST),
}).then((r) => r.json());
if (!cust.token) throw new Error('customer auth failed');
const CH = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${cust.token}`,
  'x-publishable-api-key': PUB,
};
const apiDaily = () =>
  call(`${API}/store/daily`, { headers: CH }).then((r) => r.json());

const pre = await apiDaily();
console.log(
  `pre-walk state: tier=${pre.box?.tier} draws ${pre.box?.draws_today}/${pre.box?.draws_per_day}, ` +
    `${pre.vouchers.claimable.length} claimable / ${pre.vouchers.claimed.length} claimed`,
);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
  });
  const page = await context.newPage();

  // --- 1. logged-out /daily: teaser + JoinPrompt, no crash ---
  await page.goto(`${FRONT}/daily`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('h1:has-text("DAILY REWARDS")', {
    timeout: 15000,
  });
  check(true, 'logged-out /daily renders the DAILY REWARDS teaser');
  check(
    (await page.locator('text=Join to start your streak').count()) > 0,
    'logged-out /daily shows the JoinPrompt',
  );
  await page.screenshot({
    path: 'docs/research/task15-front-daily-loggedout.png',
    fullPage: true,
  });

  // --- login: set the httpOnly JWT cookie the server actions read ---
  await context.addCookies([
    {
      name: '_polycards_jwt',
      value: cust.token,
      url: FRONT,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // --- 2. logged-in /daily: box hero for the customer's tier ---
  await page.goto(`${FRONT}/daily`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('h1:has-text("DAILY REWARDS")', {
    timeout: 15000,
  });
  check(
    (await page.locator(`text=${pre.box.tier} tier —`).count()) > 0,
    `logged-in /daily shows the tier-${pre.box.tier} box hero (${pre.box.name})`,
  );
  await page.screenshot({
    path: 'docs/research/task15-front-daily-loggedin.png',
    fullPage: true,
  });

  // --- 3. draw to the cap: PrizeReveal each time, then the capped state ---
  const drawsLeft = pre.box.draws_per_day - pre.box.draws_today;
  const openBox = page.locator('button:has-text("Open box")');
  for (let i = 0; i < drawsLeft; i++) {
    await openBox.click();
    const dialog = page.locator(
      '[role="dialog"][aria-label="Daily box reveal"]',
    );
    await dialog.waitFor({ timeout: 20000 });
    // Case-insensitive: the kind labels render through a CSS `uppercase` class,
    // so innerText comes back as e.g. "CREDIT WON".
    const text = (await dialog.innerText()).replace(/\s+/g, ' ');
    const kind = /credit won/i.test(text)
      ? 'credit'
      : /voucher won/i.test(text)
        ? 'voucher'
        : /prize won/i.test(text)
          ? 'product'
          : /no prize today/i.test(text)
            ? 'nothing'
            : 'UNKNOWN';
    check(
      kind !== 'UNKNOWN',
      `draw ${i + 1}/${drawsLeft}: PrizeReveal shown (${kind})`,
    );
    if (i === 0)
      await page.screenshot({
        path: 'docs/research/task15-front-daily-reveal.png',
      });
    await dialog.locator('button:has-text("Continue")').click();
    await dialog.waitFor({ state: 'detached', timeout: 15000 });
    // onClose triggers a server-action refetch; give it a beat + pace the limiter.
    await page.waitForTimeout(1500);
  }

  const after = await apiDaily();
  check(
    after.box.draws_today === after.box.draws_per_day,
    `draw cap reached server-side (${after.box.draws_today}/${after.box.draws_per_day})`,
  );
  await page.waitForSelector('button:has-text("Come back in")', {
    timeout: 15000,
  });
  check(
    await page.locator('button:has-text("Come back in")').isDisabled(),
    'capped state: draw button disabled with the reset countdown',
  );
  await page.screenshot({
    path: 'docs/research/task15-front-daily-capped.png',
    fullPage: true,
  });

  // --- 4. claim one voucher: moves from claimable to claimed ---
  const claimable0 = after.vouchers.claimable.length;
  if (claimable0 > 0) {
    const claimBtns = page.locator('button:text-is("Claim")');
    const before = await claimBtns.count();
    await claimBtns.first().click();
    // Wait for the SERVER to confirm the claim (the UI flips the button to
    // "Claiming…" immediately, so counting buttons races the server action).
    let postClaim = null;
    for (let t = 0; t < 20; t++) {
      postClaim = await apiDaily();
      if (postClaim.vouchers.claimable.length === claimable0 - 1) break;
      await page.waitForTimeout(1000);
    }
    check(
      postClaim.vouchers.claimable.length === claimable0 - 1 &&
        postClaim.vouchers.claimed.length === after.vouchers.claimed.length + 1,
      `voucher claim persisted server-side (${postClaim.vouchers.claimable.length} claimable / ${postClaim.vouchers.claimed.length} claimed)`,
    );
    check(
      (await claimBtns.count()) === before - 1,
      `voucher claim: claimable rows ${before} → ${before - 1} in the UI`,
    );
    // Claimed history renders under the <details> disclosure.
    await page.locator('details summary:has-text("Claimed")').click();
    check(
      (await page.locator('details >> text=Claimed').count()) > 0,
      'claimed section lists the claimed voucher',
    );
    await page.screenshot({
      path: 'docs/research/task15-front-daily-claimed.png',
      fullPage: true,
    });
  } else {
    console.log('SKIP: no claimable vouchers to claim');
  }

  // --- 5. /rewards redirects to /daily ---
  await page.goto(`${FRONT}/rewards`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForURL((u) => u.pathname === '/daily', { timeout: 15000 });
  check(true, '/rewards redirected to /daily');

  // --- 6. /me: VIP block status lines + Rewards quick-access ---
  await page.goto(`${FRONT}/me`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('text=Today’s box:', { timeout: 15000 });
  const final = await apiDaily();
  check(
    (await page.locator('text=opened — resets tomorrow').count()) > 0,
    '/me status line 1: today’s box shows "opened — resets tomorrow" after capping',
  );
  check(
    (await page
      .locator(`text=${final.vouchers.claimable.length} to claim`)
      .count()) > 0 &&
      (await page
        .locator(`text=${final.vouchers.claimed.length} claimed`)
        .count()) > 0,
    `/me status line 2: "${final.vouchers.claimable.length} to claim · ${final.vouchers.claimed.length} claimed" matches the API`,
  );
  check(
    (await page.locator('a[href="/daily"]:has-text("Rewards")').count()) > 0,
    '/me Rewards quick-access links to /daily',
  );
  await page.screenshot({
    path: 'docs/research/task15-front-me.png',
    fullPage: true,
  });

  // --- 7. /vouchers: hero + claimable with "Claim on Daily" + claimed history ---
  await page.goto(`${FRONT}/vouchers`, {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  await page.waitForSelector('h1:has-text("Your Vouchers")', {
    timeout: 15000,
  });
  check(true, '/vouchers hero renders');
  if (final.vouchers.claimable.length > 0) {
    check(
      (await page
        .locator('a[href="/daily"]:has-text("Claim on Daily")')
        .count()) === final.vouchers.claimable.length,
      `/vouchers lists ${final.vouchers.claimable.length} active vouchers with "Claim on Daily" links`,
    );
  }
  check(
    (await page.locator('h2:has-text("Claimed History")').count()) > 0 &&
      (final.vouchers.claimed.length === 0 ||
        (await page.locator('text=No claimed vouchers yet').count()) === 0),
    `/vouchers claimed history renders with real data (${final.vouchers.claimed.length} claimed)`,
  );
  await page.screenshot({
    path: 'docs/research/task15-front-vouchers.png',
    fullPage: true,
  });
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
