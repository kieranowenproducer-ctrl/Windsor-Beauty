// Can everybody actually use the shop?
//
//   npm run build && npm start -- -p 3213     (in another terminal)
//   npm run check:a11y
//
// WHY THIS EXISTS. The shop is live and takes public money, and until 12 August
// 2026 nobody had ever checked whether a person who cannot see it, or cannot
// use a mouse, could buy anything. The answer was no, in several ways at once,
// and none of the 240 checks the project already had could see any of it:
// check:contrast reads class names and only looks at the admin, check:responsive
// measures layout. Both are code checks. This one opens the site in a real
// browser and asks the page itself.
//
// WHAT IT CATCHES:
//   - the standard WCAG 2.1 AA rule set, via axe, on every page a customer
//     walks through, at phone width and desktop width. That covers wording too
//     faint to read, a form box with no label, a dropdown a screen reader
//     cannot name, and headings that jump a level.
//   - the four things axe cannot check because they need the keyboard used:
//       * the age and research-use notice really does stop somebody pressing
//         Tab. It did not. Tab walked straight past it into the shop.
//       * the notice announces itself as a dialog and holds focus.
//       * there is a skip link, it is the first thing focus reaches, and it
//         lands on the page's own content.
//       * the announcement strip can be stopped.
//
// axe is not a verdict on its own. It finds the mechanical failures; it cannot
// tell you whether wording makes sense or whether the order of a page is
// sensible. It is the floor, not the ceiling.
//
// axe-core arrives with eslint-config-next rather than as a direct dependency,
// so this fails loudly with an instruction if it is ever not there, instead of
// passing on an empty rule set.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CHECK_BASE ?? 'http://localhost:3213';

const AXE_PATH = 'node_modules/axe-core/axe.min.js';
if (!existsSync(AXE_PATH)) {
  console.error('\n  axe-core is not installed. Run `npm install` (it comes with eslint-config-next).\n');
  process.exit(1);
}
const AXE = readFileSync(AXE_PATH, 'utf8');

// The cached browser, whichever build happens to be there — same finder as
// check-responsive.mjs, and pinned to no version for the same reason: a check
// that cannot run is worse than no check.
function findChromium() {
  const root = join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', 'AppData', 'Local'),
    'ms-playwright',
  );
  if (!existsSync(root)) return null;
  const builds = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse();
  for (const b of builds) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(root, b, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/shop', name: 'the shop' },
  { path: '/shop/retatrutide', name: 'a product page' },
  { path: '/shop/category/fat-loss', name: 'a category page' },
  { path: '/reviews', name: 'reviews' },
  { path: '/cart', name: 'the basket' },
  { path: '/checkout', name: 'checkout' },
  { path: '/account/login', name: 'sign in' },
  { path: '/account/register', name: 'create an account' },
  { path: '/contact', name: 'contact' },
  { path: '/about', name: 'about' },
  { path: '/terms', name: 'terms' },
];

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

// The rules that were actually broken here, each written the way it would be
// said out loud so a failure reads as a sentence rather than as an axe id.
// Anything axe reports that is NOT on this list still fails the run.
const RULES = [
  { id: 'color-contrast', plain: 'every piece of wording is dark enough to read' },
  { id: 'label', plain: 'every box you type into says what it is for' },
  { id: 'select-name', plain: 'every dropdown says what it is for' },
  { id: 'heading-order', plain: 'the headings go in order and do not jump a level' },
  { id: 'region', plain: 'all the content sits inside a named part of the page' },
  { id: 'landmark-unique', plain: 'two parts of the page do not share one name' },
  { id: 'link-name', plain: 'every link says where it goes' },
  { id: 'button-name', plain: 'every button says what it does' },
  { id: 'image-alt', plain: 'every picture has a description' },
  { id: 'aria-required-attr', plain: 'anything announced as a control is described properly' },
  { id: 'duplicate-id-aria', plain: 'no two things claim the same name tag' },
];

// The gate's own storage keys (EntryGate.tsx). Seeding them is how the browser
// gets to see the shop itself; the gate is then tested separately, on purpose,
// in a second browser that has NOT been let through.
const GATE_LOCAL_KEY = 'wg_entry_confirmed_v2';
const GATE_SESSION_KEY = 'wg_entry_confirmed';

let passed = 0;
const failures = [];

function check(where, description, ok, detail) {
  if (ok) { passed++; return; }
  failures.push({ where, description, detail });
}

