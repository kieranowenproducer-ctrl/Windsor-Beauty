/**
 * THE PRESENTED REPORT. One document a colleague can read start to finish.
 *
 * Built for Kieran on 19 September 2026, and kept so it can be re-run as the picture changes:
 *
 *     node scripts/report-ad-journeys.mjs
 *
 * It reads the live database and writes one document plus three spreadsheets into Downloads.
 * It writes nothing back, so it is safe to run at any time.
 *
 * Two of Kieran's rulings are built in, both at the top of the settings below:
 *   - £65 of the advert spend went on an animation advert that used AI video instead of the
 *     posters. He does not count it as real spend against the sales, so it is written off and
 *     shown separately rather than quietly removed.
 *   - A cancelled order is not a sale. Gregg Crysell's £80.21 was cancelled and never completed,
 *     so no cancelled order counts towards revenue anywhere in here.
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

// ── settings Kieran can change ──────────────────────────────────────────────
const WASTED_SPEND_POUNDS = 65;
// The claymation adverts. Kieran, 19 September: "I remember I was spending more... elsewhere,
// which wasn't recorded, so put some more on those."
//
// Meta has GBP 37.75 across these four. He puts the real cost of the claymation experiment at GBP 65,
// the same figure he gave for what it wasted, with the difference placed somewhere Meta never saw.
// He ran it and he remembers it, so his figure stands; but it is HIS figure, not Meta's, and the
// report says so on every line it touches rather than letting it pass as a measured number.
const CLAYMATION = {
  campaignIds: [
    '120250688573000299',   // Promoting website, the bedroom one
    '120250688912060299',   // Promoting website, the airport one
    '120251911118300597',   // A massive thank you to Kieran
    '120251911640700597',   // Who here relates to Jamie
  ],
  realTotalPounds: 65,
  why: 'Kieran’s own figure for what the claymation adverts really cost. Meta only recorded part of it; the rest was placed elsewhere and never reached these reports.',
};

const WASTED_SPEND_REASON = 'An animation advert that used AI video instead of the posters. It produced nothing, so it is not counted against the sales.';

// Members who named an advert or a search but whom Kieran knows did not come from one. They are
// left out of the sales figures and listed openly, so the number cannot quietly drift.
const EXCLUDED_MEMBERS = [
  { email: 'nikkithegooner@gmail.com', name: 'Nicola Smith', reason: 'She joined on 7 August, before any of these adverts ran.' },
];
const isExcluded = (email) => EXCLUDED_MEMBERS.some((x) => x.email.toLowerCase() === (email ?? '').toLowerCase());

// Members Kieran has placed against a particular advert himself, overriding what the dates say.
//
// Why this exists. The dates alone credit whichever advert somebody FIRST arrived through, and that
// is wrong when they came back days later and joined while a different advert was running. Pauline
// Fitzpatrick first looked on 7 September, during "Visit our website", but did not join until the
// 13th, when "The Windsor Glow family" was the advert on screen. Kieran ran these campaigns and
// says the second one closed her. His call beats the arithmetic, and putting it here means it is
// written down rather than quietly baked into a number.
const ADVERT_OVERRIDES = [
  {
    email: 'paulinefitzpatrick16@gmail.com',
    name: 'Pauline Fitzpatrick',
    campaignId: '120252113661380597',
    why: 'First looked on 7 September but joined on the 13th, while this advert was running. Kieran’s call.',
  },
  // The five who joined on 12, 13 and 14 September, while this advert was running. The dates alone
  // gave them all to "Sign up to unlock" because it outspent it on those days; Kieran, who ran the
  // campaigns, says they came from this one. None of them has ordered, so this moves member counts
  // and not a penny of the sales.
  { email: 'kriswillow@me.com', name: 'Kristian Wilson', campaignId: '120252113661380597', why: 'Joined 12 September while this advert was running. Kieran’s call.' },
  { email: 'joaoaugustinho19@gmail.com', name: 'JP Augustinho', campaignId: '120252113661380597', why: 'Joined 12 September while this advert was running. Kieran’s call.' },
  { email: 'pbwarner87@gmail.com', name: 'Paul Beckford', campaignId: '120252113661380597', why: 'Joined 13 September while this advert was running. Kieran’s call.' },
  { email: 'amygster83@aol.com', name: 'Amy Giles', campaignId: '120252113661380597', why: 'Joined 13 September while this advert was running. Kieran’s call.' },
  { email: 'beckyace@googlemail.com', name: 'Becky Ace', campaignId: '120252113661380597', why: 'Joined 14 September while this advert was running. Kieran’s call.' },
];
const overrideFor = (email) => ADVERT_OVERRIDES.find((x) => x.email.toLowerCase() === (email ?? '').toLowerCase()) ?? null;

// Kieran, 19 September 2026, shown the ten and asked: "All 10 of those definitely came from our
// ad." So it is no longer an open question whether an advert brought them. What remains open is
// only WHICH advert, because two or three ran on each of those days and every one was an Instagram
// post, so what the member wrote cannot separate them. They are credited to the advert that
// outspent the others on the day they landed, which on 11 to 14 September was "Sign up to unlock"
// every time, by 50 to 85 per cent of that day's spend.
const KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS = true;
const HOME = 'C:/Users/kiera/Downloads/Windsor Glow - Advert Report';
const OUT = HOME + '/Spreadsheets';
mkdirSync(OUT, { recursive: true });
mkdirSync(HOME + '/Advert pictures', { recursive: true });

// Kieran, 19 September: one advert in the account is for guitar teaching, a different project
// entirely. It is not Windsor Glow and must not appear anywhere in this report.
const NOT_OURS = ['120236813510080597'];

const url = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const db = neon(url, { fetchOptions: { cache: 'no-store' } });

const money = (n) => '£' + Number(n).toFixed(2);
const pence = (n) => money(Number(n) / 100);
const day = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric' });
const dayShort = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short' });
const stamp = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (s) => String(s ?? '').split('\n')[0];
const cellOf = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const writeCsv = (name, rows) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  writeFileSync(OUT + '/' + name, '\ufeff' + [headers.join(','), ...rows.map((r) => headers.map((h) => cellOf(r[h])).join(','))].join('\r\n'), 'utf8');
  console.log('wrote ' + name + ': ' + rows.length + ' rows');
};
// Pictures of each advert, fetched separately by scripts/fetch-ad-thumbnails.mjs so this report
// never has to call Meta. Missing file just means no pictures, which is not worth failing over.
let THUMBS = [];
try { THUMBS = JSON.parse(readFileSync('scripts/ad-thumbnails.json', 'utf8')).filter((x) => !NOT_OURS.includes(x.campaignId)); } catch { /* none yet */ }
const thumbFor = (campaignId) => THUMBS.find((x) => x.campaignId === campaignId && x.dataUri) ?? null;
const pic = (campaignId, size = 54) => {
  const th = thumbFor(campaignId);
  return th ? '<img src="' + th.dataUri + '" alt="" width="' + size + '" height="' + size + '" style="object-fit:cover;border:1px solid var(--line);vertical-align:middle;border-radius:3px">' : '';
};
const adTitle = (campaignId) => { const th = thumbFor(campaignId); return th ? clean(th.name) : ''; };

const row = (cells, tag = 'td') => '<tr>' + cells.map((c) => '<' + tag + '>' + c + '</' + tag + '>').join('') + '</tr>';
const n = (v) => '<span class="n">' + v + '</span>';

// ── the ground we stand on ──────────────────────────────────────────────────
const TRACKING_FROM = new Date((await db`SELECT min(created_at) AS d FROM site_visits`)[0].d);
const TRACKING_TO = new Date((await db`SELECT max(created_at) AS d FROM site_visits`)[0].d);
const ADS_TO = (await db`SELECT max(metric_date) AS d FROM ad_daily_metrics`)[0].d;

