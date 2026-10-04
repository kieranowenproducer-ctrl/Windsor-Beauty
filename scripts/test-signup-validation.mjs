import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalisePhoneNumber } from '../src/lib/phoneNumber.ts';
import { customerProfileEdit } from '../src/lib/customerProfileEdit.ts';

const current = { phone: '+447911123456', address_country: 'GB', marketing_consent: true,
  instagram_profile: 'old.handle', facebook_profile: 'old.name', instagram_marketing_consent: true,
  facebook_marketing_consent: true, phone_marketing_consent: true };

test('country numbering rules accept national and international formats', () => {
  assert.equal(normalisePhoneNumber('07911 123456', 'GB'), '+447911123456');
  assert.equal(normalisePhoneNumber('0044 7911 123456', 'GB'), '+447911123456');
  assert.equal(normalisePhoneNumber('+90 532 123 45 67', 'GB'), '+905321234567');
  assert.equal(normalisePhoneNumber('5321234567', 'TR'), '+905321234567');
  assert.equal(normalisePhoneNumber('2025550123', 'US'), '+12025550123');
});

test('invalid length, prose, extension and unsupported national country are refused', () => {
  for (const value of ['079111234567', '12345', 'call 07911123456', '+447911123456 ext 3', '00000000000', 123456789]) assert.equal(normalisePhoneNumber(value, 'GB'), null);
  assert.equal(normalisePhoneNumber('07911123456', 'XX'), null);
});

test('partial account saves preserve omitted phone and every permission', () => {
  const { params } = customerProfileEdit({ instagramProfile: 'new.handle' }, current);
  assert.equal(params.phone, current.phone);
  assert.equal(params.marketingConsent, true);
  assert.equal(params.phoneMarketingConsent, true);
  assert.equal(params.instagramMarketingConsent, true);
  assert.equal(params.facebookMarketingConsent, true);
  assert.equal(params.facebookProfile, current.facebook_profile);
});

test('explicit phone edits normalise, refuse invalid numbers and allow removal', () => {
  assert.equal(customerProfileEdit({ phone: '07911 123456' }, current).params.phone, '+447911123456');
  assert.ok(customerProfileEdit({ phone: '079111234567' }, current).error);
  assert.ok(customerProfileEdit({ phone: { number: '07911123456' } }, current).error);
  assert.equal(customerProfileEdit({ phone: '' }, current).params.phone, null);
  assert.equal(customerProfileEdit({ phone: '' }, current).params.phoneMarketingConsent, true);
});

test('email and phone permission changes are explicit; retired social permissions stay historical', () => {
  const { params } = customerProfileEdit({ marketingConsent: false, phoneMarketingConsent: false, instagramMarketingConsent: false, facebookMarketingConsent: false }, current);
  assert.equal(params.marketingConsent, false);
  assert.equal(params.phoneMarketingConsent, false);
  assert.equal(params.instagramMarketingConsent, true);
  assert.equal(params.facebookMarketingConsent, true);
});
