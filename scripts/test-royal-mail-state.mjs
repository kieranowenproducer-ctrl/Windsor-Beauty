// Prove what the Royal Mail button says, and what it must never say (task d912f632).
//
//   npm run test:royal-mail-state
//
// Pure logic, no network. Runs the real describeParcelState from src/lib/royalMail.ts.
//
// THE WHOLE POINT OF THIS FILE. Kieran asked for a button telling him a parcel had been delivered.
// It cannot: this shop talks to Royal Mail's Click & Drop, which is a despatch system and returns
// no delivery status at all, and their separate Tracking API refused this shop's key. So the button
// reports the two things Royal Mail genuinely knows, and the danger is that somebody later "tidies"
// the wording into something that sounds like delivery. A tracking feature that quietly guesses is
// worse than none, because it gets believed and a customer gets told a parcel arrived when nobody
// knows that. These checks are that line, written down.
import { describeParcelState } from '../src/lib/royalMail.ts';

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  if (actual === expected) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected ${JSON.stringify(expected)}\n             got      ${JSON.stringify(actual)}`); }
}
function expectTrue(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

console.log('\n=== What the Royal Mail button says ===\n');

const NOTHING = { printedOn: null, shippedOn: null };
const PRINTED = { printedOn: '2026-09-12T12:42:19Z', shippedOn: null };
const SHIPPED = { printedOn: '2026-09-12T12:42:19Z', shippedOn: '2026-09-12T14:43:06Z' };

check('Royal Mail has the order but no label yet', describeParcelState(NOTHING), 'Royal Mail has the order, but has not printed a label yet.');
check('label printed, parcel not taken', describeParcelState(PRINTED), 'Royal Mail has printed the label, but has not taken the parcel yet.');
check('parcel taken', describeParcelState(SHIPPED), 'Royal Mail has the parcel.');
check('Royal Mail has never heard of it', describeParcelState(null), 'Royal Mail has no record of this one.');

// A parcel shipped with no printed date still counts as taken. Real Click & Drop data is untidy and
// the later fact is the stronger one.
check('taken, though no print date came back', describeParcelState({ printedOn: null, shippedOn: '2026-09-12T14:43:06Z' }), 'Royal Mail has the parcel.');

console.log('\n=== The line it must never cross ===\n');

const everySentence = [NOTHING, PRINTED, SHIPPED, null, { printedOn: null, shippedOn: '2026-09-12T14:43:06Z' }]
  .map((state) => describeParcelState(state));

// "Delivered", "in transit", "on its way", "arrived" are all claims about something Royal Mail has
// not told us. None may appear in any answer this produces.
const banned = ['deliver', 'in transit', 'on its way', 'arrived', 'out for delivery', 'received by'];
for (const word of banned) {
  const offenders = everySentence.filter((sentence) => sentence.toLowerCase().includes(word));
  expectTrue(
    `never says "${word}"`,
    offenders.length === 0,
    offenders.length ? `found in: ${JSON.stringify(offenders)}` : '',
  );
}

// And every sentence names Royal Mail, so nobody can mistake it for the shop's own status, which
// sits directly above it on the row and can legitimately disagree.
expectTrue('every sentence says who it came from', everySentence.every((s) => s.includes('Royal Mail')));

// Nothing is ever blank. A blank where a status should be reads as a fault.
expectTrue('never blank', everySentence.every((s) => s.trim().length > 10));

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
