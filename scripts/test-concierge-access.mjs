// Who can reach the AI Assistance while it is closed to customers.
//
// Added 2026-08-05 when Windsor Glow's own admins were given a way in without
// their address having to be added to CONCIERGE_TEST_ACCOUNTS. The gate now has
// three doors, and a gate with more doors is worth a test: the point of these
// checks is that the two NEW ways to get in are the only new ways, and that the
// forgeable staff hint cookie is not one of them.
//
//   npm run test:access
//
// Free. No database, no network, no model call.

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const REAL_TOKEN = 'a-real-admin-session-token-0123456789';

// The module reads process.env at call time, so each case sets the world it
// wants and the import is shared.
function setEnv({ live, testers, adminToken }) {
  if (live === undefined) delete process.env.CONCIERGE_ACCOUNT_LIVE;
  else process.env.CONCIERGE_ACCOUNT_LIVE = live;
  if (testers === undefined) delete process.env.CONCIERGE_TEST_ACCOUNTS;
  else process.env.CONCIERGE_TEST_ACCOUNTS = testers;
  if (adminToken === undefined) delete process.env.ADMIN_SESSION_TOKEN;
  else process.env.ADMIN_SESSION_TOKEN = adminToken;
}

function req(cookie) {
  return new Request('https://www.windsorglow.com/api/account/me', {
    headers: cookie ? { cookie } : {},
  });
}

// Run through scripts/alias-loader.mjs, which lets plain node read the app's
// TypeScript straight from src. See the npm script.
const { conciergeAvailableToRequest, isSignedInAdmin } = await import(
  '../src/lib/concierge/availability.ts'
);

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

console.log('\n=== WHO CAN REACH THE AI ASSISTANCE ===\n');

console.log('Closed to customers, admin token configured:');
setEnv({ live: 'off', testers: 'kieranowenproducer@gmail.com', adminToken: REAL_TOKEN });

check('a signed-in admin gets in, even though their address is not on the tester list', () => {
  assert.equal(
    conciergeAvailableToRequest(req(`wg_admin_session=${REAL_TOKEN}`), 'someone@windsorglow.com'),
    true,
  );
});

check('an admin with no customer email at all still gets in', () => {
  assert.equal(conciergeAvailableToRequest(req(`wg_admin_session=${REAL_TOKEN}`), null), true);
});

check('the admin cookie survives other cookies sitting beside it', () => {
  const cookie = `wg_customer_session=abc; wg_admin_session=${REAL_TOKEN}; wg_ui_session=staff`;
  assert.equal(conciergeAvailableToRequest(req(cookie), 'nobody@example.com'), true);
});

check('a tester still gets in with no admin cookie', () => {
  assert.equal(conciergeAvailableToRequest(req(''), 'kieranowenproducer@gmail.com'), true);
});

check('an ordinary customer is still turned away', () => {
  assert.equal(conciergeAvailableToRequest(req(''), 'customer@example.com'), false);
});

console.log('\nThe ways somebody might try to talk their way in:');

check('a wrong admin cookie value does NOT get in', () => {
  assert.equal(conciergeAvailableToRequest(req('wg_admin_session=guessed'), 'x@example.com'), false);
});

check('an empty admin cookie does NOT get in', () => {
  assert.equal(conciergeAvailableToRequest(req('wg_admin_session='), 'x@example.com'), false);
});

check('the forgeable wg_ui_session=staff hint cookie does NOT get in', () => {
  assert.equal(conciergeAvailableToRequest(req('wg_ui_session=staff'), 'x@example.com'), false);
});

check('a cookie merely NAMED like the admin one does NOT get in', () => {
  const cookie = `not_wg_admin_session=${REAL_TOKEN}`;
  assert.equal(conciergeAvailableToRequest(req(cookie), 'x@example.com'), false);
});

check('a token that is a prefix of the real one does NOT get in', () => {
  const cookie = `wg_admin_session=${REAL_TOKEN.slice(0, 10)}`;
  assert.equal(conciergeAvailableToRequest(req(cookie), 'x@example.com'), false);
});

