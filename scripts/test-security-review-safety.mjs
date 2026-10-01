import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  normaliseSecurityAddress,
  normaliseSecurityEmail,
  normaliseSecurityName,
  normaliseSecurityPhone,
} from '../src/lib/db/securityReviews.ts';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const register = read('src/app/api/account/register/route.ts');
const launch = read('src/app/api/launch/subscribe/route.ts');
const basket = read('src/app/api/discount-validate/route.ts');
const checkout = read('src/app/api/checkout/place-order/route.ts');
const offer = read('src/lib/db/openingOfferProtection.ts');
const referrals = read('src/lib/memberReferrals.ts');
const customerReviewApi = read('src/app/api/admin/customers/[id]/opening-offer-check/route.ts');

// Shared-IP history must never be an account-creation gate, on either route.
assert.doesNotMatch(register, /await isSignupRateLimited\(/);
assert.doesNotMatch(launch, /await isSignupRateLimited\(/);
assert.doesNotMatch(register, /Too many accounts created from this connection/);
assert.doesNotMatch(launch, /Too many accounts created from this connection/);

// A valid owned welcome code must have no import or branch capable of reviving a hold.
for (const source of [basket, checkout]) {
  assert.doesNotMatch(source, /blockedOfferAlert/);
  assert.doesNotMatch(source, /heldForReview/);
  assert.doesNotMatch(source, /BLOCKED_OFFER_CUSTOMER_MESSAGE/);
}
assert.match(offer, /export function welcomeOfferHoldsEnabled\(\): boolean \{\s*return false;/s);
assert.match(offer, /heldForReview: false/);
assert.match(customerReviewApi, /Welcome offers can no longer be paused/);

// Similarity evidence may create a case, but may not move a referral to review or
// make the reward-stage result depend on that evidence.
assert.match(referrals, /caseType: 'referral_similarity'/);
assert.doesNotMatch(referrals, /void createSecurityReviewCase/);
assert.match(referrals, /return !eligibilityReason/);
assert.doesNotMatch(referrals, /UPDATE member_referrals SET status = 'review', review_reason = \$\{reason\}/);
const legacyScanner = read('src/lib/db/duplicateAccounts.ts');
assert.match(legacyScanner, /security_association_exemptions/);
assert.match(legacyScanner, /pairIsExempt/);

// Conservative normalization: formatting differences match; provider aliases
// and fuzzy street guesses are not invented.
assert.equal(normaliseSecurityEmail(' Person@Example.COM '), 'person@example.com');
assert.notEqual(normaliseSecurityEmail('person+offer@example.com'), normaliseSecurityEmail('person@example.com'));
assert.equal(normaliseSecurityPhone('+44 (0) 7700 900123'), normaliseSecurityPhone('07700 900123'));
assert.equal(normaliseSecurityPhone('+44 7700 900123'), normaliseSecurityPhone('07700 900123'));
assert.equal(normaliseSecurityName(' Sam ', ' O’Neil '), 'sam o neil');
assert.equal(
  normaliseSecurityAddress({ address_line1: 'Flat 2, 14 High St.', address_line2: null, address_city: 'London', address_postcode: 'SW1A 1AA', address_country: 'GB' }),
  'flat 2 14 high st||london|sw1a1aa|gb',
);

console.log('Security review is advisory: account creation, checkout, discounts and referral rewards have no similarity gate.');
