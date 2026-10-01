// Every order says truthfully how it reached the account it is attached to. Free.
//
//   node scripts/check-account-link.mjs
//
// The Orders screen tells whoever is reading it whether the person was signed in when they
// ordered, or whether the order was simply matched to a member because the email they typed
// happened to belong to one. Those two are not the same fact, and the difference is the whole
// reason this exists (task e0858a61, order WB-63U39T).
//
// If this decision were ever inverted, the screen would state the opposite of the truth with
// complete confidence, and nothing else in the codebase would notice. So it is one pure function
// in one file with no imports, and this runs it.
//
// A live order proves the value is stored, read back and displayed (done on a preview on
// 2026-08-20, order WB-8ZSTLV, which correctly read "Guest order"). This proves the other two
// branches, which cannot be exercised without creating a member account.
import { resolveAccountLink, ACCOUNT_LINK_LABELS } from '../src/lib/orderAccountLink.ts';

const cases = [
  { name: 'signed in, order attached to that same account', signedIn: 77,   linked: 77,   expect: 'signed_in' },
  { name: 'signed in, and no email match was needed',       signedIn: 77,   linked: null, expect: 'signed_in' },
  { name: 'not signed in, typed email matched a member',    signedIn: null, linked: 77,   expect: 'email_match' },
  { name: 'not signed in, no member behind the email',      signedIn: null, linked: null, expect: 'guest' },
  { name: 'undefined is treated exactly like absent',       signedIn: undefined, linked: undefined, expect: 'guest' },
  { name: 'customer id 0 still counts as signed in',        signedIn: 0,    linked: 0,    expect: 'signed_in' },
];

let failed = 0;
console.log('\n  How an order reached its account\n');
for (const c of cases) {
  const got = resolveAccountLink(c.signedIn, c.linked);
  const ok = got === c.expect;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   ${c.name} -> ${got}${ok ? '' : ` (expected ${c.expect})`}`);
}

// Every value a person can be shown has words written for them. A missing label would render a
// database value like "email_match" on the screen.
for (const value of ['signed_in', 'email_match', 'guest', 'admin_created', 'not_recorded']) {
  const label = ACCOUNT_LINK_LABELS[value];
  const ok = typeof label === 'string' && label.length > 0 && !/_/.test(label);
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}   "${value}" is written out for a person: ${label ?? 'MISSING'}`);
}

console.log(`\n  ${cases.length + 5} checks, ${cases.length + 5 - failed} passed, ${failed} failed.\n`);
if (failed) process.exit(1);