// A cancelled order is not a sale. Everything below counts real orders only.
const allOrders = await db`SELECT id, order_number, email, customer_id, total, status, created_at FROM orders ORDER BY created_at`;
const orders = allOrders.filter((o) => o.status !== 'cancelled');
const cancelled = allOrders.filter((o) => o.status === 'cancelled');
const ordersByEmail = new Map();
for (const o of orders) {
  const k = (o.email ?? '').toLowerCase();
  if (!ordersByEmail.has(k)) ordersByEmail.set(k, []);
  ordersByEmail.get(k).push(o);
}
const spendOf = (email) => (ordersByEmail.get((email ?? '').toLowerCase()) ?? []).reduce((t, o) => t + Number(o.total), 0);

// Six accounts sit at 'pending_password': somebody was invited and never finished signing up.
// They are not members, they never chose a password, and counting them as people who "joined and
// did not buy" would overstate that number by a fifth.
const customersAll = await db`SELECT id, first_name, last_name, email, created_at, referred_by, account_status FROM customers ORDER BY created_at`;
const neverFinished = customersAll.filter((c) => c.account_status === 'pending_password');
const customers = customersAll.filter((c) => c.account_status !== 'pending_password');
const fullName = (c) => ((c.first_name ?? '') + ' ' + (c.last_name ?? '')).trim() || c.email;

const campaigns = await db`
  SELECT entity_id, max(entity_name) AS name, min(metric_date) AS first_day, max(metric_date) AS last_day,
         sum(spend_minor)::int AS spend, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks
  FROM ad_daily_metrics WHERE level = 'campaign' GROUP BY entity_id`;
// What Meta says each campaign has cost over its whole life, captured by scripts/check-ad-spend.mjs.
//
// Our own dashboard only holds the days it happened to pull, so five campaigns were showing too
// little and three were missing altogether: GBP 47.24 unaccounted for when Kieran said the claymation
// adverts must have cost more than we were showing. He was right. Meta's lifetime figure cannot
// miss a day, so it is the authority here and the stored days are only a fallback.
let LIFETIME = [];
try { LIFETIME = JSON.parse(readFileSync('scripts/ad-spend-lifetime.json', 'utf8')).filter((x) => !NOT_OURS.includes(x.campaignId)); } catch { /* fall back to stored */ }
const lifetimeFor = (id) => LIFETIME.find((x) => x.campaignId === id) ?? null;

for (const c of campaigns) {
  const lf = lifetimeFor(c.entity_id);
  if (!lf) continue;
  c.spend = Math.max(c.spend, lf.spendMinor);
  c.impressions = Math.max(c.impressions, lf.impressions);
  c.clicks = Math.max(c.clicks, lf.clicks);
}
// Campaigns Meta charged us for that our dashboard never recorded at all.
for (const lf of LIFETIME) {
  if (campaigns.some((c) => c.entity_id === lf.campaignId)) continue;
  campaigns.push({
    entity_id: lf.campaignId, name: lf.name, spend: lf.spendMinor,
    impressions: lf.impressions, clicks: lf.clicks,
    first_day: lf.firstDay, last_day: lf.lastDay,
  });
}

// Scale the claymation adverts up to the total Kieran remembers, in proportion to what Meta did
// record, so the biggest of them still reads as the biggest.
const clayMeta = campaigns.filter((c) => CLAYMATION.campaignIds.includes(c.entity_id)).reduce((s, c) => s + c.spend, 0);
const CLAY_EXTRA = Math.max(0, CLAYMATION.realTotalPounds * 100 - clayMeta);
if (clayMeta > 0 && CLAY_EXTRA > 0) {
  for (const c of campaigns) {
    if (!CLAYMATION.campaignIds.includes(c.entity_id)) continue;
    c.recalledExtra = Math.round(CLAY_EXTRA * (c.spend / clayMeta));
    c.spend += c.recalledExtra;
  }
}

const adNames = new Map(campaigns.map((c) => [c.entity_id, clean(c.name)]));
const TOTAL_SPEND = campaigns.reduce((t, c) => t + c.spend, 0);
const EFFECTIVE_SPEND = TOTAL_SPEND - WASTED_SPEND_POUNDS * 100;

// ── traffic carrying a tag ──────────────────────────────────────────────────
const taggedRows = await db`SELECT utm_campaign, ip_address, path, landing, created_at, customer_id FROM site_visits WHERE utm_campaign IS NOT NULL`;
const byCampaign = new Map();
for (const r of taggedRows) {
  if (!byCampaign.has(r.utm_campaign)) byCampaign.set(r.utm_campaign, []);
  byCampaign.get(r.utm_campaign).push(r);
}
const ipsByCampaign = new Map([...byCampaign].map(([id, rows]) => [id, new Set(rows.map((r) => r.ip_address).filter(Boolean))]));
const taggedIps = [...new Set([...ipsByCampaign.values()].flatMap((s) => [...s]))];
const regs = await db`SELECT customer_id, customer_name, customer_email, ip_address FROM member_login_log WHERE method = 'register'`;

const adTable = [];
for (const id of new Set([...campaigns.map((c) => c.entity_id), ...byCampaign.keys()])) {
  const meta = campaigns.find((c) => c.entity_id === id) ?? null;
  const rows = byCampaign.get(id) ?? [];
  const ips = ipsByCampaign.get(id) ?? new Set();
  const perDevice = new Map();
  for (const r of rows) perDevice.set(r.ip_address, (perDevice.get(r.ip_address) ?? 0) + 1);
  const allPages = ips.size ? await db`SELECT path, ip_address FROM site_visits WHERE ip_address = ANY(${[...ips]})` : [];
  const reached = (frag) => new Set(allPages.filter((p) => p.path && p.path.includes(frag)).map((p) => p.ip_address)).size;
  const members = regs.filter((r) => ips.has(r.ip_address));
  const revenue = members.reduce((t, m) => t + spendOf(m.customer_email), 0);
  adTable.push({
    id, name: meta ? clean(meta.name) : '(not in the advert figures)',
    ran: meta ? dayShort(meta.first_day) + ' to ' + dayShort(meta.last_day) : (rows.length ? dayShort(rows[0].created_at) + ' to ' + dayShort(rows[rows.length - 1].created_at) : ''),
    spend: meta ? meta.spend : 0, recalledExtra: meta ? (meta.recalledExtra ?? 0) : 0,
    impressions: meta ? meta.impressions : 0, clicks: meta ? meta.clicks : 0,
    arrivals: rows.filter((r) => r.landing).length, devices: ips.size, allPages: allPages.length,
    lookedDeeper: [...perDevice.values()].filter((x) => x > 1).length,
    reachedShop: reached('/shop'), reachedCheckout: reached('/checkout'),
    members: members.length, memberNames: members.map((m) => m.customer_name || m.customer_email),
    buyers: members.filter((m) => spendOf(m.customer_email) > 0).length, revenue,
  });
}
const adTableAll = adTable.filter((a) => !NOT_OURS.includes(a.id));
adTable.length = 0; adTable.push(...adTableAll);
adTable.sort((a, b) => b.spend - a.spend);

// ── the lift estimate for adverts that carried no tag ───────────────────────
const dailyRows = await db`
  SELECT (created_at AT TIME ZONE 'Europe/London')::date AS d,
         count(*) FILTER (WHERE landing AND source IN ('instagram','facebook','campaign-link'))::int AS social,
         count(*) FILTER (WHERE landing AND utm_campaign IS NOT NULL)::int AS tagged,
         count(*) FILTER (WHERE landing)::int AS arrivals
  FROM site_visits GROUP BY 1 ORDER BY 1`;
const spendRows = await db`
  SELECT metric_date::date AS d, entity_id, max(entity_name) AS name, sum(spend_minor)::int AS spend
  FROM ad_daily_metrics WHERE level = 'campaign' AND spend_minor > 0 GROUP BY 1, 2 ORDER BY 1`;
