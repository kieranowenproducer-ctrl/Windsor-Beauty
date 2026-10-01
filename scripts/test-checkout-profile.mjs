// Local checkout journey checks. No order or payment request is made.
// Run with the site on port 3010: node scripts/test-checkout-profile.mjs
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const base = process.env.CHECK_BASE ?? 'http://localhost:3010';
const browserRoot = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const executablePath = existsSync(browserRoot)
  ? readdirSync(browserRoot).filter(name => name.startsWith('chromium-')).sort().reverse()
    .map(name => join(browserRoot, name, 'chrome-win64', 'chrome.exe')).find(existsSync)
  : undefined;
if (!executablePath) throw new Error('Playwright Chromium is not installed.');

const browser = await chromium.launch({ executablePath, headless: true });
const customer = {
  id: 83, firstName: 'Test', lastName: 'Customer', email: 'test@example.com',
  phone: '07123456789', marketingConsent: true,
  addressLine1: '1 Test Lane', addressLine2: null, addressCity: 'Windsor',
  addressPostcode: 'SL4 1AA', addressCountry: 'GB',
};

async function openCheckout(account) {
  const context = await browser.newContext();
  await context.addInitScript(({ owner }) => {
    localStorage.setItem('wb_entry_confirmed_v2', String(Date.now()));
    sessionStorage.setItem('wb_entry_confirmed', 'true');
    sessionStorage.setItem('wb_discount_popup_seen', 'true');
    localStorage.setItem('wb_cart_v2', JSON.stringify({
      owner,
      items: [{
        productId: '055', name: '5-Amino-1MQ 100mg', slug: '5-amino-1mq-100mg',
        variant: '100mg', price: 30, quantity: 1,
      }],
    }));
  }, { owner: account ? `customer:${account.id}` : 'guest' });
  await context.route('**/api/account/me', route => account
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ customer: account }) })
    : route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/account/welcome-code', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/products/catalogue', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route('**/api/products/visibility', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"hidden":[]}' }));
  await context.route('**/api/products/stock', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"stock":{}}' }));
  await context.route('**/api/shipping-rates', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ukStandardRate":10,"internationalRate":40}' }));
  const page = await context.newPage();
  const response = await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  assert.ok(response?.ok(), 'checkout page opens');
  await page.getByLabel('Email Address').waitFor();
  return { context, page };
}

try {
  {
    const { context, page } = await openCheckout(customer);
    assert.equal(await page.getByLabel('First Name').inputValue(), 'Test');
    assert.equal(await page.getByLabel('Email Address').inputValue(), 'test@example.com');
    assert.equal(await page.getByLabel('Phone Number').inputValue(), '07123456789');
    assert.equal(await page.getByLabel('Address Line 1').inputValue(), '1 Test Lane');
    assert.equal(await page.getByLabel('Email Address').getAttribute('readonly'), '');
    assert.equal(await page.getByLabel('Address Line 1').getAttribute('readonly'), '');
    assert.equal(await page.getByText('Keep me updated with special offers').count(), 0);
    await page.getByRole('button', { name: 'Send to another address' }).click();
    assert.equal(await page.getByLabel('Address Line 1').inputValue(), '');
    assert.equal(await page.getByLabel('Address Line 1').getAttribute('readonly'), null);
    await page.getByLabel('Recipient name (if different)').fill('Other Recipient');
    await page.getByLabel('Address Line 1').fill('2 Other Road');
    await page.getByRole('button', { name: 'Use my saved address' }).click();
    assert.equal(await page.getByLabel('Address Line 1').inputValue(), '1 Test Lane');
    assert.equal(await page.getByLabel('Recipient name (if different)').count(), 0);
    await context.close();
  }
  {
    const { context, page } = await openCheckout({ ...customer, addressLine1: null, addressCity: null, addressPostcode: null });
    assert.equal(await page.getByLabel('Address Line 1').getAttribute('readonly'), null);
    await page.getByLabel('Address Line 1').fill('3 New Street');
    assert.equal(await page.getByLabel('Address Line 1').inputValue(), '3 New Street');
    await context.close();
  }
  {
    const { context, page } = await openCheckout(null);
    assert.equal(await page.getByLabel('Email Address').getAttribute('readonly'), null);
    assert.equal(await page.getByText('Keep me updated with special offers').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Send to another address' }).count(), 0);
    await context.close();
  }
  console.log('Checkout profile journeys passed: saved details, alternate address, incomplete profile, guest consent.');
} finally {
  await browser.close();
}
