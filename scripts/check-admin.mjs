// Does every button in the admin panel do what its label says?
//
//   npm run dev                (in another terminal — see the DATABASE note below)
//   npm run check:admin
//
// WHY THIS EXISTS. Samuel runs the business from the admin panel, and until
// 12 August 2026 nothing had ever proved that a button does what its word
// promises. The other 541 checks in this project cover the shop, the customer,
// the layout and the wording; not one of them opens an admin screen and reads
// what is written on the controls. The pass that produced this file found
// buttons that said one thing and did another: "Delete" on a product that
// actually undid your edits and put the original back, "Add Sample Articles"
// that published real articles to the live blog, "Enabled" that was the way to
// disable a category, seventeen buttons on one screen all saying nothing but
// "Save", and eight buttons greyed out with no word anywhere about why.
//
// WHAT IT CATCHES:
//   - an admin page that stops loading, or throws in the browser
//   - a button greyed out with no explanation on screen and no hover text
//     (a control that cannot be pressed and does not say why reads as broken)
//   - the specific dishonest labels that were fixed, coming back
//
// It cannot judge whether a NEW label is honest. That still needs a person
// pressing the button and watching what happens. This is the floor.
//
// DATABASE. Run it against `npm run dev`, never `npm start`. A started BUILD
// reads .env.production.local first, whose DATABASE_URL is empty, so the admin
// panel renders with no data and the checks pass against an empty screen. The
// check refuses to run if the admin panel has no database behind it.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CHECK_BASE ?? 'http://localhost:3000';
const TOKEN = process.env.ADMIN_SESSION_TOKEN;

if (!TOKEN) {
  console.error('\n  ADMIN_SESSION_TOKEN is not set, so this check cannot sign in to the admin panel.');
  console.error('  Run it with the same environment the app uses, e.g. from a shell that has .env.local loaded.\n');
  process.exit(1);
}

