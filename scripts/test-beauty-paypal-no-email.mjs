// Real routes and real PostgreSQL queries, with temporary tables only.
// Run after npm run db:local. Email delivery and provider calls are intercepted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import pg from 'pg';

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
  }));
const connectionString = env.DATABASE_URL;
const address = new URL(connectionString);
assert.ok(['localhost', '127.0.0.1'].includes(address.hostname) && address.port === '5434'
  && address.pathname === '/windsor_beauty', 'This test only uses the Windsor Beauty local database on port 5434.');
const client = new pg.Client({ connectionString });
const sent = [];
let stockChecks = 0;
let heartbeats = 0;
globalThis.__beautyPaymentTest = {
  sql: async (parts, ...values) => (await client.query(parts.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, ''), values)).rows,
  send: async (message, options) => { sent.push({ message, options }); return { id: 'intercepted', error: null }; },
  stock: async () => { stockChecks++; },
  heartbeat: async () => { heartbeats++; },
};
const mocked = new Map([
  ['/src/lib/db/client.ts', 'export const sql = globalThis.__beautyPaymentTest.sql; export const requireDb = () => sql; export const isDbConfigured = () => true;'],
  ['/src/lib/email/send.ts', 'export const sendEmail = globalThis.__beautyPaymentTest.send;'],
  ['/src/lib/cronHeartbeat.ts', 'export const recordCronRun = globalThis.__beautyPaymentTest.heartbeat;'],
  ['/src/lib/retireProducts.ts', 'export const afterStockMovement = globalThis.__beautyPaymentTest.stock;'],
  ['/src/lib/automationFailure.ts', 'export const reportAutomationFailure = async () => { throw new Error("Unexpected automation failure"); };'],
]);
registerHooks({ resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier === 'next/server' ? 'next/server.js' : specifier, context);
  for (const [suffix, source] of mocked) {
    if (resolved.url.endsWith(suffix)) return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
  }
  // Voucher release is outside this payment-method test and the scheme is off.
  if (context.parentURL?.includes('/api/cron/unpaid-orders/') && specifier === '@/lib/glowCardLoyalty') {
    return { url: 'data:text/javascript,export const releaseGlowCardVoucherForUnpaidOrder = async () => false;', shortCircuit: true };
  }
  return resolved;
} });
globalThis.fetch = async () => { throw new Error('Network calls are forbidden in this test.'); };
process.env.RESEND_API_KEY = 'test-only-intercepted';
process.env.PAYPAL_ME_URL = 'https://paypal.me/example';
process.env.CRON_SECRET = 'test-only-cron';
delete process.env.WB_MEMBER_REFERRALS_ENABLED;
delete process.env.WB_GLOW_CARD_LOYALTY_ENABLED;

