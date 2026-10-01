// The 10% welcome code is once per customer, and only for the customer it was issued to.
//
//   npm run test:welcome-discount
//
// WHY THIS FILE EXISTS. On 16 September 2026 Kieran asked for a check on people opening a second
// account to get the welcome discount twice. Reading the discount code to answer that turned up two
// faults which gave somebody a second, third and hundredth 10% WITHOUT opening any second account:
//
//   1. A code that had been used still took 10% off. It was marked 'used' correctly, but the price
//      at order placement was recomputed through a lookup that ignored the status. Same code, every
//      order, forever.
//   2. A code was not tied to its owner, so any signed-in member could type in somebody else's.
//
// Each check below fails if either fault comes back. That is the point of the file: the faults were
// both invisible, both survived an audit that fixed the same class of bug next door, and nothing
// anywhere would have noticed them returning.
import { canSpendWelcomeCode } from '../src/lib/welcomeDiscount.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

const OWNER = 'jane@example.com';
const active = { email: OWNER, status: 'active' };
const used = { email: OWNER, status: 'used' };

console.log('\n=== The person it was issued to, on their first order ===\n');

const first = canSpendWelcomeCode(active, OWNER);
check('the owner may spend their own unused code', first.allowed === true);
check('and is told nothing, because nothing is wrong', first.message === null);

console.log('\n=== FAULT 1: a code that has already been used ===\n');

const again = canSpendWelcomeCode(used, OWNER);
check('the owner may NOT spend it a second time', again.allowed === false,
  'This is the fault that gave 10% off every order forever.');
check('and the reason says so', again.reason === 'already-used');
check('the customer is told plainly why', /already been used/.test(again.message ?? ''), again.message ?? '');
check('and told it is one per customer', /one per customer/.test(again.message ?? ''), again.message ?? '');

console.log('\n=== FAULT 2: somebody else\'s code ===\n');

const thief = canSpendWelcomeCode(active, 'bob@example.com');
check('another member may NOT spend it', thief.allowed === false,
  'This is the fault that let any account spend anybody else\'s code.');
check('and the reason says so', thief.reason === 'belongs-to-someone-else');
check('the customer is told to use their own', /your own email address/.test(thief.message ?? ''), thief.message ?? '');

// Telling one customer another customer's email address would be a worse fault than the one being
// fixed, so the refusal must never name the owner.
check('the refusal NEVER reveals whose code it is',
  !(thief.message ?? '').includes(OWNER), thief.message ?? '');

// And a used code belonging to someone else is refused too, not accidentally allowed by the order
// the two checks happen to run in.
check('somebody else\'s USED code is refused as well',
  canSpendWelcomeCode(used, 'bob@example.com').allowed === false);

console.log('\n=== Not signed in ===\n');

const guest = canSpendWelcomeCode(active, null);
check('a code cannot be spent with no account', guest.allowed === false);
check('and the reason says so', guest.reason === 'not-signed-in');
check('they are asked to log in', /log in|create an account/i.test(guest.message ?? ''), guest.message ?? '');
check('an empty email is treated as not signed in', canSpendWelcomeCode(active, '').allowed === false);

console.log('\n=== Spacing and capitals never decide who owns a code ===\n');

// The email on the code row and the email on the account are both typed by people at different
// times. A capital letter must not hand somebody a second discount, and must not refuse a real one.
for (const variant of ['JANE@EXAMPLE.COM', ' jane@example.com ', 'Jane@Example.com']) {
  check(`"${variant}" is recognised as the owner`,
    canSpendWelcomeCode(active, variant).allowed === true);
}
check('a genuinely different address is still refused',
  canSpendWelcomeCode(active, 'jane@example.co.uk').allowed === false,
  'Only the exact address, once spacing and capitals are set aside.');
check('a lookalike with extra characters is refused',
  canSpendWelcomeCode(active, 'xjane@example.com').allowed === false);

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
