import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';

const brand = readFileSync(new URL('../package.json', import.meta.url), 'utf8').includes('windsor-beauty') ? 'beauty' : 'glow';
const baseline = brand === 'glow' ? '2b720062d43f6059dd6277788de3ec8e39f01690' : 'ca54e74c32952efa723ba9f6adaa0f6852377707';
const cwd = new URL('../', import.meta.url);
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks++; };
function load(source, dependencies, env) {
  const target = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText,
    { module: target, exports: target.exports, require: name => { if (!(name in dependencies)) throw Error(`Unexpected import ${name}`); return dependencies[name]; }, process: { env }, URL, console });
  return target.exports;
}
class NextResponse extends Response {
  constructor(body, options) { super(body, options); this.cookies = { set() {}, delete() {} }; }
  static next() { return new NextResponse(null, { headers: { 'x-middleware-next': '1' } }); }
  static redirect(url) { return new NextResponse(null, { status: 307, headers: { location: String(url) } }); }
  static json(body, options = {}) { return new NextResponse(JSON.stringify(body), options); }
}
const policyExports = load(readFileSync(new URL('../src/lib/storefrontHostPolicy.ts', import.meta.url), 'utf8'), {}, {});
const policy = policyExports.storefrontHostDecision;
function proxy(mode, original = false, platform = {}) {
  const env = { NODE_ENV: 'production', ADMIN_SESSION_TOKEN: 'synthetic-admin', PREVIEW_ACCESS_CODE: 'synthetic-preview', MAINTENANCE_MODE: 'on', WINDSOR_STOREFRONT_MODE: mode, ...platform };
  const source = original ? execFileSync('git', ['show', `${baseline}:src/proxy.ts`], { cwd, encoding: 'utf8' }) : readFileSync(new URL('../src/proxy.ts', import.meta.url), 'utf8');
  const dependencies = { 'next/server': { NextResponse }, '@/lib/storefrontHostPolicy': policyExports };
  if (brand === 'glow') {
    dependencies['@/lib/launchWindow'] = load(readFileSync(new URL('../src/lib/launchWindow.ts', import.meta.url), 'utf8'), {}, env);
    dependencies['@/lib/isDomainHolding'] = load(readFileSync(new URL('../src/lib/isDomainHolding.ts', import.meta.url), 'utf8'), {}, env);
  } else dependencies['@/lib/holdingScreen'] = { isHoldingScreenOn: () => true, holdingResponse: () => new NextResponse('legacy holding', { status: 503 }), previewAccessCode: () => 'synthetic-preview', PREVIEW_COOKIE: 'wb_preview_access' };
  return load(source, dependencies, env).proxy;
}
function request(host, path, method = 'GET', kind = 'guest', forgedHost) {
  const url = new URL(`https://${host}${path}`); url.clone = () => new URL(url);
  const cookies = new Map(kind === 'staff' ? [[brand === 'glow' ? 'wg_admin_session' : 'wb_admin_session', 'synthetic-admin']] : kind === 'preview' ? [['wb_preview_access', 'synthetic-preview']] : []);
  return { url: String(url), nextUrl: url, method, headers: new Headers({ host, 'x-forwarded-host': forgedHost || host }), cookies: { get: name => cookies.has(name) ? { value: cookies.get(name) } : undefined } };
}
const canonical = `www.windsor${brand}.is`, old = `www.windsor${brand}.co.uk`;
// Regression: actual complete old and new proxies behave equally with the gate absent/legacy.
for (const mode of [undefined, '', 'legacy']) {
  const current = proxy(mode), original = proxy(undefined, true);
  for (const host of [canonical, old, `windsor${brand}.com`, 'preview.example.invalid']) for (const path of ['/', '/shop', '/account/login', '/admin', '/api/admin/database-identity', '/api/webhooks/fena', '/checkout/success', '/pay/fixture', '/products.json']) for (const kind of ['guest', 'staff', 'preview']) {
    const a = current(request(host, path, 'GET', kind)), b = original(request(host, path, 'GET', kind));
    equal(a.status, b.status); equal(a.headers.get('location'), b.headers.get('location')); equal(a.headers.get('x-middleware-next'), b.headers.get('x-middleware-next'));
  }
}
const held = ['/', '/shop', '/products/fixture', '/search', '/basket', '/checkout', '/api/products', '/api/products.json', '/shop.json', '/api/payment/fena/create', '/api/webhooks/not-registered', '/api/cron/not-registered'];
for (const mode of ['public', 'closed', 'typo']) {
  const actual = proxy(mode);
  for (const host of [old, `windsor${brand}.com`, 'preview.example.invalid']) for (const path of held) for (const kind of ['guest', 'staff', 'preview']) {
    const result = actual(request(host, path, 'GET', kind));
    equal(result.status, 410); equal(result.headers.get('location'), null); equal(result.headers.get('cache-control'), 'no-store, must-revalidate');
  }
  for (const path of ['/', '/shop', '/api/products']) if (mode !== 'public') equal(actual(request(canonical, path)).status, 503);
  equal(actual(request('foreign.example.invalid', '/shop', 'GET', 'staff', canonical)).status, 410);
  equal(actual(request('foreign.example.invalid', '/pay/fixture')).status, 410);
  equal(actual(request('foreign.example.invalid', '/api/webhooks/fena', 'POST')).status, 410);
  equal(actual(request(old, '/api/admin/database-identity')).status, 401);
  equal(actual(request(old, '/api/admin/database-identity', 'GET', 'staff')).headers.get('x-middleware-next'), '1');
  equal(actual(request('preview.example.invalid', '/api/admin/database-identity')).status, 401);
  for (const [path, method] of [['/pay/fixture', 'GET'], ['/api/invoices/fixture', 'GET'], ['/api/invoices/fixture/accept-terms', 'POST'], ['/api/invoices/fixture/pixel', 'GET'], ['/resume-payment/fixture', 'GET'], ['/api/payment/resume/fixture', 'GET'], ['/checkout/success?order=fixture', 'GET'], ['/checkout/cancelled', 'GET'], ['/api/payment/fena/confirm', 'POST'], ['/api/payment/fena/status/fixture', 'GET'], ['/orders/fixture', 'GET'], ['/api/orders/fixture', 'GET'], ['/account/verify-email', 'GET'], ['/api/account/verify-email', 'GET'], ['/api/webhooks/fena', 'POST'], ['/api/webhooks/resend-inbound', 'POST'], ['/api/webhooks/resend-outbound', 'POST'], ['/api/cron/royal-mail-sync', 'GET'], ['/terms', 'GET']]) equal(actual(request(old, path, method)).headers.get('x-middleware-next'), '1');
  equal(actual(request(old, '/pay/fixture', 'POST')).status, 410);
  equal(actual(request(old, '/api/payment/fena/confirm', 'GET')).status, 410);
  equal(actual(request('preview.example.invalid', '/images/logo.png')).headers.get('x-middleware-next'), '1');
}
equal(proxy('public')(request(canonical, '/shop')).headers.get('x-middleware-next'), '1');
equal(proxy('public')(request(old, '/api/marketing/unsubscribe', 'POST')).headers.get('x-middleware-next'), '1');
if (brand === 'glow') for (const path of ['/raf-invite/fixture', '/refer/fixture', '/r/fixture']) equal(proxy('public')(request(old, path)).headers.get('x-middleware-next'), '1');
for (const compatibilityHosts of ['', 'https://registered.example.invalid', '*.example.invalid', 'registered.example.invalid:443']) equal(policy({ brand, hostname: 'registered.example.invalid', pathname: '/api/webhooks/fena', method: 'POST', mode: 'public', compatibilityHosts }), 'retired');
equal(policy({ brand, hostname: 'registered.example.invalid', pathname: '/api/webhooks/fena', method: 'POST', mode: 'public', compatibilityHosts: 'registered.example.invalid' }), 'compatibility');
equal(policy({ brand, hostname: 'registered.example.invalid', pathname: '/shop', method: 'GET', mode: 'public', compatibilityHosts: 'registered.example.invalid' }), 'retired');
equal(policy({ brand, hostname: 'registered.example.invalid', pathname: '/pay/fixture', method: 'GET', mode: 'public', compatibilityHosts: 'registered.example.invalid' }), 'retired');
// Actual proxy fixtures reproduce Next's internal localhost URL with the real HTTP Host.
for (const host of [canonical, canonical.toUpperCase(), canonical + ':443']) {
  const r = request('localhost:3271', '/shop'); r.headers.set('host', host);
  equal(proxy('public')(r).headers.get('x-middleware-next'), '1');
}
for (const host of [old, 'unknown.invalid', canonical + '.evil.invalid', canonical + ':0', canonical + ':65536', canonical + ':abc', canonical + ':', canonical + ',evil.invalid', canonical + ':443:80', 'user@' + canonical, canonical + '/', canonical + '.']) {
  const r = request(canonical, '/shop'); r.headers.set('host', host); r.headers.set('x-forwarded-host', canonical);
  equal(proxy('public')(r).status, 410);
}
const absent = request(canonical, '/shop'); absent.headers.delete('host');
equal(proxy('public')(absent).headers.get('x-middleware-next'), '1');
const oldWins = request(canonical, '/shop'); oldWins.headers.set('host', old);
equal(proxy('public')(oldWins).status, 410);
for (const raw of ['', ' ' + canonical, canonical + ' ', canonical + '\n', canonical + '?x', canonical + '#x', canonical + ':01']) equal(policyExports.storefrontRequestHostname(raw, canonical), null);
equal(policyExports.storefrontRequestHostname(null, canonical), canonical);
equal(policyExports.storefrontRequestHostname(canonical + ':443', 'localhost'), canonical);
const projectId = brand === 'glow' ? 'prj_UDl8CFovgFkPtYza3m780MxwvRYT' : 'prj_8Y7SQRUuOqQ8uAb71sCo0R8d4fBu';
const deploymentHost = 'synthetic-' + brand + '-current.vercel.app';
const platform = { VERCEL: '1', VERCEL_ENV: 'production', VERCEL_PROJECT_ID: projectId, VERCEL_URL: deploymentHost };
const cronPaths = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).crons.map(row => row.path);
for (const mode of ['public', 'closed']) {
  const actual = proxy(mode, false, platform);
  for (const path of cronPaths) for (const method of ['GET', 'HEAD']) {
    equal(actual(request(deploymentHost, path, method)).headers.get('x-middleware-next'), '1');
    equal(actual(request('stale.vercel.app', path, method)).status, 410);
    equal(actual(request(deploymentHost, path, 'POST')).status, 410);
  }
  for (const path of ['/shop', '/account/login', '/pay/fixture', '/api/webhooks/fena', '/api/cron/not-configured', cronPaths[0] + '/extra']) equal(actual(request(deploymentHost, path)).status, 410);
  for (const bad of [{}, { ...platform, VERCEL: '0' }, { ...platform, VERCEL_ENV: 'preview' }, { ...platform, VERCEL_ENV: undefined }, { ...platform, VERCEL_PROJECT_ID: 'wrong-project' }, { ...platform, VERCEL_URL: 'https://' + deploymentHost }, { ...platform, VERCEL_URL: deploymentHost + ':443' }, { ...platform, VERCEL_URL: deploymentHost + '.evil' }, { ...platform, VERCEL_URL: deploymentHost + ',stale.vercel.app' }]) equal(proxy(mode, false, bad)(request(deploymentHost, cronPaths[0])).status, 410);
  const spoof = request('stale.vercel.app', cronPaths[0]); spoof.headers.set('x-forwarded-host', deploymentHost); spoof.headers.set('x-vercel-deployment-url', deploymentHost);
  equal(actual(spoof).status, 410);
  equal(policy({ brand, hostname: 'stale.vercel.app', pathname: cronPaths[0], method: 'GET', mode, compatibilityHosts: 'stale.vercel.app', platformCronHostname: deploymentHost }), 'retired');
}
equal(policyExports.storefrontPlatformCronHostname(brand, { vercel: '1', environment: 'production', projectId, url: deploymentHost }), deploymentHost);
console.log(JSON.stringify({ passed: true, brand, checks, actualProxyAndLegacyDifferential: true, noNetwork: true, noBuild: true }));
