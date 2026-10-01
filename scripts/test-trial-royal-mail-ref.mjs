// A trial product always dispatches under the same neutral Royal Mail name (task 9e2f4a11).
//
// Kieran: "each trial product should automatically be assigned a simple unique neutral name...
// That reference becomes permanently associated with that product. Every future Royal Mail order
// containing that same trial product should continue to use Product 37."
//
// This drives the REAL path, not a description of it: invoice line -> anonymiseTrialLines ->
// buildOrderItemsFromInvoice -> buildShipmentContents, which is the array that becomes the
// `contents` of the Click & Drop payload in src/lib/royalMail.ts. His acceptance test is the last
// block: what the Royal Mail product-name field actually says.
//
// Run: npm run test:trial-rm-ref

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';
import { buildOrderItemsFromInvoice } from '@/lib/invoices';
import { buildShipmentContents } from '@/lib/shipping';
import { buildAdminOrderNotificationEmail } from '@/lib/adminOrderNotificationEmail';
import { buildOrderConfirmationEmail } from '@/lib/orderConfirmationEmail';
import { buildFenaPayload } from '@/lib/fena';
import { trialRoyalMailRef, trialRefNumber, trialIdFromSlug, assertNoCollisions, TRIAL_REF_SPAN } from '@/lib/trialRoyalMailRef';

const SETTINGS = { default_item_weight_grams: 50, default_origin_country: 'GB' };

/** The whole journey, as it runs in production. Returns the Royal Mail contents[]. */
function royalMailContents(invoiceLines) {
  const anonymised = anonymiseTrialLines(invoiceLines);
  const orderItems = buildOrderItemsFromInvoice(anonymised, new Map());
  return { orderItems, contents: buildShipmentContents(orderItems, new Map(), SETTINGS) };
}

const trialLine = (id, name, extra = {}) => ({
  type: 'trial', slug: `trial:${id}`, name, description: '50mg',
  quantity: 1, unitPrice: 45, discount: 0, lineTotal: 45, ...extra,
});
const realLine = () => ({
  type: 'product', slug: 'retatrutide', name: 'Retatrutide', description: '30mg',
  quantity: 1, unitPrice: 220, discount: 0, lineTotal: 220,
});

test('1. an existing trial product gets a neutral reference', () => {
  const { contents } = royalMailContents([trialLine(8, '501')]);
  assert.equal(contents.length, 1);
  assert.match(contents[0].name, /^Product \d+$/);
  assert.equal(contents[0].name, trialRoyalMailRef(8));
});

test('2. a second existing trial product gets a DIFFERENT reference', () => {
  const a = royalMailContents([trialLine(8, '501')]).contents[0].name;
  const b = royalMailContents([trialLine(31, 'CLENna 40MG 100S')]).contents[0].name;
  assert.match(b, /^Product \d+$/);
  assert.notEqual(a, b);
});

test('3. a newly created trial product is covered with no code change', () => {
  // Whatever id the database hands the next one, it already has a reference.
  for (const newId of [34, 35, 120, 400]) {
    assert.match(royalMailContents([trialLine(newId, 'brand new')]).contents[0].name, /^Product \d+$/);
  }
});

test('4. many orders of the same trial product all use the same reference', () => {
  const names = [];
  for (let order = 0; order < 5; order++) {
    // Different quantities, prices and positions on the invoice each time.
    const lines = order % 2 === 0
      ? [trialLine(8, '501', { quantity: order + 1 })]
      : [realLine(), trialLine(8, '501', { quantity: order + 1, unitPrice: 50, lineTotal: 50 })];
    names.push(royalMailContents(lines).contents.find((c) => /^Product \d+$/.test(c.name)).name);
  }
  assert.equal(new Set(names).size, 1, `expected one reference across five orders, got ${[...new Set(names)].join(', ')}`);
  assert.equal(names[0], trialRoyalMailRef(8));
});

test('5. one order containing several different trial products keeps them apart', () => {
  const { contents } = royalMailContents([trialLine(8, '501'), trialLine(13, 'ANADR'), trialLine(31, 'CLENna')]);
  const names = contents.map((c) => c.name);
  assert.equal(names.length, 3);
  assert.equal(new Set(names).size, 3, `references must differ, got ${names.join(', ')}`);
  assert.deepEqual(names, [trialRoyalMailRef(8), trialRoyalMailRef(13), trialRoyalMailRef(31)]);
});

test('6. a normal non-trial product is completely unchanged', () => {
  const { contents } = royalMailContents([realLine()]);
  assert.equal(contents.length, 1);
  // Its existing generic name, exactly as before this task.
  assert.equal(contents[0].name, 'Sculpt Ampoule');
  assert.equal(contents[0].sku, 'WB-2808D892');
  assert.ok(!/^Product \d+$/.test(contents[0].name), 'a real product must not be given a trial reference');
});

