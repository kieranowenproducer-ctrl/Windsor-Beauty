// Runs the real request gate without a server, database, email or payment call.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
} });
const { NextRequest } = await import('next/server.js');
const { proxy } = await import('../src/proxy.ts');
const { affiliateCreditOwnedBy } = await import('../src/lib/affiliates.ts');

process.env.NODE_ENV = 'production';
process.env.MAINTENANCE_MODE = 'on';
process.env.ADMIN_SESSION_TOKEN = 'test-only-staff-session';
process.env.PREVIEW_ACCESS_CODE = 'test-only-preview';
// The abandoned launch clock must never affect the current holding screen.
process.env.LAUNCH_FORCE_LOCK = '1';
process.env.LAUNCH_ACCESS_CODE = 'test-only-old-launch';
delete process.env.WB_AFFILIATE_CUSTOMER_ACCESS_ENABLED;
delete process.env.DATABASE_URL;

function response(path, cookie = '', method = 'GET') {
  return proxy(new NextRequest(`https://www.windsorbeauty.co.uk${path}`, {
    method, headers: cookie ? { cookie } : {},
  }));
}
const preview = 'wb_preview_access=test-only-preview';
const staff = 'wb_admin_session=test-only-staff-session';
for (const path of ['/coming-soon', '/raf-invite/example?preview=1', '/refer/example',
  '/glow-card-terms', '/account/glow-card', '/account/glow-card/terms', '/account/affiliate',
  '/admin/affiliates', '/admin/member-referrals', '/api/admin/affiliates',
  '/api/admin/member-referrals', '/api/admin/launch/send', '/api/launch/subscribe',
  '/api/launch/unlock', '/api/launch/countdown', '/api/account/affiliate/invitations',
  '/api/account/referrals', '/api/affiliate-invitation', '/api/affiliate-request',
  '/api/cron/affiliate-code-reminders', '/api/admin/launch/subscribers/example.json']) {
  for (const method of ['GET', 'POST']) {
    for (const cookie of [preview, staff]) {
      const result = response(path, cookie, method);
      assert.equal(result.status, 404, `${method} ${path} must be unavailable`);
      assert.equal(result.headers.get('cache-control'), 'no-store');
    }
  }
}
for (const path of ['/', '/shop', '/api/checkout/place-order']) {
  assert.equal(response(path).status, 503, `${path} stays behind the holding screen`);
  assert.equal(response(path, preview).status, 200, `${path} allows a valid preview`);
}
for (const path of ['/api/webhooks/fena', '/api/cron/royal-mail-sync', '/admin/login', '/api/admin/login']) {
  assert.equal(response(path).status, 200, `${path} reaches its own access checks`);
}
assert.equal(response('/api/admin/orders/1.json').status, 401);
assert.equal(response('/api/admin/orders/1.json', staff).status, 200);
assert.equal(response('/account/register', preview).status, 200);
assert.equal(await affiliateCreditOwnedBy('RAF-CREDIT-EXAMPLE', 1), false,
  'Affiliate credit is refused while the scheme is off, without accessing a database');
console.log('PASS: retired features refuse GET and POST, the holding screen stays on, and active shop routes remain reachable.');
