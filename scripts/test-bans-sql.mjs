// Prove the banning SQL against a real Postgres, on a real copy of the schema.
//
//   node scripts/test-bans-sql.mjs
//
// WHY THIS EXISTS IN THIS SHAPE. The Windsor Glow credential on this machine is `agent_ro` and is
// genuinely read only, so a ban cannot be pressed against the live shop from here, and it must not
// be: banning is something that happens to a real person. The alternative to this file is shipping
// the trickiest query in the feature untested.
//
// So it builds a throwaway copy of the three tables the ban touches, exactly as ensureSchema
// writes them, runs the real statements from src/lib/db/bans.ts over made-up people, and drops the
// lot. It proves the SQL. It does not prove the live database has been migrated, and nothing here
// should be read as claiming it has: that happens on deploy, the same way every other column on
// this site arrived.
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
  console.log('\n  No writable database available, so the ban SQL was not exercised.');
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

const C = 'zz_ban_probe_customers';
const L = 'zz_ban_probe_ip_log';
const B = 'zz_ban_probe_bans';
const S = 'zz_ban_probe_sessions';

async function build() {
  for (const t of [S, B, L, C]) await sql.query(`DROP TABLE IF EXISTS ${t}`);

  // The same columns ensureSchema produces, so a difference here would be a difference there.
  await sql.query(`CREATE TABLE ${C} (
    id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
    first_name TEXT, last_name TEXT,
    account_status TEXT NOT NULL DEFAULT 'active',
    banned_at TIMESTAMPTZ, banned_reason TEXT, banned_by TEXT)`);
  await sql.query(`CREATE INDEX ${C}_banned_idx ON ${C} (banned_at) WHERE banned_at IS NOT NULL`);

  await sql.query(`CREATE TABLE ${L} (
    id SERIAL PRIMARY KEY, ip_address TEXT, event TEXT NOT NULL,
    customer_id INTEGER, customer_name TEXT, customer_email TEXT,
    country TEXT, city TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  await sql.query(`CREATE TABLE ${B} (
    id SERIAL PRIMARY KEY, customer_id INTEGER, customer_name TEXT, customer_email TEXT,
    action TEXT NOT NULL, reason TEXT, admin_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  await sql.query(`CREATE TABLE ${S} (
    id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL, token TEXT NOT NULL)`);

  // Three people. Rogue and Innocent share an address; Faraway does not.
  await sql.query(`INSERT INTO ${C} (email, first_name, last_name) VALUES
    ('rogue@example.test',    'Rogue',    'One'),
    ('innocent@example.test', 'Innocent', 'Two'),
    ('faraway@example.test',  'Faraway',  'Three')`);

  // Rogue signs in from .10. Innocent uses the SAME address, once with an account link and once
  // with only an email (a batch code check), because both shapes really occur in the live log.
  await sql.query(`INSERT INTO ${L} (ip_address, event, customer_id, customer_name, customer_email, city, country) VALUES
    ('203.0.113.10', 'sign_in',      1, 'Rogue One',    'rogue@example.test',    'Slough',  'GB'),
    ('203.0.113.10', 'sign_in',      2, 'Innocent Two', 'innocent@example.test', 'Slough',  'GB'),
    ('203.0.113.10', 'verification', NULL, NULL,        'innocent@example.test', 'Slough',  'GB'),
    ('203.0.113.99', 'sign_in',      3, 'Faraway Three','faraway@example.test',  'Dundee',  'GB')`);

  // Rogue has a live session, which banning must take away.
  await sql.query(`INSERT INTO ${S} (customer_id, token) VALUES (1, 'live-session-token')`);
}

/** The statements banCustomer() runs, in the order it runs them. */
async function ban(id, reason, admin) {
  await sql.query(`UPDATE ${C} SET banned_at = now(), banned_reason = $2, banned_by = $3 WHERE id = $1`, [id, reason, admin]);
  await sql.query(`DELETE FROM ${S} WHERE customer_id = $1`, [id]);
  await sql.query(
    `INSERT INTO ${B} (customer_id, customer_name, customer_email, action, reason, admin_name)
     SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)), email, 'banned', $2, $3 FROM ${C} WHERE id = $1`,
    [id, reason, admin]
  );
}

/** The statements liftCustomerBan() runs. */
async function lift(id, reason, admin) {
  await sql.query(`UPDATE ${C} SET banned_at = NULL, banned_reason = NULL, banned_by = NULL WHERE id = $1`, [id]);
  await sql.query(
    `INSERT INTO ${B} (customer_id, customer_name, customer_email, action, reason, admin_name)
     SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)), email, 'lifted', $2, $3 FROM ${C} WHERE id = $1`,
    [id, reason, admin]
  );
}

/** listBannedIpMatches(), with the table names swapped for the throwaway copies. */
async function matches() {
  const rows = await sql.query(`
    WITH banned AS (
      SELECT id, email, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM ${C} WHERE banned_at IS NOT NULL
    ),
    banned_ips AS (
      SELECT DISTINCT l.ip_address, b.id AS banned_id, COALESCE(NULLIF(b.name, ''), b.email) AS banned_name
      FROM ${L} l
      JOIN banned b ON (l.customer_id = b.id OR lower(l.customer_email) = lower(b.email))
      WHERE l.ip_address IS NOT NULL
    )
    SELECT bi.ip_address,
           ARRAY_AGG(DISTINCT bi.banned_name) AS banned_names,
           c.id AS customer_id,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email) AS customer_name,
           (c.banned_at IS NOT NULL) AS already_banned
    FROM banned_ips bi
    JOIN ${L} l ON l.ip_address = bi.ip_address
    JOIN ${C} c ON (c.id = l.customer_id OR lower(c.email) = lower(l.customer_email))
    WHERE c.id <> bi.banned_id
    GROUP BY bi.ip_address, c.id, c.first_name, c.last_name, c.email, c.banned_at
    ORDER BY c.id`);
  return rows;
}

/** listBannedCustomers(), same swap. */
async function bannedList() {
  return sql.query(`
    SELECT c.id, c.email, c.banned_reason, c.banned_by,
           COALESCE((SELECT ARRAY_AGG(ip ORDER BY ip) FROM (
             SELECT DISTINCT l.ip_address AS ip FROM ${L} l
             WHERE l.ip_address IS NOT NULL
               AND (l.customer_id = c.id OR lower(l.customer_email) = lower(c.email))
           ) a), '{}') AS addresses
    FROM ${C} c WHERE c.banned_at IS NOT NULL ORDER BY c.banned_at DESC`);
}

const one = (rows, col) => rows.map((r) => r[col]);

console.log('\n=== BANNING A CUSTOMER — SQL PROOF (throwaway tables) ===\n');
try {
  await build();

  // Nothing is banned to begin with, so nothing is flagged.
  check('no bans to start with', (await bannedList()).length, 0);
  check('nothing flagged to start with', (await matches()).length, 0);

  await ban(1, 'Fake account', 'Samuel');

  const banned = await bannedList();
  check('the banned account is listed', one(banned, 'email'), ['rogue@example.test']);
  check('the reason is kept', one(banned, 'banned_reason'), ['Fake account']);
  check('who pressed it is kept', one(banned, 'banned_by'), ['Samuel']);
  check('their addresses are traceable', banned[0].addresses, ['203.0.113.10']);

  const sessions = await sql.query(`SELECT COUNT(*)::int AS n FROM ${S} WHERE customer_id = 1`);
  check('banning signs them out everywhere', sessions[0].n, 0);

  const flagged = await matches();
  check('one account is flagged, not two', flagged.length, 1);
  check('the flagged account is the one sharing the address', one(flagged, 'customer_name'), ['Innocent Two']);
  check('the flag names who was banned', flagged[0].banned_names, ['Rogue One']);
  check('the flagged account is not itself banned yet', flagged[0].already_banned, false);
  check('the banned account does not flag itself', flagged.filter((r) => r.customer_id === 1).length, 0);
  check('an unrelated address is not flagged', flagged.filter((r) => r.customer_name === 'Faraway Three').length, 0);

  // The button on the flag: ban the second account too.
  await ban(2, 'Same address as a banned account', 'Samuel');
  const after = await matches();
  check('now both are banned, so the flag says already banned', after.every((r) => r.already_banned), true);
  check('both banned accounts are listed', (await bannedList()).length, 2);

  // And the undo.
  await lift(2, 'Turned out to be their partner', 'Samuel');
  check('lifting leaves one banned', (await bannedList()).length, 1);
  const history = await sql.query(`SELECT action, reason, admin_name FROM ${B} WHERE customer_id = 2 ORDER BY id`);
  check('both the ban and the lift are on the record', one(history, 'action'), ['banned', 'lifted']);
  check('the lift keeps its reason', history[1].reason, 'Turned out to be their partner');
  check('the record survives with the name copied in',
    (await sql.query(`SELECT customer_email FROM ${B} WHERE customer_id = 2 LIMIT 1`))[0].customer_email,
    'innocent@example.test');

  // A lifted account can sign in again: the whole check the login route makes is this one column.
  const canSignIn = await sql.query(`SELECT (banned_at IS NULL) AS allowed FROM ${C} WHERE id = 2`);
  check('a lifted account is allowed back in', canSignIn[0].allowed, true);
  const stillOut = await sql.query(`SELECT (banned_at IS NULL) AS allowed FROM ${C} WHERE id = 1`);
  check('a banned account is still shut out', stillOut[0].allowed, false);
} catch (err) {
  failed += 1;
  console.log(`  FAIL  the SQL itself threw: ${err.message}`);
} finally {
  for (const t of [S, B, L, C]) await sql.query(`DROP TABLE IF EXISTS ${t}`).catch(() => {});
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
console.log('  Throwaway tables dropped. This proves the SQL, not that production has been migrated.\n');
process.exit(failed === 0 ? 0 : 1);
