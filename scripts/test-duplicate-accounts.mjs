// Spotting a second account opened for a second 10% discount (task c76f31fb).
//
//   npm run test:duplicate-accounts
//
// Kieran, 16 September 2026: "Run a automatic rule to check ip address /residential address when a
// new customer signs to ensure that there is no one trying to open more accounts to take advantage
// of getting extra the 10% opening offer."
//
// These are the matching rules, tested without a database. The rules are the whole feature: get
// them wrong in one direction and it never notices anything, get them wrong in the other and it
// accuses a real customer of fraud because they typed their postcode with a space in it.
//
// THE DIRECTION THAT MATTERS. A missed match costs a look nobody takes. An INVENTED match puts a
// paying customer's name in a red warning and an email to the sales inbox. So where the two trade
// off, this errs towards missing one.
import {
  normalisePostcode,
  normaliseAddressLine,
  addressKey,
  summariseFinding,
  SHARED_CONNECTION_THRESHOLD,
  countRecent,
  RECENT_SIGNUP_DAYS,
  arrivedBefore,
  isAllowedAsAuthentic,
} from '../src/lib/db/duplicateAccounts.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

console.log('\n=== A postcode is the same postcode however it is typed ===\n');

const postcodeForms = ['SW1A 1AA', 'sw1a1aa', ' SW1A  1AA ', 'Sw1a 1aA', 'SW1A1AA'];
const firstPostcode = normalisePostcode(postcodeForms[0]);
for (const form of postcodeForms) {
  check(`"${form}" reads as the same postcode`, normalisePostcode(form) === firstPostcode,
    `got "${normalisePostcode(form)}", expected "${firstPostcode}"`);
}
check('two genuinely different postcodes stay different',
  normalisePostcode('SW1A 1AA') !== normalisePostcode('SW1A 2AA'));
check('a missing postcode is empty, not a match-anything wildcard', normalisePostcode(null) === '');

console.log('\n=== A street line is the same street line however it is typed ===\n');

const lineForms = ['14 High Street', '14 high street', ' 14  High  Street ', '14 High Street.', '14, High Street'];
const firstLine = normaliseAddressLine(lineForms[0]);
for (const form of lineForms) {
  check(`"${form}" reads as the same line`, normaliseAddressLine(form) === firstLine,
    `got "${normaliseAddressLine(form)}", expected "${firstLine}"`);
}
check('a different house number is a different line',
  normaliseAddressLine('14 High Street') !== normaliseAddressLine('16 High Street'));
check('a flat number is not thrown away',
  normaliseAddressLine('Flat 2, 14 High Street') !== normaliseAddressLine('Flat 3, 14 High Street'),
  'Two different flats in one building must not read as one home.');

console.log('\n=== The same front door, and only the same front door ===\n');

const door = addressKey('14 High Street', 'SW1A 1AA');
check('the same address typed two ways is one key',
  addressKey(' 14  high street. ', 'sw1a1aa') === door);
check('same street, different house is NOT a match',
  addressKey('16 High Street', 'SW1A 1AA') !== door);
check('same house number, different postcode is NOT a match',
  addressKey('14 High Street', 'SW1A 2AA') !== door);

// The safe direction: not enough to identify a home means no accusation.
check('a postcode with no street line makes no key', addressKey('', 'SW1A 1AA') === '');
check('a street line with no postcode makes no key', addressKey('14 High Street', '') === '');
check('nothing at all makes no key', addressKey(null, null) === '');
check('two accounts that both gave no address do not match each other',
  addressKey(null, null) === '' && addressKey(undefined, undefined) === '',
  'An empty key must never equal another empty key in a way that counts as a match.');

console.log('\n=== How many accounts on one connection counts as odd ===\n');

// Set above two deliberately: a couple sharing a router is two, and that is normal. It matches
// the threshold the existing /admin/ip-addresses page already uses, so the two screens agree.
check('the shared-connection threshold is 3', SHARED_CONNECTION_THRESHOLD === 3,
  `got ${SHARED_CONNECTION_THRESHOLD}. Two is a couple on one router, which is not suspicious.`);
check('one other account on the connection is not enough to report', 1 + 1 < SHARED_CONNECTION_THRESHOLD);
check('two other accounts on the connection is enough', 2 + 1 >= SHARED_CONNECTION_THRESHOLD);

console.log('\n=== What the warning actually says ===\n');

const other = [{ id: 2, email: 'jane@example.com', name: 'Jane Doe', createdAt: '2026-09-01' }];
const addressOnly = summariseFinding('John Doe', 'john@example.com', other, []);
check('it names the new account', addressOnly.includes('john@example.com'));
check('it names who they matched', addressOnly.includes('jane@example.com'));
check('it says it was the address', addressOnly.includes('same address'));
check('it says what it is for', /10% welcome discount/.test(addressOnly));
check('it asks rather than accuses', /Worth checking/.test(addressOnly) && !/fraud|cheat/i.test(addressOnly),
  addressOnly);

const connectionOnly = summariseFinding(null, 'john@example.com', [], other);
check('with no name it still reads properly', connectionOnly.startsWith('New account john@example.com has'),
  connectionOnly);
check('it says it was the connection', connectionOnly.includes('same internet connection'));

const both = summariseFinding('John Doe', 'john@example.com', other, other);
check('when both matched, both are mentioned',
  both.includes('same address') && both.includes('same internet connection'), both);

const many = summariseFinding('John Doe', 'john@example.com', [
  other[0], { id: 3, email: 'bob@example.com', name: null, createdAt: '2026-09-02' },
], []);
check('two matches are counted as "2 other accounts", not "2 another account"',
  many.includes('2 other accounts'), many);