const exe = findChromium();
if (!exe) {
  console.error('\n  No cached chromium found. Run `npx playwright install chromium` once.\n');
  process.exit(1);
}

// IS THERE A DATABASE BEHIND THE SITE WE ARE ABOUT TO CHECK?
//
// This is not a detail. `next start` reads .env.production.local BEFORE
// .env.local, and this project's copy of that file was pulled from Vercel with
// DATABASE_URL empty — so a locally started build serves the shop with no
// database at all. The blog is empty, reviews are empty, admin-written page
// text falls back to defaults, and every check sails through a page that has
// almost nothing on it. A check that matches nothing passes, and nobody notices.
//
// /api/shipping-rates only includes freeShippingThreshold when the database
// answered, so its presence is a straight yes or no.
const rates = await fetch(`${BASE}/api/shipping-rates`).then((r) => r.json()).catch(() => ({}));
const hasDb = Object.prototype.hasOwnProperty.call(rates, 'freeShippingThreshold');
if (!hasDb && process.env.ALLOW_NO_DB !== '1') {
  console.error('\n  STOP. The site at ' + BASE + ' is running WITHOUT a database.\n');
  console.error('  Everything that comes out of the database — blog posts, reviews, the text');
  console.error('  written on the admin Site Content screen — is missing from every page, so a');
  console.error('  pass here would mean far less than it looks like.\n');
  console.error('  `npm start` is the usual cause: it reads .env.production.local first, and this');
  console.error('  project\'s copy has an empty DATABASE_URL. Run `npm run dev -- -p 3213` instead,');
  console.error('  or set ALLOW_NO_DB=1 if you really do mean to check the empty version.\n');
  process.exit(1);
}

// Wait for the page to be built, then give the network a short chance to go
// quiet — but never insist on it. `waitUntil: 'networkidle'` alone works fine
// against a local build and CANNOT be used against windsorglow.com: the real
// site keeps a connection open and never goes idle, so every single page timed
// out at 45 seconds and the check reported the live shop as broken. That was
// the check failing, not the shop.
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ executablePath: exe });

console.log('\n  CAN EVERYBODY USE THE SHOP\n');
console.log(`  against ${BASE}, in a real browser, with a live database\n`);

// ---------------------------------------------------------------- the rule set
for (const size of SIZES) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(([localKey, sessionKey]) => {
    try { localStorage.setItem(localKey, String(Date.now())); } catch { /* private mode */ }
    try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* private mode */ }
  }, [GATE_LOCAL_KEY, GATE_SESSION_KEY]);
  const page = await context.newPage();

  for (const target of PAGES) {
    const where = `${target.name} at ${size.name}`;
    let res;
    try {
      res = await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await settle(page);
    } catch {
      check(where, 'the page loads', false, 'it did not load in 45 seconds');
      continue;
    }
    check(where, 'the page loads', res && res.status() < 400, `status ${res ? res.status() : 'none'}`);
    if (!res || res.status() >= 400) continue;

    await page.evaluate(AXE);
    // `axe` here is the copy injected into the PAGE a line above, not anything
    // this file can import — it only exists inside the browser.
    const result = await page.evaluate(async () =>
      await axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }));

    // One check per rule per page, not per element, so a single faint colour
    // used ninety times reads as one thing to fix rather than ninety.
    for (const rule of RULES) {
      const hit = result.violations.find((v) => v.id === rule.id);
      check(where, rule.plain, !hit,
        hit ? `${hit.nodes.length} on this page, e.g. ${hit.nodes[0].html.slice(0, 110).replace(/\s+/g, ' ')}` : '');
    }
    // Anything axe finds that is not in the list above still fails the run,
    // rather than being silently allowed because nobody thought of it.
    const unlisted = result.violations.filter((v) => !RULES.some((r) => r.id === v.id));
    check(where, 'no other accessibility rule is broken', unlisted.length === 0,
      unlisted.map((v) => `${v.id} (${v.nodes.length})`).join(', '));
  }
  await context.close();
}

