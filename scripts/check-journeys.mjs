// Can a customer still get all the way through the website?
//
//   npm run dev -- -p 3010          (in another terminal)
//   npm run check:journeys
//
// WHY THIS EXISTS. On 12 August 2026 the accessibility work made the age and
// research-use notice mark the whole page behind it `inert`, so a keyboard or
// screen-reader visitor could no longer walk past the three confirmations. That
// was the right fix and it stays.
//
// The 10%-membership pop-up is mounted inside that notice, and it is the only
// overlay on this site that opens itself: a five-second timer, no click from
// anybody. So five seconds after landing, while the customer was reading the
// Terms and Conditions, it drew itself on top of everything — it sits at z-250,
// the notice at z-50 — while being inert, which means dead. On a phone that is a
// full-screen black veil with a 4px blur over the legal text somebody is
// required to read, and nothing dismisses it: not the X, not "No thanks", not
// the backdrop. Two days live. Nothing caught it, because every check this
// project had reads the code or looks at one page at a time. This one walks the
// journeys a customer actually walks, and opens overlays on top of each other on
// purpose, which is the only way that bug was ever going to show up.
//
// WHAT IT CATCHES:
//   - a promotional pop-up interrupting a legal step
//   - any overlay that is on screen but sitting inside an inert subtree, i.e.
//     visible and dead. That is the general form of the bug above and it would
//     catch it in any component, not just this one.
//   - a scroll lock left on <body> after everything has closed
//   - a leftover backdrop still swallowing clicks after its modal has gone
//   - the core journeys themselves: shop, product, basket, checkout, accounts
//
// It runs at phone width and desktop width, because the pop-up is a full-screen
// sheet on one and a card on the other, and only the phone had the veil.

import { chromium } from 'playwright-core';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.CHECK_BASE ?? 'http://localhost:3010';

// Same browser finder as check-a11y.mjs and check-responsive.mjs, pinned to no
// version for the same reason: a check that cannot run is worse than no check.
function findChromium() {
  const root = join(
    process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', 'AppData', 'Local'),
    'ms-playwright',
  );
  if (!existsSync(root)) return null;
  for (const b of readdirSync(root).filter(d => d.startsWith('chromium-')).sort().reverse()) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(root, b, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const GATE_LOCAL_KEY = 'wg_entry_confirmed_v2';
const GATE_SESSION_KEY = 'wg_entry_confirmed';
const POPUP_SESSION_KEY = 'wg_discount_popup_seen';
const POPUP_DELAY_MS = 5000;
const WAIT_FOR_POPUP = POPUP_DELAY_MS + 1500;

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

let passed = 0;
const failures = [];

function check(where, description, ok, detail) {
  if (ok) { passed++; return; }
  failures.push({ where, description, detail });
}

// ---------------------------------------------------------------- shared probes

// Anything on screen that a customer cannot use. `inert` is not a style: it does
// not grey the element out or hide it, it just makes the whole subtree refuse
// clicks and focus. An overlay drawn inside one is visible and dead, which is
// the worst state a modal can be in, because it still covers the page.
async function deadOverlays(page) {
  return page.evaluate(() => {
    const out = [];

    function drawnAndClickable(el) {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
      if (cs.pointerEvents === 'none') return false;
      const r = el.getBoundingClientRect();
      if (r.width < 80 || r.height < 40) return false;
      return r.bottom > 0 && r.top < innerHeight;
    }

    // An overlay is anchored to the viewport, so look only at `position: fixed`
    // containers. Anything `absolute` inside an inert page is ordinary page
    // furniture (the homepage's background gradient, for one) and the page
    // behind the notice is inert on purpose.
    document.querySelectorAll('[inert] *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') return;
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return; // scrolled off screen

      // The container itself is often `pointer-events-none` with a solid,
      // clickable card and backdrop inside it — that is exactly how the 10%
      // pop-up is built, so asking only about the container would miss it.
      const surfaces = [el].concat(Array.prototype.slice.call(el.querySelectorAll('*')));
      if (!surfaces.some(drawnAndClickable)) return;

      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} at ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
}

// Is the page usable again? Body not frozen, nothing invisible swallowing taps
// in the middle of the screen, and no leftover inert marker.
/**
 * Scroll to a position and WAIT UNTIL THE PAGE HAS ACTUALLY GOT THERE, then report where it is.
 *
 * WHY THIS EXISTS (task 33d761be, 7 September 2026). Four of the ten standing failures in this
 * file were a phantom. The site sets `scroll-behavior: smooth` on <html>, so `window.scrollTo`
 * ANIMATES rather than jumping. Measured on the home page: 100ms in it had reached 90px, 300ms
 * 1051px, 500ms 1192px, and it did not settle on 1200 until about 900ms.
 *
 * The old code scrolled, waited 500ms, and wrote down 1192 as "where the customer is". Five
 * seconds later the pop-up opened, correctly captured the settled 1200, and restored 1200 when it
 * closed. The check then compared 1200 against its own stale 1192 and reported that the offer
 * "jumps the page 12 pixels", every run, at both widths. No customer has ever seen that jump.
 *
 * So: ask for an instant scroll, then poll until the number stops changing. Returns the settled
 * position, which is the only honest baseline to compare anything against.
 */
async function settleScroll(page, to) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), to);
  let last = -1;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const now = await page.evaluate(() => Math.round(window.scrollY));
    if (now === last) return now;
    last = now;
  }
  return last;
}