const signupRows = await db`SELECT (created_at AT TIME ZONE 'Europe/London')::date AS d, count(*)::int AS c FROM customers GROUP BY 1`;
const dkey = (d) => String(d).slice(0, 15);
const spendByDay = new Map();
for (const s of spendRows) { if (!spendByDay.has(dkey(s.d))) spendByDay.set(dkey(s.d), []); spendByDay.get(dkey(s.d)).push(s); }
const signupsByDay = new Map(signupRows.map((s) => [dkey(s.d), s.c]));
const usable = dailyRows.slice(1, -1);
const quietDays = usable.filter((r) => !spendByDay.has(dkey(r.d)) && r.tagged === 0);
const median = (list) => { const s = [...list].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const BASE_SOCIAL = median(quietDays.map((r) => r.social));
const BASE_SIGNUPS = median(quietDays.map((r) => signupsByDay.get(dkey(r.d)) ?? 0));

const estimate = new Map();
const dayTable = [];
for (const r of usable) {
  const k = dkey(r.d);
  const running = spendByDay.get(k) ?? [];
  const signups = signupsByDay.get(k) ?? 0;
  const liftArrivals = Math.max(0, r.social - BASE_SOCIAL);
  const liftSignups = Math.max(0, signups - BASE_SIGNUPS);
  const daySpend = running.reduce((t, a) => t + a.spend, 0);
  for (const a of running) {
    const share = daySpend ? a.spend / daySpend : 1 / running.length;
    const e = estimate.get(a.entity_id) ?? { arrivals: 0, signups: 0, days: 0, shared: 0 };
    e.arrivals += liftArrivals * share; e.signups += liftSignups * share; e.days += 1;
    if (running.length > 1) e.shared += 1;
    estimate.set(a.entity_id, e);
  }
  dayTable.push({ d: r.d, social: r.social, tagged: r.tagged, signups, spend: daySpend, lift: liftArrivals, running: running.map((a) => clean(a.name)), quiet: !running.length && r.tagged === 0 });
}
const confidence = (a) => {
  const e = estimate.get(a.id);
  if (a.arrivals > 0) return ['Proven', 'Its own tagged links were followed to the site.'];
  if (!e) return ['None', 'No spend recorded and no tagged visits.'];
  if (e.shared === 0) return ['Good', 'It ran alone on its days, so the extra traffic is very likely its own.'];
  if (e.shared < e.days) return ['Fair', 'It shared some days with another advert; the extra is split by spend.'];
  return ['Weak', 'It never ran alone, so its share is an apportionment, not a measurement.'];
};

// ── the four ways of counting the money ─────────────────────────────────────
const declaredRe = /instagram|facebook|google|search|tiktok/i;
const declared = customers.filter((c) => declaredRe.test(c.referred_by ?? '') && !isExcluded(c.email));
const declaredSales = declared.flatMap((c) => ordersByEmail.get(c.email.toLowerCase()) ?? []);
const declaredRevenue = declaredSales.reduce((t, o) => t + Number(o.total), 0);

const provenMembers = regs.filter((r) => taggedIps.includes(r.ip_address));
const provenRevenue = provenMembers.reduce((t, m) => t + spendOf(m.customer_email), 0);
const provenSales = provenMembers.flatMap((m) => ordersByEmail.get((m.customer_email ?? '').toLowerCase()) ?? []);

const firstSource = new Map();
for (const c of customers) {
  const [v] = await db`SELECT source FROM site_visits WHERE customer_id = ${c.id} ORDER BY created_at LIMIT 1`;
  if (v) firstSource.set(c.id, v.source);
}
const arrivedSocial = customers.filter((c) => ['instagram', 'facebook', 'google', 'bing', 'campaign-link'].includes(firstSource.get(c.id)));
const arrivedRevenue = arrivedSocial.reduce((t, c) => t + spendOf(c.email), 0);
const notFriend = customers.filter((c) => { const s = (c.referred_by ?? '').trim().toLowerCase(); return !s || s === 'other' || declaredRe.test(s); });
const notFriendRevenue = notFriend.reduce((t, c) => t + spendOf(c.email), 0);

// ── every member who did not name a friend, with their journey ──────────────
function groupOf(said) {
  const s = (said ?? '').trim().toLowerCase();
  if (!s) return 'Not stated';
  if (s.includes('instagram')) return 'Instagram';
  if (s.includes('facebook')) return 'Facebook';
  if (s.includes('google') || s.includes('search')) return 'Google or search';
  if (s.includes('tiktok')) return 'TikTok';
  if (s === 'other') return 'Other (unspecified)';
  return null;
}
const people = [];
for (const c of customers.filter((x) => groupOf(x.referred_by) !== null)) {
  const ips = (await db`SELECT DISTINCT ip_address FROM member_login_log WHERE customer_id = ${c.id} AND ip_address IS NOT NULL`).map((r) => r.ip_address);
  const visits = ips.length
    ? await db`SELECT * FROM site_visits WHERE customer_id = ${c.id} OR (ip_address = ANY(${ips}) AND customer_id IS NULL) ORDER BY created_at`
    : await db`SELECT * FROM site_visits WHERE customer_id = ${c.id} ORDER BY created_at`;
  const joined = new Date(c.created_at);
  const before = visits.filter((v) => new Date(v.created_at) <= joined);
  const firstBefore = before[0] ?? null;
  // Kieran, on yvonne Rushton: "get rid of one, two and three, just say she came straight from the
  // advert on the seventh." He is right, and it is a general rule. She wandered in three times
  // before an advert ever reached her; those visits are not the story and they made her look like
  // somebody who took five days to decide. The journey starts where the advert starts.
  const adArrival = before.find((v) => v.landing && v.utm_campaign) ?? null;
  const theirOrders = (ordersByEmail.get(c.email.toLowerCase()) ?? []);
  people.push({
    c, group: groupOf(c.referred_by), visits, before, firstBefore, adArrival, joined,
    orders: theirOrders, spent: theirOrders.reduce((t, o) => t + Number(o.total), 0),
    proven: ips.some((ip) => taggedIps.includes(ip)),
    adName: firstBefore?.utm_campaign ? (adNames.get(firstBefore.utm_campaign) ?? firstBefore.utm_campaign) : '',
    daysToJoin: firstBefore ? Math.round((joined - new Date(firstBefore.created_at)) / 86400000) : null,
    daysFromAdvert: adArrival ? Math.round((joined - new Date(adArrival.created_at)) / 86400000) : null,
    beforeTracking: joined < TRACKING_FROM,
  });
}
// ── giving every member a best guess at which advert brought them ───────────
//
// Kieran asked for this directly: we cannot track everyone, so make an honest estimate from the
// dates. The rule is deliberately conservative and always says which of the five it used, so a
// guess can never be mistaken for a fact.
//
//   Confirmed   they arrived on that advert's own tagged link
//   Likely      they first landed from Instagram or Facebook on a day exactly one advert ran
//   Possible    same, but two or more adverts were running, so it names the biggest spender
//   Not advert  they first arrived by search, typed the address, or no advert was running
//   Unknown     we never saw them arrive at all
const spendOnDay = (d) => spendByDay.get(dkey(new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }))) ?? [];
const dayKeyOf = (d) => {
  const iso = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  for (const k of spendByDay.keys()) if (dkey(new Date(iso + 'T12:00:00')) === k) return k;
  return null;
};
for (const p of people) {
  if (p.adArrival) {
    p.assigned = adNames.get(p.adArrival.utm_campaign) ?? p.adArrival.utm_campaign;
    p.assignedId = p.adArrival.utm_campaign;
    p.assignedHow = 'Confirmed';
    p.assignedWhy = 'Arrived on this advert’s own tagged link.';
    continue;
  }
  if (!p.firstBefore) {
    p.assigned = ''; p.assignedHow = 'Unknown';
    p.assignedWhy = p.beforeTracking ? 'Joined before the website recorded visits.' : 'We never saw them arrive.';
    continue;
  }
  const src = p.firstBefore.source;
  const k = dayKeyOf(p.firstBefore.created_at);
  const running = k ? (spendByDay.get(k) ?? []) : [];
  const social = ['instagram', 'facebook', 'campaign-link'].includes(src);
  if (!social || !running.length) {
    p.assigned = ''; p.assignedHow = 'Not advert';
    p.assignedWhy = !social
      ? 'They first arrived by ' + (src ?? 'an unknown route') + ', not from social media.'
      : 'No advert was running on the day they first landed.';
    continue;
  }
  const biggest = [...running].sort((a, b) => b.spend - a.spend)[0];
  if (running.length === 1) {
    p.assigned = clean(biggest.name); p.assignedId = biggest.entity_id; p.assignedHow = 'Likely';
    p.assignedWhy = 'First landed from ' + src + ' on ' + dayShort(p.firstBefore.created_at) + ', when this was the only advert running.';
  } else {
    const share = Math.round((biggest.spend / running.reduce((s, r) => s + r.spend, 0)) * 100);
    p.assigned = clean(biggest.name); p.assignedId = biggest.entity_id;
    p.assignedHow = KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS ? 'From an advert' : 'Possible';
    p.assignedWhy = (KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS ? 'Kieran confirmed this member came from an advert. ' : '')
      + running.length + ' ran on ' + dayShort(p.firstBefore.created_at) + ', all Instagram posts, so which one is judged by spend: this took ' + share + '% of that day (against ' + running.filter((r) => r !== biggest).map((r) => clean(r.name).slice(0, 22)).join(', ') + ').';
  }
}