await client.connect();
try {
  // No public table may be found by the tested queries. Closing this connection
  // removes these tables even if an assertion fails.
  await client.query('SET search_path TO pg_temp');
  await client.query(`CREATE TEMP TABLE orders (
    order_number TEXT PRIMARY KEY, email TEXT DEFAULT 'fixture@example.invalid', customer_name TEXT DEFAULT 'Local fixture',
    items JSONB DEFAULT '[]', subtotal NUMERIC DEFAULT 1, discount_code TEXT, discount_amount NUMERIC DEFAULT 0,
    rule_discount_amount NUMERIC DEFAULT 0, shipping_label TEXT DEFAULT 'UK', shipping_cost NUMERIC DEFAULT 0,
    paypal_fee NUMERIC DEFAULT 0, total NUMERIC DEFAULT 1, status TEXT DEFAULT 'pending', phone TEXT,
    shipping_line1 TEXT, shipping_line2 TEXT, shipping_city TEXT, shipping_postcode TEXT, shipping_country TEXT,
    created_at TIMESTAMPTZ DEFAULT now(), payment_method TEXT, payment_access_token TEXT,
    paypal_order_id TEXT, payment_confirmed_at TIMESTAMPTZ, delivered_at TIMESTAMPTZ, archived_at TIMESTAMPTZ,
    reservation_expires_at TIMESTAMPTZ, payment_reminder_sent_at TIMESTAMPTZ,
    checkout_stock_decremented_at TIMESTAMPTZ, checkout_stock_items JSONB DEFAULT '[]',
    stock_restored_at TIMESTAMPTZ, admin_notes TEXT
  )`);
  await client.query('CREATE TEMP TABLE product_variant_stock (slug TEXT, dosage TEXT, quantity INT, updated_at TIMESTAMPTZ)');
  const db = await import('../src/lib/db.ts');
  const checkout = await import('../src/app/api/payment/paypal/instructions/route.ts');
  const reminder = await import('../src/app/api/admin/orders/[orderNumber]/resend-payment/route.ts');
  const manual = await import('../src/app/api/admin/orders/[orderNumber]/resend-payment-link/route.ts');
  const cron = await import('../src/app/api/cron/unpaid-orders/route.ts');
  const post = body => new Request('https://www.windsorbeauty.co.uk/api/payment/paypal/instructions', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const params = orderNumber => ({ params: Promise.resolve({ orderNumber }) });
  await client.query(`INSERT INTO orders(order_number,payment_method,payment_access_token,reservation_expires_at)
    VALUES ('WB-TEST-PAYPAL','paypal','fixture-token',now()+interval '6 hours'),
      ('WB-TEST-BANK','fena','bank-token',now()+interval '6 hours')`);
  assert.equal((await checkout.POST(post({ orderNumber: 'WB-TEST-PAYPAL', paymentToken: 'wrong' }))).status, 403);
  assert.equal(sent.length, 0);
  const result = await checkout.POST(post({ orderNumber: 'WB-TEST-PAYPAL', paymentToken: 'fixture-token' }));
  assert.equal(result.status, 200);
  const resultBody = await result.json();
  assert.equal(resultBody.paymentUrl, 'https://paypal.me/example/1.00GBP');
  assert.equal(resultBody.resumeUrl, '/resume-payment/fixture-token');
  assert.equal(sent.length, 1, 'Only one staff notice should be sent.');
  assert.equal(sent[0].options.internal, true, 'The notice is internal, not a customer email.');
  assert.match(sent[0].message.subject, /PayPal/);
  assert.match(sent[0].message.text, /verif/i);
  const stored = await db.findOrderByNumber('WB-TEST-PAYPAL');
  assert.equal(stored.status, 'awaiting_payment');
  assert.equal(stored.payment_confirmed_at, null);
  assert.equal(stored.paypal_order_id, 'WB-TEST-PAYPAL');
  assert.equal((await reminder.POST(post({}), params('WB-TEST-PAYPAL'))).status, 409);
  const manualResult = await manual.POST(post({ via: 'paypal' }), params('WB-TEST-PAYPAL'));
  assert.equal(manualResult.status, 200);
  assert.equal((await manualResult.json()).paymentUrl, 'https://paypal.me/example/1.00GBP');
  assert.equal(sent.length, 1, 'Neither manual PayPal action sends a customer email.');
  await client.query("UPDATE orders SET status='paid',payment_confirmed_at=now() WHERE order_number='WB-TEST-PAYPAL'");
  assert.equal((await checkout.POST(post({ orderNumber: 'WB-TEST-PAYPAL', paymentToken: 'fixture-token' }))).status, 409);
  assert.equal((await manual.POST(post({ via: 'paypal' }), params('WB-TEST-PAYPAL'))).status, 409);
  assert.equal((await db.findOrderByNumber('WB-TEST-PAYPAL')).status, 'paid');
  assert.equal(sent.length, 1);
  await client.query("UPDATE orders SET status='awaiting_payment',payment_confirmed_at=NULL WHERE order_number='WB-TEST-PAYPAL'");
  const due = await db.claimDuePaymentReminders();
  assert.deepEqual(due.map(row => row.order_number), ['WB-TEST-BANK']);
  assert.equal((await db.findOrderByNumber('WB-TEST-PAYPAL')).payment_reminder_sent_at, null);
  assert.deepEqual(await db.claimDuePaymentReminders(), [], 'A reminder cannot be claimed twice.');
  await db.releasePaymentReminderClaim('WB-TEST-BANK');
  const cronRequest = () => new Request('https://www.windsorbeauty.co.uk/api/cron/unpaid-orders', { headers: { authorization: 'Bearer test-only-cron' } });
  const cronResult = await cron.GET(cronRequest());
  assert.equal(cronResult.status, 200);
  assert.equal((await cronResult.json()).reminderSentCount, 1);
  assert.equal(sent.length, 2, 'Only the bank order gets a customer reminder.');
  assert.match(sent[1].message.text, /WB-TEST-BANK/);
  assert.doesNotMatch(sent[1].message.text, /WB-TEST-PAYPAL/);
  await client.query("INSERT INTO product_variant_stock VALUES ('test-product','small',3,now())");
  await client.query(`UPDATE orders SET reservation_expires_at=now()-interval '1 minute',
    checkout_stock_decremented_at=now(), checkout_stock_items='[{"slug":"test-product","variant":"small","quantity":2}]'
    WHERE order_number='WB-TEST-PAYPAL'`);
  const expired = await cron.GET(cronRequest());
  assert.equal(expired.status, 200);
  assert.equal((await expired.json()).expiredCount, 1);
  assert.equal((await db.findOrderByNumber('WB-TEST-PAYPAL')).status, 'cancelled');
  assert.equal((await client.query('SELECT quantity FROM product_variant_stock')).rows[0].quantity, 5);
  assert.ok((await db.findOrderByNumber('WB-TEST-PAYPAL')).stock_restored_at);
  await cron.GET(cronRequest());
  assert.equal((await client.query('SELECT quantity FROM product_variant_stock')).rows[0].quantity, 5, 'Repeated expiry cannot restore stock twice.');
  assert.equal(sent.length, 2, 'Expiry sends no PayPal email.');
  assert.equal(stockChecks, 1);
  assert.equal(heartbeats, 3);
  console.log('PASS: PayPal handoff, token checks, paid-order protection, staff notice, no customer emails, bank-only reminder claims and one-time stock release.');
} finally {
  await client.end();
  delete globalThis.__beautyPaymentTest;
}
