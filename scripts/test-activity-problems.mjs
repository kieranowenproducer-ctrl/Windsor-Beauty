// Prove what the dashboard does with a red "Problem" row, against a real Postgres.
//
//   npm run test:activity-problems
//
// WHY THIS EXISTS IN THIS SHAPE. The dashboard's Latest Activity feed grew a tick and a bin on
// every red row (task f95367d6): the tick files one away under "Already Dealt With" on System
// Health, the bin destroys it. The feed itself now leaves out anything already ticked off. The
// Windsor Beauty credential available locally is `agent_ro`, which genuinely refuses to write
// anything, so none of that can be exercised against the live table from here. The choice is
// between shipping a delete that has never been seen to delete, and exercising it against an
// identical table in a database this machine CAN write to. This does the second, the same way
// scripts/test-handover-sql.mjs does.
//
// A finished order's line can be cleared off the same list too (task 535c24f9), which is the
// other half of what is proved here, and the half with something genuinely dangerous in it: an
// order still waiting to be packed must NEVER be hideable, or a parcel is forgotten and a
// customer waits with no trace of why. That is checked explicitly below.
//
// It runs the REAL functions from src/lib/db.ts, not copies of their SQL. It proves the feed
// leaves out what has been dealt with while System Health keeps it; that the delete removes
// exactly one row, leaves its neighbours alone, and reports false the second time, which is what
// lets the API tell "removed" from "was not there"; and that clearing an order hides its line
// while the Orders screen goes on showing every order. It does not prove anything about the live
// Windsor Beauty database, and nothing here should be read that way.
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

// The one database this machine holds a writable credential for. Borrowed as a scratch pad only:
// the table it builds here is dropped at the end, and it refuses to run at all if a table of that
// name is already there, so it can never delete somebody else's data.
const url = env('AI_COSTS_DATABASE_URL');
if (!url) {
  console.log('\n  No writable database available, so the delete was not exercised.');
  console.log('  Set AI_COSTS_DATABASE_URL. Not treated as a pass.\n');
  process.exit(1);
}

const sql = neon(url);

const existing = await sql`
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('automation_failures', 'orders', 'invoices')
`;
if (existing.length > 0) {
  console.log('\n  A table this test builds already exists in the scratch database. Refusing to touch it.\n');
  process.exit(1);
}

