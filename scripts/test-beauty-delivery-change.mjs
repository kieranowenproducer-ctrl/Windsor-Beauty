// Changing the delivery name/address before dispatch (Samuel, 3 Nov 2026).
// Runs the real src/lib/orderDeliveryChange.ts, the real Royal Mail client and the real label
// step against a throwaway Postgres (PGlite) and a fake Royal Mail. Nothing live is touched.
// Usage: npm run test:delivery-change
import fs from 'node:fs'; import path from 'node:path'; import * as crypto from 'node:crypto'; import vm from 'node:vm'; import assert from 'node:assert/strict'; import ts from 'typescript'; import { pathToFileURL } from 'node:url'; import { createRequire } from 'node:module';
if (!process.argv[2]) throw Error('Pass existing isolated PGlite module. No live database accepted.');
const { PGlite } = await import(pathToFileURL(process.argv[2] ?? createRequire(import.meta.url).resolve('@electric-sql/pglite')).href);
const pg = new PGlite(); let checks = 0; let failure = null;
const receiptDir=path.join('.local-evidence/delivery-editor-20261108/checks',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(receiptDir,{recursive:true});
const sourcePaths=['src/lib/orderDeliveryChange.ts','src/lib/db/royalMailLease.ts','src/lib/db.ts','src/lib/royalMail.ts','src/lib/royalMailDispatch.ts','src/app/api/admin/orders/[orderNumber]/delivery-address/route.ts','src/lib/adminReadAccess.ts','scripts/install-beauty-delivery-lease.sql'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,hash(fs.readFileSync(p))]));
try {
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks++; };
const ok = (v, m) => { assert.ok(v, m); checks++; };
const tagged = async (parts, ...values) => (await pg.query(parts.reduce((s, p, i) => s + p + (i < values.length ? '$' + (i + 1) : ''), ''), values)).rows;

await pg.exec(`CREATE TABLE orders (
  order_number text PRIMARY KEY, customer_name text, email text, phone text, status text, created_at timestamptz DEFAULT now(),
  items jsonb DEFAULT '[]', subtotal numeric DEFAULT 10, shipping_cost numeric DEFAULT 0, total numeric DEFAULT 10, shipping_label text DEFAULT 'UK',
  shipping_address text, shipping_line1 text, shipping_line2 text, shipping_city text, shipping_postcode text, shipping_country text, shipping_recipient text,
  fulfilment_type text DEFAULT 'royal_mail', automation_flags jsonb, shipping_email_sent_at timestamptz,
  royal_mail_order_id text, royal_mail_label_status text DEFAULT 'none', royal_mail_label_error text, royal_mail_label_created_at timestamptz,
  royal_mail_label_error_at timestamptz, royal_mail_last_response text, royal_mail_printed_on timestamptz, royal_mail_shipped_on timestamptz,
  tracking_number text, tracking_url text, parcel_weight_grams int, parcel_package_format text, admin_notes text)`);

// ── Fake Royal Mail ──────────────────────────────────────────────────────────
let rm, calls, deleteMode, hook=null, productsHook=null, labelTracking=false, sends=0; const testEnv={ROYAL_MAIL_API_KEY:'synthetic-only',ADMIN_SESSION_TOKEN:'synthetic-beauty-admin'};
function resetRm() { rm = []; calls = []; deleteMode = 'ok'; hook=null; productsHook=null; labelTracking=false; sends=0; }
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
async function fakeFetch(url, init = {}) {
  const method = init.method ?? 'GET';
  const path = decodeURIComponent(url.replace(/^https:\/\/api\.parcel\.royalmail\.com\/api\/v1/, ''));
  calls.push(`${method} ${path}`); if (hook) await hook(method,path);
  const ref = path.match(/^\/orders\/"(.+)"$/)?.[1];
  if (method === 'GET' && ref) { const found = rm.filter(o => o.orderReference === ref); return deleteMode==='malformed' ? reply(200,{unexpected:true}) : found.length ? reply(200, found) : reply(404, null); }
  if (method === 'DELETE') {
    if (deleteMode === '403') return reply(403, { errors: [{ message: 'Feature not available' }] });
    const ids = path.replace('/orders/', '').split(';');
    if (deleteMode !== 'ignored') rm = rm.filter(o => !ids.includes(String(o.orderIdentifier)));
    return reply(200, { deletedOrders: ids.map(orderIdentifier => ({ orderIdentifier })), errors: [] });
  }
  if (method === 'POST' && path === '/orders') {
    const item = JSON.parse(init.body).items[0];
    const created = { orderIdentifier: 9000 + rm.length + 1, orderReference: item.orderReference, recipient: item.recipient.address };
    rm.push(created);
    return reply(200, { createdOrders: [{ orderIdentifier: created.orderIdentifier, ...(labelTracking?{trackingNumber:'SYNTHETIC-TRACK'}:{}) }] }); // no tracking until postage is paid
  }
  throw new Error(`unexpected Royal Mail call ${method} ${path}`);
}

