// Headless proof harness for the Ad Results pages (ADSLAB, 4 Sept 2026). No screenshots: DOM
// structure, text and API values only, which is what actually needs proving and costs no image data.
//
// How to run:  start `npx next dev -p 3021` in this folder, then
//              node scripts/prove-ads-page.mjs nav picker funds labels cards compare verdict csv funnel breakeven landing names visitors previous timing live
// The admin session is forged from ADMIN_SESSION_TOKEN in .env.local, so no login and no brute-force limiter.
// Meta is on the development access tier: each page read costs about a dozen calls, so run the
// checksets you need rather than the lot on a loop. The reader's two-minute memory covers repeats.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:3021';
const env = fs.readFileSync(path.join(SITE, '.env.local'), 'utf8');
const token = (env.match(/^ADMIN_SESSION_TOKEN=(.*)$/m) || [])[1]?.replace(/^['"]|['"]$/g, '');
if (!token) throw new Error('ADMIN_SESSION_TOKEN missing from .env.local');
const COOKIE = `wg_admin_session=${token}`;

const pwUrl = 'file:///' + path.join(SITE, 'node_modules/playwright-core/index.js').replace(/\\/g, '/').replace(/'/g, '%27').replace(/ /g, '%20');
const pw = (await import(pwUrl)).default;

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` (${detail})` : ''}`); }
}

async function api(pathname) {
  const res = await fetch(BASE + pathname, { headers: { cookie: COOKIE } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, text, headers: res.headers };
}

async function launch() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await pw.chromium.launch(channel ? { channel } : {}); } catch (e) { /* try next */ }
  }
  throw new Error('No Chromium-based browser could be launched');
}

const sets = process.argv.slice(2);
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies([{ name: 'wg_admin_session', value: token, domain: 'localhost', path: '/' }]);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  PAGE ERROR', e.message));

async function loadedShell() {
  await page.waitForFunction(() => document.querySelector('[data-testid="ads-shell"]')?.getAttribute('data-loading') === 'true', null, { timeout: 4000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[data-testid="ads-shell"]')?.getAttribute('data-loading') === 'false', null, { timeout: 90000 });
}
async function open(pathname = '/admin/ads') {
  await page.goto(BASE + pathname, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="ads-nav"]', { timeout: 60000 });
  await loadedShell();
}
async function pickPeriod(value) {
  await page.selectOption('select[aria-label="Period"]', value);
  await page.waitForFunction((v) => document.querySelector('[data-testid="download-csv"]')?.getAttribute('href') === `/api/admin/ads/export?range=${v}`, value, { timeout: 15000 });
  await loadedShell();
}

// Who the after-the-click cards count (ADSLAB item 15). The historical figures
// in these checks were measured before the filter existed, so anything that
// asserts an exact count switches to "Everybody" first.
async function pickVisitors(value) {
  await page.click(`[data-testid="visitor-${value}"]`);
  await page.waitForFunction((v) => document.querySelector('[data-testid="visitor-switch"]')?.getAttribute('data-scope') === v, value, { timeout: 15000 });
  await loadedShell();
}

const checks = {};

checks.funds = async () => {
  console.log('funds card');
  const { status, body } = await api('/api/admin/ads?range=7d');
  check('api answers 200', status === 200, `status ${status}`);
  const f = body?.funds;
  check('api carries funds', Boolean(f), JSON.stringify(f));
  if (f) {
    check('available = cap - spent', f.availableMinor === f.capMinor - f.spentMinor, `${f.availableMinor} = ${f.capMinor} - ${f.spentMinor}`);
    if ((f.accounts ?? []).length > 1) {
      check('only explicit prepaid balances are counted', f.displayMinor === null && f.fundedAccountIds?.length === 1 && f.disagreement === false, `display ${f.displayMinor}`);
    } else {
      check('display string parsed and agrees', f.displayMinor === f.availableMinor && f.disagreement === false, `display ${f.displayMinor}`);
    }
    check('prepay account', f.prepay === true);
    check('fetchedAt is a time', !Number.isNaN(Date.parse(f.fetchedAt)));
  }
  check('api carries fetchedAt', Boolean(body?.fetchedAt));

  await open();
  const card = page.locator('[data-testid="funds-card"]');
  check('card is the first thing on the Dashboard page', await page.evaluate(() => document.querySelector('[data-testid="page-dashboard"]')?.firstElementChild?.getAttribute('data-testid') === 'funds-card'));
  const value = (await card.locator('[data-testid="funds-value"]').textContent())?.trim();
  check('value is money', /^£\d+\.\d\d$/.test(value ?? ''), value);
  if (f) check('value matches the api', value === `£${(f.availableMinor / 100).toFixed(2)}`);
  const spent = (await card.locator('[data-testid="funds-spent"]').textContent())?.trim();
  const cap = (await card.locator('[data-testid="funds-cap"]').textContent())?.trim();
  check('spent and cap shown', /^£/.test(spent ?? '') && /^£/.test(cap ?? ''), `${spent} / ${cap}`);
  const statusText = (await card.locator('[data-testid="funds-status"]').textContent())?.trim();
  const tone = await card.getAttribute('data-tone');
  check('status sentence present', Boolean(statusText), `${tone}: ${statusText}`);
  check('status never divides by zero', !/NaN|Infinity/.test(statusText ?? ''));
  const text = (await card.textContent()) ?? '';
  check('explains what the balance means', /already paid to Meta|Live prepaid balance returned by Meta/.test(text));
  check('says Meta lags about 15 minutes', /lag about 15 minutes/.test(text));
  check('shows last updated time', /Last updated \d\d:\d\d/.test(text));
  check('no disagreement warning when sources agree', (await card.locator('[data-testid="funds-disagreement"]').count()) === 0);
  check('label says this is the prepaid balance', /Available prepaid funds/i.test(text));
  check('no em or en dashes in the card', !/[\u2013\u2014]/.test(text));
};

checks.labels = async () => {
  console.log('experiment labels');
  const post = async (body) => {
    const res = await fetch(BASE + '/api/admin/ads/creative', { method: 'POST', headers: { cookie: COOKIE, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  let r = await post({ adId: '1', slot: 'Z' });
  check('letter Z is refused', r.status === 400 && /A to E/.test(r.body?.error ?? ''), `${r.status} ${r.body?.error}`);
  r = await post({ adId: '', note: 'x' });
  check('missing ad id is refused', r.status === 400);
  r = await post({ adId: '1', note: 'x'.repeat(201) });
  check('a 201-letter note is refused', r.status === 400);
  r = await post({ adId: '120251836299220597', adName: 'test', slot: 'a', note: 'Gym targeting, comments off', label: 'Ibiza film' });
  // The laptop database role is read-only, so a valid save answers 500 here and 200 in production.
  check('a valid save is accepted by the route (200) or refused only by the read-only local database (500)', r.status === 200 || r.status === 500, `status ${r.status}`);
  const { body } = await api('/api/admin/ads?range=28d');
  check('api creativeLinks is an object keyed by ad id', body && typeof body.creativeLinks === 'object');

  await open('/admin/ads/all');
  const editors = page.locator('[data-testid="ad-label-editor"]');
  const n = await editors.count();
  check('an editor per ad row', n >= 1, `${n} editors`);
  const first = editors.first();
  check('a letter dropdown, A to E plus none', (await first.locator('select[aria-label="Compare letter"] option').count()) === 6);
  check('note and film inputs present', (await first.locator('input[aria-label="Experiment note"]').count()) === 1 && (await first.locator('input[aria-label="Which film"]').count()) === 1);
  // Display name falls back to the Meta name when nothing has been typed.
  const names = await page.locator('[data-testid="ad-card-name"]').allTextContents();
  check('display names shown', names.length === n, names.map((x) => x.trim()).join(' | '));
  // Typing a note and blurring saves (or fails honestly on the read-only laptop database).
  await first.locator('input[aria-label="Experiment note"]').fill('Gym targeting, comments off');
  await first.locator('input[aria-label="Experiment note"]').press('Enter');
  await page.waitForFunction(() => {
    const s = document.querySelector('[data-testid="ad-label-state"]')?.getAttribute('data-state');
    return s === 'saved' || s === 'failed';
  }, null, { timeout: 20000 });
  const state = await first.locator('[data-testid="ad-label-state"]').getAttribute('data-state');
  check('save reports saved or failed, never silent', state === 'saved' || state === 'failed', state);
  if (state === 'saved') {
    const name0 = (await page.locator('[data-testid="ad-card-name"]').first().textContent())?.trim();
    check('display name updates at once after a save', /Gym targeting, comments off/.test(name0 ?? ''), name0);
    check('Meta name still visible small', (await page.locator('[data-testid="ad-card-meta-name"]').count()) >= 1);
  }
  await first.locator('select[aria-label="Compare letter"]').selectOption('C');
  await page.waitForFunction(() => {
    const s = document.querySelector('[data-testid="ad-label-state"]')?.getAttribute('data-state');
    return s === 'saved' || s === 'failed';
  }, null, { timeout: 20000 });
  check('choosing a letter is sent (C is allowed now)', (await first.locator('select[aria-label="Compare letter"]').inputValue()) === 'C');
  const bad = await post({ adId: '1', slot: 'F' });
  check('letter F is refused', bad.status === 400 && /A to E/.test(bad.body?.error ?? ''), `${bad.status} ${bad.body?.error}`);
  const text = (await page.locator('main').textContent()) ?? '';
  check('no em or en dashes on the page', !/[–—]/.test(text));
};

checks.cards = async () => {
  console.log('ad cards');
  const { status, body } = await api('/api/admin/ads?range=all');
  check('api answers 200', status === 200);
  const ads = body?.ads ?? [];
  check('every owned ad is present (3)', ads.length === 3, `${ads.length}`);
  const run = ads.filter((a) => a.running);
  check('nothing running (every post is past its end date), biggest spender first', run.length === 0 && ads.every((a) => a.status === 'Finished') && ads[0].spendMinor >= ads[1].spendMinor, ads.map((a) => `${a.status}:${a.spendMinor}`).join(' '));
  const a0 = ads[0];
  for (const k of ['status', 'running', 'createdOn', 'thumbnailUrl', 'previewUrl', 'instagramUrl', 'callToAction', 'targeting', 'reach', 'frequency', 'linkClicks', 'landingPageViews', 'comments', 'engagement', 'videoViews', 'rankings', 'campaignId']) {
    check(`ad carries ${k}`, k in a0, JSON.stringify(a0[k]).slice(0, 60));
  }
  check('targeting is a plain sentence naming interests', /Interests: .*Weight training/.test(a0.targeting ?? '') && /UK/.test(a0.targeting ?? ''), a0.targeting);
  check('button is plain English', a0.callToAction === 'Shop now', a0.callToAction);
  check('rankings are null while Meta says UNKNOWN', a0.rankings.quality === null && a0.rankings.engagement === null && a0.rankings.conversion === null);
  check('comments come through (1 on the running ad)', a0.comments === 1, `${a0.comments}`);
  check('landing page views come through', a0.landingPageViews > 100, `${a0.landingPageViews}`);
  check('thumbnail is a Meta CDN address', /fbcdn\.net/.test(a0.thumbnailUrl ?? ''));
  const seven = await api('/api/admin/ads?range=7d');
  check('paused ads still listed in a 7-day range', (seven.body?.ads ?? []).length === 3, `${(seven.body?.ads ?? []).length}`);

  // The comparison rules against the real figures, for one, two and three ads.
  const cmp = await import(pwUrl.replace('node_modules/playwright-core/index.js', 'src/lib/ads/compare.ts'));
  const [a1, a2, a3] = ads;
  const till = () => undefined;
  const m = (key) => cmp.MEASURES.find((x) => x.key === key);
  check('one ad: not enough to compare', cmp.enoughToCompare([a1]) === false);
  check('two real ads: enough to compare (172 and 65 clicks)', cmp.enoughToCompare([a1, a2]) === true, `${a1.clicks} ${a2.clicks} ${a1.impressions} ${a2.impressions}`);
  check('three ads incl. the small one: not enough', cmp.enoughToCompare([a1, a2, a3]) === false, `${a3.clicks} clicks`);
  check('cost per click: cheaper ad wins', cmp.winnerOf(m('cpc'), [a1, a2], till) === a2.id, `${(a1.spendMinor / a1.clicks).toFixed(1)}p vs ${(a2.spendMinor / a2.clicks).toFixed(1)}p`);
  check('click rate: higher ad wins', cmp.winnerOf(m('ctr'), [a1, a2], till) === a2.id);
  check('clicks: the bigger ad wins', cmp.winnerOf(m('clicks'), [a1, a2], till) === a1.id);
  check('spend has no winner', cmp.winnerOf(m('spend'), [a1, a2], till) === null);
  check('comments 1 vs 1: tie, no winner', cmp.winnerOf(m('comments'), [a1, a2], till) === null, `${a1.comments} vs ${a2.comments}`);
  check('orders 0 vs 0: no winner', cmp.winnerOf(m('orders'), [a1, a2], till) === null);
  check('three ads with a small one: no winners at all', cmp.MEASURES.every((x) => cmp.winnerOf(x, [a1, a2, a3], till) === null));
  const pair = cmp.pickPair(ads, () => null);
  check('no slots set: pair is the two biggest spenders', pair.a?.id === a1.id && pair.b?.id === a2.id && pair.bySlot === false);
  const pair2 = cmp.pickPair(ads, (id) => (id === a3.id ? 'A' : id === a1.id ? 'B' : null));
  check('slots set: pair follows the slots', pair2.a?.id === a3.id && pair2.b?.id === a1.id && pair2.bySlot === true);
  check('formatting: money, percent, count', cmp.formatMeasure(m('cpc'), 14.39, 'GBP') === '£0.14' && cmp.formatMeasure(m('ctr'), 4.65, 'GBP') === '4.65%' && cmp.formatMeasure(m('clicks'), 1234, 'GBP') === '1,234');

  await open('/admin/ads/all');
  await page.waitForSelector('[data-testid="ad-card"]', { timeout: 60000 });
  const cards = page.locator('[data-testid="ad-card"]');
  check('three cards on the page', (await cards.count()) === 3);
  check('no running row when nothing is running', (await page.locator('[data-testid="running-cards"]').count()) === 0);
  check('three quiet cards below', (await page.locator('[data-testid="quiet-cards"] [data-testid="ad-card"]').count()) === 3);
  const note = (await page.locator('[data-testid="compare-note"]').textContent()) ?? '';
  check('note says nothing is running', /Nothing is running right now/.test(note), note);
  check('no ahead marks with one ad running', (await page.locator('[data-testid="ahead"]').count()) === 0);
  const first = cards.first();
  check('first card shows the Finished pill', (await first.locator('[data-testid="ad-card-status"]').textContent())?.trim() === 'Finished');
  check('four lead measures per card', (await first.locator('[data-measure].p-3').count()) === 4);
  const cpcText = await first.locator('[data-measure="cpc"] .text-xl').textContent();
  check('cost per click is money on the running card', /^£\d+\.\d\d$/.test(cpcText?.trim() ?? ''), cpcText);
  check('comments shown as a lead measure', (await first.locator('[data-measure="comments"]').count()) === 1);
  check('targeting sentence on the card', /Interests:/.test((await first.locator('[data-testid="ad-card-targeting"]').textContent()) ?? ''));
  check('the ten secondary figures are folded until asked for', (await first.locator('[data-testid="more-figures-list"]').count()) === 0);
  await first.locator('[data-testid="more-figures"]').click();
  check('More figures opens the ten rows', (await first.locator('[data-testid="more-figures-list"] [data-measure]').count()) === 10);
  check('rankings honesty line', /has not ranked/.test((await first.locator('[data-testid="ad-card-rankings"]').textContent()) ?? ''));
  check('editor inside the card', (await first.locator('[data-testid="ad-label-editor"]').count()) === 1);
  check('thumbnail image present', (await first.locator('header img').count()) === 1);
  check('old dense ads table is gone', (await page.locator('text=Individual ads, biggest spend first').count()) === 0);
  const text = (await page.locator('main').textContent()) ?? '';
  check('no em or en dashes on the page', !/[–—]/.test(text));
};

checks.compare = async () => {
  console.log('two-line comparison chart');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) % 24;
  const shift = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

  let r = await api('/api/admin/ads/compare?range=7d');
  check('7d answers 200', r.status === 200, `${r.status} ${r.body?.error ?? ''}`);
  check('7d is daily with 7 points', r.body?.granularity === 'day' && r.body?.points?.length === 7, `${r.body?.granularity} ${r.body?.points?.length}`);
  check('7d ends today and starts 6 days ago', r.body?.points?.[6]?.key === today && r.body?.points?.[0]?.key === shift(today, -6), `${r.body?.points?.[0]?.key} .. ${r.body?.points?.[6]?.key}`);
  check('7d carries all three ads', r.body?.ads?.length === 3);
  check('every point has a cell per ad', r.body?.points?.every((p) => Object.keys(p.byAd).length === 3));
  check('cells carry orders from our records', r.body?.points?.every((p) => Object.values(p.byAd).every((c) => typeof c.orders === 'number')));
  check('a paused ad has zero-click buckets (the line must break on cost per click)', r.body?.points?.some((p) => Object.values(p.byAd).some((c) => c.clicks === 0)));

  const all = await api('/api/admin/ads/compare?range=all');
  const dash = await api('/api/admin/ads?range=all');
  const runningId = dash.body?.ads?.[0]?.id;
  const sumSpend = (all.body?.points ?? []).reduce((t, p) => t + (p.byAd[runningId]?.spendMinor ?? 0), 0);
  check('whole run starts on the first day anything ran', all.body?.points?.[0]?.key === '2026-08-25', all.body?.points?.[0]?.key);
  check('whole-run spend adds up to the lifetime figure', sumSpend === dash.body?.ads?.[0]?.spendMinor, `${sumSpend} vs ${dash.body?.ads?.[0]?.spendMinor}`);
  const consecutive = (all.body?.points ?? []).every((p, i, arr) => i === 0 || p.key === shift(arr[i - 1].key, 1));
  check('whole run has no gaps (every day present)', consecutive);

  r = await api('/api/admin/ads/compare?range=today');
  check('today is hourly with one point per hour so far', r.body?.granularity === 'hour' && r.body?.points?.length === londonHour + 1, `${r.body?.points?.length} points, hour ${londonHour}`);
  check('hourly reach is null and the note says so', r.body?.points?.every((p) => Object.values(p.byAd).every((c) => c.reach === null)) && /Reach/.test(r.body?.note ?? ''));
  check('hourly labels read HH:00', r.body?.points?.every((p) => /^\d\d:00$/.test(p.label)));
  r = await api('/api/admin/ads/compare?range=24h');
  check('last 24 hours has 24 points', r.body?.points?.length === 24, `${r.body?.points?.length}`);
  r = await api('/api/admin/ads/compare?range=3d');
  check('3 days has 3 points', r.body?.points?.length === 3);
  r = await api('/api/admin/ads/compare?range=nonsense');
  check('an unknown range falls back to 7 days', r.body?.range === '7d');

  await open();
  await page.waitForSelector('[data-testid="compare-chart"]', { timeout: 60000 });
  await page.waitForSelector('[data-testid="compare-legend"] [data-testid="legend-item"]', { timeout: 60000 });
  const loaded = async (range) => {
    await page.waitForFunction((want) => {
      const el = document.querySelector('[data-testid="compare-chart"]');
      return el?.getAttribute('data-loading') === 'false' && el?.getAttribute('data-shown-range') === want;
    }, range, { timeout: 60000 });
  };
  await page.waitForFunction(() => document.querySelector('[data-testid="compare-chart"]')?.getAttribute('data-loading') === 'false', null, { timeout: 60000 });
  const chart = page.locator('[data-testid="compare-chart"]');
  check('five windows in the dropdown', (await chart.locator('select[aria-label="Time range"] option').count()) === 5);
  check('ten measures in the dropdown', (await chart.locator('select[aria-label="Measure"] option').count()) === 10);
  const how = (await chart.locator('[data-testid="compare-how"]').textContent()) ?? '';
  check('says which ads it is drawing and why', /two biggest spenders|every running ad|marked A and B/.test(how), how);
  check('two legend items', (await chart.locator('[data-testid="legend-item"]').count()) === 2);
  const styles = await chart.locator('[data-testid="compare-line"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-style')));
  check('lines differ by style as well as colour: solid green then dashed red', styles[0] === 'solid green' && styles[1] === 'dashed red', styles.join(', '));
  const legendText = (await chart.locator('[data-testid="compare-legend"]').textContent()) ?? '';
  check('legend names the line styles', /solid green/.test(legendText) && /dashed red/.test(legendText));
  check('svg drawn for the last 7 days (one paused ad spent on 31 Aug)', (await chart.locator('[data-testid="compare-svg"]').count()) === 1);
  const legend7 = (await chart.locator('[data-testid="compare-legend"]').textContent()) ?? '';
  check('7-day legend says the running ad spent nothing in the window (true: last delivery 28 Aug)', /learn more.*£0.00, 0 clicks/.test(legend7), legend7.slice(0, 120));

  await chart.locator('select[aria-label="Measure"]').selectOption('cpc');
  check('metric switch keeps the chart', (await chart.locator('[data-testid="compare-svg"]').count()) === 1);
  await chart.locator('select[aria-label="Time range"]').selectOption('all');
  await loaded('all');
  await page.waitForFunction(() => /£24\.75|£\d+\.\d\d/.test(document.querySelector('[data-testid="compare-legend"]')?.textContent ?? ''), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const legendAll = (await chart.locator('[data-testid="compare-legend"]').textContent()) ?? '';
  check('whole-run legend totals show the lifetime spend of the running ad', /£24\.75/.test(legendAll), legendAll.slice(0, 160));
  await chart.locator('select[aria-label="Time range"]').selectOption('24h');
  await loaded('24h');
  check('reach is greyed out in the dropdown by the hour', (await chart.locator('select[aria-label="Measure"] option[disabled]').count()) === 1);
  await chart.locator('select[aria-label="Time range"]').selectOption('today');
  await loaded('today');
  const emptyToday = await chart.locator('[data-testid="compare-empty"]').count();
  const svgToday = await chart.locator('[data-testid="compare-svg"]').count();
  check('today shows either the chart or an honest empty state', emptyToday + svgToday === 1, `empty ${emptyToday} svg ${svgToday}`);
  const text = (await page.locator('main').textContent()) ?? '';
  check('no em or en dashes on the page', !/[–—]/.test(text));
};

checks.verdict = async () => {
  console.log('the verdict: has one ad beaten the other?');
  const cmp = await import(pwUrl.replace('node_modules/playwright-core/index.js', 'src/lib/ads/compare.ts'));
  const mk = (id, name, spend, clicks, impressions, orders = 0) => ({ id, name, spendMinor: spend, impressions, clicks, orders });
  let v = cmp.compareVerdict(null, null, 'GBP');
  check('no ads: asks for A and B', /Mark two ads/.test(v.text) && v.solid === false && v.winnerId === null);
  v = cmp.compareVerdict(mk('1', 'Ad A', 100, 30, 600), null, 'GBP');
  check('one ad: asks for a B', /Mark a second ad as B/.test(v.text) && v.winnerId === null, v.text);
  v = cmp.compareVerdict(mk('1', 'Ad A', 100, 5, 600), mk('2', 'Ad B', 100, 30, 600), 'GBP');
  check('too early: says so and keep going', /Too early to say/.test(v.text) && /Keep going/.test(v.text) && v.solid === false, v.text);
  v = cmp.compareVerdict(mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 310, 30, 600), 'GBP');
  check('neck and neck: no winner, keep going', /Neck and neck/.test(v.text) && v.winnerId === null && v.solid === true, v.text);
  v = cmp.compareVerdict(mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 120, 30, 600), 'GBP');
  check('less than half: B wins', /Ad B is getting clicks for less than half what Ad A pays/.test(v.text) && v.winnerId === '2', v.text);
  v = cmp.compareVerdict(mk('1', 'Ad A', 300, 30, 600, 1), mk('2', 'Ad B', 190, 30, 600, 0), 'GBP');
  check('about a third less, with orders spelled out', /about a third less/.test(v.text) && /Ad A has brought 1 order and Ad B 0 orders/.test(v.text), v.text);
  v = cmp.compareVerdict({ ...mk('1', 'Ad A', 300, 30, 600), orders: null }, { ...mk('2', 'Ad B', 120, 30, 600), orders: null }, 'GBP');
  check('orders unknown: no orders sentence', !/order/.test(v.text), v.text);

  const three = cmp.compareChosen([mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 120, 30, 600), mk('3', 'Ad C', 200, 30, 600)], 'GBP');
  check('three ads: names the cheapest and the dearest, and who sits between', /Of the 3 ads you are comparing, Ad B gets the cheapest clicks/.test(three.text) && /Ad C sits between them/.test(three.text) && three.winnerId === '2', three.text);
  const early3 = cmp.compareChosen([mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 120, 30, 600), mk('3', 'Ad C', 20, 4, 100)], 'GBP');
  check('three ads with one too early: says which', /Ad C does not have enough clicks yet/.test(early3.text), early3.text);
  const tooEarly = cmp.compareChosen([mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 12, 3, 60), mk('3', 'Ad C', 20, 4, 100)], 'GBP');
  check('three ads, only one ready: too early to say', /Too early to say. Only 1 of the 3 ads has enough clicks/.test(tooEarly.text) && tooEarly.solid === false, tooEarly.text);
  const close = cmp.compareChosen([mk('1', 'Ad A', 300, 30, 600), mk('2', 'Ad B', 290, 30, 600), mk('3', 'Ad C', 280, 30, 600)], 'GBP');
  check('three ads too close: none has beaten the rest', /none has beaten the rest yet/.test(close.text) && close.winnerId === null, close.text);
  const { body } = await api('/api/admin/ads?range=all');
  const ads = body?.ads ?? [];
  check('api carries a verdict', body?.verdict && typeof body.verdict.text === 'string', JSON.stringify(body?.verdict));
  const real = body?.verdict ?? {};
  check('real data: cheaper paused ad is ahead on cost per click (36% cheaper)', real.winnerId === ads[1]?.id && real.solid === true, `${real.winnerId} vs ${ads[1]?.id}`);
  check('real verdict is plain English with the honest orders line', /enough to be believable/.test(real.text) && /Neither has brought an order yet/.test(real.text), real.text);
  check('verdict is also a signal for the adviser', (body?.signals ?? []).some((s) => /^Ad against ad:/.test(s.text)));

  await open();
  await page.waitForSelector('[data-testid="verdict"]', { timeout: 60000 });
  const strip = page.locator('[data-testid="verdict"]');
  const text = (await strip.locator('[data-testid="verdict-text"]').textContent()) ?? '';
  const pageVerdict = (await api('/api/admin/ads?range=28d')).body?.verdict;
  check('strip says exactly what the api says for the same period', text.trim() === pageVerdict?.text, text.slice(0, 100));
  check('strip carries the winner', (await strip.getAttribute('data-winner')) === (pageVerdict?.winnerId ?? ''));
  check('strip sits before the comparison chart', await page.evaluate(() => {
    const v = document.querySelector('[data-testid="verdict"]');
    const c = document.querySelector('[data-testid="compare-chart"]');
    return Boolean(v && c && (v.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
  }));
  check('strip explains which ads and why', /two biggest spenders|you ticked/.test((await strip.textContent()) ?? ''));
  const all = (await page.locator('main').textContent()) ?? '';
  check('no em or en dashes on the page', !/[–—]/.test(all));
};

checks.csv = async () => {
  console.log('download as a spreadsheet');
  const res = await fetch(BASE + '/api/admin/ads/export?range=all', { headers: { cookie: COOKIE } });
  // Read the raw bytes: Node's text() quietly strips a leading byte-order mark, which is the very thing being checked.
  const bytes = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
  check('answers 200', res.status === 200, `${res.status}`);
  check('is a csv attachment with a dated name', /text\/csv/.test(res.headers.get('content-type') ?? '') && /attachment; filename="windsor-glow-ads-all-\d{4}-\d\d-\d\d\.csv"/.test(res.headers.get('content-disposition') ?? ''), res.headers.get('content-disposition'));
  check('starts with the Excel byte-order mark (EF BB BF)', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, `${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)} ${bytes[2]?.toString(16)}`);
  const lines = text.replace(/^﻿/, '').split('\r\n');
  const idx = (label) => lines.findIndex((l) => l === label);
  check('three sections in order', idx('Day by day') > 0 && idx('Campaigns') > idx('Day by day') && idx('Ads') > idx('Campaigns'));
  const { body } = await api('/api/admin/ads?range=all');
  const section = (label, next) => lines.slice(idx(label) + 2, next ? idx(next) - 1 : lines.length).filter(Boolean);
  const daily = section('Day by day', 'Campaigns');
  const camps = section('Campaigns', 'Ads');
  const ads = section('Ads', null);
  check('day rows match the api', daily.length === (body?.daily ?? []).length, `${daily.length} vs ${(body?.daily ?? []).length}`);
  check('campaign rows match the api', camps.length === (body?.campaigns ?? []).length, `${camps.length} vs ${(body?.campaigns ?? []).length}`);
  check('ad rows match the api', ads.length === (body?.ads ?? []).length, `${ads.length} vs ${(body?.ads ?? []).length}`);
  const adHeader = lines[idx('Ads') + 1];
  check('ads header carries the names you gave them and the Meta name', /^What you call it,A or B,What it tests,Which film,Meta ad name,/.test(adHeader), adHeader.slice(0, 80));
  check('ads header carries the Meta account and website tracking state', /Meta account,Website tracking/.test(adHeader));
  const running = (body?.ads ?? [])[0];
  const runningLine = ads.find((l) => l.includes(running?.id ?? 'x'));
  check('running ad row carries its lifetime spend in pounds', Boolean(runningLine) && runningLine.includes(`,${(running.spendMinor / 100).toFixed(2)},`), runningLine?.slice(0, 120));
  check('targeting sentence is quoted because it holds commas', /"Interests: [^"]+"/.test(runningLine ?? ''));
  const dayTotal = daily.reduce((t, l) => t + Number(l.split(',')[1]), 0);
  const apiTotal = (body?.daily ?? []).reduce((t, d) => t + d.spendMinor, 0) / 100;
  check('day-by-day spend adds up to the api total', Math.abs(dayTotal - apiTotal) < 0.005, `${dayTotal.toFixed(2)} vs ${apiTotal.toFixed(2)}`);
  check('no em or en dashes in the file', !/[–—]/.test(text));
  const bad = await fetch(BASE + '/api/admin/ads/export?range=all');
  check('refused without the admin session', bad.status === 401 || bad.status === 403 || bad.status === 302 || bad.redirected, `${bad.status}`);

  await open();
  const link = page.locator('[data-testid="download-csv"]');
  check('download link on the page', (await link.count()) === 1);
  check('link points at the current period (28 days by default)', (await link.getAttribute('href')) === '/api/admin/ads/export?range=28d', await link.getAttribute('href'));
  await pickPeriod('7d');
  check('link follows the period switch', (await link.getAttribute('href')) === '/api/admin/ads/export?range=7d');
};

checks.funnel = async () => {
  console.log('what happened after the click');
  const { body } = await api('/api/admin/ads?range=all&visitors=all');
  const funnel = body?.funnel ?? [];
  check('api carries a funnel', Array.isArray(funnel), JSON.stringify(funnel).slice(0, 200));
  const f = funnel.find((x) => x.utm_campaign === '120251911118300597');
  check('the tagged campaign is in the funnel (42 visits, 40 addresses)', f && f.visits === 42 && f.people === 40, JSON.stringify(f));
  if (f) {
    check('landings counted', f.landed === 41, `${f.landed}`);
    check('steps only shrink: arrived >= product >= basket >= checkout >= ordered', f.people >= f.product_people && f.product_people >= f.basket_people && f.basket_people >= f.checkout_people && f.checkout_people >= f.orders, `${f.people} ${f.product_people} ${f.basket_people} ${f.checkout_people} ${f.orders}`);
    check('no orders credited, honestly', f.orders === 0 && f.revenue_minor === 0);
  }
  await open('/admin/ads/after-the-click');
  await pickVisitors('all');
  await page.waitForSelector('[data-testid="funnel"]', { timeout: 60000 });
  const card = page.locator('[data-testid="funnel"]');
  const blocks = card.locator('[data-testid="funnel-block"]');
  check('one block per campaign with clicks or arrivals', (await blocks.count()) >= 1, `${await blocks.count()}`);
  const tagged = card.locator('[data-testid="funnel-block"][data-campaign="120251911118300597"]');
  check('the tagged campaign has both a Meta row and an our-records row', (await tagged.locator('[data-testid="funnel-meta"]').count()) === 1 && (await tagged.locator('[data-testid="funnel-ours"]').count()) === 1);
  const arrived = await tagged.locator('[data-testid="funnel-ours"] [data-step="Arrived"]').getAttribute('data-value');
  check('our row starts with 40 arrivals', arrived === '40', arrived);
  const metaClicks = await tagged.locator('[data-testid="funnel-meta"] [data-step="Clicks on the ad"]').getAttribute('data-value');
  check('Meta row starts with that ad\'s clicks (65)', metaClicks === '65', metaClicks);
  const text = (await card.textContent()) ?? '';
  check('says which figures are Meta\'s and which are ours', /from Meta/.test(text) && /from our own records/.test(text));
  check('explains why the two never match', /never match exactly/.test(text));
  const untagged = card.locator('[data-testid="funnel-block"][data-campaign="120251836298090597"]');
  check('the running ad, which has no tags set, says so on its our-records side', (await untagged.locator('[data-testid="funnel-no-tags"]').count()) === 1);
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.breakeven = async () => {
  console.log('cost per visitor and break-even');
  const { body } = await api('/api/admin/ads?range=all');
  const o = body?.orders;
  check('api carries order stats over a year', o && o.days === 365 && o.count >= 5, JSON.stringify(o));
  check('average order is a real figure (about £169.50 across 59 orders)', o && o.averageMinor > 10000 && o.averageMinor < 30000, `${o?.averageMinor} over ${o?.count}`);
  const spend = (body?.ads ?? []).reduce((t, a) => t + a.spendMinor, 0);
  const arrivals = (body?.funnel ?? []).filter((f) => (body?.ads ?? []).some((a) => a.campaignId === f.utm_campaign)).reduce((t, f) => t + f.people, 0);
  const cpv = arrivals > 0 ? spend / arrivals : null;
  const needed = spend / o.averageMinor;

  await open('/admin/ads/after-the-click');
  await page.waitForSelector('[data-testid="break-even"]', { timeout: 60000 });
  await pickPeriod('all');
  await page.waitForSelector('[data-testid="break-even"]', { timeout: 60000 });
  const card = page.locator('[data-testid="break-even"]');
  const cpvText = (await card.locator('[data-testid="cost-per-visitor"] .text-2xl').textContent())?.trim();
  check('cost per visitor = spend over tagged arrivals', cpv !== null && cpvText === `£${(Math.round(cpv) / 100).toFixed(2)}`, `${cpvText} (${spend}p over ${arrivals})`);
  const avgText = (await card.locator('[data-testid="average-order"] .text-2xl').textContent())?.trim();
  check('average order shown in pounds', avgText === `£${(o.averageMinor / 100).toFixed(2)}`, avgText);
  const beText = (await card.locator('[data-testid="break-even-line"] .text-2xl').textContent())?.trim();
  check('orders needed to break even shown to one decimal', beText === `${needed.toFixed(1)} orders`, `${beText} vs ${needed.toFixed(2)}`);
  const sentence = (await card.locator('[data-testid="break-even-sentence"]').textContent()) ?? '';
  check('the sentence says one in how many visitors must order', /one in every \d+ visitors ordering/.test(sentence), sentence.slice(0, 200));
  check('the sentence is honest about zero orders so far', /none has ordered/.test(sentence) && /One order would put this ahead/.test(sentence));
  check('says break-even is before product costs', /before product costs/.test((await card.textContent()) ?? ''));
  check('per-ad table lists every ad that spent', (await card.locator('[data-testid="break-even-per-ad"] tbody tr').count()) === (body?.ads ?? []).filter((a) => a.spendMinor > 0).length);
  check('an untagged ad reads "no tags" rather than a made-up figure', /no tags/.test((await card.locator('[data-testid="break-even-per-ad"]').textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.landing = async () => {
  console.log('which page each ad sent people to');
  const { body } = await api('/api/admin/ads?range=all&visitors=all');
  const rep = body?.landing;
  check('api carries a landing report', rep && Array.isArray(rep.tagged) && Array.isArray(rep.pages), JSON.stringify(rep).slice(0, 200));
  const t = (rep?.tagged ?? []).find((x) => x.utm_campaign === '120251911118300597');
  check('the tagged ad landed on the home page (41 landings, 40 addresses)', t && t.path === '/' && t.landings === 41 && t.people === 40, JSON.stringify(t));
  const home = (rep?.pages ?? []).find((p) => p.path === '/');
  check('site-wide home page row present with the most landings', home && rep.pages[0].path === '/', JSON.stringify(home));
  check('site-wide steps only shrink: addresses >= product >= ordered', rep.pages.every((p) => p.people >= p.product_people && p.people >= p.order_people));

  await open('/admin/ads/after-the-click');
  await pickPeriod('all');
  await pickVisitors('all');
  await page.waitForSelector('[data-testid="landing"]', { timeout: 60000 });
  const card = page.locator('[data-testid="landing"]');
  const taggedLine = card.locator('[data-testid="landing-ad"][data-ad-id="120251911120040597"]');
  check('the tagged ad says it landed on the home page', /Home page/.test((await taggedLine.locator('[data-testid="landing-paths"]').textContent()) ?? ''), (await taggedLine.textContent())?.slice(0, 160));
  const jamie = card.locator('[data-testid="landing-ad"][data-ad-id="120251911641370597"]');
  check('the Jamie ad says its button goes to Instagram, not the site', (await jamie.locator('[data-testid="landing-instagram"]').count()) === 1);
  const running = card.locator('[data-testid="landing-ad"][data-ad-id="120251836299220597"]');
  check('the untagged running ad says where it landed is not in our records', /not in our records/.test((await running.locator('[data-testid="landing-unknown"]').textContent()) ?? ''));
  check('the site-wide table marks the page an ad lands on', /an ad lands here/.test((await card.locator('[data-testid="landing-pages"] tr[data-path="/"]').textContent()) ?? ''));
  check('table shows percentages, never a divide by zero', !/NaN|Infinity/.test((await card.textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.names = async () => {
  console.log('pages named in plain English, never a bare address');
  const { body } = await api('/api/admin/ads?range=all&visitors=all');
  const rep = body?.landing;
  const names = body?.pageNames ?? {};
  check('api carries plain-English names for the pages on screen', names && typeof names === 'object', JSON.stringify(names).slice(0, 200));
  const productPaths = (rep?.pages ?? []).map((p) => p.path).filter((p) => p.startsWith('/shop/') && !p.startsWith('/shop/category/'));
  check('every product page on screen has a real product name', productPaths.length === 0 || productPaths.every((p) => typeof names[p] === 'string' && names[p].length > 0), JSON.stringify(productPaths.map((p) => [p, names[p]])));

  await open('/admin/ads/after-the-click');
  await pickPeriod('all');
  await pickVisitors('all');
  const card = page.locator('[data-testid="landing"]');
  const rows = card.locator('[data-testid="landing-pages"] tbody tr');
  const rowCount = await rows.count();
  check('the table has rows to name', rowCount > 0, String(rowCount));
  let bare = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const path = await row.getAttribute('data-path');
    const title = ((await row.locator('td').first().locator('span').first().textContent()) ?? '').trim();
    if (!title || title.startsWith('/')) bare.push(`${path} -> ${title}`);
  }
  check('no row is named with a web address', bare.length === 0, bare.join(', '));
  const homeTitle = ((await card.locator('[data-testid="landing-pages"] tr[data-path="/"] td').first().locator('span').first().textContent()) ?? '').trim();
  check('the home page row is called the home page', /^Home page/.test(homeTitle), homeTitle);
  check('the address is still shown underneath, for tracing a row', (await card.locator('[data-testid="landing-pages"] tr[data-path="/"] td').first().textContent())?.includes('/'));
  const legend = (await card.locator('[data-testid="landing-legend"]').textContent()) ?? '';
  check('says in words that opening a product is not buying', /interest, not a sale/.test(legend), legend.slice(0, 120));
  check('the table headings are words, not jargon', /Page they arrived on/.test((await card.locator('[data-testid="landing-pages"] thead').textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.visitors = async () => {
  console.log('members left out of the ad figures');
  const all = await api('/api/admin/ads?range=all&visitors=all');
  const fresh = await api('/api/admin/ads?range=all&visitors=new');
  check('the default is new visitors only', (await api('/api/admin/ads?range=all')).body?.visitors === 'new');
  check('both reads answer with the scope they used', all.body?.visitors === 'all' && fresh.body?.visitors === 'new', `${all.body?.visitors} / ${fresh.body?.visitors}`);
  check('the landing report says which scope it counted', all.body?.landing?.scope === 'all' && fresh.body?.landing?.scope === 'new');
  const total = all.body?.landing?.totalLandings ?? 0;
  const members = all.body?.landing?.memberLandings ?? 0;
  check('the member count is reported and never exceeds the total', members >= 0 && members <= total, `${members} of ${total}`);
  check('both scopes report the same total and member count', fresh.body?.landing?.totalLandings === total && fresh.body?.landing?.memberLandings === members);
  const sum = (r) => (r?.pages ?? []).reduce((n, p) => n + p.landings, 0);
  check('filtering can only remove arrivals, never add them', sum(fresh.body?.landing) <= sum(all.body?.landing), `${sum(fresh.body?.landing)} <= ${sum(all.body?.landing)}`);
  const people = (r) => (r?.funnel ?? []).reduce((n, f) => n + f.people, 0);
  check('the funnel obeys the same filter', people(fresh.body) <= people(all.body), `${people(fresh.body)} <= ${people(all.body)}`);

  await open('/admin/ads/after-the-click');
  const sw = page.locator('[data-testid="visitor-switch"]');
  check('the switch is the first thing on the page', await page.evaluate(() => document.querySelector('[data-testid="page-after-the-click"]')?.firstElementChild?.getAttribute('data-testid') === 'visitor-switch'));
  check('it opens on people who were not members', (await sw.getAttribute('data-scope')) === 'new');
  check('it says what it leaves out, in words', /already had an account when they arrived/.test((await sw.textContent()) ?? ''));
  check('it says somebody who signed up afterwards still counts', /signed up after arriving still counts/.test((await sw.textContent()) ?? ''));
  check('it says how many arrivals were members', /arrivals in this period were people who already had an account|No arrivals recorded/.test((await sw.locator('[data-testid="visitor-switch-note"]').textContent()) ?? ''));
  check('it is honest about how far back the signed-in record goes', /since 5 September 2026/.test((await sw.textContent()) ?? ''));
  await pickVisitors('all');
  check('switching to everybody changes the figures behind it', (await sw.getAttribute('data-scope')) === 'all');
  check('the landing footnote follows the switch', /Everybody is counted here/.test((await page.locator('[data-testid="landing-footnote"]').textContent()) ?? ''));
  await pickVisitors('new');
  check('switching back leaves members out again', /are left out/.test((await page.locator('[data-testid="landing-footnote"]').textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.previous = async () => {
  console.log('last period faintly behind this one');
  const shift = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const { body } = await api('/api/admin/ads?range=7d');
  check('api carries the window and the window before', body?.window && body?.previousWindow && Array.isArray(body?.previousDaily), JSON.stringify({ w: body?.window, p: body?.previousWindow, n: body?.previousDaily?.length }));
  check('windows are equal length and touching', body?.previousWindow?.until === shift(body?.window?.since, -1) && shift(body?.previousWindow?.since, 7) === body?.window?.since);
  const all = await api('/api/admin/ads?range=all');
  check('all time has no window before', !all.body?.window && !all.body?.previousWindow && !all.body?.previousDaily);

  await open('/admin/ads/who-and-when');
  await pickPeriod('28d');
  await page.waitForSelector('svg[aria-label$="per day"]', { timeout: 60000 });
  const days = await page.locator('svg[aria-label$="per day"] rect').count();
  check('28-day chart shows every one of the 28 days, zeros included', days === 28, `${days} day columns`);
  // 28 days back from today covers the 31 Aug spend; the 28 before it (from 11 Jul) had nothing, so no faint line is drawn.
  const prev28 = await page.locator('[data-testid="previous-line"]').count();
  check('no faint line when the period before had nothing (honest, not a flat zero line)', prev28 === 0, `${prev28}`);
  await pickPeriod('7d');
  await page.waitForSelector('svg[aria-label$="per day"]', { timeout: 60000 });
  const prev7 = await page.locator('[data-testid="previous-line"]').count();
  const legend = await page.locator('[data-testid="previous-legend"]').count();
  // The 7 days before (22 to 28 Aug) carried the running ad's whole spend, so a faint line must appear.
  check('7-day chart draws the faint line for the week before (which had the spend)', prev7 >= 1 && legend === 1, `${prev7} segments, legend ${legend}`);
  check('legend explains the two lines', /Grey, dashed: the same number of days immediately before/.test((await page.locator('[data-testid="previous-legend"]').textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.timing = async () => {
  console.log('time of day and day of week');
  const { body } = await api('/api/admin/ads?range=all');
  const hours = body?.hours ?? [];
  check('api carries hourly rows', hours.length > 0 && hours.every((h) => Number.isInteger(h.hour) && h.hour >= 0 && h.hour < 24), `${hours.length} hours`);
  const hourClicks = hours.reduce((t, h) => t + h.clicks, 0);
  const dayClicks = (body?.daily ?? []).reduce((t, d) => t + d.clicks, 0);
  check('hourly clicks add up to the daily total', hourClicks === dayClicks, `${hourClicks} vs ${dayClicks}`);
  const hourSpend = hours.reduce((t, h) => t + h.spendMinor, 0);
  const daySpend = (body?.daily ?? []).reduce((t, d) => t + d.spendMinor, 0);
  check('hourly spend adds up to the daily total (within a penny)', Math.abs(hourSpend - daySpend) <= 1, `${hourSpend} vs ${daySpend}`);

  await open('/admin/ads/who-and-when');
  await pickPeriod('all');
  await page.waitForSelector('[data-testid="timing"]', { timeout: 60000 });
  const card = page.locator('[data-testid="timing"]');
  check('24 hour bars, drawn to one scale', (await card.locator('[data-testid="timing-hours"] rect[data-bar]').count()) === 24);
  check('7 weekday bars', (await card.locator('[data-testid="timing-days"] rect[data-bar]').count()) === 7);
  const bars = await card.locator('[data-testid="timing-hours"] rect[data-bar]').evaluateAll((els) => els.map((e) => ({ v: Number(e.getAttribute('data-value')), h: Number(e.getAttribute('height')) })));
  const withValue = bars.filter((b) => b.v > 0);
  const ratioOk = withValue.every((b) => Math.abs(b.h / b.v - withValue[0].h / withValue[0].v) < 0.01);
  check('bar heights are proportional to their values (no squashing under labels)', withValue.length > 0 && ratioOk, withValue.slice(0, 4).map((b) => `${b.v}:${b.h.toFixed(1)}`).join(' '));
  check('any zero-value bar has zero height', bars.filter((b) => b.v === 0).every((b) => b.h === 0), `${bars.filter((b) => b.v === 0).length} zero hours`);
  const sentence = (await card.locator('[data-testid="timing-sentence"]').textContent()) ?? '';
  check('a plain sentence names the best hour and the best day', /Most clicks come between \d\d:00 and \d\d:00, and on \w+days?\./.test(sentence), sentence);
  check('a thin sample is called a hint', /A hint rather than a rule/.test(sentence));
  await card.locator('select[aria-label="Timing measure"]').selectOption('spend');
  check('switching to spent changes the sentence', /Most money goes/.test((await card.locator('[data-testid="timing-sentence"]').textContent()) ?? ''));
  check('says hours are on the London clock', /London/.test((await card.textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.live = async () => {
  console.log('honest live behaviour');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const { body } = await api('/api/admin/ads?range=all');
  const a0 = (body?.ads ?? []).find((a) => a.id === '120251836299220597');
  check('the boosted post past its end date reads Finished, not Running', a0 && a0.status === 'Finished' && a0.running === false && a0.endsOn && a0.endsOn < today, JSON.stringify({ status: a0?.status, running: a0?.running, endsOn: a0?.endsOn }));
  check('schedule and budget come through (budget from the campaign)', Boolean(a0?.startsOn && a0?.budget), `${a0?.startsOn} to ${a0?.endsOn}, ${a0?.budget}`);

  let mainCalls = 0; let compareCalls = 0;
  page.on('request', (r) => { if (/\/api\/admin\/ads\?range=/.test(r.url())) mainCalls++; if (r.url().includes('/api/admin/ads/compare')) compareCalls++; });
  await open();
  const bar = page.locator('[data-testid="refresh-bar"]');
  const barText = (await bar.textContent()) ?? '';
  check('says when the figures were read from Meta', /Read from Meta at \d\d:\d\d/.test(barText), barText.slice(0, 60));
  check('says Meta lags about 15 minutes', /lag about 15 minutes/.test(barText));
  const btn = page.locator('[data-testid="refresh-button"]');
  check('refresh button starts enabled', !(await btn.isDisabled()));
  const before = { main: mainCalls, compare: compareCalls };
  await btn.click();
  await page.waitForFunction(() => /Refresh again in \d min/.test(document.querySelector('[data-testid="refresh-button"]')?.textContent ?? ''), null, { timeout: 30000 });
  check('after one press it waits five minutes (no polling)', /Refresh again in 5 min/.test((await btn.textContent()) ?? '') && (await btn.isDisabled()));
  await page.waitForFunction(() => !(document.querySelector('[data-testid="funds-value"]')?.textContent ?? '').trim().startsWith('-'), null, { timeout: 60000 });
  check('one press re-reads the page and the comparison chart', mainCalls > before.main && compareCalls > before.compare, `main +${mainCalls - before.main}, compare +${compareCalls - before.compare}`);

  // Graceful failure: the next read is made to fail the way a Meta throttle does.
  await page.route('**/api/admin/ads?range=7d', (route) => route.fulfill({
    status: 502, contentType: 'application/json',
    body: JSON.stringify({ configured: true, range: '7d', error: 'Meta is limiting how often it will answer just now. This clears by itself, so try again in a few minutes.' }),
  }));
  await page.selectOption('select[aria-label="Period"]', '7d');
  await page.waitForSelector('[data-testid="meta-error"]', { timeout: 30000 });
  check('a failed read shows the plain-English reason', /Meta is limiting how often/.test((await page.locator('[data-testid="meta-error"]').textContent()) ?? ''));
  check('and keeps the last good figures on screen, saying when they were read', (await page.locator('[data-testid="kept-figures"]').count()) === 1 && /^£\d/.test(((await page.locator('[data-testid="funds-value"]').textContent()) ?? '').trim()));
  check('the comparison chart is still there after the failed read', (await page.locator('[data-testid="compare-chart"]').count()) === 1);
  await page.unroute('**/api/admin/ads?range=7d');

  await page.locator('[data-testid="ads-nav-link"]', { hasText: 'All ads' }).click();
  await page.waitForSelector('[data-testid="ad-card"]', { timeout: 30000 });
  const finishedCard = page.locator('[data-testid="ad-card"][data-ad-id="120251836299220597"]');
  check('the finished ad\'s card says Finished', ((await finishedCard.locator('[data-testid="ad-card-status"]').textContent()) ?? '').trim() === 'Finished');
  const schedule = (await finishedCard.locator('[data-testid="ad-card-schedule"]').textContent()) ?? '';
  check('the card shows the run dates and the budget', /ran \d+ \w+ to \d+ \w+/.test(schedule) && /over the run|a day/.test(schedule), schedule);
  check('the cards explain the current comparison state', /One ad is running|No winner is marked yet|A gold mark shows/.test((await page.locator('[data-testid="compare-note"]').textContent()) ?? ''));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.nav = async () => {
  console.log('the navigation bar');
  let reads = 0;
  page.on('request', (r) => { if (/\/api\/admin\/ads\?range=/.test(r.url())) reads++; });
  await open();
  const links = page.locator('[data-testid="ads-nav-link"]');
  check('six pages in the bar', (await links.count()) === 6, String(await links.count()));
  const labels = await links.allTextContents();
  check('named plainly', labels.join('|') === 'Dashboard|Compare|All ads|After the click|Who and when|Advice', labels.join('|'));
  check('Dashboard is marked current', (await page.locator('[data-testid="ads-nav-link"][aria-current="page"]').textContent())?.trim() === 'Dashboard');
  check('the current tab is bold and gold, the others are not', await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('[data-testid="ads-nav-link"]'));
    const active = links.filter((l) => l.getAttribute('aria-current') === 'page');
    const rest = links.filter((l) => l.getAttribute('aria-current') !== 'page');
    const weight = (el) => Number(getComputedStyle(el).fontWeight);
    return active.length === 1 && weight(active[0]) >= 700 && rest.every((l) => weight(l) < 700)
      && getComputedStyle(active[0]).backgroundColor !== getComputedStyle(rest[0]).backgroundColor;
  }));
  check('the back link says Main dashboard, so it is not confused with this Dashboard', ((await page.locator('[data-testid="back-to-main"]').textContent()) ?? '').includes('Main dashboard'));
  const before = reads;
  const expect = [
    ['Compare', '/admin/ads/compare', 'page-compare', 'compare-picker'],
    ['All ads', '/admin/ads/all', 'page-all', 'account-strip'],
    ['After the click', '/admin/ads/after-the-click', 'page-after-the-click', 'funnel'],
    ['Who and when', '/admin/ads/who-and-when', 'page-who-and-when', 'timing'],
    ['Advice', '/admin/ads/advice', 'page-advice', 'adviser-panels'],
    ['Dashboard', '/admin/ads', 'page-dashboard', 'compare-chart'],
  ];
  for (const [label, path, pageId, inside] of expect) {
    await page.locator('[data-testid="ads-nav-link"]', { hasText: label }).click();
    await page.waitForSelector(`[data-testid="${pageId}"]`, { timeout: 30000 });
    const url = new URL(page.url()).pathname;
    const n = await page.locator(`[data-testid="${inside}"]`).count();
    check(`${label} goes to ${path} and shows its content`, url === path && n === 1, `${url}, ${inside}: ${n}`);
    check(`${label} is marked current`, (await page.locator('[data-testid="ads-nav-link"][aria-current="page"]').textContent())?.trim() === label);
  }
  check('switching pages never re-reads Meta', reads === before, `${reads - before} extra reads`);
  check('period dropdown, refresh and spreadsheet stay in the bar on every page', (await page.locator('select[aria-label="Period"]').count()) === 1 && (await page.locator('[data-testid="refresh-button"]').count()) === 1 && (await page.locator('[data-testid="download-csv"]').count()) === 1);
  await page.locator('[data-testid="ads-nav-link"]', { hasText: 'Compare' }).click();
  await page.waitForSelector('[data-testid="chosen-cards"]', { timeout: 30000 });
  check('Compare shows the chosen cards side by side (two biggest spenders until something is ticked)', (await page.locator('[data-testid="chosen-cards"] [data-testid="ad-card"]').count()) === 2);
  check('the old A and B address forwards to Compare', await (async () => { await page.goto(BASE + '/admin/ads/ab', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-testid="ads-nav"]', { timeout: 30000 }); await loadedShell(); return new URL(page.url()).pathname === '/admin/ads/compare'; })());
  await page.locator('[data-testid="ads-nav-link"]', { hasText: 'Who and when' }).click();
  await page.waitForSelector('[data-testid="daily-chart"]', { timeout: 30000 });
  await page.selectOption('select[aria-label="Day by day measure"]', 'clicks');
  check('the day-by-day dropdown drives the chart', (await page.locator('svg[aria-label="Clicks per day"]').count()) === 1);
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.picker = async () => {
  console.log('the Compare page: new ad box and the tick list');
  await open('/admin/ads/compare');
  const box = page.locator('[data-testid="new-ad-box"]');
  check('the New ad box comes first, folded to one line', await page.evaluate(() => document.querySelector('[data-testid="page-compare"]')?.firstElementChild?.getAttribute('data-testid') === 'new-ad-box') && (await box.locator('[data-testid="new-ad-body"]').count()) === 0);
  await box.locator('[data-testid="new-ad-toggle"]').click();
  await page.waitForSelector('[data-testid="new-ad-body"]', { timeout: 10000 });
  check('three plain steps', (await box.locator('[data-testid="new-ad-steps"] li').count()) === 3);
  check('the button opens Ads Manager\'s create screen for this account', /adsmanager\.facebook\.com\/adsmanager\/creation\?act=\d+/.test((await box.locator('[data-testid="new-ad-button"]').getAttribute('href')) ?? ''));
  check('says what the pasted line does and what happens if forgotten', /knows which ad sent each visitor/.test((await box.textContent()) ?? '') && /Forget it and the ad still/.test((await box.textContent()) ?? ''));
  check('the copy button and the line itself are there', (await box.locator('[data-testid="new-ad-copy"]').count()) === 1 && /utm_campaign=\{\{campaign\.id\}\}/.test((await box.locator('code').textContent()) ?? ''));

  const picker = page.locator('[data-testid="compare-picker"]');
  const rows = picker.locator('[data-testid="compare-row"]');
  const rowIds = await rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-ad-id')));
  check('every ad row has one unique Meta id', rowIds.length > 0 && new Set(rowIds).size === rowIds.length && rowIds.every(Boolean), rowIds.join(', '));
  check('every row has a tick box, a letter slot, a name and a status', (await rows.first().locator('input[type="checkbox"]').count()) === 1 && (await rows.first().locator('[data-testid="compare-letter"]').count()) === 1);
  check('says up to five, letters in tick order, and that new ads appear on their own', /Up to 5 at once/.test((await picker.textContent()) ?? '') && /nothing to add by hand/i.test((await picker.textContent()) ?? ''));
  let posted = null;
  page.on('request', (r) => { if (r.url().endsWith('/api/admin/ads/creative') && r.method() === 'POST') posted = JSON.parse(r.postData() ?? '{}'); });
  const firstId = await rows.first().getAttribute('data-ad-id');
  await rows.first().locator('input[type="checkbox"]').click();
  await page.waitForFunction(() => ['saved', 'failed'].includes(document.querySelector('[data-testid="compare-picker-state"]')?.getAttribute('data-state') ?? ''), null, { timeout: 20000 });
  check('ticking the first ad gives it the letter A', posted && posted.adId === firstId && posted.slot === 'A', JSON.stringify(posted));
  const state = await picker.locator('[data-testid="compare-picker-state"]').getAttribute('data-state');
  check('the list reports saved, or not saved (the laptop database is read-only)', state === 'saved' || state === 'failed', state);
  check('the verdict and the chosen cards sit below the list', (await page.locator('[data-testid="verdict"]').count()) === 1 && (await page.locator('[data-testid="chosen-cards"]').count()) === 1);
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

checks.accounts = async () => {
  console.log('both Windsor Glow Meta accounts');
  const expected = ['act_4002287066545281', 'act_4486863841549073'];
  const newAdId = '120250688573010299';
  const { status, body } = await api('/api/admin/ads?range=7d');
  check('api answers 200', status === 200, `status ${status}, ${body?.error ?? ''}`);
  const ids = (body?.accounts ?? []).map((account) => account.id);
  check('both configured accounts are returned', expected.every((id) => ids.includes(id)) && ids.length === 2, ids.join(', '));
  check('combined account stays in GBP and London time', body?.account?.currency === 'GBP' && body?.account?.timezone === 'Europe/London');
  const newAd = (body?.ads ?? []).find((ad) => ad.id === newAdId);
  check('the newly published advert is present', Boolean(newAd), JSON.stringify(newAd)?.slice(0, 180));
  check('the new advert is tied to the second account and running', newAd?.accountId === expected[1] && newAd?.running === true && newAd?.status === 'Running', `${newAd?.accountId} ${newAd?.status}`);
  check('the new advert has its website tracking tag', newAd?.websiteTracking === true);
  check('funds stay traceable to both accounts', (body?.funds?.accounts ?? []).length === 2);
  check('the balance is the real £280 and never the card ending 4531', body?.funds?.availableMinor === 28000 && body?.funds?.displayMinor === null, JSON.stringify(body?.funds)?.slice(0, 300));
  check('the card-billed account is not treated as extra prepaid money', body?.funds?.accounts?.[1]?.displayMinor === null && body?.funds?.fundedAccountIds?.length === 1);

  await open('/admin/ads');
  check('the page shows £280 rather than a false combined balance', (await page.locator('[data-testid="funds-value"]').textContent())?.trim() === '£280.00');
  await page.locator('[data-testid="ads-nav-link"]', { hasText: 'All ads' }).click();
  await page.waitForSelector('[data-testid="page-all"]', { timeout: 30000 });
  check('the page lists both tracked accounts', (await page.locator('[data-testid="tracked-account"]').count()) === 2);
  check('the new advert has its own card', (await page.locator(`[data-testid="ad-card"][data-ad-id="${newAdId}"]`).count()) === 1);
  check('every advert says which Meta account it belongs to', (await page.locator('[data-testid="ad-card-account"]').count()) === (body?.ads ?? []).length);
  check('the new advert has no missing-tracking warning', (await page.locator(`[data-testid="ad-card"][data-ad-id="${newAdId}"] [data-testid="ad-card-tracking-warning"]`).count()) === 0);
  await page.locator('[data-testid="ads-nav-link"]', { hasText: 'Compare' }).click();
  await page.waitForSelector('[data-testid="new-ad-box"]', { timeout: 30000 });
  await page.locator('[data-testid="new-ad-toggle"]').click();
  const createLinks = await page.locator('[data-testid="new-ad-button"]').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  check('new-ad box offers the correct Meta screen for either account', expected.every((id) => createLinks.some((href) => href?.includes(`act=${id.replace(/^act_/, '')}`))), createLinks.join(' | '));
  check('no em or en dashes on the page', !/[–—]/.test((await page.locator('main').textContent()) ?? ''));
};

for (const s of sets) {
  if (!checks[s]) { console.log(`unknown checkset ${s}`); fail++; continue; }
  await checks[s]();
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
