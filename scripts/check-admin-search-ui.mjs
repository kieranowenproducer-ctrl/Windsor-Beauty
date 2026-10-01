// Does searching, sorting and the date range on Orders and Invoices actually work?
//
//   npm run dev                (in another terminal)
//   npm run check:search
//
// Drives the two real screens in a real browser against the real database. Read-only: it types in
// boxes and reads the list back, and never presses a button that writes anything.
//
// WHY IT EXISTS. Kieran, 2026-09-24: typing "Amber Reta" into Orders found nothing, because the
// box looked for that whole phrase in one field at a time and never looked at the products at all.
// The unit checks in scripts/test-admin-search.mjs prove the rules on made-up data. This one
// proves the boxes on the screen are wired to those rules, on his own orders.

import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const env = readFileSync('.env.local', 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const TOKEN = process.env.ADMIN_SESSION_TOKEN;
if (!TOKEN) { console.error('ADMIN_SESSION_TOKEN missing'); process.exit(1); }

function findChromium() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  if (!existsSync(root)) return null;
  for (const b of readdirSync(root).filter(d => d.startsWith('chromium-')).sort().reverse()) {
    const p = join(root, b, 'chrome-win64/chrome.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ok       ${name}${detail ? '  ' + detail : ''}`); }
  else { failed++; console.log(`  FAILED   ${name}  ${detail}`); }
};

const browser = await chromium.launch({ executablePath: findChromium() });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addCookies([{ name: 'wg_admin_session', value: TOKEN, domain: 'localhost', path: '/' }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

// ----------------------------------------------------------------- ORDERS
console.log('\n=== Orders ===\n');
await page.goto(`${BASE}/admin/orders`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// "No orders match your search" is drawn as a row spanning every column, so a raw <tr> count reads
// an empty list as one result. Data rows are the ones with no colspan in them.
const DATA_ROWS = 'table tbody tr:not(:has(td[colspan]))';
const rowCount = () => page.locator(DATA_ROWS).count();
// Column 1 is the tick box, 2 the coloured square, 3 the order (number, date and what was bought),
// 4 the customer. Read them by position rather than guessing at the whole row's text.
const ORDER_CELL = `${DATA_ROWS} td:nth-child(3)`;
const CUSTOMER_CELL = `${DATA_ROWS} td:nth-child(4)`;
const searchBox = page.getByLabel('Search orders');
const sortBox = page.locator('select').filter({ hasText: 'Newest first' }).first();

const baseRows = await rowCount();
check('the orders list loads with rows', baseRows > 0, `${baseRows} rows`);

// Take a real customer and a real product off the first row, then search for the two together.
const firstRowText = await page.locator(CUSTOMER_CELL).first().innerText();
console.log(`  (first row reads: ${firstRowText.replace(/\s+/g, ' ').slice(0, 110)})`);

const firstName = (firstRowText.trim().match(/[A-Za-z]{3,}/) || [''])[0];

await searchBox.fill(firstName);
await page.waitForTimeout(400);
const nameOnly = await rowCount();
check(`one word ("${firstName}") narrows the list`, nameOnly > 0 && nameOnly <= baseRows, `${nameOnly} of ${baseRows}`);

// A product word off the same row, from the column that lists what was bought.
const itemsText = await page.locator(ORDER_CELL).first().innerText();
const productWord = (itemsText.match(/\d+×\s*([A-Za-z]{4,})/) || [])[1] || '';
if (productWord) {
  await searchBox.fill(`${firstName} ${productWord}`);
  await page.waitForTimeout(400);
  const both = await rowCount();
  check(`TWO words ("${firstName} ${productWord}") still find the order`, both > 0, `${both} rows`);
  check('two words narrow further than one', both <= nameOnly, `${both} <= ${nameOnly}`);

  await searchBox.fill(`${firstName}- ${productWord}`);
  await page.waitForTimeout(400);
  check('a dash between the words does the same', (await rowCount()) === both);

  await searchBox.fill(`${firstName} + ${productWord}`);
  await page.waitForTimeout(400);
  check('a plus between the words does the same', (await rowCount()) === both);
} else {
  check('could read a product word off the first row', false, 'no product word found');
}

// ---- The faults Kieran found on 25 September, on his own data.
// He typed a product name and got an empty screen. The orders existed; they had archived
// themselves weeks earlier, and the working list does not show the archive.
for (const product of ['hgh', 'aod']) {
  await searchBox.fill(product);
  await page.waitForTimeout(500);
  const found = await rowCount();
  check(`"${product}" finds orders (it found nothing before)`, found > 0, `${found} rows`);
}

// Both of those are archived orders, so the rows must say so rather than look like live work.
await searchBox.fill('aod');
await page.waitForTimeout(500);
check('rows pulled out of the archive are labelled',
  (await page.locator(`${DATA_ROWS} >> text=Archived`).count()) > 0);

// "and" is how a person joins two words out loud, so it must not be searched for as a word.
await searchBox.fill('hgh and aod');
await page.waitForTimeout(500);
const andRows = await rowCount();
await searchBox.fill('hgh aod');
await page.waitForTimeout(500);
check('"hgh and aod" behaves exactly like "hgh aod"', (await rowCount()) === andRows, `${andRows} rows`);

// Nothing has both, so rather than an empty table it must say what each word finds on its own.
await searchBox.fill('hgh and aod');
await page.waitForTimeout(500);
check('an empty two-word search explains itself',
  (await page.locator('text=No order has all of those words').count()) > 0);

await searchBox.fill('hgh or aod');
await page.waitForTimeout(500);
const orRows = await rowCount();
check('"hgh or aod" finds both sets', orRows > andRows, `${orRows} rows`);

// Short names, the other thing he asked for: the full name must find the shorthand too.
await searchBox.fill('reta');
await page.waitForTimeout(500);
const shortName = await rowCount();
await searchBox.fill('retatrutide');
await page.waitForTimeout(500);
check('"retatrutide" finds as much as "reta"', (await rowCount()) >= shortName,
  `${await rowCount()} vs ${shortName}`);

await searchBox.fill('zzqq nothinglikethis');
await page.waitForTimeout(400);
check('nonsense finds nothing, and says so',
  (await rowCount()) === 0 && (await page.locator('text=No orders match').count()) > 0);

await searchBox.fill('');
await page.waitForTimeout(400);
check('clearing the box brings them all back', (await rowCount()) === baseRows);

// Sorting
await sortBox.selectOption('name_az');
await page.waitForTimeout(400);
const azNames = await page.locator(CUSTOMER_CELL).allInnerTexts();
const azFirst = azNames.map(t => t.trim().split('\n')[0].toLowerCase()).filter(Boolean);
const azSorted = [...azFirst].sort((a, b) => a.localeCompare(b, 'en-GB'));
check('Name A to Z really is alphabetical', JSON.stringify(azFirst) === JSON.stringify(azSorted),
  `first: ${azFirst[0]}  last: ${azFirst[azFirst.length - 1]}`);

await sortBox.selectOption('name_za');
await page.waitForTimeout(400);
const zaFirst = (await page.locator(CUSTOMER_CELL).allInnerTexts())
  .map(t => t.trim().split('\n')[0].toLowerCase()).filter(Boolean);
check('Name Z to A is the reverse', zaFirst[0] === azFirst[azFirst.length - 1], `${zaFirst[0]}`);

await sortBox.selectOption('newest');
await page.waitForTimeout(400);
check('back to newest first shows the same count', (await rowCount()) === baseRows);

// Date range
await page.getByLabel('Show orders placed on or after this day').fill('2030-01-01');
await page.waitForTimeout(400);
check('a future start date empties the list', (await rowCount()) === 0);
await page.getByLabel('Show orders placed on or after this day').fill('');
await page.waitForTimeout(400);
check('clearing the date brings them back', (await rowCount()) === baseRows);

check('the hint about two words is on screen', (await page.locator('text=Search takes more than one word').count()) > 0);
check('nothing threw in the browser', errors.length === 0, errors.join(' | '));

// Phone width: nothing may spill off the side.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no sideways scroll at 390px', overflow <= 1, `${overflow}px over`);
await page.setViewportSize({ width: 1440, height: 1000 });

// --------------------------------------------------------------- INVOICES
console.log('\n=== Invoices ===\n');
errors.length = 0;
await page.goto(`${BASE}/admin/invoices`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const INV_ROWS = 'table tbody tr:not(:has(td[colspan]))';
const invRows = () => page.locator(INV_ROWS).count();
const INV_CUSTOMER_CELL = `${INV_ROWS} td:nth-child(3)`;
const invBase = await invRows();
check('the invoices list loads with rows', invBase > 0, `${invBase} rows`);

const invName = ((await page.locator(INV_CUSTOMER_CELL).first().innerText()).trim().match(/[A-Za-z]{3,}/) || [''])[0];
const invSearch = page.getByLabel('Search invoices');

// Typing alone has to be enough. Until 25 September this box did nothing until you pressed Enter
// or found the small Search button, so typing a product name and watching nothing happen looked
// exactly like a search that did not work. NOTE: no Enter anywhere in this block.
await invSearch.fill(invName);
await page.waitForTimeout(1400);
const invOne = await invRows();
check(`typing one word ("${invName}") narrows the invoices with no Enter`,
  invOne > 0 && invOne < invBase, `${invOne} of ${invBase}`);

for (const product of ['hgh', 'aod']) {
  await invSearch.fill(product);
  await page.waitForTimeout(1400);
  const found = await invRows();
  check(`typing "${product}" finds invoices with no Enter`, found > 0 && found < invBase, `${found} rows`);
}

await invSearch.fill('reta');
await page.waitForTimeout(1400);
const invShort = await invRows();
await invSearch.fill('retatrutide');
await page.waitForTimeout(1400);
check('"retatrutide" finds as many invoices as "reta"', (await invRows()) >= invShort,
  `${await invRows()} vs ${invShort}`);

await invSearch.fill(invName);
await invSearch.press('Enter');
await page.waitForTimeout(1200);

await invSearch.fill(`${invName} zzqqnothing`);
await invSearch.press('Enter');
await page.waitForTimeout(1200);
check('adding a word that cannot be there empties it', (await invRows()) === 0);

await invSearch.fill('');
await invSearch.press('Enter');
await page.waitForTimeout(1200);
check('clearing brings the invoices back', (await invRows()) === invBase);

const invSort = page.locator('select').filter({ hasText: 'Newest first' }).first();
await invSort.selectOption('name_az');
await page.waitForTimeout(1500);
const invNames = (await page.locator(INV_CUSTOMER_CELL).allInnerTexts())
  .map(t => t.trim().split('\n')[0].toLowerCase()).filter(Boolean);
const invSorted = [...invNames].sort((a, b) => a.localeCompare(b, 'en-GB'));
check('invoices Name A to Z really is alphabetical', JSON.stringify(invNames) === JSON.stringify(invSorted),
  `first: ${invNames[0]}  last: ${invNames[invNames.length - 1]}`);

await page.getByLabel('Show invoices created on or after this day').fill('2030-01-01');
await page.waitForTimeout(1500);
check('a future start date empties the invoices', (await invRows()) === 0);

await page.locator('button', { hasText: 'Clear' }).first().click();
await page.waitForTimeout(1500);
check('Clear puts everything back', (await invRows()) === invBase, `${await invRows()} rows`);

check('nothing threw on the invoices page', errors.length === 0, errors.join(' | '));

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
const invOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('no sideways scroll at 390px', invOverflow <= 1, `${invOverflow}px over`);

await browser.close();
console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