// ------------------------------------------------- the things axe cannot check
{
  // A browser that has NOT been let through the gate.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  // `networkidle` on purpose is NOT used here. It is fine against a local build,
  // but the real site keeps a connection open, never goes quiet, and the whole
  // check died on it the first time it was pointed at windsorglow.com. Waiting
  // for the page to be built and then settling for a moment is enough: what
  // follows is keyboard work, and the keyboard does not care about a pending
  // analytics request.
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  const where = 'the age and research-use notice';

  // Only dialogs a person can actually reach count. The membership offer is
  // also a dialog and it renders inside the page the gate has made inert, so it
  // is in the HTML and unreachable — which is correct, and would otherwise read
  // here as "two dialogs are fighting".
  const liveDialogs = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter((d) => !d.closest('[inert]'))
      .map((d) => d.getAttribute('aria-labelledby') || ''));
  check(where, 'it is announced as a dialog that must be answered', liveDialogs.length === 1,
    `found ${liveDialogs.length} that a person can reach`);

  check(where, 'it says what it is', Boolean(liveDialogs[0]),
    'no aria-labelledby, so a screen reader announces an unnamed dialog');

  // The real test: press Tab twenty times and see whether focus ever leaves
  // the notice. Before 12 August 2026 it left on the first press.
  const escaped = [];
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-modal="true"]');
      const el = document.activeElement;
      // `nextjs-portal` is the development error overlay. It is not part of the
      // site and is not there in the built version, so tabbing to it is not the
      // shop failing to hold focus.
      if (el && el.tagName.toLowerCase() === 'nextjs-portal') return true;
      return !d || d.contains(el) || el === document.body;
    });
    if (!inside) {
      escaped.push(await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName.toLowerCase()} "${(el.textContent || '').trim().slice(0, 40)}"` : 'unknown';
      }));
    }
  }
  check(where, 'pressing Tab cannot walk past it into the shop', escaped.length === 0,
    `focus reached ${[...new Set(escaped)].slice(0, 3).join(', ')}`);

  check(where, 'the shop behind it is hidden from a screen reader',
    await page.evaluate(() => {
      const w = document.querySelector('[data-behind-gate]');
      return Boolean(w && w.hasAttribute('inert'));
    }),
    'the page behind the notice is not inert, so it is still read out and still tabbable');

  await context.close();
}

{
  // Skip link and the ticker's stop button, on a page past the gate.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(([localKey, sessionKey]) => {
    try { localStorage.setItem(localKey, String(Date.now())); } catch { /* private mode */ }
    try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* private mode */ }
  }, [GATE_LOCAL_KEY, GATE_SESSION_KEY]);
  const page = await context.newPage();
  // `networkidle` on purpose is NOT used here. It is fine against a local build,
  // but the real site keeps a connection open, never goes quiet, and the whole
  // check died on it the first time it was pointed at windsorglow.com. Waiting
  // for the page to be built and then settling for a moment is enough: what
  // follows is keyboard work, and the keyboard does not care about a pending
  // analytics request.
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  const where = 'getting around with a keyboard';
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName.toLowerCase(), text: (el?.textContent || '').trim(), href: el?.getAttribute('href') };
  });
  check(where, 'the first thing Tab reaches is a link that skips the header',
    first.tag === 'a' && first.href === '#main',
    `it reached ${first.tag} "${first.text.slice(0, 40)}"`);

  check(where, 'the skip link is readable once it has focus',
    await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 10;
    }),
    'it stays hidden when focused, so a sighted keyboard user cannot see where they are');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check(where, 'the skip link really moves focus to the content',
    await page.evaluate(() => document.activeElement?.id === 'main'),
    `focus ended on ${await page.evaluate(() => document.activeElement?.tagName.toLowerCase() + '#' + (document.activeElement?.id || ''))}`);

  check('the announcement strip', 'it can be stopped',
    await page.evaluate(() => {
      const bar = document.querySelector('aside[aria-label="Announcements"]');
      return Boolean(bar && bar.querySelector('button'));
    }),
    'it scrolls forever with no way to stop it, which WCAG 2.2.2 does not allow');

  check('the announcement strip', 'it is only read out once, not three times',
    await page.evaluate(() => {
      const spans = document.querySelectorAll('aside[aria-label="Announcements"] span');
      if (spans.length < 2) return true;
      return Array.prototype.slice.call(spans, 1).every((s) => s.getAttribute('aria-hidden') === 'true');
    }),
    'the duplicate copies that make the loop seamless are not hidden from assistive tech');

  await context.close();
}

await browser.close();

// ------------------------------------------------------------------- the report
if (failures.length === 0) {
  console.log(`  ${passed} checks, all pass.\n`);
  process.exit(0);
}

console.log(`  ${passed} pass, ${failures.length} FAIL.\n`);
for (const f of failures) {
  console.log(`  FAIL  ${f.where}`);
  console.log(`        ${f.description}`);
  if (f.detail) console.log(`        ${f.detail}`);
}
console.log('');
process.exit(1);