async function pageState(page) {
  return page.evaluate(() => {
    const mid = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
    return {
      bodyPosition: document.body.style.position,
      bodyOverflow: document.body.style.overflow,
      bodyTop: document.body.style.top,
      inertLeft: document.querySelectorAll('[inert]').length,
      midPoint: mid ? `${mid.tagName.toLowerCase()}.${String(mid.className).slice(0, 40)}` : 'nothing',
      midInsideDeadZone: mid ? !!mid.closest('[inert]') : false,
      canScroll: getComputedStyle(document.body).position !== 'fixed',
    };
  });
}

async function popupOnScreen(page) {
  return !!(await page.$('#discount-popup-title'));
}

async function seedThroughGate(context) {
  await context.addInitScript(([localKey, sessionKey]) => {
    try { localStorage.setItem(localKey, String(Date.now())); } catch { /* private mode */ }
    try { sessionStorage.setItem(sessionKey, 'true'); } catch { /* private mode */ }
  }, [GATE_LOCAL_KEY, GATE_SESSION_KEY]);
}

async function silencePopup(context) {
  await context.addInitScript((key) => {
    try { sessionStorage.setItem(key, 'true'); } catch { /* private mode */ }
  }, POPUP_SESSION_KEY);
}

// ----------------------------------------------------------------------- set-up

const exe = findChromium();
if (!exe) {
  console.error('\n  No cached chromium found. Run `npx playwright install chromium` once.\n');
  process.exit(1);
}

const reachable = await fetch(BASE).then(r => r.ok).catch(() => false);
if (!reachable) {
  console.error(`\n  STOP. Nothing is answering at ${BASE}.`);
  console.error('  Start the site first:  npm run dev -- -p 3010\n');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: exe });
console.log(`\n  Walking the customer journeys at ${BASE}, in a real browser\n`);

