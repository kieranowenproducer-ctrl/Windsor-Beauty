// What the customer confirmed before paying is stored on the order, and an order without it is
// refused (Samuel, 10 September 2026: "Storing both confirmations against the order please").
//
//   npm run test:checkout-confirmations
//
// WHAT MATTERS HERE, IN ORDER OF HOW BADLY IT WOULD HURT.
//
//   1. An order that exists but cannot say what its customer confirmed. That is the situation the
//      whole change was made to prevent, and it is the one that only shows up months later when
//      somebody actually asks.
//   2. A record that says a customer agreed to a sentence they never saw. That happens the day the
//      wording changes, unless the words are stored WITH the tick. So the sentences are stored.
//   3. A tick that only exists when the browser cooperates. The Pay button greys out until both
//      boxes are ticked, and that is a courtesy, not a control: the endpoint is a plain POST.
//      So the server refuses the order too.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import {
  CHECKOUT_CONFIRMATIONS,
  checkoutConfirmationRecord,
  isConfirmedAtCheckout,
} from '../src/lib/complianceConfirmations.ts';

const ROOT = fileURLToPath(new URL('../src/', import.meta.url));

/* ── The record itself ───────────────────────────────────────────────────────────────────────── */
const record = checkoutConfirmationRecord();
assert.equal(record.researchUse, true);
assert.equal(record.terms, true);
assert.deepEqual(record.statements, CHECKOUT_CONFIRMATIONS.map(c => c.label),
  'the record must carry the exact sentences shown, not just two booleans');
assert.ok(!Number.isNaN(Date.parse(record.confirmedAt)), 'confirmedAt must be a real time');
assert.ok(isConfirmedAtCheckout(record));

/* A record is only complete when both were genuinely ticked and the wording came with it. */
assert.equal(isConfirmedAtCheckout(null), false, 'a missing record is not a confirmation');
assert.equal(isConfirmedAtCheckout({ researchUse: true, terms: false, statements: record.statements, confirmedAt: record.confirmedAt }), false);
assert.equal(isConfirmedAtCheckout({ researchUse: true, terms: true, statements: [], confirmedAt: record.confirmedAt }), false,
  'ticks with no wording are not a record of anything');

/* THE ONE THAT PROVES POINT 2. A stored record keeps its own words even after the live wording
   changes underneath it, which is exactly what happens the first time somebody edits a sentence. */
const storedLastYear = {
  researchUse: true,
  terms: true,
  statements: ['I confirm I am over 18.', 'I agree to the terms.'],
  confirmedAt: '2025-11-02T09:15:00.000Z',
};
assert.notDeepEqual(storedLastYear.statements, record.statements);
assert.equal(storedLastYear.statements[0], 'I confirm I am over 18.',
  'an older order must still read as what THAT customer agreed to');

/* ── The server refuses an order without them ────────────────────────────────────────────────── */
const route = await readFile(ROOT + 'app/api/checkout/place-order/route.ts', 'utf8');
assert.match(route, /confirmedResearchUse = body\?\.confirmations\?\.researchUse === true/);
assert.match(route, /confirmedTerms = body\?\.confirmations\?\.terms === true/);
assert.match(route, /if \(!confirmedResearchUse \|\| !confirmedTerms\) \{[\s\S]{0,300}status: 400/,
  'the order must be refused, not saved with a blank record');
/* The record is built on the server from this deployment's own wording. If the browser could send
   the sentences, the thing being agreed with would be writing the record of the agreement. */
assert.match(route, /checkoutConfirmations: checkoutConfirmationRecord\(\)/);
assert.doesNotMatch(route, /statements:\s*body/, 'the browser must not be able to supply the wording');

/* ── It is actually stored, and it is actually shown ─────────────────────────────────────────── */
const db = await readFile(ROOT + 'lib/db.ts', 'utf8');
assert.match(db, /checkout_confirmations/, 'createOrder does not write the column');
assert.match(db, /params\.checkoutConfirmations \? JSON\.stringify\(params\.checkoutConfirmations\) : null/,
  'an order with no confirmations must store NULL, meaning not captured, not an empty object');

const schema = await readFile(ROOT + 'lib/db/schema-parts/customers-and-orders.ts', 'utf8');
assert.match(schema, /ADD COLUMN IF NOT EXISTS checkout_confirmations JSONB/);

const panel = await readFile(ROOT + 'app/admin/orders/OrderDetailPanel.tsx', 'utf8');
assert.match(panel, /Confirmed before paying/, 'the record is stored but never shown to anybody');
assert.match(panel, /Not recorded/, 'an order without a record must say so rather than look confirmed');

const checkout = await readFile(ROOT + 'app/checkout/page.tsx', 'utf8');
assert.match(checkout, /^\s*confirmations,$/m, 'checkout does not send what was ticked');

/* ── The SQL, against a real Postgres ────────────────────────────────────────────────────────── */
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf-8').replace(/^﻿/, '').split(/\r?\n/)) {
        const at = line.indexOf('=');
        if (at > 0 && !line.trim().startsWith('#') && line.slice(0, at).trim() === name) return line.slice(at + 1).trim();
      }
    } catch { /* next */ }
  }
  return undefined;
}

// The Windsor Glow credential here is read only, so the column behaviour is proved on a throwaway
// copy in the one database this machine can write to, the same way the handover SQL is.
const url = env('AI_COSTS_DATABASE_URL');
if (!url) {
  console.log('\n  No writable database available, so the storage was not exercised. Not a pass.\n');
  process.exit(1);
}
const sql = neon(url);
const T = 'zz_confirm_probe';
try {
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
  await sql.query(`CREATE TABLE ${T} (id SERIAL PRIMARY KEY, order_number TEXT NOT NULL)`);
  // Added exactly as ensureSchema adds it to the real table.
  await sql.query(`ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS checkout_confirmations JSONB`);

  await sql.query(`INSERT INTO ${T} (order_number, checkout_confirmations) VALUES ($1, $2)`,
    ['WG-CONFIRMED', JSON.stringify(record)]);
  // An order made by the invoice system, where nobody ticked anything.
  await sql.query(`INSERT INTO ${T} (order_number) VALUES ($1)`, ['WG-INVOICE']);

  const saved = (await sql.query(`SELECT checkout_confirmations FROM ${T} WHERE order_number = 'WG-CONFIRMED'`))[0];
  assert.deepEqual(saved.checkout_confirmations.statements, record.statements,
    'the sentences did not survive the round trip through the database');
  assert.equal(saved.checkout_confirmations.researchUse, true);
  assert.equal(saved.checkout_confirmations.terms, true);
  assert.equal(isConfirmedAtCheckout(saved.checkout_confirmations), true);

  const invoice = (await sql.query(`SELECT checkout_confirmations FROM ${T} WHERE order_number = 'WG-INVOICE'`))[0];
  assert.equal(invoice.checkout_confirmations, null,
    'an order nobody ticked anything for must read as not captured');
  assert.equal(isConfirmedAtCheckout(invoice.checkout_confirmations), false);

  // The question this whole thing exists to answer, asked the way it would really be asked.
  const answered = await sql.query(
    `SELECT order_number FROM ${T} WHERE checkout_confirmations->>'researchUse' = 'true' ORDER BY order_number`);
  assert.deepEqual(answered.map(r => r.order_number), ['WG-CONFIRMED'],
    'could not ask the database which orders carry a confirmation');
} finally {
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
}

console.log('Checkout confirmation checks passed: stored with their wording, refused without them,');
console.log('shown on the order, and an order with none says so. Scratch table dropped.');
