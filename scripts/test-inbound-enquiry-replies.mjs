// Prove that a customer's emailed reply lands on their enquiry (task bb0a850f).
//
//   node scripts/test-inbound-enquiry-replies.mjs
//
// WHY THIS EXISTS IN THIS SHAPE. Same reason as test-handover-sql.mjs, and it borrows that file's
// method. The Windsor Glow credential on this machine is `agent_ro` and genuinely read only: it
// refuses both ALTER TABLE and INSERT on the live enquiries tables. So the rules are proved against
// a throwaway copy of the same schema in the one database this machine can write to, and the copy
// is dropped at the end. It proves the SQL and the index. It does not prove production has been
// migrated, and nothing here should be read as claiming it has.
//
// WHAT IT IS PROVING. Emma answered a website enquiry by email, and the site had nowhere to put
// what she said, so the dashboard showed a question that looked answered and finished while she
// waited. Four things have to hold for that not to happen again:
//
//   1. her words are stored, and stored as HERS, not as something we sent;
//   2. the enquiry comes back to the team instead of sitting there marked replied;
//   3. a webhook Resend retries writes one row, not two;
//   4. a reply is matched to the conversation it is actually answering.
import { neon } from '@neondatabase/serverless';
import { readFile } from 'node:fs/promises';
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
  console.log('\n  No writable database available, so the inbound reply SQL was not exercised.');
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

const T = 'zz_inbound_probe';