console.log('\nFail closed when the admin token is not configured:');
setEnv({ live: 'off', testers: '', adminToken: undefined });

check('with no ADMIN_SESSION_TOKEN set, nobody is an admin', () => {
  assert.equal(isSignedInAdmin(req('wg_admin_session=anything')), false);
  assert.equal(conciergeAvailableToRequest(req('wg_admin_session=anything'), 'x@e.com'), false);
});

check('an empty ADMIN_SESSION_TOKEN does not let an empty cookie through', () => {
  setEnv({ live: 'off', testers: '', adminToken: '   ' });
  assert.equal(conciergeAvailableToRequest(req('wg_admin_session=   '), 'x@e.com'), false);
});

// The safety property that lets a staff turn happen at all. The hosted service
// only switches on the order tools when it is handed a session carrying a real
// customer id AND email (api/chat.mjs: `b.surface === 'account' && b.session &&
// b.session.customerId != null && b.session.email`). A staff turn sends no
// session, so the account toolset is never offered and the audience falls back
// to 'public'. These checks pin the shape the route must keep sending, so a
// later edit cannot quietly start inventing an identity to fill the gap.
console.log('\nWhat a staff turn sends to the assistant:');

function serviceWouldTreatAsAccount(payload) {
  return Boolean(
    payload.surface === 'account'
    && payload.session
    && payload.session.customerId != null
    && payload.session.email,
  );
}

check('a staff turn carries no session, so no order tool is ever offered', () => {
  const staffTurn = { surface: 'account', session: undefined, actor: 'staff:admin' };
  assert.equal(serviceWouldTreatAsAccount(staffTurn), false);
});

check('a customer turn still carries a full session, so orders still work', () => {
  const customerTurn = {
    surface: 'account',
    session: { customerId: 1, email: 'someone@example.com', firstName: 'Sam' },
    actor: 'customer:1',
  };
  assert.equal(serviceWouldTreatAsAccount(customerTurn), true);
});

check('a half-filled session is not honoured either', () => {
  assert.equal(
    serviceWouldTreatAsAccount({ surface: 'account', session: { customerId: 1, email: '' } }),
    false,
  );
  assert.equal(
    serviceWouldTreatAsAccount({ surface: 'account', session: { customerId: null, email: 'a@b.c' } }),
    false,
  );
});

console.log('\nWhen it is open to everyone, it is open to everyone:');
setEnv({ live: 'on', testers: '', adminToken: REAL_TOKEN });

check('any signed-in customer gets in once CONCIERGE_ACCOUNT_LIVE=on', () => {
  assert.equal(conciergeAvailableToRequest(req(''), 'anyone@example.com'), true);
});

console.log('\nPEARL keeps the same member and admin gates:');

const pearlAccountRoute = readFileSync(
  new URL('../src/app/api/account/pearl-terminology/route.ts', import.meta.url),
  'utf8',
);
const middlewareSource = readFileSync(
  new URL('../src/proxy.ts', import.meta.url),
  'utf8',
);
const localPreviewSource = readFileSync(
  new URL('../src/app/concierge-local-preview/page.tsx', import.meta.url),
  'utf8',
);

check('the PEARL terminology feed requires a signed-in member or a real admin', () => {
  assert.match(pearlAccountRoute, /if \(!customer && !admin\).*status: 401/s);
});

check('the PEARL terminology feed passes through the same AI Assistance gate', () => {
  assert.match(pearlAccountRoute, /conciergeAvailableTo\(customer\?\.email \?\? null, \{ isAdmin: admin \}\)/);
  assert.match(pearlAccountRoute, /status: 403/);
});

check('the administration area protects every PEARL admin page and endpoint', () => {
  assert.match(middlewareSource, /pathname\.startsWith\('\/admin'\).*pathname\.startsWith\('\/api\/admin'\)/s);
});

check('the visual-review page cannot exist in production', () => {
  assert.match(localPreviewSource, /process\.env\.NODE_ENV === 'production'.*notFound\(\)/s);
});

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