function findChromium() {
  const root = join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', 'AppData', 'Local'),
    'ms-playwright',
  );
  if (!existsSync(root)) return null;
  for (const b of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(root, b, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// Every page in the admin menu, plus the two that are reachable by link only.
const ALL_ROUTES = [
  '/admin/dashboard', '/admin/tasks', '/admin/orders', '/admin/invoices', '/admin/dispatch',
  '/admin/profit', '/admin/products', '/admin/trial', '/admin/certificates', '/admin/certificate-filler',
  '/admin/categories', '/admin/promotions', '/admin/discount-codes', '/admin/upsells', '/admin/qr-campaigns',
  '/admin/marketing', '/admin/reviews', '/admin/customers', '/admin/member-logins', '/admin/research-questions',
  '/admin/pearl-terminology', '/admin/ip-addresses', '/admin/enquiries', '/admin/verification-codes',
  '/admin/batches', '/admin/verification', '/admin/content', '/admin/system-health',
  '/admin/bulk-weights', '/admin/nav-links', '/admin/revenue', '/admin/concierge',
];
const requestedRoutes = (process.env.CHECK_ROUTES ?? '')
  .split(',')
  .map((route) => route.trim())
  .filter(Boolean);
const ROUTES = requestedRoutes.length > 0 ? requestedRoutes : ALL_ROUTES;

// Labels that were found lying, and the honest word each was replaced with.
// If one of these ever reappears on an admin screen, somebody has undone a fix.
const BANNED_LABELS = [
  { text: 'Add Sample Articles', why: 'it publishes real articles to the live blog, so it is not a sample' },
  { text: 'AI Support Inbox', why: 'that screen was retired on 2 August; the real one is Website Enquiries' },
];

let failures = 0;
let checks = 0;
const fail = (msg) => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = (msg) => { checks++; if (process.env.VERBOSE) console.log(`  ok    ${msg}`); };

const exe = findChromium();
const browser = await chromium.launch({ executablePath: exe ?? undefined, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([{
  name: 'wg_admin_session',
  value: TOKEN,
  domain: new URL(BASE).hostname,
  path: '/',
}]);
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => errors.push('threw: ' + String(e).slice(0, 160)));

console.log(`\nAdmin panel check — ${ROUTES.length} pages at ${BASE}\n`);

// ── Is there a database behind this? An empty admin panel passes everything. ──
{
  const res = await page.goto(BASE + '/admin/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (res?.status() === 401 || page.url().includes('/admin/login')) {
    console.error('  The admin session cookie was not accepted. Is ADMIN_SESSION_TOKEN the one this server is running with?\n');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(3000);
  const body = await page.locator('body').innerText();
  if (/Database not configured|DATABASE_URL/i.test(body)) {
    console.error('  The admin panel has no database behind it, so every check below would pass against an empty screen.');
    console.error('  Run this against `npm run dev`, not a started build. See the note at the top of this file.\n');
    await browser.close();
    process.exit(1);
  }
}

for (const route of ROUTES) {
  errors.length = 0;
  let status = 0;
  try {
    const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 60000 });
    status = res?.status() ?? 0;
    await page.waitForTimeout(2200);
  } catch (err) {
    fail(`${route} did not load: ${String(err).split('\n')[0].slice(0, 90)}`);
    continue;
  }

  if (status !== 200) fail(`${route} returned ${status}`); else pass(`${route} loads`);

  const real = errors.filter((e) => !/favicon|React DevTools|Download the React/i.test(e));
  if (real.length) fail(`${route} threw in the browser: ${real[0]}`); else pass(`${route} is clean in the browser`);

  const found = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const text = document.body.innerText.replace(/\s+/g, ' ');

    // A greyed-out control has to say why, somewhere the operator can see:
    // in its own hover text, or in the words of the block it sits in.
    const unexplained = [];
    document.querySelectorAll('button:disabled').forEach((el) => {
      if (!visible(el)) return;
      const label = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!label) return;
      if (el.getAttribute('title') || el.getAttribute('aria-describedby')) return;
      // A count in the label is its own explanation: "Save Changes (0)".
      if (/\(\s*0\s*\)/.test(label)) return;
      let box = el.parentElement, near = '';
      for (let i = 0; i < 4 && box; i++) { near = box.innerText || ''; if (near.length > label.length + 60) break; box = box.parentElement; }
      const explains = /\b(first|before|until|once|choose|pick|select|write|enter|add|need|no |nothing|not yet|turn on|turns on|enabled?)\b/i.test(
        near.replace(label, ' '),
      );
      if (!explains) unexplained.push(label.slice(0, 40));
    });

    return { text, unexplained: [...new Set(unexplained)] };
  });

  if (found.unexplained.length) {
    fail(`${route}: greyed out with no reason given — ${found.unexplained.join(', ')}`);
  } else pass(`${route}: every greyed-out button says why`);

  for (const banned of BANNED_LABELS) {
    if (found.text.toLowerCase().includes(banned.text.toLowerCase())) {
      fail(`${route}: "${banned.text}" is back — ${banned.why}`);
    } else pass(`${route}: no "${banned.text}"`);
  }

  // Site Content had seventeen buttons reading nothing but "Save".
  if (route === '/admin/content') {
    const bare = await page.getByRole('button', { name: /^\s*save\s*$/i }).count();
    if (bare > 0) fail(`/admin/content: ${bare} button(s) say only "Save", so nothing on them says which part of the site they belong to`);
    else pass('/admin/content: every Save names its own section');
  }

  // A category is hidden by pressing a button that says so, not one that
  // reads back the state it is already in.
  if (route === '/admin/categories') {
    const stateWords = await page.getByRole('button', { name: /^\s*(enabled|disabled)\s*$/i }).count();
    if (stateWords > 0) fail(`/admin/categories: ${stateWords} button(s) are labelled with the current state instead of what pressing them does`);
    else pass('/admin/categories: the toggle says what pressing it does');
  }

  // "Delete" on a built-in product does not delete it.
  if (route === '/admin/products') {
    const undo = await page.getByRole('button', { name: /^\s*undo edits\s*$/i }).count();
    if (undo === 0) fail('/admin/products: no "Undo Edits" button — built-in products are saying "Delete" again, which is not what that button does');
    else pass('/admin/products: built-in products say Undo Edits');
    if (found.text.includes('There is no separate')) {
      fail('/admin/products: the footer note claims there is no Delete while a delete-style button sits on every row');
    } else pass('/admin/products: the footer note matches the buttons');
  }
}

await browser.close();
console.log(`\n${checks} checks passed, ${failures} failed\n`);
process.exit(failures ? 1 : 0);