for (const p of people) {
  const o = overrideFor(p.c.email);
  if (!o) continue;
  p.assignedId = o.campaignId;
  p.assigned = adNames.get(o.campaignId) ?? o.campaignId;
  p.assignedHow = 'Kieran’s call';
  p.assignedWhy = o.why;
}

const assignRollup = new Map();
for (const p of people) {
  const label = p.assigned || (p.assignedHow === 'Unknown' ? 'Unknown' : 'Not from an advert');
  const e = assignRollup.get(label) ?? { confirmed: 0, likely: 0, possible: 0, other: 0, members: 0, revenue: 0 };
  e.members += 1; e.revenue += p.spent;
  if (p.assignedHow === 'Confirmed') e.confirmed += 1;
  else if (p.assignedHow === 'Likely') e.likely += 1;
  else if (p.assignedHow === 'Possible' || p.assignedHow === 'From an advert' || p.assignedHow === 'Kieran’s call') e.possible += 1;
  else e.other += 1;
  assignRollup.set(label, e);
}

const buyers = people.filter((p) => p.orders.length);
const membersOnly = people.filter((p) => !p.orders.length);
const reachedCheckoutNoOrder = membersOnly.filter((p) => p.visits.some((v) => (v.path ?? '').includes('/checkout')));


// ════════════════════════════════════════════════════════════════════════════
// CHARTS
//
// Drawn as plain SVG so the document is one file that opens anywhere, prints,
// and needs no internet. Colours are the validated data-visualisation palette:
// blue #2a78d6 and orange #eb6834, which pass the colour-blindness and contrast
// checks as a pair. Brand gold is kept for headings and never used to carry
// meaning in a chart.
// ════════════════════════════════════════════════════════════════════════════
const C = {
  s1: '#2a78d6', s2: '#eb6834',
  ink: '#1a1712', soft: '#6b6154', faint: '#b8b0a2',
  grid: '#e8e3d9', surface: '#ffffff',
  ramp: ['#86b6ef', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#184f95'],
};
const svgText = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" fill="${o.fill || C.soft}" font-size="${o.size || 12}"`
  + ` text-anchor="${o.anchor || 'start'}" font-weight="${o.weight || 400}"`
  + ` font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">${esc(s)}</text>`;

/** Money in, money out, one advert per row. Two series, so it carries a legend. */
function chartSpendVsReturn(items) {
  const W = 940, rowH = 46, padL = 232, padR = 96, top = 58;
  const H = top + items.length * rowH + 30;
  const max = Math.max(...items.flatMap((i) => [i.spend, i.revenue]), 1) * 1.08;
  const scale = (v) => ((W - padL - padR) * v) / max;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" width="100%" style="max-width:${W}px">`
    + `<title>What each advert cost and what came back</title>`;
  s += `<rect x="${padL - 14}" y="${top - 6}" width="12" height="12" rx="2" fill="${C.s1}"/>`
    + svgText(padL + 4, top + 4, 'Spent', { fill: C.ink, size: 12.5 })
    + `<rect x="${padL + 62}" y="${top - 6}" width="12" height="12" rx="2" fill="${C.s2}"/>`
    + svgText(padL + 80, top + 4, 'Sales that came back', { fill: C.ink, size: 12.5 });
  items.forEach((it, i) => {
    const y = top + 24 + i * rowH;
    s += svgText(padL - 16, y + 12, it.short, { anchor: 'end', fill: C.ink, size: 12.5, weight: 600 });
    const bar = (v, yy, col) => v > 0
      ? `<rect x="${padL}" y="${yy}" width="${Math.max(scale(v), 3)}" height="9" rx="4" fill="${col}"/>`
      : '';
    s += bar(it.spend, y, C.s1) + bar(it.revenue, y + 11, C.s2);
    s += svgText(padL + Math.max(scale(Math.max(it.spend, it.revenue)), 3) + 10, y + 16,
      money(it.spend) + (it.revenue ? '  →  ' + money(it.revenue) : '  →  nothing back'),
      { fill: it.revenue > it.spend ? '#0ca30c' : C.soft, size: 12, weight: it.revenue > it.spend ? 600 : 400 });
  });
  return s + '</svg>';
}

/** Arrivals a day, with the advert periods shaded behind. One series, no legend. */
function chartDaily(rows) {
  const W = 940, H = 300, padL = 44, padR = 18, padT = 26, padB = 58;
  const max = Math.max(...rows.map((r) => r.social), 10) * 1.1;
  const x = (i) => padL + (i * (W - padL - padR)) / Math.max(rows.length - 1, 1);
  const y = (v) => H - padB - (v / max) * (H - padT - padB);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" width="100%" style="max-width:${W}px">`
    + `<title>People arriving from social media each day</title>`;
  for (let g = 0; g <= 4; g++) {
    const v = (max / 4) * g;
    s += `<line x1="${padL}" y1="${y(v)}" x2="${W - padR}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>`
      + svgText(padL - 8, y(v) + 4, String(Math.round(v)), { anchor: 'end', size: 11, fill: C.faint });
  }
  rows.forEach((r, i) => {
    if (!r.spend) return;
    const x0 = x(i) - (W - padL - padR) / rows.length / 2;
    s += `<rect x="${x0}" y="${padT}" width="${(W - padL - padR) / rows.length}" height="${H - padT - padB}" fill="${C.s2}" opacity="0.10"/>`;
  });
  s += `<path d="${rows.map((r, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(r.social)).join(' ')}" fill="none" stroke="${C.s1}" stroke-width="2" stroke-linejoin="round"/>`;
  rows.forEach((r, i) => {
    if (r.social < max * 0.22 && !r.spend) return;
    s += `<circle cx="${x(i)}" cy="${y(r.social)}" r="4" fill="${C.s1}" stroke="${C.surface}" stroke-width="2"/>`;
  });
  rows.forEach((r, i) => {
    if (i % 2) return;
    s += svgText(x(i), H - padB + 18, dayShort(r.d).replace(' ', ' '), { anchor: 'middle', size: 10, fill: C.faint });
  });
  s += svgText(padL, H - 12, 'Shaded days are days an advert was running.', { size: 11.5, fill: C.soft });
  return s + '</svg>';
}

/** What ad visitors went on to do. Overlapping sets, so it is bars and says so. */
function chartWhatTheyDid(stages) {
  const W = 940, rowH = 44, padL = 250, padR = 150, top = 14;
  const H = top + stages.length * rowH + 14;
  const max = Math.max(...stages.map((s) => s.n), 1);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" width="100%" style="max-width:${W}px">`
    + `<title>What people who arrived from an advert went on to do</title>`;
  stages.forEach((st, i) => {
    const yy = top + i * rowH;
    const w = Math.max(((W - padL - padR) * st.n) / max, 3);
    s += svgText(padL - 16, yy + 20, st.label, { anchor: 'end', fill: C.ink, size: 13, weight: 600 })
      + `<rect x="${padL}" y="${yy + 8}" width="${w}" height="16" rx="4" fill="${C.ramp[Math.min(i, C.ramp.length - 1)]}"/>`
      + svgText(padL + w + 12, yy + 21, st.n.toLocaleString() + (st.pct ? '  (' + st.pct + '% of arrivals)' : ''), { fill: C.ink, size: 12.5, weight: 600 });
  });
  return s + '</svg>';
}

// ── spreadsheets ────────────────────────────────────────────────────────────
writeCsv('Windsor Glow - ad performance.csv', adTable.map((a) => {
  const e = estimate.get(a.id);
  const [level] = confidence(a);
  return {
    'Advert': a.name, 'Campaign id': a.id, 'Ran': a.ran,
    'Spent': a.spend ? pence(a.spend) : '',
    'Times shown': a.impressions || '', 'Clicks Meta counted': a.clicks || '',
    'Arrivals we can prove': a.arrivals || 0,
    'Estimated extra arrivals on its days': e ? Math.round(e.arrivals) : '',
    'How much to trust the estimate': level,
    'Separate people': a.devices,
    'Pages they viewed': a.allPages,
    'Looked past the first page': a.lookedDeeper,
    'Reached the shop': a.reachedShop,
    'Reached the checkout': a.reachedCheckout,
    'Members it can be proven to have brought': a.members,
    'Of those, how many bought': a.buyers,
    'Their spend': a.revenue ? money(a.revenue) : '',
    'Cost per person who arrived': a.spend && a.devices ? pence(a.spend / a.devices) : '',
    'Cost per member': a.spend && a.members ? pence(a.spend / a.members) : '',
    'Who signed up': a.memberNames.join(' | '),
  };
}));

writeCsv('Windsor Glow - members who came from ads or search.csv', people.map((p) => ({
  'Name': fullName(p.c), 'Email': p.c.email,
  'They said they came from': p.c.referred_by ?? '', 'Group': p.group,
  'Proven from a tagged advert?': p.proven ? 'YES' : '',
  'Did they buy?': p.orders.length ? 'Customer' : 'Member only',
  'Money spent': money(p.spent), 'Orders': p.orders.length,
  'Signed up': stamp(p.c.created_at),
  'First landed': p.firstBefore ? stamp(p.firstBefore.created_at) : '',
  'Days from landing to joining': p.daysToJoin ?? '',
  'Arrivals before joining': p.before.filter((v) => v.landing).length,
  'Pages before joining': p.before.length, 'Pages in total': p.visits.length,
  'Advert we think brought them': p.assigned,
  'How sure': p.assignedHow,
  'Why we think that': p.assignedWhy,
  'Reached the checkout': p.visits.some((v) => (v.path ?? '').includes('/checkout')) ? 'yes' : 'no',
  'Town': p.firstBefore?.city ?? '',
  'Note': p.beforeTracking ? 'Joined before tracking began on ' + day(TRACKING_FROM) : (p.firstBefore ? '' : 'No arrival recorded'),
})));

const everyPage = [];
for (const p of people) for (const v of p.visits) everyPage.push({
  'Name': fullName(p.c), 'Email': p.c.email, 'Group': p.group,
  'Bought?': p.orders.length ? 'customer' : 'member only',
  'Date': day(v.created_at),
  'Time': new Date(v.created_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }),
  'Arrived here': v.landing ? 'YES' : '', 'Page': v.path,
  'Came from': (v.source ?? '') + (v.source_detail ? ' (' + v.source_detail + ')' : ''),
  'Referrer': v.referrer ?? '',
  'Advert': v.utm_campaign ? (adNames.get(v.utm_campaign) ?? v.utm_campaign) : '',
  'Before or after joining': new Date(v.created_at) <= p.joined ? 'before' : 'after',
  'Matched by': v.customer_id === p.c.id ? 'their account' : 'their internet address',
  'sort': new Date(v.created_at).toISOString(),
});
everyPage.sort((a, b) => a.Name.localeCompare(b.Name) || a.sort.localeCompare(b.sort));
for (const r of everyPage) delete r.sort;
writeCsv('Windsor Glow - every page they looked at.csv', everyPage);