// ── Load the real modules ────────────────────────────────────────────────────
function load(file, imports, sourceOverride) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(sourceOverride ?? fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: s => { if (!(s in imports)) throw Error(`missing import ${s}`); return imports[s]; }, fetch: fakeFetch, process: { env: testEnv }, console, Date, JSON, encodeURIComponent, Error, AbortSignal, Request, Response, URL, TextEncoder });
  return module.exports;
}
const PAYMENT_CONFIRMED_STATUSES = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];
const db = {
  PAYMENT_CONFIRMED_STATUSES,
  findOrderByNumber: async n => (await tagged`SELECT * FROM orders WHERE order_number = ${n}`)[0] ?? null,
  addAdminNote: async (n, note) => { await tagged`UPDATE orders SET admin_notes = concat_ws(E'\n', admin_notes, ${note}::text) WHERE order_number = ${n}`; },
  getShippingSettings: async () => ({ international_enabled: false }),
  recordRoyalMailLabel: async (n, p) => { await tagged`UPDATE orders SET royal_mail_order_id = ${p.royalMailOrderId}, tracking_number = ${p.trackingNumber}, royal_mail_label_status = 'created' WHERE order_number = ${n}`; },
  recordRoyalMailLabelError: async (n, m) => { await tagged`UPDATE orders SET royal_mail_label_status = 'error', royal_mail_label_error = ${m} WHERE order_number = ${n}`; },
  recordRoyalMailPendingPostage: async (n, m, o) => { await tagged`UPDATE orders SET royal_mail_label_status = 'pending_postage', royal_mail_label_error = ${m}, royal_mail_order_id = ${o?.royalMailOrderId ?? null} WHERE order_number = ${n}`; },
  listOrdersAwaitingPostage: async () => [], logAutomationFailure: async () => {}, markShippingEmailSent: async () => {},
};
await pg.exec(fs.readFileSync('scripts/install-beauty-delivery-lease.sql','utf8'));
// Extract the exact three active setter declarations, avoiding unrelated schema
// startup and modules. Their SQL and guards are executed unchanged.
const dbSource=fs.readFileSync('src/lib/db.ts','utf8'),tree=ts.createSourceFile('db.ts',dbSource,ts.ScriptTarget.Latest,true);
const setterNames=['recordRoyalMailLabel','recordRoyalMailLabelError','recordRoyalMailPendingPostage'];
const declarations=tree.statements.filter(node=>ts.isFunctionDeclaration(node)&&setterNames.includes(node.name?.text)).map(node=>node.getText(tree));
eq(declarations.length,3);Object.assign(db,load('src/lib/db.ts',{'./client':{requireDb:()=>tagged}},`import {requireDb} from './client'; const PAYMENT_CONFIRMED_STATUSES=${JSON.stringify(PAYMENT_CONFIRMED_STATUSES)};\n${declarations.join('\n')}`));
const lease=load('src/lib/db/royalMailLease.ts',{'./client':{requireDb:()=>tagged}});
const royalMail = load('src/lib/royalMail.ts', { '@/data/products': {} });
const dispatch = load('src/lib/royalMailDispatch.ts', {
  '@/lib/db': db, '@/lib/db/royalMailLease':lease, crypto, '@/lib/royalMail': royalMail, '@/lib/shippingEmail': { sendShippingConfirmationEmail: async () => { sends++; return true; } },
  '@/lib/shipping': { getProductsBySlug: async () => { if(productsHook) await productsHook(); return {}; }, calculateParcel: () => ({ totalWeightGrams: 100, packageFormat: 'parcel', internationalEligible: true }), resolveShipmentService: () => 'uk-standard', buildShipmentContents: () => [] },
});
const change = load('src/lib/orderDeliveryChange.ts', { crypto, '@/lib/db': db, '@/lib/db/client': { requireDb: () => tagged }, '@/lib/db/royalMailLease':lease, '@/lib/royalMail': royalMail, '@/lib/royalMailDispatch': dispatch });
const auth=load('src/lib/adminReadAccess.ts',{});
const route=load('src/app/api/admin/orders/[orderNumber]/delivery-address/route.ts',{'next/server':{NextResponse:{json:(body,init={})=>Response.json(body,init)}},'@/lib/db':{...db,isDbConfigured:()=>true},'@/lib/orderDeliveryChange':change,'@/lib/adminReadAccess':auth});
const runChange=async(n,details)=>change.changeDeliveryDetails(n,{...details,expectedVersion:change.deliveryDetailsVersion(await db.findOrderByNumber(n))});

