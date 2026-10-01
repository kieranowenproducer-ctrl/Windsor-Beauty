// Proves the rules that stop the database contradicting itself.
//
// WHY THIS EXISTS. The audit on 2026-08-15 found five invoices in the live
// database pointing at an order number that no longer existed. The cause was an
// asymmetry nobody had noticed: deleting an INVOICE deliberately cascades to its
// order and says so in a comment, but deleting an ORDER was a bare DELETE that
// never looked at the invoice. Press Delete on the order and the invoice was
// left describing something that had ceased to exist.
//
// The fix refuses rather than tidies up: an invoice is a financial record, and
// quietly unpicking one because somebody pressed the wrong Delete is worse than
// being told to go and do it from the invoice instead. These checks pin that
// decision, and pin the message actually reaching the screen, because a refusal
// nobody can read is the same as a silent failure.
//
// Run: npm run check:data-integrity
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ok       ${name}`);
  } else {
    failures += 1;
    console.log(`  FAILED   ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const orderRoute = read('src/app/api/admin/orders/[orderNumber]/route.ts');
// Invoices and the order row shapes moved out of db.ts on 2026-08-16.
const invoicesDb = read('src/lib/db/invoices.ts');
const ordersDb = read('src/lib/db/orders.ts');
const ordersPage = read('src/app/admin/orders/page.tsx');
const dispatchPage = read('src/app/admin/dispatch/page.tsx');

console.log('\nDeleting an order that came from an invoice');
check('the delete endpoint looks for a linked invoice first',
  /findInvoiceByOrderNumber\(params\.orderNumber\)/.test(orderRoute),
  'without this the invoice is orphaned again');
check('it refuses with 409 rather than deleting',
  /linkedInvoice[\s\S]{0,600}status:\s*409/.test(orderRoute));
check('the refusal names the invoice to go and delete instead',
  /invoice \$\{linkedInvoice\.invoice_number\}/.test(orderRoute));
check('the refusal tells the reader the order goes with it',
  /the order goes with it/.test(orderRoute));
check('the invoice number is returned as data, not just prose',
  /invoiceNumber:\s*linkedInvoice\.invoice_number/.test(orderRoute));
check('the check happens BEFORE the delete',
  orderRoute.indexOf('findInvoiceByOrderNumber') < orderRoute.indexOf('await deleteOrder('),
  'checking after deleting would prove nothing');

console.log('\nThe other direction still cascades, deliberately');
check('deleting an invoice still deletes its order',
  /export async function deleteInvoice[\s\S]{0,400}deleteOrder\(invoice\.order_number\)/.test(invoicesDb),
  'this is the supported way to remove both');
check('deleteOrder itself stays a plain delete',
  /export async function deleteOrder[\s\S]{0,300}DELETE FROM orders/.test(ordersDb),
  'the guard belongs in the route, or the cascade above could never run');
check('invoices reaches deleteOrder without importing back out of db.ts',
  /from '\.\/orders'/.test(invoicesDb) && !/from '\.\.\/db'/.test(invoicesDb),
  'no file in src/lib/db/ may import from db.ts, or the two become circular');

console.log('\nThe reason reaches the person who pressed the button');
check('the orders page shows the server message',
  /const data = await res\.json\(\)[\s\S]{0,200}setError\(data\?\.error/.test(ordersPage),
  'otherwise it says "please try again", which is untrue and unhelpful');
check('the orders page no longer throws away the reason',
  !/if \(!res\.ok\) throw new Error\('Failed to delete'\)/.test(ordersPage));
check('the dispatch page shows the server message',
  /const data = await res\.json\(\)[\s\S]{0,240}data\?\.error/.test(dispatchPage));
check('the dispatch page no longer throws away the reason',
  !/if \(!res\.ok\) throw new Error\('Failed to delete'\)/.test(dispatchPage));

console.log('\nBulk delete explains what it skipped');
check('skipped orders are named by their invoice',
  /invoiced\.map\(r => r\.invoiceNumber\)/.test(ordersPage),
  'an anonymous "3 could not be deleted" gives nobody anything to act on');
check('an invoice-skip is counted apart from a real failure',
  /otherFailures/.test(ordersPage));

console.log(failures === 0
  ? '\nAll data integrity checks passed.\n'
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