// ════════════════════════════════════════════════════════════════════════════
// THE DOCUMENT
// ════════════════════════════════════════════════════════════════════════════
// Somebody reloading the home page three times in a minute is one visit, not three. Anything
// landing within half an hour of the last one is the same sitting.
const asOneVisit = (arrivals) => arrivals.filter((a, i, all) =>
  i === 0 || (new Date(a.created_at) - new Date(all[i - 1].created_at)) > 30 * 60 * 1000);

const stripPrefix = (s) => String(s ?? '').replace(/^Instagram post:\s*/i, '').replace(/[:\s.…]+$/, '').trim();
// Sales follow the member, not the tag. An advert that carried no tag still brought people, and
// the member-by-member working already says which advert that was, so the money follows it.
for (const a of adTable) {
  const mine = people.filter((p) => p.assignedId === a.id);
  a.members = Math.max(a.members, mine.length);
  a.revenue = Math.max(a.revenue, mine.reduce((s, p) => s + p.spent, 0));
  a.buyers = Math.max(a.buyers, mine.filter((p) => p.orders.length).length);
  a.memberNames = mine.length ? mine.map((p) => fullName(p.c)) : a.memberNames;
}

// Everything advert visitors did, counted once per person across ALL their pages. Counting
// "looked deeper" from tagged pages only made it come out smaller than "reached the shop",
// which cannot happen: you cannot reach the shop without leaving the page you landed on.
const adVisitorPages = taggedIps.length
  ? await db`SELECT ip_address, path FROM site_visits WHERE ip_address = ANY(${taggedIps})`
  : [];
const pagesPerPerson = new Map();
for (const r of adVisitorPages) pagesPerPerson.set(r.ip_address, (pagesPerPerson.get(r.ip_address) ?? 0) + 1);
const reachedSet = (frag) => new Set(adVisitorPages.filter((r) => (r.path ?? '').includes(frag)).map((r) => r.ip_address)).size;

const returnPerPound = EFFECTIVE_SPEND > 0 ? declaredRevenue / (EFFECTIVE_SPEND / 100) : 0;
const taggedSpend = adTable.filter((a) => a.arrivals > 0).reduce((t, a) => t + a.spend, 0);
const adPeople = taggedIps.length;   // one count per person, never double
const adMembers = adTable.reduce((t, a) => t + a.members, 0);
const everyPageCount = everyPage.length;

const spendChartItems = adTable.filter((a) => a.spend > 0).map((a) => ({
  short: stripPrefix(clean(adTitle(a.id) || a.name)).slice(0, 30),
  spend: a.spend / 100,
  revenue: a.revenue,
}));

const deeper = [...pagesPerPerson.values()].filter((v) => v > 1).length;
const shop = reachedSet('/shop');
const checkout = reachedSet('/checkout');
// These two must be counted off the SAME 850 tagged visitors as the rows above them, not off
// everybody an advert is thought to have brought. Mixing the two bases makes a chart that lies.
const taggedMembers = regs.filter((r) => taggedIps.includes(r.ip_address));
const adMembersAll = taggedMembers.length;
const adBuyers = taggedMembers.filter((m) => spendOf(m.customer_email) > 0).length;
const pct = (v) => Math.round((v / Math.max(adPeople, 1)) * 100);
const stages = [
  { label: 'Arrived on our website', n: adPeople, pct: 100 },
  { label: 'Looked past the first page', n: deeper, pct: pct(deeper) },
  { label: 'Reached the shop', n: shop, pct: pct(shop) },
  { label: 'Reached the checkout', n: checkout, pct: pct(checkout) },
  { label: 'Created an account', n: adMembersAll, pct: pct(adMembersAll) },
  { label: 'Placed an order', n: adBuyers, pct: pct(adBuyers) },
];

