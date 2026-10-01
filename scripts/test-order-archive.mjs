// Prove which orders go to Archived orders, and which must never (task 831a4461).
//
//   npm run test:order-archive
//
// Pure logic over data the shop already holds, so no database and no network. Runs the real
// orderArchiveState from src/lib/orderArchive.ts.
//
// THE DANGEROUS MISTAKE this guards against is an order that still needs doing quietly disappearing
// off the working list. Only a DELIVERED order archives itself. An order waiting on a label, in the
// post, or unpaid stays where Kieran can see it however old it is, and half these checks are that
// one rule from different angles.
import { orderArchiveState, ARCHIVE_AFTER_DAYS } from '../src/lib/orderArchive.ts';

const NOW = new Date('2026-09-12T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

let passed = 0;
let failed = 0;
function check(name, order, expected) {
  const got = orderArchiveState(order, NOW).archived;
  if (got === expected) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected archived=${expected}\n             got      archived=${got}`); }
}

console.log('\n=== What goes to Archived orders ===\n');

console.log(`  (the rule is ${ARCHIVE_AFTER_DAYS} days)\n`);

// Delivered and old enough: the whole point.
check('delivered 8 days ago', { status: 'delivered', deliveredAt: daysAgo(8) }, true);
check('delivered 30 days ago', { status: 'delivered', deliveredAt: daysAgo(30) }, true);

// Delivered but still recent: leave it where he can see it.
check('delivered yesterday', { status: 'delivered', deliveredAt: daysAgo(1) }, false);
check('delivered 6 days ago', { status: 'delivered', deliveredAt: daysAgo(6) }, false);
check('delivered exactly 7 days ago is not yet MORE than 7 days', { status: 'delivered', deliveredAt: daysAgo(7 - 0.01) }, false);

// NOTHING UNFINISHED EVER ARCHIVES ITSELF. However old it is.
check('waiting on a label, a year old', { status: 'awaiting_dispatch', createdAt: daysAgo(365) }, false);
check('dispatched a month ago but not marked delivered', { status: 'dispatched', dispatchedAt: daysAgo(30) }, false);
check('paid a year ago and never sent', { status: 'paid', paymentConfirmedAt: daysAgo(365) }, false);
check('never paid for, a year old', { status: 'awaiting_payment', createdAt: daysAgo(365) }, false);
check('cancelled a year ago', { status: 'cancelled', createdAt: daysAgo(365) }, false);
check('refunded a year ago', { status: 'refunded', createdAt: daysAgo(365) }, false);

// By hand beats everything, in both directions. That is what the button is for.
check('moved there by hand today, delivered only yesterday', { status: 'delivered', deliveredAt: daysAgo(1), archivedAt: daysAgo(0) }, true);
check('moved there by hand while still awaiting dispatch', { status: 'awaiting_dispatch', archivedAt: daysAgo(0), createdAt: daysAgo(1) }, true);
check('moved there by hand while unpaid', { status: 'awaiting_payment', archivedAt: daysAgo(0), createdAt: daysAgo(1) }, true);

// Orders delivered before the shop recorded a delivery date. The clock falls back to the most
// recent date that IS known, every one of which is before delivery, so it can only ever read as
// older than the truth and never younger. Nothing is written to the database to make this work.
check('no delivery date, dispatched 20 days ago', { status: 'delivered', dispatchedAt: daysAgo(20), createdAt: daysAgo(25) }, true);
check('no delivery date, paid 20 days ago', { status: 'delivered', paymentConfirmedAt: daysAgo(20), createdAt: daysAgo(25) }, true);
check('no delivery date, ordered 20 days ago', { status: 'delivered', createdAt: daysAgo(20) }, true);
check('no delivery date, but only ordered yesterday, so it stays', { status: 'delivered', createdAt: daysAgo(1) }, false);
check('no dates at all: stays put rather than guessing', { status: 'delivered' }, false);

// The real delivery date wins over the stand-ins whenever it exists, which is the point of
// recording it from now on.
check('delivered today, though it was dispatched 40 days ago', { status: 'delivered', deliveredAt: daysAgo(0), dispatchedAt: daysAgo(40) }, false);

function expect(name, actual, wanted) {
  if (actual === wanted) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected ${JSON.stringify(wanted)}\n             got      ${JSON.stringify(actual)}`); }
}

// The screen says WHY something is in the archive, so the two reasons have to be told apart.
expect('a hand-moved order says so', orderArchiveState({ status: 'delivered', deliveredAt: daysAgo(1), archivedAt: daysAgo(0) }, NOW).reason, 'by_hand');
expect('an old delivered order says so', orderArchiveState({ status: 'delivered', deliveredAt: daysAgo(20) }, NOW).reason, 'old');
expect('an order still in the list has no reason', orderArchiveState({ status: 'paid', createdAt: daysAgo(2) }, NOW).reason, null);

// And it is honest about a date it had to stand in for.
expect('a stand-in date is flagged as one', orderArchiveState({ status: 'delivered', createdAt: daysAgo(20) }, NOW).dateIsEstimated, true);
expect('a real delivery date is not flagged', orderArchiveState({ status: 'delivered', deliveredAt: daysAgo(20) }, NOW).dateIsEstimated, false);

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