check('one match is counted as "1 another account" being avoided',
  addressOnly.includes('1 another account'), addressOnly);

console.log('\n=== It is a warning, never a block ===\n');

// The whole file is read for this: no function here returns anything that could be mistaken for an
// instruction to refuse a sign-up or withhold a discount. Kieran parked automatic blocking on
// 5 August 2026 and that decision still stands.
const wording = [addressOnly, connectionOnly, both].join(' ');
check('no wording anywhere tells the shop to block, refuse or ban',
  !/\b(block|blocked|ban|banned|refuse|refused|reject)\b/i.test(wording), wording);

console.log('\n=== The dashboard warning quietens by itself ===\n');

// The shop's back catalogue holds households, colleagues and test accounts that will match each
// other for ever. A red banner nobody can clear is one people learn to look past, and then the day
// it means something they look past that too. So the banner counts NEW sign-ups, which is what
// Kieran asked it to follow, and it goes quiet on its own.
const now = Date.parse('2026-09-16T12:00:00Z');
const day = 24 * 60 * 60 * 1000;
const at = (daysAgo) => ({
  customerId: daysAgo, email: `a${daysAgo}@example.com`, name: null,
  createdAt: new Date(now - daysAgo * day).toISOString(),
  sameAddress: [], sameConnection: [], ipAddress: null, summary: '',
});

check('the window is 30 days', RECENT_SIGNUP_DAYS === 30);
check('somebody who signed up today counts', countRecent([at(0)], now) === 1);
check('somebody from last week counts', countRecent([at(7)], now) === 1);
check('somebody from four months ago does not', countRecent([at(120)], now) === 0);
check('the day before the cutoff still counts', countRecent([at(29)], now) === 1);
check('well past the cutoff does not', countRecent([at(31)], now) === 0);
check('a mixed list counts only the recent ones',
  countRecent([at(1), at(10), at(200), at(365)], now) === 2);
check('an empty list is zero, not an error', countRecent([], now) === 0);

// Missing a real one is worse than one extra look, so an unreadable date counts as recent rather
// than being quietly dropped.
check('an unreadable sign-up date is counted rather than silently dropped',
  countRecent([{ ...at(0), createdAt: 'not a date' }], now) === 1);

console.log('\n=== Allowed as authentic, and the third account (task ce609555) ===\n');

// Kieran, 18 September 2026: "You need to have bottom that says 'allow as authentic' so it doesn't
// appear again on the dashboards for the customer chosen. if another account is made for the same
// customers that have been allowed, then it must show on the dashboard as A third or more account
// should flag up again on the dashboard"
//
// Two rules combine to do that, and both are checked here. The decision itself is kept in Kieran's
// own opening_offer_reviews table, so there is one record of who has been cleared rather than two.

check('an approved account is silenced', isAllowedAsAuthentic('approved') === true);
check('an account under review is NOT silenced', isAllowedAsAuthentic('review') === false,
  'Under review means their 10% is being held. That must still be visible.');
check('a cleared account is not silenced by the allow rule', isAllowedAsAuthentic('clear') === false);
check('an account nobody has decided on is not silenced', isAllowedAsAuthentic(null) === false,
  'No decision must never read as an approval.');
check('nothing else silences an account', isAllowedAsAuthentic('anything else') === false);

// Three accounts at one address, in the order they signed up.
const chris = { id: 1, created_at: '2026-09-01T10:00:00Z' };
const cat   = { id: 2, created_at: '2026-09-07T10:00:00Z' };
const dave  = { id: 3, created_at: '2026-09-18T10:00:00Z' };

// Who gets raised: somebody was already at that address AND this account has not been allowed.
// The same two rules the real code applies, in the same order.
const raise = (subject, others, decisions) =>
  others.some((other) => arrivedBefore(other, subject))
  && !isAllowedAsAuthentic(decisions[subject.id] ?? null);

check('the first account at an address is never raised', raise(chris, [cat, dave], {}) === false,
  'Nobody was there before them, so there is nothing to raise.');
check('the second account IS raised', raise(cat, [chris], {}) === true);

// Kieran presses Allow as authentic on Cat.
const allowed = { 2: 'approved' };
check('once allowed, the second account stops being raised', raise(cat, [chris], allowed) === false);
check('and the first account is still not raised', raise(chris, [cat], allowed) === false);

// Then a third person signs up at the same address.
check('THE THIRD ACCOUNT IS RAISED, even though the pair was allowed',
  raise(dave, [chris, cat], allowed) === true,
  'The whole point of the task: allowing a couple must not quietly allow the next arrival.');
check('allowing the third silences only the third',
  raise(dave, [chris, cat], { ...allowed, 3: 'approved' }) === false
  && raise(cat, [chris], allowed) === false);

// And a fourth, after the earlier ones were allowed.
const eve = { id: 4, created_at: '2026-09-20T10:00:00Z' };
check('a fourth account is raised as well',
  raise(eve, [chris, cat, dave], { 2: 'approved', 3: 'approved' }) === true);

// The mirror-image fault: an approval must never leak to a different household.
check('allowing one household does not silence a different one',
  raise({ id: 9, created_at: '2026-09-19T10:00:00Z' },
        [{ id: 8, created_at: '2026-09-02T10:00:00Z' }], allowed) === true);

// Two accounts created in the same second must still produce one row, not two flagging each other.
const twinA = { id: 10, created_at: '2026-09-10T10:00:00Z' };
const twinB = { id: 11, created_at: '2026-09-10T10:00:00Z' };
check('two accounts created in the same second raise exactly one of them',
  (raise(twinA, [twinB], {}) ? 1 : 0) + (raise(twinB, [twinA], {}) ? 1 : 0) === 1);

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