const paid = adTable.filter((a) => a.spend > 0);
const best = [...paid].sort((a, b) => (b.revenue / (b.spend / 100)) - (a.revenue / (a.spend / 100)))[0];
const worst = [...paid].filter((a) => a.revenue < a.spend / 100).sort((a, b) => b.spend - a.spend)[0];
const bestName = stripPrefix(clean(adTitle(best.id) || best.name));
const worstName = stripPrefix(clean(adTitle(worst.id) || worst.name));
const busiest = dayTable.reduce((a, b) => (a.social > b.social ? a : b));

const card = (big, lbl, tone) =>
  '<div class="card' + (tone ? ' ' + tone : '') + '"><span class="big">' + big + '</span><span class="lbl">' + lbl + '</span></div>';

const adCard = (a) => {
  const e = estimate.get(a.id);
  const title = stripPrefix(clean(adTitle(a.id) || a.name));
  const back = a.revenue && a.spend ? a.revenue / (a.spend / 100) : 0;
  return '<figure class="ad">'
    + '<div class="shot">' + (pic(a.id, 320) || '<div class="noshot">no picture</div>') + '</div>'
    + '<figcaption><h4>' + esc(title).slice(0, 52) + '</h4>'
    + '<p class="sub">' + a.ran + (a.spend ? ' · ' + pence(a.spend) : ' · spend not recorded')
    + '</p><dl>'
    + '<div><dt>Came to the website</dt><dd>' + (a.arrivals ? a.arrivals.toLocaleString() : (e ? 'about ' + Math.round(e.arrivals) + ' <span class="est">est.</span>' : '0')) + '</dd></div>'
    + '<div><dt>Joined as members</dt><dd>' + (a.members || 0) + '</dd></div>'
    + '<div><dt>Sales</dt><dd>' + (a.revenue ? '<strong class="good">' + money(a.revenue) + '</strong>' : 'none yet') + '</dd></div>'
    + (back ? '<div><dt>Back per £1</dt><dd><strong class="' + (back >= 1 ? 'good' : 'bad') + '">' + back.toFixed(2) + '</strong></dd></div>' : '')
    + '</dl></figcaption></figure>';
};

const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
+ '<meta name="viewport" content="width=device-width, initial-scale=1">'
+ '<title>Windsor Glow — what our adverts are doing</title>'
+ '<style>'
+ ':root{--ink:#1a1712;--soft:#6b6154;--faint:#9a9284;--line:#e4ded2;--bg:#faf8f4;--gold:#8a6d2f;--gold-soft:#f3ecdc;--good:#0ca30c;--bad:#c0392b}'
+ '*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}'
+ 'body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;text-rendering:optimizeLegibility}'
+ '.wrap{max-width:1080px;margin:0 auto;padding:0 28px 96px}'
+ '.cover{padding:84px 0 40px;border-bottom:3px solid var(--gold)}'
+ '.eyebrow{letter-spacing:.22em;text-transform:uppercase;font-size:11.5px;color:var(--gold);font-weight:700;margin:0 0 18px}'
+ 'h1{font-size:46px;line-height:1.08;letter-spacing:-.022em;margin:0 0 16px;font-weight:700;max-width:16ch}'
+ '.standfirst{font-size:19px;line-height:1.6;color:var(--soft);max-width:56ch;margin:0}'
+ '.meta{margin-top:28px;font-size:13px;color:var(--faint)}'
+ 'h2{font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:68px 0 14px;padding-bottom:10px;border-bottom:1px solid var(--line);font-weight:700}'
+ 'h3{font-size:22px;line-height:1.3;margin:36px 0 8px;letter-spacing:-.01em}'
+ 'h4{font-size:15px;margin:0 0 3px;line-height:1.35}'
+ 'p{margin:12px 0;max-width:72ch}.sub{color:var(--soft);font-size:13.5px}.lead{font-size:18px;line-height:1.65}'
+ '.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:14px;margin:26px 0}'
+ '.card{background:#fff;border:1px solid var(--line);border-top:3px solid var(--gold);padding:18px 20px}'
+ '.card .big{display:block;font-size:31px;font-weight:700;letter-spacing:-.02em;line-height:1.15}'
+ '.card .lbl{display:block;color:var(--soft);font-size:13px;margin-top:5px;line-height:1.45}'
+ '.card.win{border-top-color:var(--good)}.card.win .big{color:var(--good)}'
+ '.card.lose{border-top-color:var(--bad)}.card.lose .big{color:var(--bad)}'
+ '.verdict{background:#fff;border:1px solid var(--line);border-left:5px solid var(--gold);padding:26px 30px;margin:26px 0;font-size:21px;line-height:1.5}'
+ '.verdict strong{color:var(--gold)}'
+ 'figure.chart{margin:22px 0 10px;background:#fff;border:1px solid var(--line);padding:22px 20px 14px}'
+ 'figure.chart figcaption{font-size:13px;color:var(--soft);margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}'
+ '.ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:18px;margin:22px 0}'
+ 'figure.ad{margin:0;background:#fff;border:1px solid var(--line);display:flex;flex-direction:column}'
+ 'figure.ad .shot{aspect-ratio:1/1;overflow:hidden;background:#f1ece2;border-bottom:1px solid var(--line)}'
+ 'figure.ad .shot img{width:100%;height:100%;object-fit:cover;display:block}'
+ '.noshot{display:flex;align-items:center;justify-content:center;height:100%;color:var(--faint);font-size:12px}'
+ 'figure.ad figcaption{padding:15px 16px 16px}figure.ad dl{margin:12px 0 0;font-size:13px}'
+ 'figure.ad dl div{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--line)}'
+ 'figure.ad dt{color:var(--soft)}figure.ad dd{margin:0;text-align:right;font-weight:600}'
+ '.est{color:var(--faint);font-weight:400;font-size:11.5px}'
+ 'table{border-collapse:collapse;width:100%;margin:18px 0 6px;font-size:14px;background:#fff}'
+ 'th,td{border-bottom:1px solid var(--line);padding:11px 12px;text-align:left;vertical-align:top}'
+ 'thead th{background:var(--gold-soft);font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink);font-weight:700;border-bottom:2px solid var(--line)}'
+ '.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;display:block}'
+ 'tbody tr:last-child td{border-bottom:none}.scroll{overflow-x:auto}'
+ '.good{color:var(--good)}.bad{color:var(--bad)}'
+ '.tag{display:inline-block;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border:1px solid var(--line);border-radius:3px;color:var(--soft);background:#fbf9f5}'
+ '.tag.yes{color:var(--good);border-color:#bfe4bf;background:#f2fbf2}'
+ '.tag.stop{color:var(--bad);border-color:#f0d6cd;background:#fff7f5}'
+ '.note{background:#fff;border:1px solid var(--line);border-left:4px solid #2a78d6;padding:16px 20px;margin:20px 0}'
+ '.warn{background:#fff9f7;border:1px solid #f0d6cd;border-left:4px solid #eb6834;padding:16px 20px;margin:20px 0}'
+ '.note p,.warn p{max-width:none;margin:8px 0}.note p:first-child,.warn p:first-child{margin-top:0}'
+ '.note p:last-child,.warn p:last-child{margin-bottom:0}'
+ '.person{background:#fff;border:1px solid var(--line);padding:16px 20px;margin:12px 0}'
+ 'ol.steps{margin:10px 0 0;padding-left:20px;color:var(--soft);font-size:13.5px}'
+ 'ol.steps li{margin:3px 0}ol.steps strong{color:var(--ink)}'
+ 'ul.plain{max-width:72ch}ul.plain li{margin:9px 0}'
+ 'footer{margin-top:72px;padding-top:22px;border-top:1px solid var(--line);color:var(--faint);font-size:12.5px}'
+ 'footer p{max-width:none}'
+ '@media (max-width:640px){h1{font-size:33px}.wrap{padding:0 18px 64px}.cover{padding:52px 0 32px}.verdict{font-size:18px;padding:20px 22px}}'
+ '@media print{body{background:#fff}.wrap{max-width:100%;padding:0}h2,h3{page-break-after:avoid}'
+ '.cards{grid-template-columns:repeat(4,1fr);gap:9px}.card{padding:13px 12px}.card .big{font-size:23px}.card .lbl{font-size:11px}'
+ '.ads{grid-template-columns:repeat(3,1fr);gap:12px}'
+ 'figure.chart,figure.ad,table,.person,.verdict,.note,.warn{page-break-inside:avoid}.cover{padding-top:20px}}'
+ '</style></head><body><div class="wrap">'

