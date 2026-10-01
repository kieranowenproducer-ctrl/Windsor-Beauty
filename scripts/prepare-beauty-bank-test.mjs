// Prepares a hidden 50p product and an unsent invoice. Never calls a payment
// provider, sends an email, creates an order or requests a Royal Mail parcel.
// Default: local site on port 3002. Live requires --live and --owner-email=...
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const args = new Set(process.argv.slice(2));
const live = args.has('--live');
const OWNER = 'kieranowenproducer@gmail.com';
const suppliedEmail = process.argv.find(arg => arg.startsWith('--owner-email='))?.slice(14);
if (live) assert.equal(suppliedEmail, OWNER, 'Supply the verified owner email before preparing a live draft.');
const base = live ? 'https://www.windsorbeauty.co.uk' : 'http://localhost:3002';
const env = parseEnv(readFileSync(new URL(live ? '../../../windsor-glow/website/.env.local' : '../.env.local', import.meta.url), 'utf8'));
if (!live) {
  const db = new URL(env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(db.hostname) && db.port === '5434'
    && db.pathname === '/windsor_beauty', 'Local preparation requires Windsor Beauty local database settings.');
}
assert.ok(env.ADMIN_USERNAME && env.ADMIN_PASSWORD, 'Local admin sign-in settings are missing.');
let cookie = '';
async function api(path, method = 'GET', body) {
  assert.ok(path.startsWith('/api/admin/'), 'Only staff preparation routes may be called.');
  assert.ok(!/\/(send|mark-paypal-paid|dispatch)$/.test(path), 'Sending and payment actions are forbidden.');
  const response = await fetch(`${base}${path}`, {
    method, redirect: 'error', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Preparation stopped: ${method} ${path.split('?')[0]} returned ${response.status}.`);
  if (path === '/api/admin/login') {
    cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(cookie.includes('wb_admin_session='), 'Admin sign-in did not return a session.');
  }
  return response.json();
}
await api('/api/admin/login', 'POST', { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD });
const slug = 'owner-bank-payment-test-50p';
const name = 'Owner bank payment test';
const marker = 'WB-OWNER-BANK-TEST-50P';
// Hide first, so a newly created item is never briefly visible in the shop.
await api('/api/admin/products/visibility', 'POST', { slug, hidden: true });
const catalogue = await api('/api/admin/products/catalogue');
const existingProduct = catalogue.overrides?.[slug];
if (existingProduct) {
  assert.equal(existingProduct.name, name, 'The reserved test product name has changed.');
  assert.equal(existingProduct.variants?.[0]?.price, 0.5, 'The test price has changed.');
} else {
  await api('/api/admin/products/catalogue', 'POST', { product: {
    slug, name, categories: [],
    shortDescription: 'Private payment check for the shop owner. No product will be posted.',
    variants: [{ dosage: 'One payment check', price: 0.5 }],
  } });
}
const fields = {
  customerName: 'Kieran', email: OWNER, subject: marker,
  internalNotes: 'Owner-authorised 50p bank payment check. Keep hidden. No emails or parcel. Waiting for Fena connection and owner approval in the bank.',
  customerNotes: 'Private bank payment check. No product will be posted.',
  lineItems: [{ type: 'product', slug, name, description: 'One payment check', quantity: 1, unitPrice: 0.5, discount: 0 }],
  shippingLabel: 'Collection. Nothing will be posted.', shippingAmount: 0, discountAmount: 0,
  intendedPaymentMethod: 'fena', fulfilmentType: 'collection',
  automationFlags: { sendPaymentLink: false, sendConfirmation: false, triggerRoyalMail: false, sendDispatchEmail: false },
};
const found = await api(`/api/admin/invoices?q=${encodeURIComponent(marker)}`);
const matching = found.invoices.filter(row => row.subject === marker && row.email === OWNER);
assert.ok(matching.length <= 1, 'More than one owner test invoice exists. Review them before continuing.');
let invoice = matching[0];
if (!invoice) invoice = (await api('/api/admin/invoices', 'POST', fields)).invoice;
assert.equal(invoice.status, 'draft', 'The existing test is no longer a draft. Do not create a second payment.');
assert.equal(invoice.order_number, null, 'The draft must not have an order.');
invoice = (await api(`/api/admin/invoices/${invoice.id}`, 'PATCH', fields)).invoice;
const check = (await api(`/api/admin/invoices/${invoice.id}`)).invoice;
assert.equal(check.status, 'draft');
assert.equal(Number(check.total), 0.5);
assert.equal(Number(check.shipping_amount), 0);
assert.equal(check.fulfilment_type, 'collection');
assert.equal(check.intended_payment_method, 'fena');
assert.equal(check.order_number, null);
assert.equal(check.fena_payment_url, null);
for (const flag of Object.values(check.automation_flags)) assert.equal(flag, false);
assert.ok((await api('/api/admin/products/visibility')).hidden.includes(slug));
console.log(`Prepared ${live ? 'live' : 'local'} hidden test product and unsent 50p invoice ${check.invoice_number}.`);
console.log(`Staff review: ${base}/admin/invoices/${check.id}/edit`);
console.log('No payment requested, email sent, shop order created or Royal Mail parcel created.');
