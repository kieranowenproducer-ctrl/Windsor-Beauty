// The two decisions behind task 477f3453: can this invoice still be paid, and
// what is said when money arrives for a cancelled order. Pure functions, no
// database.  npm run test:invoice-payability
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invoicePayable,
  invoiceStatusForCustomer,
  orderFollowsInvoiceCancellation,
  paidAfterCancelNotice,
} from '../src/lib/invoicePayability.ts';

test('an open invoice on a live order can be paid', () => {
  assert.equal(invoicePayable('sent', 'awaiting_payment'), true);
  assert.equal(invoicePayable('viewed', 'pending'), true);
  assert.equal(invoicePayable('viewed', null), true);
});

test('a cancelled or refunded order closes the invoice, whatever the invoice says', () => {
  assert.equal(invoicePayable('viewed', 'cancelled'), false);
  assert.equal(invoicePayable('sent', 'refunded'), false);
  assert.equal(invoiceStatusForCustomer('viewed', 'cancelled'), 'cancelled');
});

test('a paid, cancelled or draft invoice is never payable and a paid one stays paid', () => {
  assert.equal(invoicePayable('paid', 'awaiting_dispatch'), false);
  assert.equal(invoicePayable('cancelled', 'pending'), false);
  assert.equal(invoicePayable('draft', 'pending'), false);
  assert.equal(invoiceStatusForCustomer('paid', 'cancelled'), 'paid');
  assert.equal(invoiceStatusForCustomer('viewed', 'awaiting_payment'), 'viewed');
});

test('cancelling an invoice takes an unpaid order with it, never a paid one', () => {
  assert.equal(orderFollowsInvoiceCancellation('awaiting_payment'), true);
  assert.equal(orderFollowsInvoiceCancellation('payment_failed'), true);
  assert.equal(orderFollowsInvoiceCancellation('paid'), false);
  assert.equal(orderFollowsInvoiceCancellation('dispatched'), false);
  assert.equal(orderFollowsInvoiceCancellation(null), false);
});

test('the paid-after-cancel notice names who, how much, which order and what to decide', () => {
  const notice = paidAfterCancelNotice(
    { order_number: 'WB-TEST01', status: 'cancelled', customer_name: 'Harry Hardwick ', total: '240.00' },
    240,
    new Date('2026-08-29T06:02:00Z'),
  );
  assert.equal(notice.category, 'fena_paid_after_cancel');
  assert.match(notice.message, /Harry Hardwick paid £240\.00 for order WB-TEST01 after it was cancelled/);
  assert.match(notice.message, /reinstate the order or refund the payment/);
  assert.match(notice.note, /29 Aug 2026, 07:02: £240\.00 arrived by bank transfer/);
});

test('a missing reported amount falls back to the order total, and refunded reads as refunded', () => {
  const notice = paidAfterCancelNotice(
    { order_number: 'WB-TEST02', status: 'refunded', customer_name: '', total: '35' },
    null,
  );
  assert.match(notice.message, /The customer paid £35\.00 for order WB-TEST02 after it was refunded/);
  assert.match(notice.note, /after this order was refunded/);
});