async function seed(patch = {}) {
  resetRm();
  await pg.exec('DELETE FROM orders');
  const o = { order_number: 'WB-TEST1', customer_name: 'Jane Smith', email: 'jane@example.invalid', status: 'paid', shipping_line1: '1 Old Road', shipping_city: 'Leeds', shipping_postcode: 'LS1 1AA', shipping_country: 'GB', shipping_address: '1 Old Road, Leeds, LS1 1AA, GB', ...patch };
  const keys = Object.keys(o);
  await pg.query(`INSERT INTO orders (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map(k => o[k]));
  return o;
}
const row = async () => (await tagged`SELECT * FROM orders WHERE order_number = 'WB-TEST1'`)[0];
const NEW = { recipient: 'Tom Smith', line1: '22 New Street', line2: 'Flat 3', city: 'York', postcode: 'yo1 7hh', country: 'GB' };

// 1. Paid, Royal Mail already holds the old address (postage not paid yet): delete, save, make a new one.
await seed({ royal_mail_order_id: '9001', royal_mail_label_status: 'pending_postage' });
rm.push({ orderIdentifier: 9001, orderReference: 'WB-TEST1', recipient: { addressLine1: '1 Old Road' } });
let r = await runChange('WB-TEST1', NEW);
ok(r.ok, 'paid order with a pending Royal Mail order is changed');
eq(r.deletedRoyalMailOrders, ['9001']);
eq(rm.length, 1, 'exactly one Royal Mail order remains');
eq(rm[0].recipient.addressLine1, '22 New Street'); eq(rm[0].recipient.fullName, 'Tom Smith'); eq(rm[0].recipient.postcode, 'YO1 7HH');
let o = await row();
eq([o.shipping_recipient, o.shipping_line1, o.shipping_line2, o.shipping_city, o.shipping_postcode, o.shipping_country], ['Tom Smith', '22 New Street', 'Flat 3', 'York', 'YO1 7HH', 'GB']);
eq(o.shipping_address, '22 New Street, Flat 3, York, YO1 7HH, GB');
eq(o.royal_mail_label_status, 'pending_postage'); eq(o.royal_mail_order_id, String(rm[0].orderIdentifier));
ok(r.royalMail?.pending, 'the new order waits for postage, as normal');
ok(/Delivery changed: recipient/.test(o.admin_notes) && /Old Royal Mail order 9001 deleted/.test(o.admin_notes),o.admin_notes);
ok(calls.indexOf('DELETE /orders/9001') < calls.indexOf('POST /orders'), 'old order deleted before the new one is made');

// 2. A paid label (tracking issued) is cancelled and its tracking forgotten.
await seed({ royal_mail_order_id: '9001', royal_mail_label_status: 'created', tracking_number: 'MZ1GB', tracking_url: 'https://x', royal_mail_printed_on: '2026-11-03T10:00:00Z' });
rm.push({ orderIdentifier: 9001, orderReference: 'WB-TEST1', trackingNumber: 'MZ1GB', printedOn: '2026-11-03T10:00:00Z' });
r = await runChange('WB-TEST1', { ...NEW, recipient: 'Jane Smith' });
ok(r.ok && r.oldLabelWasPaid, 'paid label is reported');
o = await row();
eq(o.tracking_number, null, 'old tracking number gone'); eq(o.royal_mail_printed_on, null);
eq(o.shipping_recipient, null, 'name the same as the customer means the customer');
ok(/Do not use its old label/.test(o.admin_notes));

// 3. Unpaid: saved, nothing created in Royal Mail.
await seed({ status: 'awaiting_payment' });
r = await runChange('WB-TEST1', NEW);
ok(r.ok && r.royalMail === null, 'unpaid: no Royal Mail order made');
eq(rm.length, 0); eq((await row()).shipping_city, 'York');

// 4-6. On its way: refused, nothing touched, Royal Mail never called.
for (const patch of [{ status: 'dispatched' }, { status: 'delivered' }, { shipping_email_sent_at: '2026-11-03T10:00:00Z' }, { royal_mail_shipped_on: '2026-11-03T10:00:00Z' }]) {
  await seed(patch);
  r = await runChange('WB-TEST1', NEW);
  eq([r.ok, r.status], [false, 409], JSON.stringify(patch)); eq(calls.length, 0); eq((await row()).shipping_city, 'Leeds');
}

// 7. Royal Mail refuses the delete (403): nothing changes on our side.
await seed({ royal_mail_order_id: '9001', royal_mail_label_status: 'pending_postage' });
rm.push({ orderIdentifier: 9001, orderReference: 'WB-TEST1' }); deleteMode = '403';
r = await runChange('WB-TEST1', NEW);
ok(!r.ok && /delete the old order in Click & Drop by hand/i.test(r.error), r.error);
o = await row(); eq([o.shipping_city, o.royal_mail_order_id, o.admin_notes], ['Leeds', '9001', null]);

// 8. Delete says yes but the order is still there: refused, nothing changes.
await seed({ royal_mail_order_id: '9001', royal_mail_label_status: 'pending_postage' });
rm.push({ orderIdentifier: 9001, orderReference: 'WB-TEST1' }); deleteMode = 'ignored';
r = await runChange('WB-TEST1', NEW);
ok(!r.ok && /still shows the old order/.test(r.error)); eq((await row()).shipping_city, 'Leeds');

// 9. Royal Mail has it as posted: refused before any delete.
await seed({ royal_mail_order_id: '9001' });
rm.push({ orderIdentifier: 9001, orderReference: 'WB-TEST1', shippedOn: '2026-11-03T10:00:00Z' });
r = await runChange('WB-TEST1', NEW);
ok(!r.ok && /posted/.test(r.error)); ok(!calls.some(c => c.startsWith('DELETE')), 'no delete attempted'); eq(rm.length, 1);

// 10. Typing checks.
await seed();
for (const [patch, want] of [[{ postcode: 'NOTAPOSTCODE' }, /Check the UK postcode/], [{ line1: ' ' }, /recipient, first address line/], [{ city: '' }, /town or city/], [{ recipient: '' }, /recipient, first address line/], [{ country: 'Narnia' }, /country/]]) {
  r = await runChange('WB-TEST1', { ...NEW, ...patch }); ok(!r.ok && r.status === 400 && want.test(r.error), r.error);
}
r = await runChange('WB-TEST1', { recipient: 'jane smith', line1: '1 Old Road', line2: '', city: 'Leeds', postcode: 'ls11aa', country: 'GB' });
ok(!r.ok && /Nothing has changed/.test(r.error), 'unchanged details are not saved');

// 11. An old row storing "United Kingdom" is read as GB, so Royal Mail does not treat it as abroad.
await seed({ shipping_country: 'United Kingdom' });
eq(change.currentDeliveryDetails(await row()).country, 'GB');
r = await runChange('WB-TEST1', NEW);
ok(r.ok && r.royalMail?.pending, 'new Royal Mail order made, not refused as international');

// 12. Not going by post: saved, Royal Mail never called.
await seed({ fulfilment_type: 'collection' });
r = await runChange('WB-TEST1', NEW);
ok(r.ok && r.royalMail === null); eq(calls.length, 0);

// 13. Every way of writing the UK is stored as GB.
for (const country of ['UK', 'u.k.', 'United Kingdom', 'England', 'Scotland', 'Wales', 'Northern Ireland', 'Great Britain', '']) {
  await seed({ status: 'awaiting_payment' });
  r = await runChange('WB-TEST1', { ...NEW, country });
  ok(r.ok, `"${country}" accepted`); eq((await row()).shipping_country, 'GB', `"${country}" saved as GB`);
}

// Actual staff handler checks happen before any order read or provider work.
const request=(method,body,headers={})=>new Request('https://www.windsorbeauty.is/api/admin/orders/WB-TEST1/delivery-address',{
 method,headers:{cookie:'wb_admin_session=synthetic-beauty-admin',origin:'https://www.windsorbeauty.is','content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
const props={params:Promise.resolve({orderNumber:'WB-TEST1'})};
await seed({status:'awaiting_payment'});
for(const cookie of ['', 'wb_admin_session=wrong','wb_admin_session=synthetic-beauty-admin; wb_admin_session=synthetic-beauty-admin']){
 eq((await route.GET(request('GET',undefined,{cookie}),props)).status,401);
 eq((await route.POST(request('POST',NEW,{cookie}),props)).status,401);
}
eq(calls.length,0,'unauthorized routes never touch Royal Mail');
const response=await route.GET(request('GET'),props);eq(response.status,200);const opened=await response.json();ok(/^[a-f0-9]{64}$/.test(opened.version));
for(const origin of ['https://www.windsorglow.is','https://attacker.invalid','null',''])eq((await route.POST(request('POST',{...NEW,expectedVersion:opened.version},{origin}),props)).status,403);
eq((await route.POST(request('POST',{...NEW,expectedVersion:opened.version,price:0}),props)).status,400);
eq((await route.POST(request('POST',{...NEW,expectedVersion:opened.version},{'content-type':'text/plain'}),props)).status,415);
eq((await route.POST(request('POST',{...NEW,line1:'x'.repeat(4200),expectedVersion:opened.version}),props)).status,413);
eq((await route.POST(request('POST',{...NEW,expectedVersion:opened.version}),{params:Promise.resolve({orderNumber:'WG-TEST1'})})).status,400);
eq(calls.length,0,'bad payloads and origins cause no carrier calls');
eq((await route.POST(request('POST',{...NEW,expectedVersion:opened.version}),props)).status,200);
eq(sends,0,'address handler never emails customer');

// Exact stale draft and country changes are refused before deleting a parcel.
await seed();let original=await row(), version=change.deliveryDetailsVersion(original);
await tagged`UPDATE orders SET shipping_line1='Changed elsewhere',shipping_address='Changed elsewhere, Leeds, LS1 1AA, GB' WHERE order_number='WB-TEST1'`;
r=await change.changeDeliveryDetails('WB-TEST1',{...NEW,expectedVersion:version});eq(r.status,409);eq(calls.length,0);
await seed();r=await runChange('WB-TEST1',{...NEW,country:'US',postcode:'10001'});eq(r.status,409);eq(calls.length,0);
await seed();deleteMode='malformed';r=await runChange('WB-TEST1',NEW);eq(r.status,502);eq((await row()).shipping_city,'Leeds');ok(!calls.some(c=>c.startsWith('DELETE')));

// Actual SQL lease excludes simultaneous editor and ordinary dispatcher.
await seed();let release,entered;const hold=new Promise(resolve=>release=resolve),inside=new Promise(resolve=>entered=resolve);let blocked=false;
hook=async(method)=>{if(method==='GET'&&!blocked){blocked=true;entered();await hold;}};
const first=runChange('WB-TEST1',NEW);await inside;
const second=await runChange('WB-TEST1',{...NEW,city:'Oxford'});eq(second.status,409);
const dispatchDuring=await dispatch.dispatchOrderToRoyalMail('WB-TEST1');eq(dispatchDuring.status,409);
release();r=await first;ok(r.ok);eq((await row()).shipping_city,'York');eq(rm.length,1);
eq((await row()).royal_mail_dispatch_lease_token,null,'lease released after completion');

// A stale lease owner cannot clear a replacement lease or write the address.
await seed({status:'awaiting_payment'});ok(await lease.claimRoyalMailDispatch('WB-TEST1','first'));
await tagged`UPDATE orders SET royal_mail_dispatch_lease_until=now()-interval '1 second' WHERE order_number='WB-TEST1'`;
ok(await lease.claimRoyalMailDispatch('WB-TEST1','second'));await lease.releaseRoyalMailDispatch('WB-TEST1','first');eq((await row()).royal_mail_dispatch_lease_token,'second');await lease.releaseRoyalMailDispatch('WB-TEST1','second');
await seed();hook=async(method)=>{if(method==='GET')await tagged`UPDATE orders SET royal_mail_dispatch_lease_token='replacement',royal_mail_dispatch_lease_until=now()+interval '3 minutes' WHERE order_number='WB-TEST1'`;};
r=await runChange('WB-TEST1',NEW);eq(r.status,409);eq((await row()).shipping_city,'Leeds');eq((await row()).royal_mail_dispatch_lease_token,'replacement');

// Posted/status changes during a provider round trip still prevent the SQL edit.
for(const field of ['royal_mail_shipped_on','shipping_email_sent_at']){
 await seed();hook=async(method)=>{if(method==='GET')await pg.exec(`UPDATE orders SET ${field}=now() WHERE order_number='WB-TEST1'`);};
 r=await runChange('WB-TEST1',NEW);eq(r.status,409);eq((await row()).shipping_city,'Leeds');
}
await seed();hook=async(method)=>{if(method==='GET')await tagged`UPDATE orders SET status='dispatched' WHERE order_number='WB-TEST1'`;};r=await runChange('WB-TEST1',NEW);eq(r.status,409);eq((await row()).shipping_city,'Leeds');

// Lease ownership must still be current immediately before external mutation.
await seed({royal_mail_order_id:'9001',royal_mail_label_status:'pending_postage'});
rm.push({orderIdentifier:9001,orderReference:'WB-TEST1'});
hook=async(method)=>{if(method==='GET')await tagged`UPDATE orders SET royal_mail_dispatch_lease_token='replacement',royal_mail_dispatch_lease_until=now()+interval '3 minutes' WHERE order_number='WB-TEST1'`;};
r=await runChange('WB-TEST1',NEW);ok(!r.ok);eq(calls.filter(c=>c.startsWith('DELETE')).length,0,'lost lookup lease cannot delete parcel');eq(rm.length,1);eq((await row()).shipping_city,'Leeds');
for(const boundary of ['products','lookup','expired']){
 await seed();const lose=async()=>{await pg.exec(boundary==='expired' ? "UPDATE orders SET royal_mail_dispatch_lease_until=now()-interval '1 second' WHERE order_number='WB-TEST1'" : "UPDATE orders SET royal_mail_dispatch_lease_token='replacement',royal_mail_dispatch_lease_until=now()+interval '3 minutes' WHERE order_number='WB-TEST1'");};
 if(boundary==='lookup')hook=async(method)=>{if(method==='GET')await lose();};else productsHook=lose;
 const stale=await dispatch.dispatchOrderToRoyalMail('WB-TEST1');eq(stale.ok,false);eq(calls.filter(c=>c.startsWith('POST')).length,0,'stale '+boundary+' owner cannot create parcel');eq((await row()).royal_mail_order_id,null);eq(sends,0);
}

// No replacement customer email, but ordinary dispatch keeps its established email path.
await seed();labelTracking=true;const moneyBefore=await pg.query('SELECT subtotal,shipping_cost,total,items,email,customer_name FROM orders');r=await runChange('WB-TEST1',NEW);ok(r.ok);eq(sends,0);eq((await pg.query('SELECT subtotal,shipping_cost,total,items,email,customer_name FROM orders')).rows,moneyBefore.rows);
await seed();labelTracking=true;await dispatch.dispatchOrderToRoyalMail('WB-TEST1');eq(sends,1,'ordinary existing dispatch still sends tracking');
await seed({automation_flags:{triggerRoyalMail:false}});r=await runChange('WB-TEST1',NEW);ok(r.ok);ok(!calls.some(c=>c.startsWith('POST')),'disabled Royal Mail automation never makes new shipment');eq(sends,0);
for(const status of ['pending','awaiting_payment','payment_failed','payment_cancelled']){await seed({status});r=await runChange('WB-TEST1',NEW);ok(r.ok);ok(!calls.some(c=>c.startsWith('POST')));eq(sends,0);}

// No stale worker may attach a carrier result or email after its lease is lost.
for(const tracked of [false,true]){
 await seed();labelTracking=tracked;hook=async(method)=>{if(method==='POST')await tagged`UPDATE orders SET royal_mail_dispatch_lease_token='replacement',royal_mail_dispatch_lease_until=now()+interval '3 minutes' WHERE order_number='WB-TEST1'`;};
 const late=await dispatch.dispatchOrderToRoyalMail('WB-TEST1');eq(late.status,503);eq((await row()).royal_mail_order_id,null);eq((await row()).royal_mail_label_status,'none');eq((await row()).royal_mail_dispatch_lease_token,'replacement');eq(sends,0);
}
await seed();ok(await lease.claimRoyalMailDispatch('WB-TEST1','current'));
await assert.rejects(()=>db.recordRoyalMailLabelError('WB-TEST1','late error',{leaseToken:'old'}));checks++;
eq((await row()).royal_mail_label_status,'none');
await tagged`UPDATE orders SET royal_mail_dispatch_lease_until=now()-interval '1 second' WHERE order_number='WB-TEST1'`;
await assert.rejects(()=>db.recordRoyalMailPendingPostage('WB-TEST1','late',{leaseToken:'current',royalMailOrderId:'42'}));checks++;
eq((await row()).royal_mail_order_id,null);

// Canonical migration is idempotent and does not change existing business rows.
const beforeReapply=(await pg.query('SELECT * FROM orders ORDER BY order_number')).rows;await pg.exec(fs.readFileSync('scripts/install-beauty-delivery-lease.sql','utf8'));eq((await pg.query('SELECT * FROM orders ORDER BY order_number')).rows,beforeReapply);
await seed();await pg.exec('ALTER TABLE orders DROP COLUMN royal_mail_checked_at');r=await runChange('WB-TEST1',NEW);eq(r.status,503);eq(calls.length,0,'partial parcel schema refuses before carrier call');await pg.exec(fs.readFileSync('scripts/install-beauty-delivery-lease.sql','utf8'));

for(const [file,before]of Object.entries(sourceHashes))eq(hash(fs.readFileSync(file)),before,'source remains stable: '+file);
console.log(JSON.stringify({passed:true,checks,providerCalls:'intercepted only',realEmails:0}));
} catch(error) { failure=error instanceof Error?error.message:String(error);throw error; }
finally { await pg.close();fs.writeFileSync(path.join(receiptDir,'receipt.json'),JSON.stringify({passed:failure===null,checks,failure,sourceHashes,database:'fresh disposable in-memory PGlite, closed',providerRequests:'synthetic fetch only',realEmails:0,liveDatabaseOpened:false},null,2)); }
