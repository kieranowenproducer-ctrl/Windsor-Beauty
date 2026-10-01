// Does the shop actually look right on a phone, a tablet and a desktop?
//
//   npm run build && npm start -- -p 3213     (in another terminal)
//   npm run check:responsive
//
// WHY THIS EXISTS. This project had 202 automated checks and not one of them
// opened the site and looked at it. They all read the code. A page can pass
// every one of them and still be broken on a phone, and most people who buy
// from this shop are on a phone.
//
// It asserts on MEASURED layout, not on how a screenshot looks, so it gives a
// pass or a fail rather than an opinion. Nothing here needs a person to squint
// at an image.
//
// WHAT IT CATCHES, and why each one matters on a shop:
//   - the page scrolling sideways. The classic phone break: one wide element
//     drags the whole page with it and the customer sees half of everything.
//   - any single element wider than the screen, which is what causes that.
//     Elements inside their own scrolling box are fine and are excluded, because
//     a wide table that scrolls by itself is correct.
//   - tap targets under 24 pixels. That is the WCAG 2.2 minimum, and on a
//     product page it is the difference between adding to the basket and
//     missing the button.
//   - the main navigation being unreachable, so nobody can leave the page.
//   - images with no alt text, which is both an accessibility failure and
//     something Google reads.
//
// It uses the chromium Playwright has already cached, so it downloads nothing.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CHECK_BASE ?? 'http://localhost:3213';

// The cached browser, whichever build happens to be there. The version is not
// pinned on purpose: hard-coding one means the check dies silently the first
// time the cache is cleaned, and a check that cannot run is worse than none.
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

const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

// The pages a customer actually walks through.
const PAGES = [
  { path: '/', name: 'home' },
  { path: '/shop', name: 'the shop' },
  { path: '/shop/retatrutide', name: 'a product page' },
  { path: '/shop/category/fat-loss', name: 'a category page' },
  { path: '/reviews', name: 'reviews' },
  { path: '/cart', name: 'the basket' },
  { path: '/account/login', name: 'sign in' },
];

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
// Found on 12 August 2026, and it had been quietly weakening this check since
// the day it was written. `next start` reads .env.production.local BEFORE
// .env.local, and this project's copy of that file was pulled from Vercel with
// DATABASE_URL empty — so the very command in the instructions at the top of
// this file serves a shop with no database. The blog is empty, the reviews are
// empty, and the text written on the admin Site Content screen is missing.
// Short pages do not scroll sideways and have no wide elements, so everything
// passes. A check that matches nothing passes.
//
// /api/shipping-rates only carries freeShippingThreshold when the database
// answered, so its presence is a straight yes or no.
const rates = await fetch(`${BASE}/api/shipping-rates`).then((r) => r.json()).catch(() => ({}));
if (!Object.prototype.hasOwnProperty.call(rates, 'freeShippingThreshold') && process.env.ALLOW_NO_DB !== '1') {
  console.error(`\n  STOP. The site at ${BASE} is running WITHOUT a database.\n`);
  console.error('  Its pages are missing everything that comes out of the database, so they are');
  console.error('  far shorter than the real ones and this check would prove almost nothing.\n');
  console.error('  Run `npm run dev -- -p 3213` instead of `npm start`, or set ALLOW_NO_DB=1 if');
  console.error('  you really do mean to measure the empty version.\n');
  process.exit(1);
}

// Wait for the page to be built, then give the network a short chance to go
// quiet — but never insist on it. `waitUntil: 'networkidle'` alone works fine
// against a local build and CANNOT be used against windsorbeauty.co.uk: the real
// site keeps a connection open and never goes idle, so every single page timed
// out at 45 seconds and the check reported the live shop as broken. That was
// the check failing, not the shop.
async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
}

const browser = await chromium.launch({ executablePath: exe });

console.log('\n  DOES THE SHOP LOOK RIGHT ON A PHONE, A TABLET AND A DESKTOP\n');
console.log(`  against ${BASE}, in a real browser\n`);

for (const size of WIDTHS) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
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

    const found = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;

      // An element wider than the screen is only a problem if it can drag the
      // page with it. It cannot if any parent contains it: either the parent
      // scrolls it by itself (a wide table, correct) or clips it (the scrolling
      // announcement ticker, also correct — it is meant to be 3,500px long).
      const isContained = (el) => {
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
        }
        return false;
      };

      const wide = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width > vw + 1 && !isContained(el)) {
          wide.push(`<${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? ' class="' + el.className.slice(0, 60) + '"' : ''}> is ${Math.round(r.width)}px wide`);
          if (wide.length >= 3) break;
        }
      }

      // Anything a finger has to hit, judged the way WCAG 2.2 actually judges
      // it. A target smaller than 24x24 is NOT automatically a failure: it
      // passes if it is far enough from its neighbours that a 24px circle
      // centred on it touches no other target. That is the standard's own
      // spacing exception, and without it every ordinary text link in a footer
      // reads as broken, which is how a check becomes noise nobody reads.
      const targets = [...document.querySelectorAll('a[href], button, input[type=submit], [role=button]')]
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden');

      const centre = ({ r }) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      const small = [];
      for (const t of targets) {
        if (t.r.width >= 24 && t.r.height >= 24) continue;
        const c = centre(t);
        const crowded = targets.some((o) => {
          if (o === t) return false;
          const d = centre(o);
          return Math.hypot(c.x - d.x, c.y - d.y) < 24;
        });
        if (!crowded) continue; // small, but with room around it: allowed
        const label = (t.el.textContent || t.el.getAttribute('aria-label') || t.el.tagName).trim().slice(0, 30);
        small.push(`"${label}" is ${Math.round(t.r.width)}x${Math.round(t.r.height)}px with another control inside 24px`);
        if (small.length >= 3) break;
      }

      const noAlt = [...document.querySelectorAll('img')]
        .filter((i) => !i.hasAttribute('alt'))
        .map((i) => (i.getAttribute('src') || '').slice(-45));

      return {
        scrollsSideways: document.documentElement.scrollWidth > vw + 1,
        scrollWidth: document.documentElement.scrollWidth,
        viewport: vw,
        wide,
        small,
        noAlt: noAlt.slice(0, 3),
        navLinks: document.querySelectorAll('header a[href], nav a[href], header button').length,
        // Proof the checks above had something to look at. An empty page passes
        // every rule here, so without this a blank screen would read as perfect.
        targetCount: targets.length,
        elementCount: document.querySelectorAll('body *').length,
      };
    });

    check(where, 'the page actually rendered something to check',
      found.elementCount > 50 && found.targetCount > 4,
      `${found.elementCount} elements and ${found.targetCount} clickable things found`);

    check(where, 'the page does not scroll sideways', !found.scrollsSideways,
      `the page is ${found.scrollWidth}px wide inside a ${found.viewport}px screen`);
    check(where, 'nothing is wider than the screen', found.wide.length === 0, found.wide.join('; '));
    check(where, 'every tap target is at least 24px', found.small.length === 0, found.small.join('; '));
    check(where, 'every image has alt text', found.noAlt.length === 0, found.noAlt.join('; '));
    check(where, 'the navigation is reachable', found.navLinks > 0, 'no header or nav links found');
  }

  await context.close();
}

await browser.close();

const total = passed + failures.length;
if (failures.length) {
  console.log(`  ${failures.length} of ${total} checks FAILED\n`);
  for (const f of failures) console.log(`  FAIL  ${f.where}: ${f.description}\n        ${f.detail}`);
  console.log('');
  process.exit(1);
}
console.log(`  All ${total} checks pass.\n`);
