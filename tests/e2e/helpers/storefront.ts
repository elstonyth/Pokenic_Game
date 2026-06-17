// Storefront (:4000) page-object helpers. The reveal-theater timing here is
// ported verbatim from the proven scripts/qa-claw-e2e.mjs — the open animation
// has no clean end-signal, so fixed settles are intentional, not laziness.
import { type Page, expect } from '@playwright/test';
import { BASE } from './constants';

const revealDialog = (page: Page) =>
  page.getByRole('dialog', { name: /^opening /i });

export async function gotoPack(page: Page, slug: string): Promise<void> {
  await page.goto(`${BASE}/claw/${slug}`, { waitUntil: 'domcontentloaded' });
}

// Did the auth CTA flip to the logged-in "Open Pack" within `ms`?
async function flippedToOpen(page: Page, ms: number): Promise<boolean> {
  try {
    await page.getByRole('button', { name: /open pack/i }).waitFor({
      timeout: ms,
    });
    return true;
  } catch {
    return false;
  }
}

async function submitSignup(
  page: Page,
  slug: string,
  username: string,
  email: string,
  password: string,
): Promise<void> {
  await gotoPack(page, slug);
  await page
    .getByRole('button', { name: /^sign up$/i })
    .first()
    .click();
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.getByRole('button', { name: /create account/i }).click();
}

async function submitLogin(
  page: Page,
  slug: string,
  email: string,
  password: string,
): Promise<void> {
  await gotoPack(page, slug);
  await page
    .getByRole('button', { name: /^login$/i })
    .first()
    .click();
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.press('input[name="password"]', 'Enter');
}

// Create the account via the UI. The backend rate-limits sign-ins, so under
// suite-wide auth pressure the register or the follow-up login can be throttled.
// Alternate create-account / login with a backoff until the CTA flips: whichever
// half got throttled, the next pass completes it (the account exists after a
// successful register even if its login 429'd).
export async function signup(
  page: Page,
  slug: string,
  username: string,
  email: string,
  password: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await submitSignup(page, slug, username, email, password);
    if (await flippedToOpen(page, 12_000)) return;
    await page.waitForTimeout(8_000); // clear the short sign-in window
    await submitLogin(page, slug, email, password);
    if (await flippedToOpen(page, 12_000)) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error('signup never completed — CTA never became "Open Pack"');
}

export async function login(
  page: Page,
  slug: string,
  email: string,
  password: string,
): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await submitLogin(page, slug, email, password);
    if (await flippedToOpen(page, 12_000)) return;
    await page.waitForTimeout(8_000);
  }
  throw new Error('login never completed — CTA never became "Open Pack"');
}

export async function logout(page: Page, slug: string): Promise<void> {
  await gotoPack(page, slug);
  await page.locator('header').getByRole('button').last().click();
  await page.getByRole('menuitem', { name: /log out/i }).click();
  await page
    .getByRole('button', { name: /log in to open/i })
    .waitFor({ timeout: 15_000 });
}

// "Each open costs $X in site credits — your balance: $Y"
export async function readPriceAndBalance(
  page: Page,
): Promise<{ price: number; balance: number }> {
  const line = page.getByText(/Each open costs \$/);
  await line.waitFor({ timeout: 15_000 });
  const text = (await line.textContent()) ?? '';
  const m = text.match(
    /costs \$([\d,.]+) in site credits — your balance:\s*\$([\d,.]+)/,
  );
  if (!m) throw new Error(`unparsable price/balance line: ${text}`);
  return {
    price: Number(m[1].replace(/,/g, '')),
    balance: Number(m[2].replace(/,/g, '')),
  };
}

export async function topUp(page: Page, amount: number): Promise<void> {
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /add credits/i }).click();
  await page.getByLabel('Top-up amount in USD').fill(String(amount));
  await page
    .getByRole('button', { name: new RegExp(`^Add \\$${amount}\\.00$`) })
    .click();
  await page.getByText(/added to your balance/i).waitFor({ timeout: 15_000 });
}

// Stage 1 wraps the screen in a stopPropagation block — selection happens on the
// grabbable pack, so click that. Later stages bubble to the dialog root.
async function selectPack(page: Page): Promise<void> {
  const dialog = revealDialog(page);
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.locator('div.cursor-grab').click();
}

async function tapOverlay(page: Page): Promise<void> {
  const dialog = revealDialog(page);
  await dialog.waitFor({ timeout: 15_000 });
  const box = await dialog.boundingBox();
  if (!box) throw new Error('reveal dialog has no box');
  await dialog.click({ position: { x: box.width / 2, y: 60 } });
}

// Reveal theater: cylinder → tap pack → slab → tap → metadata → card → keep.
export async function openPackAndKeep(page: Page): Promise<void> {
  await page.getByRole('button', { name: /open pack/i }).click();
  await page.waitForTimeout(2600); // cylinder shuffle settle — no end-signal
  await selectPack(page);
  await page.waitForTimeout(1000);
  await tapOverlay(page);
  const keep = page.getByRole('button', { name: /keep in vault/i });
  await keep.waitFor({ timeout: 25_000 });
  await keep.click();
  await page.waitForTimeout(800); // keep/dismiss transition settle
}

export async function gotoVault(page: Page): Promise<void> {
  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
}

// A vaulted card renders a "Sell for $X (90%)" button — wait for at least one.
export async function expectVaultHasCard(page: Page): Promise<void> {
  await expect(
    page.getByRole('button', { name: /sell for/i }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

// Sell the first vaulted card end-to-end: the grid "Sell for $X" button opens
// the confirm dialog, then the dialog's own "Sell for $X" button fires the
// buyback. Without the second click the modal never confirms and the buyback
// endpoint is never hit (the gap that left the sell-back path untested).
export async function sellFirstCard(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /sell for/i })
    .first()
    .click();
  // Scope to the modal (aria-label "Confirm sell-back") so the dialog's confirm
  // button is unambiguous vs. the grid buttons behind it.
  const dialog = page.getByRole('dialog', { name: 'Confirm sell-back' });
  await dialog.getByRole('button', { name: /sell for/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}
