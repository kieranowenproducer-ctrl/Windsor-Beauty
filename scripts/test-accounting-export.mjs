import assert from 'node:assert/strict';
import { accountingExportRange, buildAccountingCsv } from '../src/lib/accountingExport.ts';

const csv = buildAccountingCsv([
  {
    orderNumber: 'WB-PAID', total: 120, paypalFee: 3.2,
    status: 'dispatched', paymentConfirmedAt: '2026-09-27T11:00:00Z',
    customerName: 'Private customer', email: 'private@example.invalid',
  },
  {
    orderNumber: 'WB-REFUND', total: 40, paypalFee: 0,
    status: 'refunded', paymentConfirmedAt: '2026-09-27T12:00:00Z',
  },
  {
    orderNumber: 'WB-CANCEL', total: 25, paypalFee: 0,
    status: 'cancelled', paymentConfirmedAt: '2026-09-27T13:00:00Z',
  },
  { orderNumber: 'WB-UNPAID', total: 90, paypalFee: 0, status: 'pending', paymentConfirmedAt: null },
], ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered']);

assert.match(csv, /"WB-PAID","27\/09\/2026"|"WB-PAID","2026-09-27"/);
assert.match(csv, /"WB-PAID".*"120\.00","","0\.00".*"paid"/);
assert.doesNotMatch(csv, /"3\.20"/);
assert.match(csv, /"WB-REFUND".*"refunded"/);
assert.match(csv, /"WB-CANCEL".*"needs-review"/);
assert.doesNotMatch(csv, /WB-UNPAID|Private customer|private@example/);
assert.deepEqual(accountingExportRange(new URLSearchParams()), { from: '', to: '', filename: 'windsor-beauty-accounting-all-latest.csv' });
assert.deepEqual(accountingExportRange(new URLSearchParams('from=2026-08-01&to=2026-08-31')), { from: '2026-08-01', to: '2026-08-31', filename: 'windsor-beauty-accounting-2026-08-01-2026-08-31.csv' });
for (const query of ['from=2026-02-31', 'to=invalid', 'from=2026-09-27&to=2026-09-01', 'from=2026-09-01&from=2026-09-02']) {
  assert.throws(() => accountingExportRange(new URLSearchParams(query)));
}
const midnight = buildAccountingCsv([{ orderNumber: 'WB-BST', total: 10, status: 'paid', paymentConfirmedAt: '2026-08-31T23:30:00Z' }], ['paid']);
assert.match(midnight, /2026-09-01|01\/09\/2026/);
assert.throws(() => buildAccountingCsv([{ orderNumber: 'WB-BAD', total: 10, status: 'paid', paymentConfirmedAt: 'invalid' }], ['paid']), /invalid payment date/);
console.log('Accounting export: paid, refunded and review states; no customer details or invented processor fees.');
