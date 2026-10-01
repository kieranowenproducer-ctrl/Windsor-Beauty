// A delivery address must never become somebody's billing address, and the name on a parcel must
// never have to be typed into an address line. Exits 1 when either stops being true.
// Run: npm run check:invoice-addresses (also inside npm run check).
//
// Why it exists (task 77b818aa): a customer paid for an order that went to a friend. There was
// nowhere to say who the parcel was for, so the friend's name went into the first line of the
// delivery address. Raising the NEXT invoice for that customer then offered the friend's address
// as her billing address, because the customer lookup kept whichever address was most recent and
// an order's address is where the PARCEL went. Her own record had never changed; only the prefill
// was wrong. Both halves are checked here, the first against the real merging code.

import { mergeInvoiceCustomers } from '../src/lib/invoiceCustomerMerge.ts';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (label) => console.log(`  ok       ${label}`);
const fail = (label, detail) => { failures++; console.log(`  FAILED   ${label}${detail ? `\n           ${detail}` : ''}`); };
const check = (label, condition, detail) => (condition ? ok(label) : fail(label, detail));

const row = (over) => ({
  source: 'order', name: 'A Customer', email: 'someone@example.com', phone: null, company: null,
  line1: null, line2: null, city: null, postcode: null, country: 'GB', lastActivity: null, ...over,
});
const one = (rows) => mergeInvoiceCustomers(rows, 8)[0] ?? {};

console.log('\n=== A delivery address is never offered as a billing address ===');

// The live shape of the bug: a member whose most recent activity is an order sent somewhere else.
const m = one([
  row({ source: 'order', line1: 'Somebody Else', city: 'Belfast', postcode: 'BT3 9AA', lastActivity: '2026-08-20' }),
  row({ source: 'member', line1: '23 Home Road', city: 'Reading', postcode: 'RG3 1AA', lastActivity: '2026-01-01' }),
]);
check('the customer\'s own address wins over a more recent delivery address',
  m.line1 === '23 Home Road' && m.postcode === 'RG3 1AA', `got line1=${m.line1} postcode=${m.postcode}`);
check('  and it is marked as a real billing address', m.billingAddressIsReal === true, `got ${m.billingAddressIsReal}`);

const m2 = one([
  row({ source: 'order', line1: 'Somewhere Else', city: 'Belfast', postcode: 'BT3 9AA', lastActivity: '2026-08-20' }),
  row({ source: 'invoice', line1: '9 Billing Street', city: 'Reading', postcode: 'RG1 2BB', lastActivity: '2026-02-02' }),
]);
check('a past invoice\'s billing address also beats a delivery address',
  m2.line1 === '9 Billing Street', `got ${m2.line1}`);
check('  and it is marked as a real billing address', m2.billingAddressIsReal === true, `got ${m2.billingAddressIsReal}`);

const m3 = one([row({ source: 'order', line1: '4 Only Address', city: 'Leeds', postcode: 'LS1 3CC', lastActivity: '2026-08-20' })]);
check('when a delivery address is all there is, it is still offered', m3.line1 === '4 Only Address', `got ${m3.line1}`);
check('  but flagged, so the editor fills the delivery section and not the billing address',
  m3.billingAddressIsReal === false, `got ${m3.billingAddressIsReal}`);

const m4 = one([
  row({ source: 'order', line1: 'Friend House', line2: 'Flat 2', city: 'Belfast', postcode: 'BT3 9AA', lastActivity: '2026-08-20' }),
  row({ source: 'member', line1: '23 Home Road', line2: null, city: 'Reading', postcode: 'RG3 1AA', lastActivity: '2026-01-01' }),
]);
check('a better address replaces the other outright rather than filling its gaps',
  m4.line1 === '23 Home Road' && !m4.line2, `got line1=${m4.line1} line2=${m4.line2}`);

const m5 = one([
  row({ source: 'order', phone: '07000 000000', line1: 'Somebody Else', city: 'Belfast', postcode: 'BT3 9AA', lastActivity: '2026-08-20' }),
  row({ source: 'member', phone: null, line1: '23 Home Road', city: 'Reading', postcode: 'RG3 1AA', lastActivity: '2026-01-01' }),
]);
check('a phone number from a past order is still worth keeping', m5.phone === '07000 000000', `got ${m5.phone}`);

const m6 = one([row({ source: 'member', line1: null, postcode: null, lastActivity: '2026-01-01' })]);
check('a customer with no address at all is not marked as having a billing address',
  m6.billingAddressIsReal === false, `got ${m6.billingAddressIsReal}`);

console.log('\n=== The name on a parcel is never typed into an address line ===');
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

check('invoices carry a delivery recipient',
  /ADD COLUMN IF NOT EXISTS shipping_recipient TEXT/.test(read('../src/lib/db/schema-parts/qr-upsells-and-invoices.ts')));
check('orders carry a delivery recipient',
  /ADD COLUMN IF NOT EXISTS shipping_recipient TEXT/.test(read('../src/lib/db/schema-parts/customers-and-orders.ts')));
check('Royal Mail prints it when it is set, and the customer otherwise',
  /order\.shipping_recipient\?\.trim\(\)\s*\|\|\s*order\.customer_name/.test(read('../src/lib/royalMailDispatch.ts')));
const fulfilment = read('../src/lib/invoiceFulfillment.ts');
check('an invoice passes it to the order it creates',
  /shippingRecipient: invoice\.shipping_recipient/.test(fulfilment));
check('  and editing a sent invoice moves it on that order too',
  (fulfilment.match(/shippingRecipient: invoice\.shipping_recipient/g) || []).length >= 2);
check('the printed invoice shows it above the delivery address',
  /invoice\.shipping_recipient,\s*[\r\n]+\s*invoice\.shipping_line1/.test(read('../src/app/api/admin/invoices/[id]/print/route.ts')));
check('the editor never writes a delivery address into the billing fields',
  /if \(c\.billingAddressIsReal\) \{/.test(read('../src/app/admin/invoices/[id]/edit/page.tsx')));
// This app has no migration step: a new column exists only once some page happens to call
// ensureSchema. Without a retry, every invoice save would fail from the moment this deploys until
// that happened. createOrder has carried the same guard for the same reason.
const invoicesDb = read('../src/lib/db/invoices.ts');
check('saving an invoice survives the new column not being migrated yet',
  (invoicesDb.match(/withSchemaRetry\(\(\) => db`/g) || []).length >= 2,
  'createInvoice and updateInvoice must both retry once after ensureSchema on a missing column.');
check('the delivery name is cleared when either tick box is turned off',
  /shipDifferent && sendToSomeoneElse \? \(shippingRecipient\.trim\(\) \|\| null\) : null/.test(read('../src/app/admin/invoices/[id]/edit/page.tsx')));

console.log('');
if (failures > 0) {
  console.log(`  ${failures} check(s) FAILED. A delivery address could become a billing address again.\n`);
  process.exit(1);
}
console.log('  Billing addresses come only from billing sources, and a parcel name has its own box.\n');