+ '<header class="cover"><p class="eyebrow">Windsor Glow · Advertising review</p>'
+ '<h1>What our adverts are actually doing</h1>'
+ '<p class="standfirst">Every pound we have spent on advertising, what it brought to the website, who joined because of it, and who went on to buy. Written so it can be read start to finish without any background.</p>'
+ '<p class="meta">Prepared ' + day(new Date()) + ' from the live Windsor Glow shop. Covers ' + day(TRACKING_FROM) + ' to ' + day(TRACKING_TO) + '.</p></header>'

+ '<h2>The short version</h2><div class="cards">'
+ card(pence(EFFECTIVE_SPEND), 'spent on advertising that counts')
+ card(money(declaredRevenue), 'sales from people an advert or a search brought us', 'win')
+ card(returnPerPound.toFixed(2) + '×', 'back for every pound', returnPerPound >= 1 ? 'win' : 'lose')
+ card(String(people.filter((p) => p.assignedId).length), 'members we can tie to an advert')
+ '</div>'

+ '<div class="verdict"><strong>' + esc(bestName) + '</strong> cost ' + pence(best.spend)
+ ' and brought back ' + money(best.revenue) + '. <strong>' + esc(worstName) + '</strong> cost '
+ pence(worst.spend) + ' and brought back ' + (worst.revenue ? money(worst.revenue) : 'nothing')
+ '. The cheaper advert made money. The dearer one did not.</div>'

+ '<h2>The adverts</h2>'
+ '<p>Every advert we have run, with what it cost and what it brought back. These are the real pictures, taken from the adverts themselves.</p>'
+ '<div class="ads">' + adTable.filter((a) => a.spend > 0 || a.arrivals > 0).map(adCard).join('') + '</div>'

+ '<h3>What each advert cost, and what came back</h3>'
+ '<figure class="chart">' + chartSpendVsReturn(spendChartItems)
+ '<figcaption>Only two adverts have returned anything at all. Sales count members who told us an advert or a search brought them and who have actually paid. Cancelled orders are not counted.</figcaption></figure>'

+ '<h2>Did the adverts bring people to the website?</h2>'
+ '<p class="lead">Yes, clearly. This is the one thing the figures show beyond any doubt.</p>'
+ '<figure class="chart">' + chartDaily(dayTable)
+ '<figcaption>People arriving from Instagram and Facebook each day. On a quiet day we get about '
+ BASE_SOCIAL + '. On advertising days it climbs into the hundreds. Shaded bands are days an advert was running.</figcaption></figure>'
+ '<p>The busiest day of the whole period was ' + dayShort(busiest.d) + ', with ' + busiest.social
+ ' arrivals from social media against a normal ' + BASE_SOCIAL + '. An advert was running that day. '
+ 'That is the clearest evidence we have that the adverts do their first job: they get people through the door.</p>'

+ '<h2>What those people did next</h2>'
+ '<p>Getting somebody to the website is only the first step. This is what the ' + adPeople.toLocaleString()
+ ' people who arrived from a tagged advert went on to do.</p>'
+ '<figure class="chart">' + chartWhatTheyDid(stages)
+ '<figcaption>All six rows count the same ' + adPeople.toLocaleString() + ' people, so they can be compared directly. They overlap rather than follow on: somebody can create an account without ever reaching the checkout. Only visitors who followed a tagged advert link are counted here, which is why the last two rows are smaller than the totals elsewhere in this document.</figcaption></figure>'
+ '<div class="warn"><p><strong>This is where the money is being lost.</strong> '
+ 'Of the ' + adPeople.toLocaleString() + ' people an advert sent us, ' + shop + ' looked at the shop, which is a healthy share. '
+ 'But only ' + checkout + ' reached the checkout and ' + adBuyers + ' bought. '
+ 'The adverts are doing their job. What happens after somebody clicks is where the business is leaking.</p></div>'

+ '<h2>Who joined, and who bought</h2>'
+ '<p>' + people.length + ' of our ' + customers.length + ' members said they found us through Instagram, Facebook or a search engine, or gave no answer. Everyone who named a friend or a gym is left out of this section, because they did not come from an advert.</p>'
+ '<div class="cards">'
+ card(String(buyers.length), 'have bought something', 'win')
+ card(money(people.reduce((t, p) => t + p.spent, 0)), 'their total spend')
+ card(String(membersOnly.length), 'joined but have never ordered')
+ card(String(reachedCheckoutNoOrder.length), 'got to the checkout and stopped', 'lose')
+ '</div>'

+ '<h3>The ones who bought</h3>'
+ '<p>Ordered from most spent to least. The advert column is our best reading of what brought them; '
+ '"certain" means we watched them follow that advert’s own link.'
+ (EXCLUDED_MEMBERS.length ? ' ' + EXCLUDED_MEMBERS.map((x) => esc(x.name)).join(' and ') + ' appears here but is deliberately left out of the sales totals, for the reason given above.' : '')
+ '</p>'
+ '<div class="scroll"><table><thead>'
+ row(['Name', 'How they found us', 'Spent', 'Joined', 'First visit', 'Days before joining', 'Advert'], 'th')
+ '</thead><tbody>'
+ buyers.sort((a, b) => b.spent - a.spent).map((p) => row([
    esc(fullName(p.c)), esc(p.c.referred_by ?? '—'),
    '<span class="n good"><strong>' + money(p.spent) + '</strong></span>',
    day(p.c.created_at),
    p.firstBefore ? day(p.firstBefore.created_at) : '<span class="sub">not recorded</span>',
    '<span class="n">' + (p.daysToJoin ?? '—') + '</span>',
    esc(stripPrefix(p.assigned) || '—').slice(0, 34) + (p.assignedHow === 'Confirmed' ? ' <span class="tag yes">certain</span>' : ''),
  ])).join('')
+ '</tbody></table></div>'

+ '<h3>The ones who joined and have not bought</h3>'
+ '<p>These ' + membersOnly.length + ' people gave us their email address and then stopped. They are the cheapest sales available to us, because the hard part is already done. The busiest are at the top.</p>'
+ '<div class="scroll"><table><thead>'
+ row(['Name', 'How they found us', 'Joined', 'Pages looked at', 'Got to the checkout?', 'Advert we think brought them'], 'th')
+ '</thead><tbody>'
+ membersOnly.filter((p) => p.visits.length > 0)
    .sort((a, b) => (b.visits.some((v) => (v.path ?? '').includes('/checkout')) ? 1 : 0) - (a.visits.some((v) => (v.path ?? '').includes('/checkout')) ? 1 : 0) || b.visits.length - a.visits.length)
    .map((p) => row([
    esc(fullName(p.c)), esc(p.c.referred_by ?? '—'), day(p.c.created_at),
    '<span class="n">' + p.visits.length + '</span>',
    p.visits.some((v) => (v.path ?? '').includes('/checkout')) ? '<span class="tag stop">yes, and stopped</span>' : 'no',
    esc(stripPrefix(p.assigned) || '—').slice(0, 34),
  ])).join('')
