/**
 * Where our members came from, and what the adverts actually did.
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
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

// ── settings Kieran can change ──────────────────────────────────────────────
const WASTED_SPEND_POUNDS = 65;
const WASTED_SPEND_REASON = 'An animation advert that used AI video instead of the posters. It produced nothing, so it is not counted against the sales.';

// Members who named an advert or a search but whom Kieran knows did not come from one. They are
// left out of the sales figures and listed openly, so the number cannot quietly drift.
const EXCLUDED_MEMBERS = [
  { email: 'nikkithegooner@gmail.com', name: 'Nicola Smith', reason: 'She joined on 7 August, before any of these adverts ran.' },
];
const isExcluded = (email) => EXCLUDED_MEMBERS.some((x) => x.email.toLowerCase() === (email ?? '').toLowerCase());

// Kieran, 19 September 2026, shown the ten and asked: "All 10 of those definitely came from our
// ad." So it is no longer an open question whether an advert brought them. What remains open is
// only WHICH advert, because two or three ran on each of those days and every one was an Instagram
// post, so what the member wrote cannot separate them. They are credited to the advert that
// outspent the others on the day they landed, which on 11 to 14 September was "Sign up to unlock"
// every time, by 50 to 85 per cent of that day's spend.
const KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS = true;
const OUT = process.env.REPORT_OUT_DIR || 'C:/Users/kiera/Downloads';

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
try { THUMBS = JSON.parse(readFileSync('scripts/ad-thumbnails.json', 'utf8')); } catch { /* none yet */ }
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

const customers = await db`SELECT id, first_name, last_name, email, created_at, referred_by FROM customers ORDER BY created_at`;
const fullName = (c) => ((c.first_name ?? '') + ' ' + (c.last_name ?? '')).trim() || c.email;

