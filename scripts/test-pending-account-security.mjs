import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as phone from '../src/lib/phoneNumber.ts';
import * as referrals from '../src/lib/referralSources.ts';
import { customerProfileEdit } from '../src/lib/customerProfileEdit.ts';

// Execute the real handlers with isolated in-memory dependencies. No database,
// provider, environment credential or customer email is read or contacted.
const nativeRequire = createRequire(import.meta.url);
const next = { after() {}, NextResponse: { json(body, options = {}) {
  const response = new Response(JSON.stringify(body), { status: options.status || 200 });
  response.cookies = { set(name, value) { response.headers.append('set-cookie', `${name}=${value}`); } };
  return response;
} } };
function load(file, modules, env = {}, globals = {}) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  vm.runInNewContext(compiled, { exports: result.exports, module: result,
    require(name) { if (name === 'crypto') return nativeRequire(name); if (name in modules) return modules[name]; throw new Error(`Unexpected dependency ${name}`); },
    Buffer, Date, URL, process: { env }, console, ...globals,
  }, { filename: file });
  return result.exports;
}
const request = body => new Request('https://example.com/api/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const credentials = { email: 'member@example.com', password: 'proper-private-password', firstName: 'Test', lastName: 'Member',
  phone: '+447911123456', addressLine1: 'Example Street', addressCity: 'London', addressPostcode: 'SW1A 1AA', addressCountry: 'GB',
  referredBy: 'Google or another search engine', ageConfirmed: true, researchUseConfirmed: true, lawfulUseConfirmed: true, termsAccepted: true };
function harness(customer) {
  const calls = { activated: 0, sessions: 0, marketing: 0, resets: 0 };
  const db = { isDbConfigured: () => true, findCustomerByEmail: async () => customer,
    findCustomerByValidSessionToken: async () => customer,
    completePendingCustomer: async () => { calls.activated++; return { ...customer, account_status: 'active' }; },
    createCustomer: async () => { throw Error('Unexpected account insertion'); },
    createCustomerSession: async () => { calls.sessions++; }, createEmailVerificationToken: async () => {},
    logSignupAttempt: async () => {}, upsertMarketingContact: async () => { calls.marketing++; },
    deleteCustomerSessionsByCustomerId: async () => {}, touchCustomerLastLogin: async () => {},
    findLaunchSubscriberByEmail: async () => ({}), createLaunchSubscriber: async () => {},
  };
  const auth = load('src/lib/auth.ts', { '@/lib/db': db });
  const modules = { 'next/server': next, '@/lib/auth': auth, '@/lib/db': db, '@/lib/phoneNumber': phone, '@/lib/referralSources': referrals,
    '@/lib/complianceConfirmations': {}, '@/lib/db/memberLogins': { recordMemberLogin: async () => {} },
    '@/lib/db/securityReviews': {}, '@/lib/glowCardDemo': { glowCardDemoDesign: () => false },
    '@/lib/db/siteVisits': { attachVisitToCustomer: async () => true },
    '@/lib/verificationDelivery': { deliverVerificationEmail: async () => true },
    '@/lib/automationFailure': { reportAutomationFailure: async () => {} },
    '@/lib/memberReferrals': { referralsEnabled: () => false }, '@/lib/glowCardLoyalty': { glowCardLoyaltyEnabled: () => false },
    '@/lib/affiliates': { affiliatesEnabled: () => true, findAffiliateInvitation: async (token, email) => token === 'real-private-invite' && email === customer.email ? {} : null,
      createAffiliateReferralFromInvitation: async () => ({}) },
    '@/lib/launchCodes': { ensureStoredSignupCode: async () => {} }, '@/lib/db/ipActivity': {},
  };
  return { db, auth, modules, calls };
}

test('guessed email and names cannot use the legacy password activation handler', async () => {
  const route = load('src/app/api/account/create-password/route.ts', { 'next/server': next });
  const response = await route.POST(request(credentials));
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await response.json()).redirect, '/account/forgot-password');
});

test('full signup cannot activate a passwordless pending lead or replace its password', async () => {
  for (const passwordHash of [null, 'not-a-password-hash']) {
    const h = harness({ id: 1, email: credentials.email, account_status: 'pending_password', password_hash: passwordHash });
    const response = await load('src/app/api/account/register/route.ts', h.modules).POST(request(credentials));
    assert.equal(response.status, 403);
    assert.equal(h.calls.activated, 0);
    assert.equal(h.calls.sessions, 0);
  }
});

