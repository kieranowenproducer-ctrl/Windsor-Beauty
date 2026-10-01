// Browser check for the admin enquiry notification. The API is intercepted;
// this never creates a customer case or changes the live database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.POPUP_BASE ?? 'http://localhost:3100';
const line = readFileSync('.env.local', 'utf8').split(/\r?\n/)
  .find(item => item.startsWith('ADMIN_SESSION_TOKEN='));
const token = line?.slice('ADMIN_SESSION_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '');
if (!token) throw new Error('Admin test cookie is not configured.');

const browser = await chromium.launch({ channel: 'msedge', headless: true })
  .catch(() => chromium.launch({ channel: 'chrome', headless: true }));
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'wb_admin_session', value: token, url: base }]);
  const page = await context.newPage();
  let alert = { id: 900001, updated_at: '2030-01-01T09:00:00.000Z' };
  const refusedWrites = [];

  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.method() !== 'GET') {
      refusedWrites.push(`${request.method()} ${request.url()}`);
      await route.abort();
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/api/admin/enquiries/new-count', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      newCount: 1, oldestDays: 0, latestUpdatedAt: alert.updated_at,
      recent: [{ ...alert, name: 'Test customer', subject_label: 'Question about an order',
        source: 'direct_email', priority: 'high', order_number: 'TEST-123' }],
    }) });
  });

  await page.goto(`${base}/admin/trial`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const popup = page.getByRole('alertdialog');
  await popup.waitFor({ state: 'visible', timeout: 90_000 });
  assert.equal(await popup.getByRole('button', { name: 'Close enquiry notification' }).count(), 1);
  assert.equal(await popup.getByRole('link', { name: 'Open enquiries' }).count(), 1);

  await popup.getByRole('button', { name: 'Close enquiry notification' }).click();
  await popup.waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  assert.equal(await popup.count(), 0, 'Acknowledged note reappeared on reload');

  alert = { id: 900002, updated_at: '2030-01-02T09:00:00.000Z' };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await popup.waitFor({ state: 'visible', timeout: 90_000 });
  await popup.getByRole('link', { name: 'Open enquiries' }).click();
  await page.waitForURL('**/admin/enquiries', { timeout: 90_000 });
  assert.equal(await popup.count(), 0, 'The note stayed open after opening enquiries');
  assert.deepEqual(refusedWrites, [], 'The browser test attempted a write');
  console.log('Admin enquiry pop-up: X, reload memory, new alert and direct link passed.');
} finally {
  await browser.close();
}