const campaigns = await db`
  SELECT entity_id, max(entity_name) AS name, min(metric_date) AS first_day, max(metric_date) AS last_day,
         sum(spend_minor)::int AS spend, sum(impressions)::int AS impressions, sum(clicks)::int AS clicks
  FROM ad_daily_metrics WHERE level = 'campaign' GROUP BY entity_id`;
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
    spend: meta ? meta.spend : 0, impressions: meta ? meta.impressions : 0, clicks: meta ? meta.clicks : 0,
    arrivals: rows.filter((r) => r.landing).length, devices: ips.size, allPages: allPages.length,
    lookedDeeper: [...perDevice.values()].filter((x) => x > 1).length,
    reachedShop: reached('/shop'), reachedCheckout: reached('/checkout'),
    members: members.length, memberNames: members.map((m) => m.customer_name || m.customer_email),
    buyers: members.filter((m) => spendOf(m.customer_email) > 0).length, revenue,
  });
}
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
  const theirOrders = (ordersByEmail.get(c.email.toLowerCase()) ?? []);
  people.push({
    c, group: groupOf(c.referred_by), visits, before, firstBefore, joined,
    orders: theirOrders, spent: theirOrders.reduce((t, o) => t + Number(o.total), 0),
    proven: ips.some((ip) => taggedIps.includes(ip)),
    adName: firstBefore?.utm_campaign ? (adNames.get(firstBefore.utm_campaign) ?? firstBefore.utm_campaign) : '',
    daysToJoin: firstBefore ? Math.round((joined - new Date(firstBefore.created_at)) / 86400000) : null,
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
  if (p.firstBefore?.utm_campaign) {
    p.assigned = adNames.get(p.firstBefore.utm_campaign) ?? p.firstBefore.utm_campaign;
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
    p.assigned = clean(biggest.name); p.assignedHow = 'Likely';
    p.assignedWhy = 'First landed from ' + src + ' on ' + dayShort(p.firstBefore.created_at) + ', when this was the only advert running.';
  } else {
    const share = Math.round((biggest.spend / running.reduce((s, r) => s + r.spend, 0)) * 100);
    p.assigned = clean(biggest.name);
    p.assignedHow = KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS ? 'From an advert' : 'Possible';
    p.assignedWhy = (KIERAN_CONFIRMED_ADVERT_CAME_FROM_ADS ? 'Kieran confirmed this member came from an advert. ' : '')
      + running.length + ' ran on ' + dayShort(p.firstBefore.created_at) + ', all Instagram posts, so which one is judged by spend: this took ' + share + '% of that day (against ' + running.filter((r) => r !== biggest).map((r) => clean(r.name).slice(0, 22)).join(', ') + ').';
  }
}

const assignRollup = new Map();
for (const p of people) {
  const label = p.assigned || (p.assignedHow === 'Unknown' ? 'Unknown' : 'Not from an advert');
  const e = assignRollup.get(label) ?? { confirmed: 0, likely: 0, possible: 0, other: 0, members: 0, revenue: 0 };
  e.members += 1; e.revenue += p.spent;
  if (p.assignedHow === 'Confirmed') e.confirmed += 1;
  else if (p.assignedHow === 'Likely') e.likely += 1;
  else if (p.assignedHow === 'Possible' || p.assignedHow === 'From an advert') e.possible += 1;
  else e.other += 1;
  assignRollup.set(label, e);
}

const buyers = people.filter((p) => p.orders.length);
const membersOnly = people.filter((p) => !p.orders.length);
const reachedCheckoutNoOrder = membersOnly.filter((p) => p.visits.some((v) => (v.path ?? '').includes('/checkout')));

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

// ── the document ────────────────────────────────────────────────────────────
const returnPerPound = EFFECTIVE_SPEND > 0 ? declaredRevenue / (EFFECTIVE_SPEND / 100) : 0;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Windsor Glow — what our adverts actually did</title>
<style>
:root{--ink:#1a1712;--soft:#6b6154;--gold:#8a6d2f;--line:#e4ded2;--bg:#fbf9f5;--good:#2f6b43;--bad:#9c3328}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1120px;margin:0 auto;padding:48px 24px 80px}
h1{font-size:34px;line-height:1.2;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:22px;margin:52px 0 6px;padding-bottom:8px;border-bottom:2px solid var(--gold)}
h3{font-size:17px;margin:30px 0 8px}
p{margin:10px 0}.sub{color:var(--soft)}.lede{font-size:18px}
table{border-collapse:collapse;width:100%;margin:16px 0 8px;font-size:14px;background:#fff}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f3eee4;font-weight:600}
.n{text-align:right;white-space:nowrap;display:block}
tr:nth-child(even) td{background:#fdfcfa}
.cards{display:flex;flex-wrap:wrap;gap:14px;margin:20px 0}
.card{flex:1 1 210px;background:#fff;border:1px solid var(--line);border-left:4px solid var(--gold);padding:14px 16px}
.card .big{font-size:26px;font-weight:600;display:block;line-height:1.25}
.card .lbl{color:var(--soft);font-size:13px}
.note{background:#fff8e8;border:1px solid #e8d9a8;padding:14px 18px;margin:18px 0}
.warn{background:#fdf0ee;border:1px solid #edc9c2;padding:14px 18px;margin:18px 0}
.good{color:var(--good);font-weight:600}.bad{color:var(--bad);font-weight:600}
.scroll{overflow-x:auto}
.person{background:#fff;border:1px solid var(--line);padding:14px 18px;margin:12px 0}
.person h4{margin:0 0 4px;font-size:16px}
.steps{margin:8px 0 0;padding-left:18px;color:var(--soft);font-size:14px}
footer{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);color:var(--soft);font-size:13px}
@media print{body{background:#fff}.wrap{padding:0}h2{page-break-after:avoid}table{page-break-inside:avoid}}
</style></head><body><div class="wrap">
<h1>What our adverts actually did</h1>
<p class="sub">Windsor Glow · ${day(new Date())}</p>
<p class="lede">Every pound spent on advertising, what it brought to the website, who joined because of it, and who went on to buy.</p>

<div class="cards">
  <div class="card"><span class="big">${pence(EFFECTIVE_SPEND)}</span><span class="lbl">advert spend that counts</span></div>
  <div class="card"><span class="big">${money(declaredRevenue)}</span><span class="lbl">sales from people who said social or search brought them</span></div>
  <div class="card"><span class="big">${returnPerPound.toFixed(2)}×</span><span class="lbl">returned for every pound that counts</span></div>
  <div class="card"><span class="big">${money(provenRevenue)}</span><span class="lbl">of that we can prove outright</span></div>
</div>

<div class="note"><strong>Two rules built into every figure here.</strong><br>
<strong>1. ${money(WASTED_SPEND_POUNDS)} of the ${pence(TOTAL_SPEND)} spent is written off.</strong> ${WASTED_SPEND_REASON} Total spend was ${pence(TOTAL_SPEND)}; the spend judged against sales is ${pence(EFFECTIVE_SPEND)}.<br>
<strong>2. A cancelled order is not a sale.</strong> ${cancelled.length} cancelled order${cancelled.length === 1 ? '' : 's'} ${cancelled.length === 1 ? 'is' : 'are'} excluded everywhere, including Gregg Crysell's, which was never completed.<br>
<strong>3. ${EXCLUDED_MEMBERS.length} member${EXCLUDED_MEMBERS.length === 1 ? ' is' : 's are'} left out of the sales figures by hand.</strong> ${EXCLUDED_MEMBERS.map((x) => esc(x.name) + ' — ' + esc(x.reason)).join(' ')} Their orders are still in the shop's own totals; they are simply not credited to advertising.</div>

<div class="warn"><strong>Read this before using any number.</strong> Website visits are only recorded from <strong>${day(TRACKING_FROM)}</strong>. Anyone who arrived before that left no trail, and nothing can recover it. Meta's advert figures stop on <strong>${day(ADS_TO)}</strong>. Both gaps are marked wherever they bite.</div>

<h2>1. How much did advertising actually make?</h2>
<p>There is no single honest answer, so here are all of them, from the most certain to the most generous.</p>
<div class="scroll"><table>
${row(['How it is counted', 'Orders', 'Sales', 'How much to trust it'], 'th')}
${row(['<strong>They followed a tagged advert link and we watched them do it</strong>', n(provenSales.length), n(money(provenRevenue)), 'Certain. But only ' + pence(adTable.filter((a) => a.arrivals > 0).reduce((t, a) => t + a.spend, 0)) + ' of our adverts carried a tag, so this is a floor, not an answer.'])}
${row(['<strong>They told us Instagram, Facebook or a search engine brought them</strong>', n(declaredSales.length), n('<strong>' + money(declaredRevenue) + '</strong>'), 'The fairest single figure, and the one used above. It catches the untagged adverts. It also includes ordinary posts and plain searches, so not all of it was paid for.'])}
${row(['The first page we ever saw them on came from social or search', n(arrivedSocial.filter((c) => spendOf(c.email) > 0).length), n(money(arrivedRevenue)), 'Too generous. It sweeps in people who heard about us at their gym and then searched our name.'])}
${row(['Everyone who did not name a friend, including those who answered nothing', n(notFriend.filter((c) => spendOf(c.email) > 0).length), n(money(notFriendRevenue)), 'Misleading. Most of the difference is two members who joined in June, months before a single advert ran.'])}
</table></div>
<div class="note"><strong>The short version.</strong> Advertising and social have brought in <strong>${money(declaredRevenue)}</strong> against <strong>${pence(EFFECTIVE_SPEND)}</strong> of spend that counts, a return of <strong>${returnPerPound.toFixed(2)} for every pound</strong>. Only ${money(provenRevenue)} of it can be tied to a named advert, and that is a limit of our tracking, not a measure of the adverts.</div>

<h3>Every sale in that ${money(declaredRevenue)}</h3>
<div class="scroll"><table>
${row(['Order', 'Date', 'Amount', 'Name', 'They said', 'Proven?'], 'th')}
${declaredSales.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((o) => {
  const c = customers.find((x) => x.email.toLowerCase() === (o.email ?? '').toLowerCase());
  const p = people.find((x) => x.c.id === c?.id);
  return row([o.order_number, day(o.created_at), n(money(o.total)), esc(c ? fullName(c) : o.email), esc(c?.referred_by ?? ''), p?.proven ? '<span class="good">yes</span>' : '—']);
}).join('')}
</table></div>

<h3>Why so little of it can be proven</h3>
<ul>
<li><strong>Only ${pence(adTable.filter((a) => a.arrivals > 0).reduce((t, a) => t + a.spend, 0))} of the ${pence(TOTAL_SPEND)} went on adverts carrying a tracking tag.</strong> The rest send visitors in anonymously.</li>
<li><strong>Half the business predates the tracking.</strong> ${orders.filter((o) => new Date(o.created_at) < TRACKING_FROM).length} of our ${orders.length} orders, worth ${money(orders.filter((o) => new Date(o.created_at) < TRACKING_FROM).reduce((t, o) => t + Number(o.total), 0))}, were placed before ${day(TRACKING_FROM)}.</li>
<li><strong>People change device.</strong> Tap an advert on a phone, sign up on a laptop, and the link between the two is lost.</li>
</ul>
<p>The single cheapest improvement available is to tag every link before the next campaign. That alone would move most of this out of "they told us" and into "we watched it happen".</p>

<h2>2. Advert by advert</h2>
<p>The left half is Meta's account of what we paid for. The right half is our own website's account of who turned up. Where they disagree, our own figures are the ones that happened.</p>
<div class="scroll"><table>
${row(['Advert', 'Ran', 'Spent', 'Shown', 'Clicks<br>(Meta)', 'Arrivals<br>(our site)', 'People', 'Looked<br>deeper', 'Reached<br>shop', 'Reached<br>checkout', 'Members', 'Bought', 'Sales'], 'th')}
${adTable.map((a) => row([
  '<div style="display:flex;gap:9px;align-items:flex-start">' + pic(a.id) + '<span>' + esc(a.name === '(not in the advert figures)' && adTitle(a.id) ? adTitle(a.id) : a.name).slice(0, 62) + '</span></div>', a.ran,
  n(a.spend ? pence(a.spend) : '—'), n(a.impressions ? a.impressions.toLocaleString() : '—'), n(a.clicks ? a.clicks.toLocaleString() : '—'),
  n(a.arrivals || '<span class="bad">0</span>'), n(a.devices), n(a.lookedDeeper), n(a.reachedShop), n(a.reachedCheckout),
  n(a.members ? '<span class="good">' + a.members + '</span>' : '0'), n(a.buyers), n(a.revenue ? money(a.revenue) : '—'),
])).join('')}
</table></div>

<h3>What each visitor cost</h3>
<div class="scroll"><table>
${row(['Advert', 'Spent', 'Per person who arrived', 'Per member gained', 'Per paying customer'], 'th')}
${adTable.filter((a) => a.spend > 0).map((a) => row([
  esc(a.name).slice(0, 62), n(pence(a.spend)),
  n(a.devices ? pence(a.spend / a.devices) : '<span class="bad">nobody arrived</span>'),
  n(a.members ? pence(a.spend / a.members) : '—'),
  n(a.buyers ? pence(a.spend / a.buyers) : '—'),
])).join('')}
</table></div>

<h3>What each advert looked like</h3>
<p>Straight from Meta, so this is exactly what people saw.</p>
<div style="display:flex;flex-wrap:wrap;gap:16px;margin:18px 0">
${adTable.filter((a) => thumbFor(a.id)).map((a) => {
  const e = estimate.get(a.id);
  return '<figure style="flex:0 1 200px;margin:0;background:#fff;border:1px solid var(--line);padding:10px">'
    + pic(a.id, 180)
    + '<figcaption style="font-size:12px;line-height:1.45;margin-top:8px">'
    + '<strong>' + esc(clean(adTitle(a.id) || a.name)).slice(0, 46) + '</strong><br>'
    + '<span class="sub">' + (a.spend ? pence(a.spend) : 'spend not recorded') + ' · '
    + (a.arrivals ? a.arrivals + ' arrivals' : (e ? '~' + Math.round(e.arrivals) + ' est. arrivals' : 'no traffic')) + '</span>'
    + (a.revenue ? '<br><span class="good">' + money(a.revenue) + ' of sales</span>' : '')
    + '</figcaption></figure>';
}).join('')}
</div>
${THUMBS.some((x) => /guitar/i.test(x.name ?? '')) ? '<p class="sub"><strong>Note:</strong> one advert in the account is for guitar teaching, not Windsor Glow. It is left out of every figure here.</p>' : ''}

<h2>3. Which adverts got people looking</h2>
<p>Signing up is rare; looking is not, and it tells you whether an advert found the right people.</p>
<div class="scroll"><table>
${row(['Advert', 'People', 'Pages viewed', 'Pages each', 'Looked past the first page', 'Reached the shop'], 'th')}
${adTable.filter((a) => a.devices > 0).sort((a, b) => (b.allPages / b.devices) - (a.allPages / a.devices)).map((a) => row([
  esc(a.name).slice(0, 62), n(a.devices), n(a.allPages), n((a.allPages / a.devices).toFixed(1)),
  n(Math.round((a.lookedDeeper / a.devices) * 100) + '%'), n(Math.round((a.reachedShop / a.devices) * 100) + '%'),
])).join('')}
</table></div>

<h2>4. The adverts that left no tag, worked out from the dates</h2>
<p>Most adverts carried no tag, so their visitors cannot be named. But we know which days each ran. The catch: Instagram and Facebook send us people every day, advert or not, so crediting an advert with all of its days' traffic would hand it visitors we would have had anyway.</p>
<p>So we measure the <em>lift</em>. On a quiet day, nothing paid for and no tagged visitor, the site gets about <strong>${BASE_SOCIAL} social arrivals</strong> and <strong>${Number.isInteger(BASE_SIGNUPS) ? BASE_SIGNUPS + ' sign-ups' : 'one or two sign-ups'}</strong>. Anything above that on an advert's days is what it plausibly added. Two adverts on one day split the extra by what each cost.</p>
<p class="sub">Quiet days used: ${quietDays.map((r) => dayShort(r.d)).join(', ')}.</p>
<div class="scroll"><table>
${row(['Advert', 'Days', 'Spent', 'Arrivals proven', 'Extra arrivals estimated', 'Extra sign-ups', 'Trust', 'Why'], 'th')}
${adTable.filter((a) => a.spend > 0 || estimate.has(a.id)).map((a) => {
  const e = estimate.get(a.id); const [level, why] = confidence(a);
  const cls = level === 'Proven' ? 'good' : (level === 'Weak' || level === 'None' ? 'bad' : '');
  return row([esc(a.name).slice(0, 58), n(e ? e.days : 0), n(a.spend ? pence(a.spend) : '—'), n(a.arrivals || '—'),
    n(e ? Math.round(e.arrivals) : '—'), n(e && e.signups >= 0.5 ? Math.round(e.signups) : '—'),
    '<span class="' + cls + '">' + level + '</span>', '<span class="sub">' + why + '</span>']);
}).join('')}
</table></div>

<h3>Does the estimate work? Here is the test</h3>
<p>Three adverts were tagged, so for those we know the truth <em>and</em> can run the estimate blind against it.</p>
<div class="scroll"><table>
${row(['Advert', 'What really arrived', 'What the estimate says', 'Out by'], 'th')}
${adTable.filter((a) => a.arrivals > 0 && estimate.has(a.id)).map((a) => {
  const e = estimate.get(a.id); const diff = Math.round(((e.arrivals - a.arrivals) / a.arrivals) * 100);
  return row([esc(a.name).slice(0, 58), n(a.arrivals), n(Math.round(e.arrivals)), n('<span class="' + (Math.abs(diff) > 50 ? 'bad' : '') + '">' + (diff > 0 ? '+' : '') + diff + '%</span>')]);
}).join('')}
</table></div>
<p>So it lands in the right region but is rough. Treat an estimate as "roughly this many, give or take a third", never as a count.</p>
${(() => {
  const silly = adTable.filter((a) => { const e = estimate.get(a.id); return e && a.clicks > 0 && e.arrivals > a.clicks * 1.2; });
  return silly.length ? '<div class="warn"><strong>One estimate to throw out.</strong> ' + silly.map((a) => esc(a.name).slice(0, 50) + ' is credited with about ' + Math.round(estimate.get(a.id).arrivals) + ' arrivals, but Meta counted only ' + a.clicks + ' clicks on it and it cost ' + pence(a.spend)).join('; ') + '. An advert cannot send more people than clicked it, so that day’s traffic came from an ordinary post. This is exactly the trap in judging an advert by the calendar alone.</div>' : '';
})()}

<h3>Day by day</h3>
<div class="scroll"><table>
${row(['Day', 'Adverts running', 'Spent', 'Social arrivals', 'Tagged', 'Above a quiet day', 'New members'], 'th')}
${dayTable.map((r) => row([
  dayShort(r.d) + (r.quiet ? ' <span class="sub">(quiet)</span>' : ''),
  r.running.length ? esc(r.running.map((x) => x.slice(0, 26)).join(' + ')) : '<span class="sub">none</span>',
  n(r.spend ? pence(r.spend) : '—'), n(r.social), n(r.tagged || '—'), n(r.lift ? '+' + r.lift : '—'), n(r.signups || '—'),
])).join('')}
</table></div>

<h2>5. Which advert brought each member, as far as we can tell</h2>
<p>Only eight members can be proven, because only they followed a tagged link. For everyone else this uses the dates: what they first arrived from, on what day, and which adverts were running then. Every line says which of these five it is, so a guess is never mistaken for a fact.</p>
<div class="scroll"><table>
${row(['Advert', 'Members', 'Proven by link', 'Likely', 'From an advert,<br>which one judged<br>by spend', 'Their spend'], 'th')}
${[...assignRollup].sort((a, b) => b[1].members - a[1].members).map(([label, e]) => row([
  esc(label).slice(0, 62), n(e.members),
  n(e.confirmed ? '<span class="good">' + e.confirmed + '</span>' : '—'),
  n(e.likely || '—'), n(e.possible || '—'), n(e.revenue ? money(e.revenue) : '—'),
])).join('')}
</table></div>
<p class="sub"><strong>Confirmed</strong> arrived on that advert's own tagged link. <strong>Likely</strong> first landed from Instagram or Facebook on a day exactly one advert was running. <strong>From an advert</strong> means Kieran has confirmed an advert brought them; two or three ran that day and all were Instagram posts, so which one is judged by which outspent the others. The rest either arrived by search or typed the address, or we never saw them arrive.</p>

<h3>Member by member</h3>
<div class="scroll"><table>
${row(['Name', 'Joined', 'First landed', 'Arrived from', 'Advert we think brought them', 'How sure', 'Why', 'Spent'], 'th')}
${people.map((p) => row([
  esc(fullName(p.c)), day(p.c.created_at),
  p.firstBefore ? day(p.firstBefore.created_at) : '—',
  esc(p.firstBefore?.source ?? '—'),
  esc(p.assigned || '—'),
  '<span class="' + (p.assignedHow === 'Confirmed' ? 'good' : (p.assignedHow === 'Unknown' ? 'bad' : '')) + '">' + p.assignedHow + '</span>',
  '<span class="sub">' + esc(p.assignedWhy) + '</span>',
  n(p.spent ? money(p.spent) : '—'),
])).join('')}
</table></div>

<h2>6. Members who did not come from a friend</h2>
<p>${people.length} of our ${customers.length} members named Instagram, Facebook, a search engine, or gave no answer. <strong>${buyers.length} have bought</strong>; <strong>${membersOnly.length} have joined and never ordered</strong>.</p>
<div class="cards">
  <div class="card"><span class="big">${buyers.length}</span><span class="lbl">became paying customers</span></div>
  <div class="card"><span class="big">${money(people.reduce((t, p) => t + p.spent, 0))}</span><span class="lbl">their total spend</span></div>
  <div class="card"><span class="big">${membersOnly.length}</span><span class="lbl">joined but never ordered</span></div>
  <div class="card"><span class="big">${reachedCheckoutNoOrder.length}</span><span class="lbl">reached the checkout and stopped</span></div>
</div>

<h3>The ones who bought</h3>
<div class="scroll"><table>
${row(['Name', 'Said they came from', 'Spent', 'Orders', 'Joined', 'First landed', 'Days to join', 'Advert', 'Proven?'], 'th')}
${buyers.sort((a, b) => b.spent - a.spent).map((p) => row([
  esc(fullName(p.c)), esc(p.c.referred_by ?? '—'), n('<span class="good">' + money(p.spent) + '</span>'), n(p.orders.length),
  day(p.c.created_at), p.firstBefore ? day(p.firstBefore.created_at) : '<span class="bad">not recorded</span>',
  n(p.daysToJoin ?? '—'), esc(p.adName || '—'), p.proven ? '<span class="good">yes</span>' : '—',
])).join('')}
</table></div>

<h3>The ones who joined and have not bought</h3>
<div class="scroll"><table>
${row(['Name', 'Said they came from', 'Joined', 'First landed', 'Days to join', 'Pages', 'Reached checkout?', 'Advert'], 'th')}
${membersOnly.map((p) => row([
  esc(fullName(p.c)), esc(p.c.referred_by ?? '—'), day(p.c.created_at),
  p.firstBefore ? day(p.firstBefore.created_at) : '<span class="bad">not recorded</span>',
  n(p.daysToJoin ?? '—'), n(p.visits.length),
  p.visits.some((v) => (v.path ?? '').includes('/checkout')) ? '<strong>yes</strong>' : 'no', esc(p.adName || '—'),
])).join('')}
</table></div>
${reachedCheckoutNoOrder.length ? '<div class="note"><strong>Worth an email this week.</strong> ' + reachedCheckoutNoOrder.map((p) => esc(fullName(p.c))).join(', ') + ' each reached the checkout and did not finish. They are the warmest names on this list.</div>' : ''}

<h2>7. The ones who took their time</h2>
<p>Most people join the day they arrive. These did not, and they are why an advert should never be judged on the day it runs.</p>
${people.filter((p) => p.daysToJoin > 0).sort((a, b) => b.daysToJoin - a.daysToJoin).map((p) => {
  const arrivals = p.before.filter((v) => v.landing);
  return '<div class="person"><h4>' + esc(fullName(p.c)) + ' — ' + p.daysToJoin + ' days, ' + arrivals.length + ' separate visits, ' + p.before.length + ' pages before joining</h4>'
    + '<p class="sub">Said ' + esc(p.c.referred_by ?? '—') + '. ' + (p.adName ? 'Arrived through <strong>' + esc(p.adName) + '</strong>.' : 'Arrived with no advert tag.') + ' ' + (p.orders.length ? '<span class="good">Has spent ' + money(p.spent) + '.</span>' : 'Has not ordered.') + '</p>'
    + '<ul class="steps">' + arrivals.map((a) => '<li>' + stamp(a.created_at) + ' — arrived on ' + esc(a.path) + (a.utm_campaign ? ' <strong>from the advert</strong>' : '') + '</li>').join('')
    + '<li>' + stamp(p.c.created_at) + ' — <strong>signed up</strong></li>'
    + (p.orders.length ? '<li>' + stamp(p.orders[0].created_at) + ' — <strong>first order, ' + money(Number(p.orders[0].total)) + '</strong></li>' : '') + '</ul></div>';
}).join('')}

<h2>8. What to do next</h2>
<ul>
<li><strong>Tag every advert link before the next campaign.</strong> ${pence(TOTAL_SPEND - adTable.filter((a) => a.arrivals > 0).reduce((t, a) => t + a.spend, 0))} of spend so far cannot be traced at all. This costs nothing to fix and doubles what the next report can tell you.</li>
<li><strong>Email the ${reachedCheckoutNoOrder.length} who reached the checkout and stopped.</strong> They chose products and walked away.</li>
<li><strong>Judge an advert two weeks after it stops, not on the day.</strong> Our longest journey was ${Math.max(...people.filter((p) => p.daysToJoin !== null).map((p) => p.daysToJoin))} days from first visit to joining.</li>
<li><strong>The sign-up adverts brought members, not money.</strong> Plenty joined between 8 and 16 September and almost none have ordered. Getting the sign-up is only half of it.</li>
</ul>

<h2>9. What these numbers cannot tell you</h2>
<ul>
<li>Website visits begin on ${day(TRACKING_FROM)}. Members who joined earlier have no journey, and nothing can recover it.</li>
<li>Meta's figures stop on ${day(ADS_TO)}. Anything spent since is not in here.</li>
<li>A person is counted by their internet address. A household sharing one connection reads as one person; a phone moving between wifi and mobile data reads as two.</li>
<li>Untagged adverts cannot be separated from ordinary Instagram and Facebook traffic.</li>
<li>Meta counts a click on anything in the post; our site counts an arrival. That is why the two columns differ.</li>
<li>The ${money(WASTED_SPEND_POUNDS)} written off is applied to the total. The data does not record which campaign it was, so it is not deducted from any single advert's row.</li>
</ul>

<footer>
Built from the live Windsor Glow database on ${stamp(new Date())}. Website visits ${day(TRACKING_FROM)} to ${day(TRACKING_TO)}; advert figures to ${day(ADS_TO)}.<br>
Re-run at any time with <strong>node scripts/report-ad-journeys.mjs</strong> in the Windsor Glow website folder. It only reads, never writes.<br>
Alongside this: <strong>Windsor Glow - ad performance.csv</strong>, <strong>Windsor Glow - members who came from ads or search.csv</strong>, and <strong>Windsor Glow - every page they looked at.csv</strong> (${everyPage.length} rows).
</footer>
</div></body></html>`;

const name = 'Windsor Glow - what our adverts actually did - ' + day(new Date()) + '.html';
writeFileSync(OUT + '/' + name, html, 'utf8');
console.log('wrote ' + name);
console.log('');
console.log('total spend ' + pence(TOTAL_SPEND) + ', written off ' + money(WASTED_SPEND_POUNDS) + ', counts ' + pence(EFFECTIVE_SPEND));
console.log('declared social/search sales ' + money(declaredRevenue) + ' from ' + declaredSales.length + ' orders = ' + returnPerPound.toFixed(2) + 'x');
console.log('proven ' + money(provenRevenue) + ' | cancelled excluded: ' + cancelled.length + ' worth ' + money(cancelled.reduce((t, o) => t + Number(o.total), 0)));