// The module reads DATABASE_URL once, when it loads, so this has to be set before the import.
process.env.DATABASE_URL = url;
const {
  deleteAutomationFailure,
  listRecentAutomationFailures,
  listOpenAutomationFailures,
  listAllOrders,
  listOrdersForActivity,
  setOrderActivityCleared,
} = await import('../src/lib/db.ts');

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected ${JSON.stringify(expected)}\n             got      ${JSON.stringify(actual)}`); }
}

try {
  // The live shape, from src/lib/db.ts ensureSchema.
  await sql`
    CREATE TABLE automation_failures (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      order_number TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )
  `;
  const seeded = await sql`
    INSERT INTO automation_failures (category, message, resolved_at) VALUES
      ('visitor_tracking', 'A visitor page could not be saved.', now()),
      ('visitor_tracking', 'A visitor page could not be saved.', now()),
      ('fena_payment_not_completed', 'Someone tried to pay and their bank did not complete it.', NULL)
    RETURNING id
  `;
  const [first, second, third] = seeded.map(r => r.id);

  console.log('\n=== What the dashboard shows, and clearing one ===\n');

  check('three entries on the record to start with', (await listRecentAutomationFailures(50)).length, 3);

  // The dashboard feed. Two of the three above are ticked off as dealt with, and those are
  // exactly the ones that were still shouting in red on the real dashboard.
  const open = await listOpenAutomationFailures(50);
  check('the dashboard shows only what has not been dealt with', open.length, 1);
  check('and it is the open one', open.map(r => r.id), [third]);
  check('System Health still has all three', (await listRecentAutomationFailures(50)).length, 3);

  check('removing one reports that it removed something', await deleteAutomationFailure(first), true);
  const left = await listRecentAutomationFailures(50);
  check('two entries left', left.length, 2);
  check('the right one went', left.map(r => r.id).sort((a, b) => a - b), [second, third].sort((a, b) => a - b));

  // This is what lets the screen say "that entry is not there any more" instead of claiming a
  // success it did not have. Without it, a second press on a stale page would look like a delete.
  check('removing the same one again reports nothing removed', await deleteAutomationFailure(first), false);
  check('an id that never existed reports nothing removed', await deleteAutomationFailure(999999), false);

  // A ticked-off entry and an open one are both removable. "Dealt with" and "not worth keeping"
  // are different things, and the bin on System Health has to work on either.
  check('an open entry can be removed too', await deleteAutomationFailure(third), true);
  check('one entry left', (await listRecentAutomationFailures(50)).length, 1);

  // What the tick on the dashboard does. It must take the row off the dashboard and leave it on
  // the record, because "dealt with" is not "never happened".
  const [fresh] = (await sql`
    INSERT INTO automation_failures (category, message) VALUES ('dispatch', 'A dispatch did not go.')
    RETURNING id
  `).map(r => r.id);
  check('a new problem appears on the dashboard', (await listOpenAutomationFailures(50)).map(r => r.id), [fresh]);
  await sql`UPDATE automation_failures SET resolved_at = now() WHERE id = ${fresh}`;
  check('once dealt with it leaves the dashboard', (await listOpenAutomationFailures(50)).length, 0);
  check('but it is still on the record', (await listRecentAutomationFailures(50)).some(r => r.id === fresh), true);

  // ── Clearing a finished ORDER's line off the dashboard (task 535c24f9) ──
  //
  // The dangerous mistake this guards against is hiding an order somebody still has to post, or
  // hiding the order itself rather than its line. Both are checked below.
  console.log('\n=== Clearing a cancelled order off the dashboard ===\n');
  await sql`
    CREATE TABLE invoices (id SERIAL PRIMARY KEY, message TEXT, internal_notes TEXT, customer_notes TEXT, subject TEXT)
  `;
  await sql`
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      invoice_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT now(),
      payment_confirmed_at TIMESTAMPTZ
    )
  `;
  await sql`
    INSERT INTO orders (order_number, status) VALUES
      ('WB-CANCEL1', 'cancelled'),
      ('WB-FAILED1', 'payment_failed'),
      ('WB-TOPOST1', 'awaiting_dispatch')
  `;

  check('all three orders show to start with', (await listOrdersForActivity(50)).length, 3);
  check('a cancelled order can be cleared', await setOrderActivityCleared('WB-CANCEL1', true), true);
  check('it leaves the dashboard', (await listOrdersForActivity(50)).map(o => o.order_number).sort(), ['WB-FAILED1', 'WB-TOPOST1']);
  check('but the Orders screen still has all three', (await listAllOrders(50)).length, 3);

  // The one that matters most. An order waiting to be packed must never be hideable, or a parcel
  // gets forgotten and a customer is left waiting with no trace of why.
  check('an order still to be posted CANNOT be cleared', await setOrderActivityCleared('WB-TOPOST1', true), false);
  check('it is still on the dashboard', (await listOrdersForActivity(50)).some(o => o.order_number === 'WB-TOPOST1'), true);
  check('a failed payment can be cleared', await setOrderActivityCleared('WB-FAILED1', true), true);
  check('an order that does not exist reports nothing done', await setOrderActivityCleared('WB-NOPE99', true), false);

  // Undo. A mis-tap has to be reversible, and it must work even if the order's status has moved
  // on since, or a cleared order could be stuck off the list for good.
  check('undo puts it back', await setOrderActivityCleared('WB-CANCEL1', false), true);
  check('and it is on the dashboard again', (await listOrdersForActivity(50)).some(o => o.order_number === 'WB-CANCEL1'), true);
  await sql`UPDATE orders SET status = 'refunded' WHERE order_number = 'WB-FAILED1'`;
  check('undo works even after the status changed', await setOrderActivityCleared('WB-FAILED1', false), true);
} finally {
  await sql`DROP TABLE IF EXISTS automation_failures`;
  await sql`DROP TABLE IF EXISTS orders`;
  await sql`DROP TABLE IF EXISTS invoices`;
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
console.log('  Scratch table dropped. This proves the SQL, not that production has been migrated.\n');
process.exit(failed > 0 ? 1 : 0);
