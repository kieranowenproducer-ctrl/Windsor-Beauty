// Prove the customer email history SQL (task b2084076) against a real
// Postgres, on a real copy of the customer_emails schema.
//
//   node scripts/test-customer-emails-sql.mjs
//
// Same shape as test-handover-sql.mjs and for the same reason: the local
// Windsor Glow credential is agent_ro (read only), so the insert/dedupe/
// match rules cannot be exercised against the live table from here. This
// builds a throwaway copy of the table in the one database this machine can
// write to, runs the real rules over it, and drops it. It proves the SQL,
// not that production has been migrated (ensureSchema does that on deploy).
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';

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
  console.error('AI_COSTS_DATABASE_URL not found — cannot run the scratch test.');
  process.exit(1);
}
const sql = neon(url, { fetchOptions: { cache: 'no-store' } });

const T = 'scratch_b2084076_customer_emails';
let failures = 0;
function check(name, ok) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}

// ─── The webhook signature scheme (same algorithm as src/lib/replyCapture.ts) ──
function verify({ secret, id, timestamp, signatureHeader, payload, nowMs }) {
  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs((nowMs ?? Date.now()) - tsMs) > 5 * 60 * 1000) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest();
  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const offered = Buffer.from(sig, 'base64');
    if (offered.length === expected.length && timingSafeEqual(offered, expected)) return true;
  }
  return false;
}

function sign(secret, id, timestamp, payload) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return 'v1,' + createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
}

try {
  console.log('Signature scheme:');
  const secret = 'whsec_' + Buffer.from('a test signing key 32 bytes long').toString('base64');
  const ts = String(Math.floor(Date.now() / 1000));
  const payload = '{"type":"email.received","data":{"email_id":"x"}}';
  const good = sign(secret, 'msg_1', ts, payload);
  check('a correctly signed payload verifies', verify({ secret, id: 'msg_1', timestamp: ts, signatureHeader: good, payload }));
  check('a tampered payload is refused', !verify({ secret, id: 'msg_1', timestamp: ts, signatureHeader: good, payload: payload + ' ' }));
  check('a wrong key is refused', !verify({ secret: 'whsec_' + Buffer.from('a DIFFERENT key also 32 bytes!!').toString('base64'), id: 'msg_1', timestamp: ts, signatureHeader: good, payload }));
  const staleTs = String(Math.floor(Date.now() / 1000) - 600);
  check('a 10-minute-old timestamp is refused', !verify({ secret, id: 'msg_1', timestamp: staleTs, signatureHeader: sign(secret, 'msg_1', staleTs, payload), payload }));

  console.log('Storage rules (scratch table):');
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
  await sql.query(`
    CREATE TABLE ${T} (
      id SERIAL PRIMARY KEY,
      direction TEXT NOT NULL,
      customer_id INTEGER,
      email TEXT NOT NULL,
      our_address TEXT,
      subject TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      provider_id TEXT,
      order_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  // A sent message, typed to an address before that person registered.
  await sql.query(
    `INSERT INTO ${T} (direction, customer_id, email, our_address, subject, body_text) VALUES ($1,$2,$3,$4,$5,$6)`,
    ['sent', null, 'callum@example.com', 'sales@windsorglow.com', 'A message for you', 'About your order.']
  );
  // A captured reply, matched to customer 42, delivered twice by a webhook retry.
  const insertReply = async () => {
    const existing = await sql.query(`SELECT id FROM ${T} WHERE provider_id = $1 LIMIT 1`, ['re_abc']);
    if (existing.length) return false;
    await sql.query(
      `INSERT INTO ${T} (direction, customer_id, email, our_address, subject, body_text, provider_id, order_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['received', 42, 'Callum@Example.com'.toLowerCase(), 'reply@inbound.windsorglow.com', 'Re: A message for you', 'PAG Gym would be perfect.', 're_abc', 'WG-GCZBKK']
    );
    return true;
  };
  check('first webhook delivery stores the reply', await insertReply() === true);
  check('a webhook retry with the same provider id stores nothing', await insertReply() === false);
  const all = await sql.query(`SELECT * FROM ${T}`);
  check('exactly two rows exist after the retry', all.length === 2);

  // The customer-page lookup: by customer id OR by address, so the
  // pre-registration 'sent' row appears once the person has an account.
  const forCustomer = await sql.query(
    `SELECT direction FROM ${T} WHERE customer_id = $1 OR lower(email) = $2 ORDER BY created_at`,
    [42, 'callum@example.com']
  );
  check('the customer page sees both directions', forCustomer.length === 2 && forCustomer[0].direction === 'sent' && forCustomer[1].direction === 'received');

  const ref = await sql.query(`SELECT order_ref FROM ${T} WHERE provider_id = 're_abc'`);
  check('the order reference travelled with the reply', ref[0].order_ref === 'WG-GCZBKK');
} finally {
  await sql.query(`DROP TABLE IF EXISTS ${T}`).catch(() => {});
}

console.log(failures === 0 ? '\nAll checks passed. Scratch table dropped. This proves the SQL, not that production has been migrated.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
