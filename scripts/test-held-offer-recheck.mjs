import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stillHeldAfterRecheck, welcomeOfferHoldsEnabled } from '../src/lib/db/openingOfferProtection.ts';
import { BLOCKED_OFFER_CATEGORY } from '../src/lib/blockedOfferAlert.ts';
import { isCustomerEvent } from '../src/lib/automationFailureKinds.ts';

const basket = fs.readFileSync(new URL('../src/app/api/discount-validate/route.ts', import.meta.url), 'utf8');
const checkout = fs.readFileSync(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
const adminApi = fs.readFileSync(new URL('../src/app/api/admin/customers/[id]/opening-offer-check/route.ts', import.meta.url), 'utf8');

process.env.WELCOME_OFFER_HOLDS = 'on';
assert.equal(welcomeOfferHoldsEnabled(), false, 'the old environment switch must not revive holds');
assert.equal(await stillHeldAfterRecheck(1), false, 'even a historical review row cannot hold a code');
delete process.env.WELCOME_OFFER_HOLDS;

for (const source of [basket, checkout]) {
  assert.doesNotMatch(source, /blockedOfferAlert/);
  assert.doesNotMatch(source, /heldForReview/);
  assert.doesNotMatch(source, /refuseHeldWelcomeOffer/);
}
assert.match(adminApi, /Welcome offers can no longer be paused/);
assert.equal(isCustomerEvent(BLOCKED_OFFER_CATEGORY), true, 'historical blocked-offer rows are audit events, not red system faults');

console.log('Historical offer reviews cannot block a basket, checkout or admin action.');
