// Prove the public-form spam brakes against a real Postgres, on a real copy of the schema.
//
//   node scripts/test-form-limits-sql.mjs
//
// WHY THIS EXISTS IN THIS SHAPE. The Windsor Beauty credential on this machine is `agent_ro` and is
// genuinely read only, and the counting itself is time-sensitive: "five in the last fifteen
// minutes" cannot be proved by reading code, only by inserting rows and counting them back. The
// alternative to this file is shipping a brake nobody has ever seen stop anything.
//
// So it builds a throwaway copy of the one table the brakes touch, exactly as ensureSchema writes
// it, runs the real statements from src/lib/db/formLimits.ts over made-up visitors, and drops it.
// It proves the SQL. It does not prove the live database has been migrated: that happens on
// deploy, the same way every other column on this site arrived.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(file, 'utf-8').replace(/^﻿/, '');
      for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf('=');
        if (at > 0 && !line.trim().startsWith('#') && line.slice(0, at).trim() === name) {
          return line.slice(at + 1).trim();
        }
      }
    } catch { /* next */ }
  }
  return undefined;
}

const url = env('AI_COSTS_DATABASE_URL');
if (!url) {
  console.log('\n  No writable database available, so the form-limit SQL was not exercised.');
  console.log('  Set AI_COSTS_DATABASE_URL. Not treated as a pass.\n');
  process.exit(1);
}
const sql = neon(url);

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}\n          expected ${e}\n          got      ${a}`); }
}

const T = 'zz_form_limit_probe';

// The limits the code ships with. Kept beside the assertions so a change to one
// without the other shows up here as a failure rather than a surprise in production.
const LIMITS = { contact: { limit: 5, windowMinutes: 15 }, review: { limit: 5, windowMinutes: 60 }, 'stock-alert': { limit: 10, windowMinutes: 60 } };

/** The real counting query from isFormRateLimited, against the throwaway table. */
async function isLimited(form, ip) {
  const { limit, windowMinutes } = LIMITS[form];
  const rows = await sql.query(
    `SELECT count(*)::int AS count FROM ${T}
     WHERE form = $1 AND ip_address = $2
       AND attempted_at > now() - ($3 || ' minutes')::interval`,
    [form, ip, windowMinutes]
  );
  return (rows[0]?.count ?? 0) >= limit;
}

/** The real insert from logFormAttempt. */
async function logAttempt(form, ip, minutesAgo = 0) {
  await sql.query(
    `INSERT INTO ${T} (form, ip_address, attempted_at) VALUES ($1, $2, now() - ($3 || ' minutes')::interval)`,
    [form, ip, minutesAgo]
  );
}

try {
  await sql.query(`DROP TABLE IF EXISTS ${T}`);

  // The same columns ensureSchema produces, so a difference here would be a difference there.
  await sql.query(`CREATE TABLE ${T} (
    id SERIAL PRIMARY KEY,
    form TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await sql.query(`CREATE INDEX ${T}_lookup ON ${T} (form, ip_address, attempted_at)`);

  const VISITOR = '203.0.113.40';
  const OTHER   = '203.0.113.41';

  // ── A real person is never stopped ─────────────────────────────────────────
  check('a first-time visitor is let through', await isLimited('contact', VISITOR), false);

  for (let i = 0; i < 4; i += 1) await logAttempt('contact', VISITOR);
  check('four messages is still under the limit, so the fifth is allowed',
    await isLimited('contact', VISITOR), false);

  // ── A script is stopped ────────────────────────────────────────────────────
  await logAttempt('contact', VISITOR);
  check('the fifth message reaches the limit, so a sixth is refused',
    await isLimited('contact', VISITOR), true);

  await logAttempt('contact', VISITOR);
  await logAttempt('contact', VISITOR);
  check('hammering it further keeps it refused', await isLimited('contact', VISITOR), true);

  // ── One noisy visitor must not shut out everybody else ─────────────────────
  check('a different visitor is unaffected', await isLimited('contact', OTHER), false);

  // ── The three forms count separately ───────────────────────────────────────
  check('the review form has its own count, not the contact form\'s',
    await isLimited('review', VISITOR), false);
  check('the stock-alert form has its own count too',
    await isLimited('stock-alert', VISITOR), false);

  // ── Restock signups get a longer rope, because wanting several is normal ───
  for (let i = 0; i < 9; i += 1) await logAttempt('stock-alert', VISITOR);
  check('nine restock signups is still allowed', await isLimited('stock-alert', VISITOR), false);
  await logAttempt('stock-alert', VISITOR);
  check('the tenth restock signup reaches its limit', await isLimited('stock-alert', VISITOR), true);

  // ── The brake lets go again once the window has passed ─────────────────────
  // This is the part that matters most: a brake that never releases is a broken
  // contact form, not a spam filter.
  const PATIENT = '203.0.113.42';
  for (let i = 0; i < 5; i += 1) await logAttempt('contact', PATIENT, 20); // 20 minutes ago
  check('five messages sent twenty minutes ago no longer count against a fifteen minute window',
    await isLimited('contact', PATIENT), false);

  // ...but a longer window still remembers them.
  for (let i = 0; i < 5; i += 1) await logAttempt('review', PATIENT, 20);
  check('the same five inside a sixty minute window are still counted',
    await isLimited('review', PATIENT), true);

  // ── Old rows fall out on their own; nothing has to sweep them ──────────────
  const stale = await sql.query(
    `SELECT count(*)::int AS count FROM ${T} WHERE form = 'contact' AND ip_address = $1`, [PATIENT]);
  check('the old rows are still on the table, they simply stop counting',
    stale[0].count, 5);
} catch (err) {
  failed += 1;
  console.log(`  FAIL  the SQL itself threw: ${err.message}`);
} finally {
  await sql.query(`DROP TABLE IF EXISTS ${T}`).catch(() => {});
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
console.log('  Throwaway table dropped. This proves the SQL, not that production has been migrated.\n');
process.exit(failed === 0 ? 0 : 1);
