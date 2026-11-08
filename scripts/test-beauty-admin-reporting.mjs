import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Reuse the installed test engine only. No Glow application module or database is opened.
const engine = createRequire(resolve(root, '../../windsor-glow/website-account-inbox-local/package.json'));
const { PGlite } = engine('@electric-sql/pglite');
const receiptDir = resolve(root, '.local-evidence/beauty-admin-parity-20261108/tests', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(receiptDir, { recursive: true });
let checks = 0;
const sources = {};
function check(actual, expected, name) { assert.deepEqual(actual, expected, name); checks++; }
function load(path, dependencies = {}, env = {}) {
  const source = readFileSync(resolve(root, path), 'utf8');
  sources[path] = createHash('sha256').update(source).digest('hex');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, process: { env }, Date, Request, Response, console });
  return module.exports;
}
const pg = new PGlite();
let readsOnly = false;
let readQueries = 0;
async function sql(parts, ...values) {
  const query = parts.reduce((text, part, i) => text + part + (i < values.length ? `$${i + 1}` : ''), '');
  if (readsOnly) { assert.match(query.trim(), /^SELECT\b/i); readQueries++; }
  return (await pg.query(query, values)).rows;
}
const client = { requireDb: () => sql, isDbConfigured: () => true };
const jsonResponse = { NextResponse: { json: (body, init) => Response.json(body, init) } };
try {
  await load('src/lib/db/schema-parts/customers-and-orders.ts').ensureCustomersAndOrders(sql);
  await load('src/lib/db/schema-parts/qr-upsells-and-invoices.ts').ensureQrUpsellsAndInvoices(sql);
  const archive = load('src/lib/db/customerEmails.ts', { './client': client });
  await pg.exec(`
    INSERT INTO customers(id,email,password_hash,first_name,last_name,email_verified,created_at,referred_by) VALUES
      (1,'one@example.invalid','fixture','One','Member',true,'2026-09-30 23:30:00+00','Instagram'),
      (2,'two@example.invalid','fixture','Two','Member',false,'2026-10-01 01:00:00+00',null),
      (3,'three@example.invalid','fixture','Three','Member',true,'2026-10-02 01:00:00+00',null);
    INSERT INTO orders(order_number,customer_id,email,customer_name,items,subtotal,shipping_label,total,status,shipping_address,payment_confirmed_at,tracking_number,shipping_email_sent_at) VALUES
      ('WB-PAID',1,'one@example.invalid','One','[]',20,'UK',20,'paid','Test','2026-10-02',null,'2026-10-02'),
      ('WB-GUEST',null,'ONE@example.invalid','Guest','[]',10,'UK',10,'paid','Test','2026-10-02',null,null),
      ('WB-OTHER',2,'one@example.invalid','Different owner','[]',30,'UK',30,'paid','Test','2026-10-02',null,null),
      ('WB-UNPAID',1,'one@example.invalid','One','[]',500,'UK',500,'pending','Test',null,null,null),
      ('WB-REFUND',1,'one@example.invalid','One','[]',40,'UK',40,'refunded','Test','2026-10-02',null,null),
      ('WB-CANCEL',1,'one@example.invalid','One','[]',50,'UK',50,'cancelled','Test','2026-10-02',null,null);
    INSERT INTO invoices(id,invoice_number,customer_name,email,line_items,subtotal,total,order_number,created_at,sent_at,viewed_at,public_token) VALUES
      (1,'INV-1','One','one@example.invalid','[]',20,20,'WB-PAID','2026-10-01','2026-10-01 01:00+00','2026-10-01 02:00+00','synthetic-invoice-1'),
      (2,'INV-10','Other','two@example.invalid','[]',30,30,null,'2026-10-01',null,null,'synthetic-invoice-2');
  `);
  const addEmail = (params) => archive.recordCustomerEmail({ direction: 'sent', customerId: 1, email: 'one@example.invalid', ourAddress: 'fixture@example.invalid', bodyText: 'Synthetic', ...params });
  await addEmail({ subject: 'Invoice INV-1 from Windsor Beauty', emailType: 'invoice', deliveryStatus: 'delivered' });
  await addEmail({ subject: 'Invoice INV-10 from Windsor Beauty', emailType: 'invoice' });
  await addEmail({ subject: 'Invoice INV-1 from Windsor Beauty', email: 'unrelated@example.invalid', emailType: 'invoice' });
  await addEmail({ subject: 'Tracking', orderRef: 'WB-PAID', emailType: 'dispatch', deliveryStatus: 'bounced' });
  await addEmail({ subject: 'Invoice INV-1 from Windsor Beauty', direction: 'received', emailType: 'invoice' });
  const referral = load('src/lib/referralSources.ts');
  const cameFrom = load('src/app/admin/customers/cameFrom.ts', { '@/lib/referralSources': referral });
  const stats = load('src/lib/db/customerStats.ts', { './client': client, '@/app/admin/customers/cameFrom': cameFrom });
  const projection = load('src/lib/invoiceTrail.ts');
  const history = load('src/lib/db/invoiceTrail.ts', { './client': client, '../invoiceTrail': projection });
  async function snapshot() {
    return JSON.stringify(await pg.query(`SELECT (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM customers c) customers,
      (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o) orders,
      (SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM invoices i) invoices,
      (SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM customer_emails e) emails`));
  }
  const before = await snapshot();
  await pg.exec('BEGIN READ ONLY'); readsOnly = true;
  const people = await stats.listCustomerStatsPeople();
  check(people.length, 3, 'all real fixture customers');
  const one = people.find(p => p.id === 1);
  check(one.month, '2026-10', 'UK daylight-saving month boundary');
  check(one.paidOrders, 4, 'confirmed payments only; cancelled/refunded still recorded paid');
  check(one.spent, 30, 'unpaid/refunded/cancelled excluded from spend');
  check(people.find(p => p.id === 2).spent, 30, 'explicit other customer ownership wins over email match');
  check(people.find(p => p.id === 3).paidOrders, 0, 'no orders preserved');
  check(people.find(p => p.id === 3).sourceKnown, false, 'unknown referral not invented');
  const trail = await history.readInvoiceTrail(1);
  check(trail.emailHistoryAvailable, true, 'current archive available');
  check(trail.events.filter(e => e.key.startsWith('email-')).length, 2, 'exact invoice/order scope, not INV-10/recipient/received');
  check(trail.events.some(e => e.key === 'dispatched'), false, 'email timestamp not dispatch evidence');
  check(trail.events.some(e => e.key === 'paid'), true, 'actual stored payment confirmation');
  check(trail.events.find(e => e.key.startsWith('email-') && e.title === 'Tracking email sent').tone, 'bad', 'bounce visible');
  check(await history.readInvoiceTrail(999), null, 'missing invoice not fabricated');
  check(Object.keys(trail.events[0]).some(key => /token|body|email|provider/i.test(key)), false, 'bounded metadata output');
  await pg.exec('ROLLBACK'); readsOnly = false;
  check(await snapshot(), before, 'all business and archive rows unchanged');
  const uncertain = projection.buildInvoiceTrail({ invoice_number: 'INV-X', created_at: '2026-01-01', sent_at: null, viewed_at: '2026-01-02', paid_at: null, cancelled_at: null }, { status: 'delivered', payment_confirmed_at: null, dispatched_at: null, delivered_at: null, tracking_number: 'TEST' }, []);
  check(uncertain.find(e => e.key === 'dispatched').at, null, 'no invented dispatch timestamp');
  check(uncertain.find(e => e.key === 'delivered').at, null, 'no invented delivery timestamp');
  check(uncertain.some(e => e.key === 'paid'), false, 'viewed/delivered is not payment proof');
  const auth = load('src/lib/adminReadAccess.ts', {}, { ADMIN_SESSION_TOKEN: 'synthetic-report-token' });
  const request = cookie => new Request('https://www.windsorbeauty.is/api/admin/customer-stats', { headers: cookie ? { cookie } : {} });
  for (const cookie of [null, 'wb_admin_session=wrong', 'wg_admin_session=synthetic-report-token', 'wb_customer_session=synthetic-report-token', 'wb_admin_session=synthetic-report-token; wb_admin_session=wrong']) check(auth.hasAdminReadAccess(request(cookie)), false, 'refuse missing/wrong/other-business/customer/ambiguous auth');
  check(auth.hasAdminReadAccess(request('wb_admin_session=synthetic-report-token')), true, 'actual Beauty cookie');
  check(load('src/lib/adminReadAccess.ts').hasAdminReadAccess(request('wb_admin_session=synthetic-report-token')), false, 'missing configuration fails closed');
  let calls = 0;
  const statsRoute = load('src/app/api/admin/customer-stats/route.ts', { 'next/server': jsonResponse, '@/lib/adminReadAccess': auth, '@/lib/db/client': client, '@/lib/db/customerStats': { listCustomerStatsPeople: async () => { calls++; return people; } } });
  check((await statsRoute.GET(request(null))).status, 401, 'handler independently protects stats');
  check(calls, 0, 'unauthorized request does not query');
  const good = await statsRoute.GET(request('wb_admin_session=synthetic-report-token'));
  check(good.status, 200, 'staff stats response');
  check(good.headers.get('cache-control'), 'private, no-store', 'private stats never cached');
  const trailRoute = load('src/app/api/admin/invoices/[id]/trail/route.ts', { 'next/server': jsonResponse, '@/lib/adminReadAccess': auth, '@/lib/db/client': client, '@/lib/db/invoiceTrail': { readInvoiceTrail: async id => { calls++; return id === 1 ? trail : null; } } });
  for (const id of ['1.json', '-1', '0', '1e0', '9007199254740992']) check((await trailRoute.GET(request('wb_admin_session=synthetic-report-token'), { params: Promise.resolve({ id }) })).status, 400, 'malformed IDs rejected');
  check((await trailRoute.GET(request(null), { params: Promise.resolve({ id: '1' }) })).status, 401, 'trail anonymous denied');
  check((await trailRoute.GET(request('wb_admin_session=synthetic-report-token'), { params: Promise.resolve({ id: '9' }) })).status, 404, 'missing invoice handler');
  const goodTrail = await trailRoute.GET(request('wb_admin_session=synthetic-report-token'), { params: Promise.resolve({ id: '1' }) });
  check(goodTrail.status, 200, 'actual trail response');
  check(goodTrail.headers.get('cache-control'), 'private, no-store', 'private trail never cached');
  // Archive read failure remains visible without inventing successful delivery or running DDL.
  const unavailable = load('src/lib/db/invoiceTrail.ts', { './client': { requireDb: () => async (parts, ...values) => { if (parts.join('').includes('customer_emails')) throw Error('fixture archive unavailable'); return sql(parts, ...values); } }, '../invoiceTrail': projection });
  check((await unavailable.readInvoiceTrail(1)).emailHistoryAvailable, false, 'unavailable archive explicitly reported');
  writeFileSync(resolve(receiptDir, 'receipt.json'), JSON.stringify({ ok: true, checks, readQueries, engine: 'fresh in-memory PGlite; actual Beauty canonical DDL', sources, originalOrLiveDatabaseOpened: false, externalCalls: 0 }, null, 2));
  console.log(JSON.stringify({ ok: true, checks, receipt: resolve(receiptDir, 'receipt.json') }));
} catch (error) {
  writeFileSync(resolve(receiptDir, 'receipt.json'), JSON.stringify({ ok: false, checks, sources, error: String(error.stack) }, null, 2));
  throw error;
} finally { await pg.close(); }
