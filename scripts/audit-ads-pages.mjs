// Design and quality audit of the six Ad Results pages, measured in a headless browser.
// No screenshots. Every finding is a number or a DOM fact.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.ADS_AUDIT_BASE || 'http://localhost:3021';
const env = fs.readFileSync(path.join(SITE, '.env.local'), 'utf8');
const token = (env.match(/^ADMIN_SESSION_TOKEN=(.*)$/m) || [])[1]?.replace(/^['"]|['"]$/g, '');
const shotsDir = process.env.ADS_AUDIT_SHOTS;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const pwUrl = 'file:///' + (SITE + '/node_modules/playwright-core/index.js').replace(/'/g, '%27').replace(/ /g, '%20');
const pw = (await import(pwUrl)).default;
const browser = await pw.chromium.launch({ channel: 'msedge' }).catch(() => pw.chromium.launch());

const PAGES = ['/admin/ads', '/admin/ads/compare', '/admin/ads/all', '/admin/ads/after-the-click', '/admin/ads/who-and-when', '/admin/ads/advice'];
const WIDTHS = process.env.ADS_AUDIT_PHONE_ONLY
  ? [{ name: 'phone', w: 390, h: 844 }]
  : [{ name: 'desktop', w: 1280, h: 900 }, { name: 'phone', w: 390, h: 844 }];

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const l1 = luminance(fg), l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { rgb: p.slice(0, 3), a: p[3] ?? 1 }; };

const report = [];
for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: width.w, height: width.h } });
  await ctx.addCookies([{ name: 'wg_admin_session', value: token, domain: 'localhost', path: '/' }]);
  const page = await ctx.newPage();
  // Open the dashboard once, then use its own links. The AdsProvider stays
  // mounted between pages, so one Meta read audits all six screens instead of
  // asking Meta again for every route.
  await page.goto(BASE + PAGES[0], { waitUntil: 'domcontentloaded' });
  for (const [index, p] of PAGES.entries()) {
    if (index > 0) {
      await page.locator(`[data-testid="ads-nav-link"][href="${p}"]`).click();
      await page.waitForURL(BASE + p, { timeout: 30000 });
    }
    await page.waitForSelector('[data-testid="ads-nav"]', { timeout: 60000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="ads-shell"]')?.getAttribute('data-loading') === 'false', null, { timeout: 90000 });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const main = document.querySelector('main');
      const rect = (el) => el.getBoundingClientRect();
      const visible = (el) => { const r = rect(el); return r.width > 0 && r.height > 0; };
      const all = Array.from(main.querySelectorAll('*')).filter(visible);
      // 1. Horizontal overflow anywhere.
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const overflowing = all.filter((el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX !== 'auto' && getComputedStyle(el).overflowX !== 'scroll' && getComputedStyle(el).overflowX !== 'hidden' && el.children.length === 0 && (el.textContent ?? '').trim().length > 0)
        .map((el) => ({ tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 60), over: el.scrollWidth - el.clientWidth }));
      // 2. Text sizes.
      const texts = all.filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 0 && !['SVG', 'svg', 'text', 'title'].includes(el.tagName));
      const sizes = {};
      for (const el of texts) { const s = Math.round(parseFloat(getComputedStyle(el).fontSize)); sizes[s] = (sizes[s] ?? 0) + 1; }
      // 3. Contrast of small text (under 11px), sampled by unique colour pairs.
      const bgOf = (el) => { let e = el; while (e && e !== document.body) { const bg = getComputedStyle(e).backgroundColor; if (bg && !/rgba\(0, 0, 0, 0\)/.test(bg) && bg !== 'transparent') return bg; e = e.parentElement; } return 'rgb(250, 250, 249)'; };
      const pairs = {};
      for (const el of texts) {
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size >= 11) continue;
        const key = `${getComputedStyle(el).color}|${bgOf(el)}|${Math.round(size)}`;
        pairs[key] = (pairs[key] ?? 0) + 1;
      }
      // 4. Touch targets: interactive elements under 32px tall.
      const interactive = Array.from(main.querySelectorAll('button, a, select, input[type="checkbox"], input[type="text"]')).filter(visible);
      const small = interactive.filter((el) => rect(el).height < 32).map((el) => ({ tag: el.tagName, text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 40), h: Math.round(rect(el).height) }));
      // 5. Page length and card count.
      const height = document.documentElement.scrollHeight;
      const cards = main.querySelectorAll('section, article, [data-testid$="-table"], [data-testid="adviser-panels"] > div').length;
      // 6. Headings.
      const headings = Array.from(main.querySelectorAll('h1,h2,h3,h4')).map((h) => h.tagName + ':' + (h.textContent ?? '').trim().slice(0, 40));
      // 7. Controls without a name.
      const unnamed = interactive.filter((el) => !(el.textContent ?? '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).length;
      // 8. Charts present and their drawn heights.
      const svgs = Array.from(main.querySelectorAll('svg[aria-label]')).map((s) => ({ label: s.getAttribute('aria-label'), h: Math.round(rect(s).height), w: Math.round(rect(s).width) }));
      // 9. Empty-state sentences.
      const empties = Array.from(main.querySelectorAll('p')).map((p) => (p.textContent ?? '').trim()).filter((t) => /^(Nothing|No |Not enough|Too early)/.test(t)).slice(0, 8);
      // 10. Dashes in visible text.
      const dashes = /[–—]/.test(main.textContent ?? '');
      // 11. Tab rail: on a phone it should be one sideways-scrolling row,
      // while the page itself must never scroll sideways.
      const nav = document.querySelector('[data-testid="ads-nav-scroll"]');
      const navScrolls = nav ? nav.scrollWidth > nav.clientWidth + 2 : false;
      const navLinks = Array.from(document.querySelectorAll('[data-testid="ads-nav-link"]'));
      const navRows = new Set(navLinks.map((link) => Math.round(rect(link).top))).size;
      const active = document.querySelector('[data-testid="ads-nav-link"][aria-current="page"]');
      const activeVisible = !nav || !active || (rect(active).left >= rect(nav).left - 1 && rect(active).right <= rect(nav).right + 1);
      return { docOverflow, overflowing: overflowing.slice(0, 8), sizes, pairs, small: small.slice(0, 12), smallCount: small.length, height, cards, headings, unnamed, svgs, empties, dashes, navScrolls, navRows, activeVisible, interactiveCount: interactive.length };
    });
    const weak = Object.entries(m.pairs).map(([k, n]) => { const [fg, bg, size] = k.split('|'); const f = parse(fg), b = parse(bg); if (!f || !b) return null; const c = contrast(f.rgb, b.rgb); return { fg, bg, size: Number(size), n, contrast: Math.round(c * 100) / 100 }; }).filter(Boolean).filter((x) => x.contrast < 4.5).sort((a, b) => a.contrast - b.contrast);
    if (shotsDir && width.name === 'phone') {
      const slug = p === '/admin/ads' ? 'dashboard' : p.split('/').pop();
      await page.screenshot({ path: path.join(shotsDir, `${slug}.png`), fullPage: true });
    }
    report.push({ width: width.name, page: p, ...m, weak });
  }
  await ctx.close();
}
await browser.close();
let failures = 0;
for (const r of report) {
  console.log(`\n== ${r.width} ${r.page}`);
  console.log(`page height ${r.height}px, ${r.cards} cards, ${r.interactiveCount} controls, doc overflow ${r.docOverflow}px, nav scrolls: ${r.navScrolls}, nav rows: ${r.navRows}, active visible: ${r.activeVisible}, dashes: ${r.dashes}`);
  console.log(`text sizes (px:count): ${Object.entries(r.sizes).sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(' ')}`);
  if (r.overflowing.length) console.log(`overflowing text: ${JSON.stringify(r.overflowing)}`);
  if (r.weak.length) console.log(`weak contrast (<4.5) on small text: ${r.weak.map((w) => `${w.contrast} ${w.fg} on ${w.bg} @${w.size}px x${w.n}`).join(' | ')}`);
  console.log(`controls under 32px tall: ${r.smallCount} ${JSON.stringify(r.small.slice(0, 6))}`);
  console.log(`headings: ${r.headings.join(' ; ')}`);
  console.log(`unnamed controls: ${r.unnamed}; charts: ${r.svgs.map((s) => `${s.label} ${s.w}x${s.h}`).join(' | ')}`);
  if (r.empties.length) console.log(`empty-state lines: ${r.empties.join(' || ')}`);
  const expected = [
    [r.docOverflow === 0, 'the page does not scroll sideways'],
    [r.unnamed === 0, 'every control has a readable name'],
    [r.dashes === false, 'visible copy follows the site punctuation rule'],
    [r.activeVisible, 'the current section is visible'],
    [r.width === 'phone' ? r.navScrolls && r.navRows === 1 : !r.navScrolls && r.navRows === 1,
      r.width === 'phone' ? 'phone sections use one swipeable row' : 'desktop sections use one fixed row'],
  ];
  for (const [ok, label] of expected) {
    if (!ok) {
      failures++;
      console.log(`FAIL: ${label}`);
    }
  }
}
console.log(`\n${failures === 0 ? 'AUDIT PASSED' : `AUDIT FAILED: ${failures} checks`}`);
process.exitCode = failures ? 1 : 0;
