/**
 * Asks Meta what every campaign has EVER cost, and compares it with what we have stored.
 *
 *     node --import ./scripts/alias-loader.mjs --experimental-strip-types --no-warnings scripts/check-ad-spend.mjs
 *
 * Kieran, 19 September: "I don't buy fifteen to sixteen pounds in ad spend on either of the
 * claymation adverts, I'm pretty sure we spent more than that." Our dashboard only stores the days
 * it happened to pull, so a campaign that ran before it started pulling, or on a day it missed,
 * shows too little. This asks for lifetime spend straight from the account, which cannot miss days.
 *
 * One call per account. Read-only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const { accountIds } = await import('../src/lib/ads/meta.ts');
const GRAPH = 'https://graph.facebook.com/v21.0';
const TOKEN = process.env.META_SYSTEM_USER_TOKEN;
const money = (n) => '£' + Number(n).toFixed(2);

const db = neon(readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^["']|["']$/g, ''), { fetchOptions: { cache: 'no-store' } });
const stored = new Map((await db`
  SELECT entity_id, max(entity_name) AS name, sum(spend_minor)::int AS spend,
         min(metric_date) AS first_day, max(metric_date) AS last_day, count(*)::int AS days
  FROM ad_daily_metrics WHERE level = 'campaign' GROUP BY entity_id`).map((r) => [r.entity_id, r]));

const live = [];
for (const act of accountIds()) {
  const url = GRAPH + '/' + act + '/insights'
    + '?level=campaign&date_preset=maximum&limit=200'
    + '&fields=' + encodeURIComponent('campaign_id,campaign_name,spend,impressions,clicks,date_start,date_stop')
    + '&access_token=' + encodeURIComponent(TOKEN);
  const body = await fetch(url).then((r) => r.json()).catch((e) => ({ error: { message: e.message } }));
  if (body.error) { console.error(act + ': ' + body.error.message); continue; }
  for (const r of body.data ?? []) live.push({ act, ...r });
}

console.log('CAMPAIGN'.padEnd(46) + 'META SAYS'.padStart(11) + 'WE STORED'.padStart(12) + '   MISSING');
let liveTotal = 0, storedTotal = 0;
for (const r of live.sort((a, b) => Number(b.spend) - Number(a.spend))) {
  const s = stored.get(r.campaign_id);
  const have = s ? s.spend / 100 : 0;
  const real = Number(r.spend);
  liveTotal += real; storedTotal += have;
  const gap = real - have;
  console.log(String(r.campaign_name).split('\n')[0].slice(0, 44).padEnd(46)
    + money(real).padStart(11) + money(have).padStart(12)
    + (Math.abs(gap) > 0.02 ? ('   ' + money(gap) + (s ? '  (we hold ' + s.days + ' days, ' + String(s.first_day).slice(4, 10) + ' to ' + String(s.last_day).slice(4, 10) + ')' : '  (NOT STORED AT ALL)')) : ''));
}
console.log(''.padEnd(46, '-'));
console.log('TOTAL'.padEnd(46) + money(liveTotal).padStart(11) + money(storedTotal).padStart(12) + '   ' + money(liveTotal - storedTotal) + ' missing');

// Save what Meta says so the report can use it instead of whatever days we happened to pull.
writeFileSync('scripts/ad-spend-lifetime.json', JSON.stringify(live.map((r) => ({
  campaignId: r.campaign_id,
  name: String(r.campaign_name),
  spendMinor: Math.round(Number(r.spend) * 100),
  impressions: Number(r.impressions ?? 0),
  clicks: Number(r.clicks ?? 0),
  firstDay: r.date_start,
  lastDay: r.date_stop,
})), null, 2), 'utf8');
console.log('');
console.log('wrote scripts/ad-spend-lifetime.json (' + live.length + ' campaigns)');

const unseen = [...stored.values()].filter((s) => !live.some((r) => r.campaign_id === s.entity_id));
if (unseen.length) console.log('\nstored but not in Meta’s answer: ' + unseen.map((s) => String(s.name).split('\n')[0].slice(0, 40)).join(', '));