for (const size of SIZES) {
  const at = `on ${size.name}`;

  // ===================================================================
  // 1. THE ONE THAT BROKE. Agreement flow, Terms open, promo tries to fire.
  // ===================================================================
  {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    /* THE ENTRY NOTICE IS SWITCHED OFF ON PURPOSE (task 33d761be, 7 September 2026).
     *
     * Kieran turned it off himself on 25 August 2026 so the home page could be seen straight away.
     * The switch is TEMPORARILY_BYPASS_ENTRY_GATE in src/components/SiteChrome.tsx and it carries
     * a comment saying exactly that. This check went on demanding the screen and failing twice a
     * run for a fortnight, which is how a check teaches people to ignore it.
     *
     * So it now reads the switch and holds the site to whichever answer is set. Turn the gate back
     * on and this check turns back on with it, with nothing to remember. */
    const gateExpected = !/const TEMPORARILY_BYPASS_ENTRY_GATE\s*=\s*true/
      .test(readFileSync(new URL('../src/components/SiteChrome.tsx', import.meta.url), 'utf8'));
    const gateShown = await page.waitForSelector('#entry-gate-title', { timeout: gateExpected ? 15000 : 4000 })
      .then(() => true).catch(() => false);
    if (gateExpected) {
      check(`the entry notice ${at}`, 'it appears for somebody arriving for the first time', gateShown);
    } else {
      check(`the entry notice ${at}`, 'it stays off, as Kieran set it on 25 August',
        !gateShown, 'the gate appeared even though the switch says it is bypassed');
    }

    if (gateShown) {
      for (let i = 0; i < 3; i++) await page.click(`label[for="entry-check-${i}"]`);
      check(`the entry notice ${at}`, 'all three confirmations can be ticked',
        (await page.$$eval('input[id^="entry-check-"]', els => els.filter(e => e.checked).length)) === 3);

      await page.click('button:has-text("Read Terms & Conditions")');
      const termsOpen = await page.waitForSelector('#terms-modal-title', { timeout: 5000 }).then(() => true).catch(() => false);
      check(`the Terms ${at}`, 'they open when the button is pressed', termsOpen);

      // Read them the way a customer does, then sit there long enough for the
      // pop-up's timer to have fired.
      await page.evaluate(() => {
        const sc = document.querySelector('#terms-modal-title').closest('[role="dialog"]').querySelector('.overflow-y-auto');
        sc.scrollTop = Math.round(sc.scrollHeight / 2);
      });
      const scrolled = await page.evaluate(() => {
        const sc = document.querySelector('#terms-modal-title').closest('[role="dialog"]').querySelector('.overflow-y-auto');
        return sc.scrollTop > 0;
      });
      check(`the Terms ${at}`, 'they scroll', scrolled);

      await page.waitForTimeout(WAIT_FOR_POPUP);

      check(`the Terms ${at}`, 'the 10% offer does not interrupt them',
        !(await popupOnScreen(page)),
        'the membership pop-up drew itself on top of the Terms, and while inert it could not be closed');

      check(`the Terms ${at}`, 'nothing on screen is visible but dead',
        (await deadOverlays(page)).length === 0,
        (await deadOverlays(page)).join('; '));

      // Finish the agreement properly.
      await page.evaluate(() => {
        const sc = document.querySelector('#terms-modal-title').closest('[role="dialog"]').querySelector('.overflow-y-auto');
        sc.scrollTop = sc.scrollHeight;
        sc.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await page.waitForTimeout(250);
      const canConfirm = await page.$('label[for="terms-confirm-check"]');
      check(`the Terms ${at}`, 'reading to the end unlocks the confirmation', !!canConfirm);
      if (canConfirm) {
        await page.click('label[for="terms-confirm-check"]');
        await page.click('button:has-text("Accept & Continue")');
      }
      const termsClosed = !(await page.$('#terms-modal-title'));
      check(`the Terms ${at}`, 'accepting closes them', termsClosed);

      const enterEnabled = await page.$eval('button:has-text("Enter Website")', b => !b.disabled).catch(() => false);
      check(`the entry notice ${at}`, 'the Enter button unlocks once everything is agreed', enterEnabled);
      if (enterEnabled) await page.click('button:has-text("Enter Website")');
      await page.waitForTimeout(400);

      const afterEntry = await pageState(page);
      check(`the entry notice ${at}`, 'it lets the customer through', !(await page.$('#entry-gate-title')));
      check(`after entering ${at}`, 'the page is not left frozen',
        afterEntry.canScroll && afterEntry.bodyPosition === '',
        `body position="${afterEntry.bodyPosition}" overflow="${afterEntry.bodyOverflow}"`);
      check(`after entering ${at}`, 'nothing is left blocking the middle of the screen',
        !afterEntry.midInsideDeadZone, `the middle of the screen is ${afterEntry.midPoint}`);
      check(`after entering ${at}`, 'the dead zone behind the notice is lifted',
        afterEntry.inertLeft === 0, `${afterEntry.inertLeft} still marked inert`);

      // ===============================================================
      // 2. THE PROMOTION STILL WORKS. It was delayed, not switched off.
      // ===============================================================
      await page.waitForTimeout(WAIT_FOR_POPUP);
      const promoCame = await popupOnScreen(page);
      check(`the 10% offer ${at}`, 'it still appears once the customer is inside the site',
        promoCame, 'it never came back after the gate, so the offer has been lost rather than delayed');

      if (promoCame) {
        check(`the 10% offer ${at}`, 'it is alive, not visible-but-dead',
          (await deadOverlays(page)).length === 0, (await deadOverlays(page)).join('; '));

        const closed = await page.click('button[aria-label="Close offer"]', { timeout: 4000 })
          .then(() => true).catch(() => false);
        check(`the 10% offer ${at}`, 'its close button can actually be pressed', closed);
        await page.waitForTimeout(300);
        check(`the 10% offer ${at}`, 'pressing it closes the offer', !(await popupOnScreen(page)));

        const afterClose = await pageState(page);
        check(`the 10% offer ${at}`, 'closing it leaves no invisible sheet behind',
          !afterClose.midInsideDeadZone && afterClose.midPoint !== 'nothing',
          `the middle of the screen is ${afterClose.midPoint}`);
        check(`the 10% offer ${at}`, 'the page scrolls again afterwards',
          afterClose.canScroll && afterClose.bodyPosition === '' && afterClose.bodyTop === '',
          `body position="${afterClose.bodyPosition}" top="${afterClose.bodyTop}"`);

        // And the page really responds, not just looks right. `:visible`
        // matters: the header carries a full and a compact navigation and only
        // one of them is on screen at a time.
        const navWorked = await page.click('a[href="/shop"]:visible', { timeout: 4000 }).then(() => true).catch(() => false);
        // waitForURL, not a fixed pause: in dev the shop route is compiled on
        // first visit, which takes far longer than any sleep worth writing.
        const landed = await page.waitForURL('**/shop', { timeout: 30000 }).then(() => true).catch(() => false);
        check(`after the offer ${at}`, 'links work again without reloading the page',
          navWorked && landed, `ended on ${page.url()}`);
      }
    }
    await context.close();
  }

  // ===================================================================
  // 3. THE OTHER WAYS OUT of the offer, each on a fresh visit.
  // ===================================================================
  for (const exit of [
    { name: 'the "No thanks" line closes it', act: p => p.click('button:has-text("No thanks")') },
    { name: 'the Escape key closes it', act: p => p.keyboard.press('Escape') },
  ]) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await seedThroughGate(context);
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(WAIT_FOR_POPUP);
    if (await popupOnScreen(page)) {
      const ok = await exit.act(page).then(() => true).catch(() => false);
      await page.waitForTimeout(300);
      check(`the 10% offer ${at}`, exit.name, ok && !(await popupOnScreen(page)));
      const s = await pageState(page);
      check(`the 10% offer ${at}`, `${exit.name} — and the page still works afterwards`,
        s.canScroll && s.bodyPosition === '' && !s.midInsideDeadZone,
        `body position="${s.bodyPosition}", middle of screen ${s.midPoint}`);
    } else {
      check(`the 10% offer ${at}`, exit.name, false, 'the offer never appeared, so this could not be tested');
    }
    await context.close();
  }

  // ===================================================================
  // 3b. CLOSING THE OFFER MUST NOT MOVE THE PAGE.
  //
  // The page is genuinely at scroll 0 while it is locked, held in place by
  // `top: -Ypx`. Releasing it means putting the scroll position back, and
  // globals.css sets `html { scroll-behavior: smooth }`, which makes that
  // restore ANIMATE — the whole page visibly scrolling itself back up over
  // about a second. Sampling immediately after the click is the point: a
  // smooth restore is still in flight there, an instant one has finished.
  // ===================================================================
  {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await seedThroughGate(context);
    const page = await context.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1200);
    // Settle the smooth scroll before writing down where the customer is. See settleScroll.
    const before = await settleScroll(page, 1200);
    await page.waitForTimeout(WAIT_FOR_POPUP);

    if (await popupOnScreen(page)) {
      // Measure the BODY, not the html element. The lock works by making <body>
      // `position: fixed; top: -1200px`, so the body is the thing that carries
      // where the customer actually is; html stays at 0 either way and would
      // read as a 1200px jump that nobody can see.
      const onScreenWhileOpen = await page.evaluate(() =>
        Math.round(-document.body.getBoundingClientRect().top));
      check(`the 10% offer ${at}`, 'it does not move the page when it opens',
        Math.abs(onScreenWhileOpen - before) < 4,
        `the page was at ${before} but ${onScreenWhileOpen} is what is on screen behind the offer`);

      await page.click('button[aria-label="Close offer"]', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(120);
      const rightAfter = await page.evaluate(() => Math.round(window.scrollY));
      check(`the 10% offer ${at}`, 'closing it leaves the page exactly where it was',
        Math.abs(rightAfter - before) < 4,
        `the page was at ${before} and jumped to ${rightAfter}, so it is scrolling itself instead of staying still`);
    } else {
      check(`the 10% offer ${at}`, 'closing it leaves the page exactly where it was',
        false, 'the offer never appeared, so this could not be tested');
    }
    await context.close();
  }

  // ===================================================================
  // 3c. THE SAME FOR THE BASKET DRAWER, which is the overlay customers
  //     open most and always from partway down a page. Measured broken on
  //     the live site on 14 August: closing it from 1000px down left the
  //     page still travelling through 424 a moment later, both sizes.
  // ===================================================================
  {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await seedThroughGate(context);
    await silencePopup(context);
    const page = await context.newPage();
    await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', timeout: 45000 });
    const link = await page
      .waitForSelector('a[href^="/shop/"]:not([href*="/category/"]):visible', { timeout: 25000 })
      .catch(() => null);
    /* Same one-word selector fix as the block further down, plus a settled baseline: the old code
     * scrolled and read the position 500ms later, mid smooth-scroll animation. See settleScroll. */
    if (link) {
      await link.click();
      await page.waitForTimeout(2500);
      const before = await settleScroll(page, 1000);
      const opened = await page.click('[aria-label="Open basket"]:visible', { timeout: 8000 })
        .then(() => true).catch(() => false);
      if (opened && before > 200) {
        await page.waitForTimeout(600);
        const onScreen = await page.evaluate(() => Math.round(-document.body.getBoundingClientRect().top));
        check(`the basket drawer ${at}`, 'opening it does not move the page underneath',
          Math.abs(onScreen - before) < 6, `the page was at ${before} but ${onScreen} is on screen behind it`);

        await page.click('button[aria-label="Close basket"]:visible', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(120);
        const rightAfter = await page.evaluate(() => Math.round(window.scrollY));
        check(`the basket drawer ${at}`, 'closing it leaves the page exactly where it was',
          Math.abs(rightAfter - before) < 6,
          `the page was at ${before} and jumped to ${rightAfter}, so it is scrolling itself instead of staying still`);
      } else {
        check(`the basket drawer ${at}`, 'closing it leaves the page exactly where it was',
          false, `could not set this up (opened=${opened}, scrolled to ${before})`);
      }
    }
    await context.close();
  }

  // ===================================================================
  // 4. THE REST OF THE SHOP still works, with the offer out of the way.
  // ===================================================================
  {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await seedThroughGate(context);
    await silencePopup(context);
    const page = await context.newPage();

    const PAGES = [
      { path: '/', name: 'the homepage' },
      { path: '/shop', name: 'the shop' },
      { path: '/cart', name: 'the basket' },
      { path: '/checkout', name: 'checkout' },
      { path: '/account/login', name: 'sign in' },
      { path: '/account/register', name: 'create an account' },
      { path: '/terms', name: 'the Terms page' },
    ];
    for (const target of PAGES) {
      const res = await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      check(target.name + ' ' + at, 'it opens', !!res && res.status() < 400, res ? `HTTP ${res.status()}` : 'no response');
      await page.waitForTimeout(250);
      const s = await pageState(page);
      check(target.name + ' ' + at, 'it is not frozen and nothing invisible is in the way',
        s.canScroll && s.bodyPosition === '' && !s.midInsideDeadZone,
        `body position="${s.bodyPosition}", middle of screen ${s.midPoint}`);
      check(target.name + ' ' + at, 'nothing on it is visible but dead',
        (await deadOverlays(page)).length === 0, (await deadOverlays(page)).join('; '));
    }

    // A product, the basket drawer, and the navigation — the things a customer
    // touches between the shop and paying.
    await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', timeout: 45000 });
    // A product, not a category: /shop/category/... links live in the same list.
    // waitForSelector rather than a plain query — asking the instant the
    // document fires domcontentloaded is a race, and it lost intermittently.
    const firstProduct = await page
      .waitForSelector('a[href^="/shop/"]:not([href*="/category/"]):visible', { timeout: 20000 })
      .catch(() => null);
    check(`the shop ${at}`, 'it lists products you can click into', !!firstProduct);
    if (firstProduct) {
      const href = await firstProduct.getAttribute('href');
      await firstProduct.click();
      await page.waitForURL(`**${href}`, { timeout: 30000 }).catch(() => {});
      check(`a product page ${at}`, 'it opens from the shop',
        /\/shop\/[^/]+/.test(new URL(page.url()).pathname), `ended on ${page.url()}`);
      check(`a product page ${at}`, 'it is not frozen', (await pageState(page)).canScroll);
    }

    /* THE BASKET OPENER IS AN ANCHOR, NOT A BUTTON (task 33d761be, 7 September 2026).
     *
     * This used to look for `button[aria-label="Open basket"]`. The drawer is real and works, but
     * the thing that opens it is a `<Link href="/cart">` in Header.tsx whose onClick calls
     * preventDefault and opens the drawer. The href is the no-JavaScript fallback and is what
     * makes ctrl-click and middle-click still work.
     *
     * So the selector could never match, and "the basket drawer does not open" failed on every
     * run at both widths: four of the ten standing failures, from one word in a selector. The
     * drawer was never broken. Dropping `button` is the whole fix; the close control below really
     * is a <button>, so that half was always right.
     *
     * A check that is always red is a check nobody reads, and the day the basket really does
     * break, the red will look like the red that has been there for weeks.
     */
    /* Judge "it opens" by the DRAWER being on screen, never by the click succeeding. The opener is
     * an anchor, so a click on it always reports success even when the handler behind it does
     * nothing at all. Proved by breaking it on purpose: with openDrawer() removed the old wording
     * still said "it opens" passed and failed on "it closes again" instead, which sends whoever
     * reads it looking at the wrong end of the problem. */
    await page.click('[aria-label="Open basket"]:visible', { timeout: 4000 }).catch(() => {});
    const basketOpened = await page.waitForSelector('button[aria-label="Close basket"]', { timeout: 4000, state: 'visible' })
      .then(() => true).catch(() => false);
    await page.waitForTimeout(400);
    check(`the basket drawer ${at}`, 'it opens', basketOpened);
    if (basketOpened) {
      const shut = await page.click('button[aria-label="Close basket"]', { timeout: 4000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(400);
      const s = await pageState(page);
      check(`the basket drawer ${at}`, 'it closes again', shut);
      check(`the basket drawer ${at}`, 'closing it gives the page back',
        s.canScroll && s.bodyPosition === '' && !s.midInsideDeadZone,
        `body position="${s.bodyPosition}", middle of screen ${s.midPoint}`);
    }

    const navLabel = size.name === 'phone' ? 'Main, compact' : 'Main';
    check(`the navigation ${at}`, 'it is there and has links in it',
      await page.evaluate((label) => {
        const nav = document.querySelector(`nav[aria-label="${label}"]`);
        return !!nav && nav.querySelectorAll('a').length > 0;
      }, navLabel), `looked for nav[aria-label="${navLabel}"]`);

    await context.close();
  }

  // ===================================================================
  // 5. ONE OVERLAY ON TOP OF ANOTHER, on purpose. The offer is showing;
  //    the customer opens the basket. Neither may strand the other.
  // ===================================================================
  {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    await seedThroughGate(context);
    const page = await context.newPage();
    await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(WAIT_FOR_POPUP);
    if (await popupOnScreen(page)) {
      await page.click('button[aria-label="Close offer"]', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(250);
      await page.click('button[aria-label="Open basket"]:visible', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      await page.click('button[aria-label="Close basket"]', { timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(400);
      const s = await pageState(page);
      check(`the offer then the basket ${at}`, 'opening and closing both leaves the page working',
        s.canScroll && s.bodyPosition === '' && s.bodyTop === '' && !s.midInsideDeadZone,
        `body position="${s.bodyPosition}" top="${s.bodyTop}", middle of screen ${s.midPoint}`);
    } else {
      check(`the offer then the basket ${at}`, 'opening and closing both leaves the page working',
        false, 'the offer never appeared on the shop, so this could not be tested');
    }
    await context.close();
  }
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
