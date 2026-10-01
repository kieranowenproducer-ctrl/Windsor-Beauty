/**
 * Mark the visits already recorded as person or machine (task 522d09f1).
 *
 * The is_bot column defaults to false, so without this every visit recorded before 7 September 2026
 * would count as a person, including the WhatsApp preview that made Ross's brand new link read
 * "1 visit" before anybody had opened it. That row is the whole reason the column exists.
 *
 * Safe to run more than once: it only ever recalculates from the user agent already stored on the
 * row, and it deletes nothing. Run it after deploying, with DATABASE_URL pointing at the shop.
 *
 *   node --env-file=.env.local scripts/backfill-scan-bots.mjs          (report only, changes nothing)
 *   node --env-file=.env.local scripts/backfill-scan-bots.mjs --apply  (write the answers)
 */
import { neon } from '@neondatabase/serverless';
import { isBotUserAgent, describeBot } from '../src/lib/analytics/botDetection.ts';

const APPLY = process.argv.includes('--apply');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('No DATABASE_URL. Run with --env-file=.env.local from the website folder.');
  process.exit(1);
}
const sql = neon(url, { fetchOptions: { cache: 'no-store' } });

const rows = await sql`
  SELECT s.id, s.user_agent, s.is_bot, c.slug
  FROM qr_campaign_scans s
  JOIN qr_campaigns c ON c.id = s.campaign_id
  ORDER BY s.id
`;

const wrong = rows.filter((r) => isBotUserAgent(r.user_agent) !== r.is_bot);

console.log(`${rows.length} recorded visits, ${wrong.length} with the wrong answer stored.`);
console.log();

if (wrong.length) {
  for (const r of wrong) {
    const bot = isBotUserAgent(r.user_agent);
    console.log(
      `  #${String(r.id).padEnd(5)} ${r.slug.padEnd(26)} ${bot ? 'MACHINE' : 'PERSON '}  ${bot ? describeBot(r.user_agent) : ''}`,
    );
  }
  console.log();
}

if (!APPLY) {
  console.log('Nothing written. Add --apply to save these answers.');
} else if (wrong.length) {
  for (const r of wrong) {
    await sql`UPDATE qr_campaign_scans SET is_bot = ${isBotUserAgent(r.user_agent)} WHERE id = ${r.id}`;
  }
  console.log(`Updated ${wrong.length} rows.`);
} else {
  console.log('Nothing to change.');
}

// What each campaign will show once this is done.
const after = await sql`
  SELECT c.slug,
    COUNT(*) FILTER (WHERE NOT s.is_bot)::int AS people,
    COUNT(*) FILTER (WHERE s.is_bot)::int AS machines
  FROM qr_campaign_scans s JOIN qr_campaigns c ON c.id = s.campaign_id
  GROUP BY c.slug ORDER BY c.slug
`;
console.log();
console.log('What each link will show:');
for (const r of after) {
  console.log(`  ${r.slug.padEnd(26)} ${String(r.people).padStart(4)} people   ${String(r.machines).padStart(3)} not counted`);
}