async function build() {
  await sql.query(`DROP TABLE IF EXISTS ${T}_replies`);
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
  await sql.query(`
    CREATE TABLE ${T} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // The replies table exactly as it stands before this task, so the column and the index are
  // added here the same way ensureSchema adds them to the real one.
  await sql.query(`
    CREATE TABLE ${T}_replies (
      id SERIAL PRIMARY KEY,
      enquiry_id INTEGER NOT NULL REFERENCES ${T}(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      from_address TEXT NOT NULL,
      provider_message_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await sql.query(`ALTER TABLE ${T}_replies ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'out'`);
  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${T}_replies_provider_message_id
      ON ${T}_replies (provider_message_id) WHERE provider_message_id IS NOT NULL`);
}

/** The real query from recordInboundEnquiryReply, against the throwaway tables. */
async function recordInbound(enquiryId, body, fromAddress, providerMessageId, closeAsAcknowledged = false) {
  if (providerMessageId) {
    const seen = await sql.query(
      `SELECT * FROM ${T}_replies WHERE provider_message_id = $1 LIMIT 1`, [providerMessageId]);
    if (seen[0]) return seen[0].enquiry_id === enquiryId ? { reply: seen[0], created: false } : null;
  }
  const rows = await sql.query(`
    WITH saved_reply AS (
      INSERT INTO ${T}_replies (enquiry_id, body, from_address, provider_message_id, direction)
      VALUES ($1, $2, $3, $4, 'in')
      RETURNING *
    ), reopened AS (
      UPDATE ${T}
      SET status = CASE WHEN $5 THEN 'closed' ELSE 'new' END,
          updated_at = now()
      WHERE id = $1
      RETURNING id
    )
    SELECT saved_reply.* FROM saved_reply JOIN reopened ON reopened.id = saved_reply.enquiry_id
  `, [enquiryId, body, String(fromAddress).toLowerCase(), providerMessageId, closeAsAcknowledged]);
  return rows[0] ? { reply: rows[0], created: true } : null;
}

/** The real query from findEnquiryForCustomerEmail. */
async function findEnquiryFor(email, closedWithinDays = 60) {
  const rows = await sql.query(`
    SELECT * FROM ${T}
    WHERE lower(email) = $1
      AND (status <> 'closed' OR updated_at > now() - make_interval(days => $2))
    ORDER BY (status = 'closed'), created_at DESC
    LIMIT 1
  `, [String(email).trim().toLowerCase(), closedWithinDays]);
  return rows[0] ?? null;
}

async function run() {
  await build();

  /* ── 1. Her words are stored, and stored as hers ───────────────────────── */
  const emma = (await sql.query(
    `INSERT INTO ${T} (name, email, message, status) VALUES ($1,$2,$3,'replied') RETURNING *`,
    ['Emma Lewis', 'emmalouise123@example.test', 'Are the peptides pre-mixed?']))[0];

  // An answer we sent, written the old way, with no direction given at all.
  await sql.query(
    `INSERT INTO ${T}_replies (enquiry_id, body, from_address) VALUES ($1,$2,$3)`,
    [emma.id, 'All pens are pre-mixed.', 'info@windsorglow.com']);
  const ours = (await sql.query(`SELECT direction FROM ${T}_replies WHERE enquiry_id = $1`, [emma.id]))[0];
  check('a reply written before the column existed still counts as ours', ours.direction, 'out');

  const hers = await recordInbound(emma.id, 'May I ask why there are two pens?', 'EmmaLouise123@example.test', 'rcv_001');
  check('her reply is saved', Boolean(hers?.created), true);
  check('her reply is marked as hers', hers.reply.direction, 'in');
  check('her address is stored, not ours', hers.reply.from_address, 'emmalouise123@example.test');

  /* ── 2. The enquiry comes back to the team ─────────────────────────────── */
  const after = (await sql.query(`SELECT status FROM ${T} WHERE id = $1`, [emma.id]))[0];
  check('the enquiry is waiting for an answer again', after.status, 'new');

  const closed = (await sql.query(
    `INSERT INTO ${T} (name, email, message, status) VALUES ($1,$2,$3,'closed') RETURNING *`,
    ['Closed Case', 'closed@example.test', 'Thanks']))[0];
  await recordInbound(closed.id, 'Actually, one more thing.', 'closed@example.test', 'rcv_002');
  const reopened = (await sql.query(`SELECT status FROM ${T} WHERE id = $1`, [closed.id]))[0];
  check('a closed enquiry reopens when the customer writes again', reopened.status, 'new');

  const courtesy = (await sql.query(
    `INSERT INTO ${T} (name, email, message, status) VALUES ($1,$2,$3,'replied') RETURNING *`,
    ['Courtesy Reply', 'thanks@example.test', 'Can you help?']))[0];
  await recordInbound(courtesy.id, 'Thank you', 'thanks@example.test', 'rcv_thanks', true);
  const courtesyAfter = (await sql.query(`SELECT status FROM ${T} WHERE id = $1`, [courtesy.id]))[0];
  check('a simple thank-you is recorded and finished automatically', courtesyAfter.status, 'closed');

  /* ── 3. A retried webhook writes one row, not two ──────────────────────── */
  const retry = await recordInbound(emma.id, 'May I ask why there are two pens?', 'emmalouise123@example.test', 'rcv_001');
  check('the retry is accepted', Boolean(retry), true);
  check('the retry did not write a second row', retry.created, false);
  const count = (await sql.query(
    `SELECT count(*)::int AS n FROM ${T}_replies WHERE provider_message_id = 'rcv_001'`))[0];
  check('one email, one row', count.n, 1);

  const wrongThread = await recordInbound(closed.id, 'same email again', 'closed@example.test', 'rcv_001');
  check('the same email cannot be filed on a second enquiry', wrongThread, null);

  /* ── 4. Matched to the conversation it is answering ────────────────────── */
  const stranger = await findEnquiryFor('nobody@example.test');
  check('an email from a stranger matches nothing', stranger, null);

  const olderOpen = (await sql.query(
    `INSERT INTO ${T} (name, email, message, status, created_at) VALUES ($1,$2,$3,'new', now() - interval '9 days') RETURNING *`,
    ['Two Threads', 'two@example.test', 'first question']))[0];
  const newerOpen = (await sql.query(
    `INSERT INTO ${T} (name, email, message, status) VALUES ($1,$2,$3,'new') RETURNING *`,
    ['Two Threads', 'two@example.test', 'second question']))[0];
  const matched = await findEnquiryFor('  TWO@example.test  ');
  check('the newest open conversation wins, whatever case they typed', matched.id, newerOpen.id);
  check('the older open one is not the match', matched.id !== olderOpen.id, true);

  await sql.query(
    `INSERT INTO ${T} (name, email, message, status, updated_at) VALUES ($1,$2,$3,'closed', now() - interval '5 days')`,
    ['Recently Closed', 'recent@example.test', 'sorted, thanks']);
  const recent = await findEnquiryFor('recent@example.test');
  check('a recently closed conversation is still the right home', Boolean(recent), true);

  await sql.query(
    `INSERT INTO ${T} (name, email, message, status, updated_at) VALUES ($1,$2,$3,'closed', now() - interval '400 days')`,
    ['Long Closed', 'ancient@example.test', 'from last year']);
  const ancient = await findEnquiryFor('ancient@example.test');
  check('a year-old closed conversation is not guessed at', ancient, null);

  /* ── The shipped code says the same thing as what was just proved ──────── */
  const enquiries = await readFile(new URL('../src/lib/db/enquiries.ts', import.meta.url), 'utf8');
  check('the live code reopens real questions and closes acknowledgements', /closeAsAcknowledged[\s\S]{0,1200}SET status = CASE WHEN/.test(enquiries), true);
  check('the live code marks the reply as inbound', /provider_message_id, direction, inbound_attachments\)[\s\S]{0,200}'in'/.test(enquiries), true);
  check('the live code adds the column itself', /ADD COLUMN IF NOT EXISTS direction/.test(enquiries), true);
  check('the live code orders open conversations first', /ORDER BY \(status = 'closed'\), created_at DESC/.test(enquiries), true);

  const webhook = await readFile(new URL('../src/app/api/webhooks/resend-inbound/route.ts', import.meta.url), 'utf8');
  check('the webhook attaches the reply to an enquiry', /recordInboundEnquiryReply/.test(webhook), true);
  check('the webhook does not alert staff for a finished acknowledgement', /if \(newlyRecorded && !autoClosedAcknowledgement\)/.test(webhook), true);
  check('the webhook opens a case for a direct email', /createInboundEmailEnquiry/.test(webhook), true);

  // A new direct email uses the received-email id, so parallel webhook retries
  // cannot create two dashboard cases, even before either caller sees the other.
  await sql.query(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS inbound_message_id TEXT`);
  await sql.query(`CREATE UNIQUE INDEX ${T}_inbound_message_id ON ${T} (inbound_message_id) WHERE inbound_message_id IS NOT NULL`);
  const firstDirect = await sql.query(`
    INSERT INTO ${T} (name, email, message, inbound_message_id)
    VALUES ('Adam', 'adam@example.test', 'Wrong item', 'received-123')
    ON CONFLICT (inbound_message_id) WHERE inbound_message_id IS NOT NULL DO NOTHING
    RETURNING id`);
  const retriedDirect = await sql.query(`
    INSERT INTO ${T} (name, email, message, inbound_message_id)
    VALUES ('Adam', 'adam@example.test', 'Wrong item', 'received-123')
    ON CONFLICT (inbound_message_id) WHERE inbound_message_id IS NOT NULL DO NOTHING
    RETURNING id`);
  check('first direct email opens a dashboard case', firstDirect.length, 1);
  check('retry opens no second case', retriedDirect.length, 0);

  const manual = await readFile(
    new URL('../src/app/api/admin/enquiries/[id]/record-customer-reply/route.ts', import.meta.url), 'utf8');
  check('the paste-in route cannot email anyone', /new Resend|emails\.send|sendEmail/.test(manual), false);
  check('the paste-in route takes the address from the record', /fromAddress: enquiry\.email/.test(manual), true);

  const draft = await readFile(
    new URL('../src/app/api/admin/enquiries/[id]/draft/route.ts', import.meta.url), 'utf8');
  check('the automatic draft answers their latest message',
    /findLatestCustomerReply[\s\S]{0,400}const question =/.test(draft), true);
}

try {
  await run();
} finally {
  await sql.query(`DROP TABLE IF EXISTS ${T}_replies`);
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
console.log('  Scratch tables dropped. This proves the SQL, not that production has been migrated.\n');
process.exit(failed ? 1 : 0);
