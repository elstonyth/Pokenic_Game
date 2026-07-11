// UI check for the playthrough withdrawal gate on the wallet page (:4100).
// Seeds the locked state (S3), screenshots it, reseeds to the unlocked state
// (S1b), and screenshots again. Destructive ONLY for the given test customer,
// and refuses to run unless that customer is a wdtest-* account.
// Env: WD_EMAIL, WD_PW, WD_CUST (customer id), WD_OUT (screenshot dir).
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const STORE = 'http://127.0.0.1:4100';
const EMAIL = process.env.WD_EMAIL;
const PASSWORD = process.env.WD_PW;
const CUST_ID = process.env.WD_CUST;
const OUT = process.env.WD_OUT;

// Fail fast on missing inputs — a hole here otherwise surfaces as a cryptic
// Playwright/psql error mid-run.
const missing = Object.entries({
  WD_EMAIL: EMAIL,
  WD_PW: PASSWORD,
  WD_CUST: CUST_ID,
  WD_OUT: OUT,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`missing env: ${missing.join(', ')}`);
  process.exit(1);
}
if (!existsSync(OUT)) {
  console.error(`WD_OUT dir does not exist: ${OUT}`);
  process.exit(1);
}

const PSQL =
  'docker exec -i pokenic-postgres psql -U medusa -d medusa -v ON_ERROR_STOP=1';
const psql = (sql) => execSync(PSQL, { input: sql, encoding: 'utf8' });
const psqlValue = (sql) =>
  execSync(`${PSQL} -t -A`, { input: sql, encoding: 'utf8' }).trim();

// Guard: the dev DB is shared — refuse to wipe ledger rows unless the target
// customer is a throwaway wdtest account.
const custEmail = psqlValue(
  `SELECT email FROM customer WHERE id = '${CUST_ID}';`,
);
if (!/^wdtest-.*@pokenic\.test$/.test(custEmail)) {
  console.error(
    `refusing: customer ${CUST_ID} (email '${custEmail}') is not a wdtest-*@pokenic.test account`,
  );
  process.exit(1);
}

// Atomic reseed: DELETE + INSERTs commit together or not at all.
function seed(rows) {
  const inserts = rows
    .map(
      (r, i) =>
        `('ctx_wdui_${Date.now()}_${i}', '${CUST_ID}', ${r.amount}, '${r.reason}', ` +
        `'{"value": "${r.amount}", "precision": 20}')`,
    )
    .join(',\n   ');
  psql(
    `BEGIN;
     DELETE FROM credit_transaction WHERE customer_id = '${CUST_ID}';
     INSERT INTO credit_transaction (id, customer_id, amount, reason, raw_amount) VALUES
     ${inserts};
     COMMIT;`,
  );
}

const browser = await chromium.launch({ headless: true });
let a = false;
let b = false;
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });

  // login via header modal (same flow as scripts/login-stack.mjs)
  let ok = false;
  for (let i = 0; i < 4 && !ok; i++) {
    try {
      await page.goto(`${STORE}/`, { waitUntil: 'domcontentloaded' });
      const loginBtn = page
        .locator('header')
        .getByRole('button', { name: /^login$/i })
        .first();
      await loginBtn.waitFor({ state: 'visible', timeout: 30000 });
      await loginBtn.click();
      const email = page.locator('input[name="email"]');
      await email.waitFor({ state: 'visible', timeout: 20000 });
      await email.fill(EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.press('input[name="password"]', 'Enter');
      await loginBtn.waitFor({ state: 'detached', timeout: 15000 });
      ok = true;
    } catch (e) {
      console.log(
        `login attempt ${i + 1} failed: ${String(e.message).split('\n')[0]}`,
      );
      await page.waitForTimeout(3000);
    }
  }
  if (!ok) throw new Error('LOGIN FAILED');
  console.log('logged in');

  async function shot(name, mustContain) {
    await page.goto(`${STORE}/wallet`, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${OUT}/wallet-${name}.png`,
      fullPage: false,
    });
    const text = await page.locator('main, body').first().innerText();
    const absent = mustContain.filter((s) => !text.includes(s));
    console.log(
      absent.length
        ? `FAIL  ${name}: missing ${JSON.stringify(absent)}`
        : `PASS  ${name}: found ${JSON.stringify(mustContain)}`,
    );
    return absent.length === 0;
  }

  // state 1: S3 locked — deposit 100, used 50, buyback 100
  seed([
    { amount: 100, reason: 'topup' },
    { amount: -50, reason: 'pack_open' },
    { amount: 100, reason: 'buyback' },
  ]);
  a = await shot('locked', [
    'Withdrawals locked',
    'RM 50.00', // remaining playthrough
    'RM 150.00', // total balance
  ]);

  // state 2: S1b unlocked — deposit 100, used 100, buyback 80
  seed([
    { amount: 100, reason: 'topup' },
    { amount: -100, reason: 'pack_open' },
    { amount: 80, reason: 'buyback' },
  ]);
  b = await shot('unlocked', ['Withdrawable', 'RM 80.00']);
} finally {
  await browser.close();
}
process.exit(a && b ? 0 : 1);