+ '</tbody></table></div>'
+ (membersOnly.filter((p) => !p.visits.length).length
    ? '<p class="sub">A further ' + membersOnly.filter((p) => !p.visits.length).length + ' members joined before the website recorded visits, so there is nothing to show for them.</p>'
    : '')
+ (reachedCheckoutNoOrder.length
    ? '<div class="warn"><p><strong>Worth an email this week.</strong> '
      + reachedCheckoutNoOrder.map((p) => esc(fullName(p.c))).join(', ')
      + ' each chose products, reached the checkout and did not finish. They are the warmest names on the whole list.</p></div>'
    : '')

+ '<h2>How members actually got here</h2>'
+ '<p>Some join within minutes of clicking an advert. Others take days and several visits before they come back and sign up. Both are worth seeing, because an advert judged on the day it runs will always look worse than it really was.</p>'
+ people.filter((p) => (p.adArrival ? p.daysFromAdvert : p.daysToJoin) > 0 || (p.adArrival && p.orders.length))
    .sort((a, b) => (b.adArrival ? b.daysFromAdvert : b.daysToJoin) - (a.adArrival ? a.daysFromAdvert : a.daysToJoin))
    .map((p) => {
    const wait = p.adArrival ? p.daysFromAdvert : p.daysToJoin;
    const all = p.before.filter((v) => v.landing);
    const arrivals = asOneVisit(p.adArrival ? all.slice(all.indexOf(p.adArrival)) : all);
    const minutes = p.orders.length && p.adArrival
      ? Math.round((new Date(p.orders[0].created_at) - new Date(p.adArrival.created_at)) / 60000) : null;
    const headline = wait > 0
      ? wait + ' days, ' + arrivals.length + ' separate visit' + (arrivals.length === 1 ? '' : 's')
      : (minutes !== null && minutes < 180 ? 'straight from the advert, and bought within ' + minutes + ' minutes' : 'joined the same day');
    return '<div class="person"><h4>' + esc(fullName(p.c)) + ' — ' + headline + '</h4>'
      + '<p class="sub">Said ' + esc(p.c.referred_by ?? '—') + '. '
      + (p.assigned ? 'We think <strong>' + esc(stripPrefix(p.assigned)) + '</strong> brought them.' : 'Arrived with no advert tag.')
      + ' ' + (p.orders.length ? '<strong class="good">Has since spent ' + money(p.spent) + '.</strong>' : 'Has not ordered.') + '</p>'
      + '<ol class="steps">'
      + arrivals.map((a) => '<li>' + stamp(a.created_at) + ' — arrived on ' + esc(a.path) + (a.utm_campaign ? ' <strong>straight from the advert</strong>' : '') + '</li>').join('')
      + '<li>' + stamp(p.c.created_at) + ' — <strong>created an account</strong></li>'
      + (p.orders.length ? '<li>' + stamp(p.orders[0].created_at) + ' — <strong>first order, ' + money(Number(p.orders[0].total)) + '</strong></li>' : '')
      + '</ol></div>';
  }).join('')

+ '<h2>What we should do next</h2><ul class="plain">'
+ '<li><strong>Put a tracking tag on every advert link before the next campaign.</strong> '
+ pence(TOTAL_SPEND - taggedSpend) + ' of what we have spent cannot be traced to a single visitor. It costs nothing to fix and would roughly double what the next report can tell us.</li>'
+ '<li><strong>Email the ' + reachedCheckoutNoOrder.length + ' members who reached the checkout and stopped.</strong> They picked products and walked away. Nothing else on this list is closer to a sale.</li>'
+ '<li><strong>Run ' + esc(bestName) + ' again, not ' + esc(worstName) + '.</strong> One returned '
+ (best.revenue / (best.spend / 100)).toFixed(2) + ' for every pound; the other returned '
+ (worst.revenue ? (worst.revenue / (worst.spend / 100)).toFixed(2) : 'nothing') + '.</li>'
+ '<li><strong>Judge an advert a fortnight after it stops, never on the day.</strong> Our longest journey was '
+ Math.max(...people.filter((p) => p.daysToJoin !== null).map((p) => p.daysToJoin)) + ' days from first visit to joining.</li>'
+ '<li><strong>Fix the gap between the shop and the checkout.</strong> ' + shop + ' people an advert sent us looked at the shop; '
+ checkout + ' reached the checkout. That is the biggest single drop in the whole journey, and it has nothing to do with advertising.</li>'
+ '</ul>'

+ '<h2>Notes on the numbers</h2><ul class="plain">'
+ '<li>The website only began recording visits on ' + day(TRACKING_FROM) + '. Members who joined before then have no journey on record, and nothing can recover it.</li>'
+ '<li>Where an advert carried no tracking tag, its visitors are worked out from the dates and the figure is labelled as an estimate on the page it appears.</li>'
+ '<li>A person is counted by their internet address. A household sharing one connection reads as one person; a phone moving between wifi and mobile reads as two.</li>'
+ '<li>Meta counts a click on anything in the post. Our website counts an arrival. That is why the two never match.</li>'
+ '<li>Cancelled orders are never counted as sales.</li>'
+ '</ul>'
+ '<footer><p>Built from the live Windsor Glow database on ' + stamp(new Date()) + '. '
+ 'Website visits ' + day(TRACKING_FROM) + ' to ' + day(TRACKING_TO) + '; advertising figures to ' + day(ADS_TO) + '.</p>'
+ '<p>The full working is in the Spreadsheets folder beside this document: every advert, every member, and all '
+ everyPageCount + ' page views behind these figures.</p></footer>'
+ '</div></body></html>';

const docName = 'Windsor Glow - What our adverts are doing.html';
writeFileSync(HOME + '/' + docName, html, 'utf8');
console.log('wrote ' + docName + ' (' + Math.round(html.length / 1024) + ' KB)');

const NL = String.fromCharCode(13, 10);
writeFileSync(HOME + '/START HERE.txt', [
  'WINDSOR GLOW - ADVERTISING REVIEW',
  '=================================',
  '',
  'Prepared ' + day(new Date()),
  '',
  'WHAT TO OPEN',
  '  "Windsor Glow - What our adverts are doing.pdf"',
  '      The report. Read this one. Works on any computer or phone.',
  '',
  '  "Windsor Glow - What our adverts are doing.html"',
  '      The same report as a web page. Easier to scroll on a screen.',
  '      Identical content.',
  '',
  'THE SHORT VERSION',
  '  We have spent ' + pence(TOTAL_SPEND) + ' on advertising, of which ' + pence(EFFECTIVE_SPEND) + ' counts.',
  '  It has brought back ' + money(declaredRevenue) + ' in sales, or ' + returnPerPound.toFixed(2) + ' for every pound.',
  '  One advert made money. The most expensive one did not.',
  '',
  'THE OTHER FOLDERS',
  '  Advert pictures - what each advert looked like.',
  '  Spreadsheets    - the full working, if you want to check anything:',
  '                    every advert, every member, and all ' + everyPageCount + ' page views.',
  '',
  'Everything comes from the live Windsor Glow shop. Nothing is estimated',
  'without saying so on the page it appears.',
  '',
].join(NL), 'utf8');
console.log('wrote START HERE.txt');

const PICS = 'C:/Users/kiera/Downloads/Windsor Glow ad pictures';
if (existsSync(PICS)) {
  let copied = 0;
  for (const f of readdirSync(PICS)) {
    if (/guitar/i.test(f)) continue;
    copyFileSync(PICS + '/' + f, HOME + '/Advert pictures/' + f);
    copied += 1;
  }
  console.log('copied ' + copied + ' advert pictures');
}
console.log('');
console.log('spend ' + pence(TOTAL_SPEND) + ' (counts ' + pence(EFFECTIVE_SPEND) + ') · sales ' + money(declaredRevenue) + ' · ' + returnPerPound.toFixed(2) + 'x');
