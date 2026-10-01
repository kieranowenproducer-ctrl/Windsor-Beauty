// Local UI proof for the visitor-demand screen. The API is intercepted with
// made-up rows, so this never reads or changes the live customer database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.VISITOR_DEMAND_PROOF_URL || 'http://localhost:3024';
const env = fs.readFileSync(path.join(site, '.env.local'), 'utf8');
const token = (env.match(/^ADMIN_SESSION_TOKEN=([^\r\n]*)/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
if (!token) throw new Error('ADMIN_SESSION_TOKEN is missing from the local preview environment');
const playwrightUrl = 'file:///' + path.join(site, 'node_modules/playwright-core/index.js').replace(/\\/g, '/').replace(/'/g, '%27').replace(/ /g, '%20');
const playwright = (await import(playwrightUrl)).default;

const now = new Date().toISOString();
const response = {
  addresses: [], places: [], concerns: [], recent: [], banned: [], bannedMatches: [], visits: [], visitSources: [], visitors: [],
  trackingHealth: { healthy: true, latestVisitAt: now, latestCustomerActivityAt: now, untrackedRegistrations24h: 0, feedStale: false },
  pageNames: { '/shop/retatrutide': 'Retatrutide', '/shop/category/fat-loss': 'Fat Loss' },
  demand: {
    days: 30, pageViews: 19, visits: 7, visitors: 5, memberViews: 4, basketAdds: 3,
    products: [
      { slug: 'retatrutide', path: '/shop/retatrutide', name: 'Retatrutide', categories: ['Peptides', 'Fat Loss'], pageViews: 12, visitors: 5, visits: 6, memberViews: 4, basketAdds: 3, orders: 1, lastSeen: now },
      { slug: 'ghk-cu', path: '/shop/ghk-cu', name: 'GHK-Cu', categories: ['Peptides', 'Beauty'], pageViews: 7, visitors: 3, visits: 3, memberViews: 0, basketAdds: 0, orders: 0, lastSeen: now },
    ],
    categories: [
      { name: 'Fat Loss', pageViews: 12, visitors: 5, basketAdds: 3, orders: 1, products: 1 },
      { name: 'Beauty', pageViews: 7, visitors: 3, basketAdds: 0, orders: 0, products: 1 },
    ],
  },
  trends: {
    weekly: [
      { bucket: '2026-09-07', pageViews: 19, visits: 7, visitors: 5, memberViews: 4, basketAdds: 3, orders: 1, topProduct: 'Retatrutide', topCategory: 'Fat Loss' },
      { bucket: '2026-08-31', pageViews: 11, visits: 5, visitors: 4, memberViews: 1, basketAdds: 1, orders: 0, topProduct: 'GHK-Cu', topCategory: 'Beauty' },
    ],
    monthly: [
      { bucket: '2026-09-01', pageViews: 30, visits: 12, visitors: 9, memberViews: 5, basketAdds: 4, orders: 1, topProduct: 'Retatrutide', topCategory: 'Fat Loss' },
    ],
  },
  journeys: [{
    id: 'visit-1', ipAddress: '192.0.2.1', customerId: 7, customerName: 'Example Member', customerEmail: 'member@example.test',
    country: 'GB', countryRegion: 'England', city: 'Windsor', source: 'instagram', sourceDetail: null,
    startedAt: new Date(Date.now() - 8 * 60_000).toISOString(), lastAt: now, pageViews: 2, basketAdds: 1, precise: true,
    steps: [
      { id: 'page:1', kind: 'page_view', path: '/shop/category/fat-loss', productSlug: null, at: new Date(Date.now() - 8 * 60_000).toISOString() },
      { id: 'page:2', kind: 'page_view', path: '/shop/retatrutide', productSlug: null, at: new Date(Date.now() - 4 * 60_000).toISOString() },
      { id: 'action:1', kind: 'add_to_basket', path: '/shop/retatrutide', productSlug: 'retatrutide', at: now },
    ],
  }],
};

console.log('Launching the local visitor-demand proof...');
const browser = await playwright.chromium.launch({ channel: 'msedge', timeout: 15_000 })
  .catch(() => playwright.chromium.launch({ channel: 'chrome', timeout: 15_000 }));
let failed = 0;
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport });
  await context.addCookies([{ name: 'wb_admin_session', value: token, domain: 'localhost', path: '/' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.route('**/api/admin/ip-addresses?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) }));
  await page.goto(`${base}/admin/ip-addresses`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.getByText('Demand Across the Shop').waitFor();
  await page.getByText('What Is Winning Now').waitFor();
  await page.getByRole('button', { name: 'Products & Categories' }).click();
  await page.locator('[data-demand-product="Retatrutide"]:visible').waitFor();
  const productVisible = await page.locator('[data-demand-product="Retatrutide"]:visible').count();
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await page.locator('[data-demand-category="Fat Loss"]:visible').waitFor();
  const categoryVisible = await page.locator('[data-demand-category="Fat Loss"]:visible').count();
  await page.getByRole('button', { name: 'Overview' }).click();
  await page.getByText('Performance Over Time', { exact: true }).waitFor();
  const weeklyVisible = await page.getByText('Week of 7 Sept 2026', { exact: true }).count();
  await page.getByRole('button', { name: 'Month by Month' }).click();
  const monthlyRow = page.getByText('September 2026', { exact: true });
  await monthlyRow.waitFor();
  const monthlyVisible = await monthlyRow.count();
  await page.getByRole('button', { name: 'Visitor Journeys' }).click();
  await page.getByText('Example Member').click();
  const basketVisible = await page.getByText('Added Retatrutide to basket').count();
  const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  const ok = productVisible > 0 && categoryVisible > 0 && weeklyVisible > 0 && monthlyVisible > 0 && basketVisible > 0 && !pageOverflow;
  if (process.env.VISITOR_DEMAND_PROOF_SHOTS === '1') {
    await page.getByRole('button', { name: 'Overview' }).click();
    await page.screenshot({ path: path.join(site, `.visitor-demand-${viewport.width}.png`), fullPage: true });
  }
  console.log(`${ok ? 'ok' : 'FAIL'} ${viewport.width}px products, categories, weekly, monthly, journey and page width (products ${productVisible}, categories ${categoryVisible}, weekly ${weeklyVisible}, monthly ${monthlyVisible}, basket ${basketVisible}, overflow ${pageOverflow})`);
  if (!ok) failed += 1;
  await context.close();
}
await browser.close();
if (failed) process.exit(1);
