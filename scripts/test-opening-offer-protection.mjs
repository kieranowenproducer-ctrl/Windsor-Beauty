import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normaliseOfferPhone, openingOfferIsAllowed, welcomeOfferHoldsEnabled } from '../src/lib/db/openingOfferProtection.ts';

const forms = ['07123 456789', '+44 7123 456789', '0044 7123 456789'];
for (const form of forms) assert.equal(normaliseOfferPhone(form), '07123456789');
assert.notEqual(normaliseOfferPhone('07123 456780'), normaliseOfferPhone(forms[0]));

const checkout = fs.readFileSync(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
assert.match(checkout, /reserveSignupOffer/);
assert.match(checkout, /releaseSignupOfferReservation/);
assert.match(checkout, /finishSignupOfferReservation/);

const validation = fs.readFileSync(new URL('../src/app/api/discount-validate/route.ts', import.meta.url), 'utf8');
assert.doesNotMatch(validation, /heldForReview/);
assert.match(validation, /belongs to a different member/);

// A welcome code must never be withheld. This is permanent, not an environment switch.
delete process.env.WELCOME_OFFER_HOLDS;
assert.equal(welcomeOfferHoldsEnabled(), false, 'welcome offer holds must be off by default');
assert.equal(await openingOfferIsAllowed(1), true, 'a held member must still get their code');

process.env.WELCOME_OFFER_HOLDS = 'on';
assert.equal(welcomeOfferHoldsEnabled(), false, 'no environment setting may bring holds back');
delete process.env.WELCOME_OFFER_HOLDS;

const protection = fs.readFileSync(new URL('../src/lib/db/openingOfferProtection.ts', import.meta.url), 'utf8');
assert.match(protection, /heldForReview: false/);

console.log('Opening-offer protection checks passed, and welcome codes cannot be held.');