test('verified existing members cannot be taken over through full signup', async () => {
  const h = harness({ id: 1, email: credentials.email, email_verified: true, account_status: 'active' });
  const response = await load('src/app/api/account/register/route.ts', h.modules).POST(request(credentials));
  assert.equal(response.status, 409);
  assert.equal(h.calls.activated, 0);
  assert.equal(h.calls.sessions, 0);
});

test('prelaunch refuses pending takeover and never edits an existing member by known email', async () => {
  for (const status of ['pending_password', 'active']) {
    const h = harness({ id: 1, email: credentials.email, account_status: status, email_verified: true, password_hash: null });
    const response = await load('src/app/api/launch/subscribe/route.ts', h.modules).POST(request({ ...credentials, marketingConsent: true }));
    assert.equal(response.status, status === 'pending_password' ? 403 : 200);
    assert.equal(h.calls.activated, 0);
    assert.equal(h.calls.sessions, 0);
    assert.equal(h.calls.marketing, 0);
  }
});

test('recovery requires an unspent inbox token and pending recovery does not sign in', async () => {
  const customer = { id: 1, email: credentials.email, account_status: 'pending_password' };
  const h = harness(customer);
  let tokenAvailable = true;
  h.db.resetCustomerPasswordByToken = async (token, hash) => {
    if (token !== 'secret-from-email' || !tokenAvailable) return null;
    tokenAvailable = false; customer.password_hash = hash; h.calls.resets++; return customer;
  };
  const route = load('src/app/api/account/reset-password/route.ts', h.modules);
  for (const token of ['', 'guessed-token', 'expired-token']) {
    assert.equal((await route.POST(request({ token, password: credentials.password }))).status, 400);
  }
  assert.equal(h.calls.resets, 0);
  const response = await route.POST(request({ token: 'secret-from-email', password: credentials.password }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirect, '/account/register');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(h.calls.sessions, 0);
  assert.equal(h.auth.verifyPassword(credentials.password, customer.password_hash), true);
  assert.equal((await route.POST(request({ token: 'secret-from-email', password: 'replacement-password' }))).status, 400);
  assert.equal(h.calls.resets, 1);
  const sessionRequest = new Request('https://example.com/account', { headers: { cookie: `${h.auth.CUSTOMER_SESSION_COOKIE}=old-session` } });
  assert.equal(await h.auth.resolveCustomerFromRequest(sessionRequest), null);
  assert.equal((await load('src/app/api/account/login/route.ts', h.modules).POST(request({ identifier: customer.email, password: credentials.password }))).status, 403);
});

test('email-owned pending lead can finish fully checked signup with its genuine private invitation', async () => {
  const customer = { id: 1, email: credentials.email, account_status: 'pending_password', email_verified: false };
  const h = harness(customer);
  customer.password_hash = h.auth.hashPassword(credentials.password);
  const route = load('src/app/api/account/register/route.ts', h.modules);
  const bad = await route.POST(request({ ...credentials, referredBy: 'RAF affiliate', affiliateInvite: 'guess' }));
  assert.equal(bad.status, 400);
  assert.equal(h.calls.activated, 0);
  const good = await route.POST(request({ ...credentials, referredBy: 'RAF affiliate', affiliateInvite: 'real-private-invite' }));
  assert.equal(good.status, 200);
  assert.equal(h.calls.activated, 1);
  assert.equal(h.calls.sessions, 1);
  assert.ok(good.headers.get('set-cookie'));
});

test('token storage consumes a valid unexpired token and changes its owner in one statement', () => {
  const db = readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8');
  const start = db.indexOf('export async function resetCustomerPasswordByToken');
  const body = db.slice(start, db.indexOf('export interface EmailVerificationTokenRow', start));
  assert.match(body, /WITH claimed AS/);
  assert.match(body, /t\.used_at IS NULL/);
  assert.match(body, /t\.expires_at > now\(\)/);
  assert.match(body, /c\.banned_at IS NULL/);
  assert.match(body, /WHERE c\.id = claimed\.customer_id/);
});

test('invalid checkout phone is rejected by the real handler before any order or pricing write', async () => {
  const file = 'src/app/api/checkout/place-order/route.ts';
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const modules = Object.fromEntries([...source.matchAll(/from '(\@\/[^']+)'/g)].map(match => [match[1], {}]));
  let writes = 0;
  Object.assign(modules, { 'next/server': next, '@/lib/phoneNumber': phone,
    '@/lib/db': { isDbConfigured: () => true, createOrder: async () => { writes++; } },
    '@/lib/orderPricing': { isValidItem: () => true } });
  const route = load(file, modules);
  for (const value of ['079111234567', { number: '+447911123456' }]) {
    const response = await route.POST(request({ phone: value, address: { country: 'GB' }, items: [] }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, phone.PHONE_ERROR);
    assert.equal(writes, 0);
  }
});

test('invalid account phone cannot save; an omitted phone or consent does not overwrite either', async () => {
  const customer = { id: 1, account_status: 'active', phone: '+447911123456', address_country: 'GB', marketing_consent: true, phone_marketing_consent: true,
    instagram_marketing_consent: true, facebook_marketing_consent: true };
  const h = harness(customer);
  let writes = 0;
  h.db.updateCustomerProfile = async (_id, params) => { writes++; assert.equal(params.phone, customer.phone); assert.equal(params.marketingConsent, true); return customer; };
  h.modules['@/lib/customerProfileEdit'] = { customerProfileEdit };
  const route = load('src/app/api/account/update/route.ts', h.modules);
  const session = body => new Request('https://example.com/account', { method: 'POST', headers: { cookie: `${h.auth.CUSTOMER_SESSION_COOKIE}=session` }, body: JSON.stringify(body) });
  assert.equal((await route.POST(session({ phone: '079111234567' }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(session({ instagramProfile: 'test.member' }))).status, 200);
  assert.equal(writes, 1);
  assert.equal(h.calls.marketing, 0);
});

test('an existing verified Beauty member still signs in with the Beauty session cookie', async () => {
  const customer = { id: 1, email: credentials.email, account_status: 'active', email_verified: true };
  const h = harness(customer);
  customer.password_hash = h.auth.hashPassword(credentials.password);
  const route = load('src/app/api/account/login/route.ts', h.modules);
  const response = await route.POST(request({ identifier: customer.email, password: credentials.password }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /^wb_customer_session=/);
  assert.equal(h.calls.sessions, 1);
});

test('signed-in Beauty phone edits save by country while existing consent stays intact', async () => {
  for (const [country, entered, expected] of [['GB', '07911 123456', '+447911123456'], ['TR', '5321234567', '+905321234567']]) {
    const customer = { id: 1, account_status: 'active', phone: 'historic phone value', address_country: country, marketing_consent: true, phone_marketing_consent: false,
      instagram_marketing_consent: true, facebook_marketing_consent: true };
    const h = harness(customer);
    let saved;
    h.db.updateCustomerProfile = async (_id, params) => { saved = params; return { ...customer, phone: params.phone }; };
    h.modules['@/lib/customerProfileEdit'] = { customerProfileEdit };
    const route = load('src/app/api/account/update/route.ts', h.modules);
    const response = await route.POST(new Request('https://www.windsorbeauty.is/api/account/update', { method: 'POST', headers: { cookie: `${h.auth.CUSTOMER_SESSION_COOKIE}=session` }, body: JSON.stringify({ phone: entered }) }));
    assert.equal(response.status, 200);
    assert.equal(saved.phone, expected);
    assert.equal(saved.marketingConsent, true);
    assert.equal(saved.phoneMarketingConsent, false);
    assert.equal(saved.instagramMarketingConsent, true);
    assert.equal(saved.facebookMarketingConsent, true);
    assert.equal(h.calls.marketing, 0);
    assert.equal(customer.phone, 'historic phone value', 'The historical fixture was not rewritten');
  }
});


test('ordinary friend applicants remain accepted with member referrals off and no code', async () => {
  for (const file of ['src/app/api/account/register/route.ts','src/app/api/launch/subscribe/route.ts']) {
    const customer = { id:1,email:credentials.email,account_status:'pending_password',email_verified:true };
    const h=harness(customer); customer.password_hash=h.auth.hashPassword(credentials.password);
    const response=await load(file,h.modules).POST(request({...credentials,referredBy:'A friend or word of mouth: Jane Example'}));
    assert.equal(response.status,200,file); assert.equal(h.calls.activated,1,file);
  }
});

test('form retains existing friend and Other choices without the new referral admission gates',()=> {
 const form=readFileSync(new URL('../src/components/MemberRegistrationForm.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(form,/signupReferralError|SIGNUP_REFERRAL_SOURCES|memberReferralsOpen/);
 assert.match(form,/const needsDetail = referralNeedsDetail\(referralSource\)/);
});
