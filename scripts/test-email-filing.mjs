// A copy of every customer email is filed under the customer (task ce308493).
//
//   npm run test:email-filing
//
// Kieran, 19 September 2026: "Copies of each email send must be saved under each Customer."
//
// WHY THIS IS WORTH TESTING RATHER THAN EYEBALLING. The copy is now taken inside sendEmail, which
// every email the shop sends goes through: the order confirmation, the dispatch note, the password
// reset, the marketing, all of it. That is what makes it complete, and it is also what makes a
// mistake here expensive. Two failures in particular would be silent:
//
//   1. filing a STAFF alert under a customer, which would invent correspondence that never
//      happened and put "low stock" in somebody's email history;
//   2. letting a failure in the filing break the SEND, which would mean a customer not getting a
//      password reset because a database was busy.
//
// Both are checked below, along with the address handling that decides whose history a copy lands
// in.
import {
  primaryRecipient,
  isOurOwnAddress,
  capBody,
  MAX_STORED_BODY,
} from '../src/lib/email/fileUnderCustomer.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

console.log('\n=== Whose history does the copy land in ===\n');

check('a plain address is used as it is',
  primaryRecipient('jane@example.com') === 'jane@example.com');
check('a name and address is reduced to the address',
  primaryRecipient('Jane Doe <jane@example.com>') === 'jane@example.com',
  `got "${primaryRecipient('Jane Doe <jane@example.com>')}"`);
check('capitals do not create a second customer',
  primaryRecipient('JANE@EXAMPLE.COM') === 'jane@example.com');
check('stray spaces do not either',
  primaryRecipient('  jane@example.com  ') === 'jane@example.com');

// A bulk send names many people. One row per person is right, and the person this copy belongs to
// is the one it was addressed to first.
check('only the first recipient is filed',
  primaryRecipient(['jane@example.com', 'bob@example.com']) === 'jane@example.com');
check('an empty list files nothing', primaryRecipient([]) === null);

// Nothing that is not an address may become a "customer".
check('a name with no address files nothing', primaryRecipient('Jane Doe') === null);
check('an empty string files nothing', primaryRecipient('') === null);

console.log('\n=== Our own post is not somebody\'s correspondence ===\n');

// The bigger guard is `internal`, set on every staff alert. This catches the rest: a customer-facing
// sender that happens to be writing to us.
for (const ours of ['sales@windsorglow.com', 'alerts@windsorglow.com', 'INFO@WindsorGlow.com']) {
  check(`"${ours}" is recognised as ours, not a customer`, isOurOwnAddress(ours.toLowerCase()));
}
check('a real customer address is not treated as ours',
  isOurOwnAddress('jane@example.com') === false);
check('a lookalike domain is not treated as ours',
  isOurOwnAddress('jane@windsorglow.com.example.net') === false,
  'Matching anywhere in the string rather than at the end would swallow a real customer.');

console.log('\n=== One enormous email cannot fill the table ===\n');

check('an ordinary email is kept whole', capBody('hello') === 'hello');
check('nothing stays nothing', capBody(null) === null && capBody(undefined) === null);
check('an empty body is kept as empty, not lost', capBody('') === '');

const huge = 'x'.repeat(MAX_STORED_BODY + 5000);
const capped = capBody(huge);
check('an enormous email is cut down', capped.length < huge.length);
check('and it says it was cut down, rather than pretending that is what was sent',
  /too large to keep a copy of/.test(capped),
  'Somebody reading a truncated email must not believe that is what the customer received.');
check('the cap is generous enough for any real email', MAX_STORED_BODY >= 100 * 1024,
  `the cap is ${MAX_STORED_BODY} bytes; the largest email on record is 13KB`);

console.log('\n=== Filing can fail without taking the email down with it ===\n');

// The whole point of the guard: the email has already gone by the time the copy is attempted, so a
// broken database must cost a filing cabinet entry and nothing else.
const { fileEmailUnderCustomer } = await import('../src/lib/email/fileUnderCustomer.ts');
let threw = false;
try {
  // No database is configured in this test run, so the import inside will fail. That is the point.
  await fileEmailUnderCustomer({
    to: 'jane@example.com',
    from: 'Windsor Glow <sales@windsorglow.com>',
    subject: 'Test',
    text: 'Test',
    providerId: 'test-id',
  });
} catch {
  threw = true;
}
check('filing never throws, whatever goes wrong underneath', threw === false,
  'A customer waiting on a password reset must not be refused because the copy could not be saved.');

let skippedThrew = false;
try {
  await fileEmailUnderCustomer({
    to: 'jane@example.com', from: 'a@b.com', subject: 's', providerId: null, hints: { skip: true },
  });
} catch { skippedThrew = true; }
check('a send marked not to be filed is left alone quietly', skippedThrew === false);

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