test('7. the Royal Mail payload itself: only the neutral name, never the trial name', () => {
  const REAL_NAMES = ['501', 'ANADR 50MG  60S', 'CLENna 40MG 100S', 'TRN E 250'];
  const lines = [
    trialLine(8, '501'),
    trialLine(13, 'ANADR 50MG  60S'),
    trialLine(31, 'CLENna 40MG 100S'),
    trialLine(9, 'TRN E 250'),
    realLine(),
  ];
  const { orderItems, contents } = royalMailContents(lines);

  // Kieran's acceptance requirement, checked against the payload rather than the mapping.
  const payload = JSON.stringify(contents);
  for (const real of REAL_NAMES) {
    assert.ok(!payload.includes(real), `the trial name "${real}" must never appear in the Royal Mail payload`);
  }
  // And no dosage, which names it almost as precisely.
  assert.ok(!payload.includes('50mg'), 'no dosage in the payload either');

  const trialNames = contents.filter((c) => /^Product \d+$/.test(c.name)).map((c) => c.name);
  assert.equal(trialNames.length, 4, 'all four trial lines carry a Product reference');
  assert.equal(new Set(trialNames).size, 4, 'and all four differ');

  // The order record the site keeps also never holds the real trial name.
  const stored = JSON.stringify(orderItems);
  for (const real of REAL_NAMES) assert.ok(!stored.includes(real), `"${real}" must not be stored on the order`);
});

test('the same permanent code reaches the invoice-linked order and Royal Mail regardless of position', () => {
  // Same product, first on one invoice and third on another.
  const first = royalMailContents([trialLine(8, '501'), trialLine(13, 'x'), trialLine(31, 'y')]);
  const third = royalMailContents([trialLine(13, 'x'), trialLine(31, 'y'), trialLine(8, '501')]);

  assert.equal(first.orderItems[0].name, trialRoyalMailRef(8));
  assert.equal(third.orderItems[2].name, trialRoyalMailRef(8));
  assert.equal(first.contents[0].name, third.contents[2].name); // fixed, the point of the task
  assert.equal(first.contents[0].name, trialRoyalMailRef(8));
});

test('a database-assigned code on a new Trial line is preserved from invoice to order to Royal Mail', () => {
  const { orderItems, contents } = royalMailContents([trialLine(900, 'private product name', { fulfilmentRef: 'Product 909' })]);
  assert.equal(orderItems[0].name, 'Product 909');
  assert.equal(orderItems[0].fulfilmentRef, 'Product 909');
  assert.equal(contents[0].name, 'Product 909');
  assert.ok(!JSON.stringify({ orderItems, contents }).includes('private product name'));
});

test('the paid-order staff and customer emails show the same code, never the trial name', () => {
  const { orderItems } = royalMailContents([trialLine(8, 'private trial name', { fulfilmentRef: 'Product 207' })]);
  const shared = {
    customerName: 'Example Customer', orderNumber: 'WB-TEST', items: orderItems,
    subtotal: 45, shippingLabel: 'UK Delivery', shippingCost: 10,
    total: 55, shippingAddress: 'Example address',
  };
  const customer = buildOrderConfirmationEmail({ ...shared, to: 'example@example.com' });
  const staff = buildAdminOrderNotificationEmail({
    ...shared, email: 'example@example.com', phone: null,
    paymentMethod: 'fena', paymentStatus: 'confirmed', createdAt: '2026-09-15T19:06:00Z',
  });
  for (const mail of [customer, staff]) {
    assert.ok(mail.html.includes('Product 207') && mail.text.includes('Product 207'));
    assert.ok(!JSON.stringify(mail).includes('private trial name'));
  }
});

test('Fena payment-link items use the identical Product code', () => {
  const { orderItems } = royalMailContents([trialLine(8, 'private trial name', { fulfilmentRef: 'Product 207' })]);
  const payload = buildFenaPayload({
    order_number: 'WB-TEST', total: '55', email: 'example@example.com',
    customer_name: 'Example Customer', items: orderItems,
    shipping_line1: 'Example address', shipping_country: 'GB',
  }, 'https://www.windsorbeauty.co.uk', new Map());
  assert.equal(payload.items[0].name, 'Product 207');
  assert.ok(!JSON.stringify(payload).includes('private trial name'));
});

test('no two trial products can share a reference', () => {
  // Every id the live table currently holds, plus the whole space the scheme covers.
  const live = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];
  assert.deepEqual(assertNoCollisions(live), [], 'the 32 live trial products must all differ');

  const everyId = Array.from({ length: TRIAL_REF_SPAN }, (_, i) => i);
  assert.deepEqual(assertNoCollisions(everyId), [], `all ${TRIAL_REF_SPAN} references must be distinct`);
});

test('the same id always gives the same number, run after run', () => {
  for (const id of [2, 8, 33, 500]) {
    assert.equal(trialRefNumber(id), trialRefNumber(id));
    assert.equal(trialRoyalMailRef(id), `Product ${trialRefNumber(id)}`);
  }
  // Pinned, so an accidental change to the constants is caught rather than silently
  // renumbering every trial product that has already shipped.
  assert.equal(trialRoyalMailRef(8), 'Product 207');
  assert.equal(trialRoyalMailRef(31), 'Product 661');
});

test('the trial id is read only from a real trial slug', () => {
  assert.equal(trialIdFromSlug('trial:8'), 8);
  assert.equal(trialIdFromSlug('retatrutide'), null);
  assert.equal(trialIdFromSlug(undefined), null);
  assert.equal(trialIdFromSlug('trial:abc'), null);
});

test('a bespoke line with no slug is untouched, as before', () => {
  const { contents } = royalMailContents([
    { type: 'custom', name: 'Bespoke item', quantity: 1, unitPrice: 10, discount: 0, lineTotal: 10 },
  ]);
  assert.equal(contents[0].name, 'Cosmetic Item');
});
