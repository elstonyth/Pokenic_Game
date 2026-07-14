// Customer ordering flow through the storefront UI:
//   a funded customer opens a pack (API setup for speed) → logs into the UI →
//   enters the vault's select mode → "Deliver 1" in the bulk action bar →
//   add-address form → submit → and confirms the order is tracked on /orders
//   as 'Requested'.
// Re-authored 2026-07-14 against the always-on vault (spec 2026-07-14):
// no mode toggle — tap the tile's "Select <name>" button directly; delivery
// stays the bar's "Deliver N" pill.
import { test, expect } from '@playwright/test';
import { BASE, stamp } from './helpers/constants';
import { createCustomer, openPack } from './helpers/api';
import * as sf from './helpers/storefront';

const PACK = 'pokemon-rookie';
// createCustomer() registers every customer with this fixed password.
const PASSWORD = 'PwE2e2026!';

test('customer requests delivery of a vaulted card via the UI', async ({
  page,
}) => {
  // Pre-accept cookie consent (key: src/lib/consent.ts CONSENT_KEY): the fresh-
  // context banner (z-50, bottom-anchored) overlays the action bar's pills and
  // intercepts their clicks; suppressing it also keeps the screenshots clean.
  await page.addInitScript(() => {
    window.localStorage.setItem('pokenic.cookie-consent', 'accepted');
  });

  // Funded customer holding one vaulted card (API setup), then log into the UI.
  const cust = await createCustomer(100);
  await openPack(cust.token, PACK); // auto-vaults the pull
  await sf.login(page, PACK, cust.email, PASSWORD);

  await page.goto(`${BASE}/vault`, { waitUntil: 'domcontentloaded' });
  // Selection is always on — tap the tile directly. (?!All\b) skips the
  // bar's "Select All" button.
  await page
    .getByRole('button', { name: /^Select (?!All\b).+/ })
    .first()
    .click();
  await page.getByRole('button', { name: /^Deliver 1$/ }).click();

  // A fresh customer has no saved address → the add-address form shows at once.
  const modal = page.getByRole('dialog', { name: 'Request delivery' });
  await modal.locator('input[aria-label="First name"]').fill('Ash');
  await modal.locator('input[aria-label="Last name"]').fill('Ketchum');
  await modal
    .locator('input[aria-label="Address"]')
    .fill(`${stamp()} Pallet Town Rd`);
  await modal.locator('input[aria-label="City"]').fill('Kuala Lumpur');
  await modal.locator('input[aria-label="Postal code"]').fill('50000');
  await modal.locator('input[aria-label="Country code"]').fill('MY');
  await modal.getByRole('button', { name: /save address/i }).click();

  // saveAddress() auto-selects the new address and closes the add-form, which
  // enables the footer submit. Wait for that, then submit.
  const submit = modal.getByRole('button', {
    name: 'Request delivery',
    exact: true,
  });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();
  // Success fires onSubmitted → the modal closes. Wait for that BEFORE navigating
  // (otherwise the goto aborts the in-flight requestDelivery server action).
  await expect(modal).toBeHidden({ timeout: 15_000 });

  // Success pops the top-of-screen toast, which then auto-dismisses. Scoped
  // to the toast's role=status container so a same-text occurrence elsewhere
  // on the page can never satisfy the assertion.
  const toast = page
    .getByRole('status')
    .filter({ hasText: 'Shipping order created successfully!' });
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 8_000 });

  // Tracked on the orders page: the row's status badge reads "Requested".
  // (Scope to tbody — the table HEADER also carries a "Requested" column.)
  await page.goto(`${BASE}/orders`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.locator('tbody').getByText('Requested', { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
