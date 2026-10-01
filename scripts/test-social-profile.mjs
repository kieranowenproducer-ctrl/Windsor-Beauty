import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  cleanSocialProfile,
  referralAllowsSocialProfile,
  socialProfilePrompt,
} from '../src/lib/referralSources.ts';

assert.equal(referralAllowsSocialProfile('Instagram'), true);
assert.equal(referralAllowsSocialProfile('Facebook'), true);
assert.equal(referralAllowsSocialProfile('RAF affiliate'), false);
assert.equal(referralAllowsSocialProfile('A friend or word of mouth'), false);
assert.equal(socialProfilePrompt('Instagram'), 'Your Instagram username (optional)');
assert.equal(socialProfilePrompt('Facebook'), 'Your Facebook profile name (optional)');
assert.equal(socialProfilePrompt('Google'), null);
assert.equal(cleanSocialProfile('  @raf_training  '), '@raf_training');
assert.equal(cleanSocialProfile('Raf     Christian'), 'Raf Christian');
assert.equal(cleanSocialProfile(''), null);
assert.equal(cleanSocialProfile('a'.repeat(101)), null);
assert.equal(cleanSocialProfile('unsafe\u0000name'), null);

const registration = await readFile(new URL('../src/app/api/account/register/route.ts', import.meta.url), 'utf8');
assert.match(registration, /cleanSocialProfile\(body\?\.socialProfile\)/);
assert.match(registration, /referralAllowsSocialProfile\(referralChannel\(referredBy\)/);
assert.match(registration, /socialProfile,/);
assert.match(registration, /cleanSocialProfile\(body\?\.instagramProfile\)/);
assert.match(registration, /cleanSocialProfile\(body\?\.facebookProfile\)/);

const form = await readFile(new URL('../src/components/MemberRegistrationForm.tsx', import.meta.url), 'utf8');
assert.match(form, /id="instagramProfile"/);
assert.match(form, /id="facebookProfile"/);
assert.match(form, /<SocialProfilePrompt/);
assert.doesNotMatch(form, /socialProfileLabel/);
// Samuel, 27 Sep 2026: the tick box names no channels (the terms do), and it sits above the
// Instagram and Facebook boxes, since those are only used for offers once it is ticked.
assert.match(form, /Keep me updated about Windsor Beauty products and exclusive offers\./);
assert.ok(form.indexOf('Keep me updated') < form.indexOf('id="instagramProfile"'), 'marketing tick box must come before the social profile boxes');
// Samuel, 27 Sep 2026: password first, then the marketing tick box, then Instagram and Facebook.
assert.ok(form.indexOf('id="member-confirmPassword"') < form.indexOf('Keep me updated'), 'the password boxes must come before the marketing tick box');

const launchRegistration = await readFile(new URL('../src/app/api/launch/subscribe/route.ts', import.meta.url), 'utf8');
assert.match(launchRegistration, /cleanSocialProfile\(body\?\.socialProfile\)/);
assert.match(launchRegistration, /referralAllowsSocialProfile\(referralChannel\(referredBy\)/);

const schema = await readFile(new URL('../src/lib/db/schema-parts/customers-and-orders.ts', import.meta.url), 'utf8');
assert.match(schema, /ADD COLUMN IF NOT EXISTS social_profile TEXT/);
assert.match(schema, /ADD COLUMN IF NOT EXISTS instagram_profile TEXT/);
assert.match(schema, /ADD COLUMN IF NOT EXISTS facebook_profile TEXT/);
assert.match(schema, /ADD COLUMN IF NOT EXISTS instagram_marketing_consent BOOLEAN/);

const database = await readFile(new URL('../src/lib/db.ts', import.meta.url), 'utf8');
assert.match(database, /params\.marketingConsent && Boolean\(params\.instagramProfile\)/);
assert.match(database, /params\.marketingConsent && Boolean\(params\.facebookProfile\)/);
assert.match(database, /params\.marketingConsent && Boolean\(params\.phone\)/);

const account = await readFile(new URL('../src/app/account/page.tsx', import.meta.url), 'utf8');
assert.match(account, /Instagram messages/);
assert.match(account, /Facebook messages/);
assert.match(account, /Telephone offers/);

const customerApi = await readFile(new URL('../src/app/api/admin/customers/route.ts', import.meta.url), 'utf8');
assert.match(customerApi, /socialProfile: c\.social_profile/);

console.log('Social-profile checks passed: signup profiles, one reminder, saved preferences and staff visibility.');
