import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DISCOUNT_REFUSED_CATEGORY,
  DISCOUNT_SYSTEM_FAILURE_CATEGORY,
  reportRefusedDiscount,
} from '../src/lib/discountRefusalAlert.ts';
import { isCustomerEvent } from '../src/lib/automationFailureKinds.ts';

// A refused discount code must never again happen in silence (Kieran, 18 September 2026).
//
// There were fourteen ways the basket could refuse a code and only one of them told anybody. This
// test exists so that nobody can add a fifteenth quiet one.

const validate = fs.readFileSync(new URL('../src/app/api/discount-validate/route.ts', import.meta.url), 'utf8');

// Every refusal goes through the one helper, which both answers the customer and writes it down.
// Two lines are allowed to answer directly, and each says in the file why:
//   - the database being absent, which is the one refusal that cannot be recorded
//   - an empty box, which is not a refused code at all
const directRefusals = validate
  .split('\n')
  .map((line, index) => ({ line, number: index + 1 }))
  .filter(({ line }) => line.includes('valid: false'));
assert.equal(directRefusals.length, 3,
  `expected 3 lines mentioning "valid: false" (the helper plus two documented exceptions), found ${directRefusals.length}: `
  + directRefusals.map(r => r.number).join(', '));
assert.match(validate, /message: params\.message/);
assert.match(validate, /temporarily unavailable/);
assert.match(validate, /Please enter a discount code/);
assert.doesNotMatch(validate, /BLOCKED_OFFER_CUSTOMER_MESSAGE/);
assert.equal(isCustomerEvent(DISCOUNT_REFUSED_CATEGORY), true, 'ordinary invalid codes are customer events');
assert.equal(isCustomerEvent(DISCOUNT_SYSTEM_FAILURE_CATEGORY), false, 'shop-side discount failures remain red system faults');

// The helper reports before it answers, so an early return cannot skip it.
const helper = validate.slice(validate.indexOf('async function refuse('));
assert.ok(helper.indexOf('reportRefusedDiscount') < helper.indexOf('return NextResponse.json'),
  'the refusal must be recorded before the customer is answered');

// Each named refusal reason reaches the dashboard.
for (const reason of ['no longer active', 'has expired', 'usage limit', 'minimum order', 'not signed in']) {
  assert.ok(validate.toLowerCase().includes(reason.toLowerCase()), `missing refusal reason: ${reason}`);
}

// The two ways a code can vanish at the payment step, which are always our fault and always email.
const placeOrder = fs.readFileSync(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
assert.match(placeOrder, /reportRefusedDiscount/);
assert.match(placeOrder, /signed out, so their code was dropped/);
assert.match(placeOrder, /took nothing off at the payment step/);
assert.equal((placeOrder.match(/serious: true/g) || []).length, 2,
  'both payment-step failures must be marked serious so they send the email');

// Reporting must never be the reason a customer cannot buy something. There is no database in this
// test, so every call inside the reporter fails; it still has to resolve quietly.
await reportRefusedDiscount({
  email: 'someone@example.com',
  code: 'WGLOW10-TEST',
  reason: 'a test with no database behind it',
  stage: 'basket',
});
await reportRefusedDiscount({ email: null, code: 'WGLOW10-TEST', reason: 'signed out', stage: 'checkout', serious: true });

// A member's own unused code is offered at the basket, and the panel can never block the checkout.
const welcomeRoute = fs.readFileSync(new URL('../src/app/api/account/welcome-code/route.ts', import.meta.url), 'utf8');
assert.match(welcomeRoute, /resolveCustomerFromRequest/);
assert.match(welcomeRoute, /findUnusedWelcomeCodeForEmail/);
assert.match(welcomeRoute, /catch\s*\{\s*\n?\s*return NextResponse\.json\(\{ code: null \}\)/);

const checkout = fs.readFileSync(new URL('../src/app/checkout/page.tsx', import.meta.url), 'utf8');
assert.match(checkout, /api\/account\/welcome-code/);
assert.match(checkout, /You have <span[^>]*>10% off<\/span> as a member/);
assert.match(checkout, /applyDiscountCode\(memberWelcomeCode\)/);

const db = fs.readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8');
assert.match(db, /status = 'active'/);

console.log('Discount refusals are all reported, and members are offered their own code.');
