// Isolated, fictional canonical schema only. No environment files or network.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
if(!process.argv[2])throw Error('Pass an installed PGlite module path.');
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const pg=new PGlite();
let queryCount=0;
const sql=async(parts,...values)=>{queryCount++;return (await pg.query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values)).rows;};
sql.query=async(text,values=[])=>{queryCount++;return (await pg.query(text,values)).rows;};
globalThis.__beautyReportSql=sql;
registerHooks({resolve(specifier,context,next){
  if(specifier==='next/server')return next('next/server.js',context);
  if(specifier==='./db/client'&&context.parentURL?.endsWith('/src/lib/db.ts'))return {url:'data:text/javascript,export const sql=globalThis.__beautyReportSql;export const requireDb=()=>globalThis.__beautyReportSql;export const isDbConfigured=()=>true;',shortCircuit:true};
  if(specifier==='./client'&&context.parentURL?.includes('/src/lib/db/'))return {url:'data:text/javascript,export const requireDb=()=>globalThis.__beautyReportSql;export const isDbConfigured=()=>true;',shortCircuit:true};
  if(specifier==='@/lib/db/client')return {url:'data:text/javascript,export const requireDb=()=>globalThis.__beautyReportSql;export const isDbConfigured=()=>true;',shortCircuit:true};
  return next(specifier,context);
}});
const {ensureSchema}=await import('../src/lib/db/schema.ts');
await ensureSchema();
const activityMigration=fs.readFileSync('scripts/install-beauty-dashboard-activity.sql','utf8');
// Exercise the real release migration rather than hiding its prerequisite in
// fixture-only DDL. It is harmless both after canonical setup and on rerun.
await pg.exec(activityMigration);
await pg.exec(activityMigration);
const {readAdminActivity}=await import('../src/lib/db/adminActivity.ts');
const {readAdminRevenue}=await import('../src/lib/db/adminRevenue.ts');
const {readAdminDashboardStats,readAdminDashboardRange}=await import('../src/lib/db/adminDashboardStats.ts');
const {GET:rangeGET}=await import('../src/app/api/admin/stats/range/route.ts');
const {GET:statsGET}=await import('../src/app/api/admin/stats/route.ts');
const {decodeReportCursor,encodeReportCursor}=await import('../src/lib/adminReportPaging.ts');
const {GET:revenueGET}=await import('../src/app/api/admin/revenue/route.ts');
const {GET:activityGET}=await import('../src/app/api/admin/activity/route.ts');
let checks=0;const names=[];
function equal(name,actual,expected){assert.deepEqual(actual,expected,name);checks++;names.push(name);}
const query=(text,values=[])=>pg.query(text,values);
const legacy=new PGlite();
await legacy.exec("CREATE TABLE orders(id integer PRIMARY KEY,status text);INSERT INTO orders VALUES(1,'paid')");
await legacy.exec(activityMigration);
equal('release migration installs missing legacy column',(await legacy.query('SELECT activity_cleared_at FROM orders WHERE id=1')).rows,[{activity_cleared_at:null}]);
await legacy.exec("UPDATE orders SET activity_cleared_at='2026-11-01T12:00:00Z' WHERE id=1");
await legacy.exec(activityMigration);
equal('release migration preserves existing clear timestamp',(await legacy.query("SELECT status,activity_cleared_at::text AS cleared FROM orders WHERE id=1")).rows,[{status:'paid',cleared:'2026-11-01 12:00:00+00'}]);
await legacy.close();
async function order(number,status,paid,created,total=20,fee=2,cleared=null){
 await query(`INSERT INTO orders(order_number,email,customer_name,items,subtotal,shipping_label,shipping_cost,total,status,shipping_address,payment_confirmed_at,created_at,paypal_fee,activity_cleared_at)
 VALUES($1,'fixture@example.invalid','Fictional fixture','[]',10,'Fictional delivery',10,$5,$2,'Fictional',$3,$4,$6,$7)`,[number,status,paid,created,total,fee,cleared]);
}
await order('WB-OLD-UNPAID','awaiting_payment',null,'2020-01-01');
await order('WB-OLD-UNPOSTED','paid','2020-01-02','2020-01-01',20,0,'2020-01-03');
await order('WB-CLEARED','cancelled',null,'2026-11-08',20,0,'2026-11-08');
await order('WB-UNCONFIRMED','paid',null,'2026-11-08');
await order('WB-UK-START','paid','2026-09-30T23:30:00Z','2026-09-01',100,3);
await order('WB-UK-BEFORE','paid','2026-09-30T22:59:59Z','2026-09-01',40,0);
await order('WB-UK-END','delivered','2026-10-01T22:59:59Z','2026-09-01',50,0);
await order('WB-UK-AFTER','paid','2026-10-01T23:00:00Z','2026-09-01',70,0);
await order('WB-REFUND','refunded','2026-10-03T10:00:00Z','2026-09-01',80,0);
await order('WB-CANCEL','cancelled','2026-10-03T10:00:00Z','2026-09-01',90,0);
await query(`INSERT INTO automation_failures(category,message,created_at)VALUES('test','old unresolved fixture','2019-01-01')`);
await query(`INSERT INTO automation_failures(category,message,created_at,resolved_at)VALUES('test','closed fixture','2019-01-01','2019-01-02')`);
await query(`INSERT INTO customers(email,password_hash,created_at) SELECT 'fixture-'||n||'@example.invalid','unused', '2026-11-08T01:00:00.123456Z'::timestamptz FROM generate_series(1,80)n`);
await query(`INSERT INTO orders(order_number,email,customer_name,items,subtotal,shipping_label,shipping_cost,total,status,shipping_address,payment_confirmed_at,created_at,paypal_fee)
 SELECT 'WB-BULK-'||n,'fixture@example.invalid','Fictional','[]',10,'Fictional delivery',10,22,'delivered','Fictional','2026-11-08T01:00:00.123456Z'::timestamptz,'2026-10-15'::timestamptz,2 FROM generate_series(1,320)n`);
async function snapshot(){return JSON.stringify((await query(`SELECT (SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o) AS orders,(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM customers c) AS customers,(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM automation_failures f) AS failures`)).rows);}
const before=await snapshot();
await pg.exec(activityMigration);
equal('activity migration rerun preserves every saved row',await snapshot(),before);
equal('canonical schema declares activity clearing',(await query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='orders' AND column_name='activity_cleared_at'")).rows[0].n,1);
let page=await readAdminActivity(null);
equal('first page bounded at 50',page.events.length,50);
equal('old unpaid survives busy feed',page.events.some(e=>e.orderNumber==='WB-OLD-UNPAID'),true);
equal('old unposted survives cleared flag',page.events.some(e=>e.orderNumber==='WB-OLD-UNPOSTED'),true);
equal('old unresolved problem survives busy feed',page.events.some(e=>e.message==='old unresolved fixture'),true);
equal('resolved problem absent',page.events.some(e=>e.message==='closed fixture'),false);
equal('older history discoverable',Boolean(page.nextCursor),true);
const events=[...page.events];
while(page.nextCursor){page=await readAdminActivity(decodeReportCursor(page.nextCursor));events.push(...page.events);}
equal('every customer available',events.filter(e=>e.type==='customer').length,80);
equal('every uncleared order available',events.filter(e=>e.type==='order').length,329);
equal('no page duplicates',new Set(events.map(e=>e.type+':'+(e.orderNumber??e.customerId??e.id))).size,events.length);
equal('cleared final order absent',events.some(e=>e.orderNumber==='WB-CLEARED'),false);
const day=await readAdminRevenue({from:'2026-10-01',to:'2026-10-01'},null);
equal('UK date includes BST midnight and entire day',day.count,2);
equal('separate fee excluded; zero fee preserved',day.total,147);
equal('ordered by payment rather than creation',day.orders.map(o=>o.orderNumber),['WB-UK-END','WB-UK-START']);
equal('UK chart month',day.months,[{month:'2026-10',revenue:147}]);
const refundOnly=await readAdminRevenue({from:'2026-10-03',to:'2026-10-03'},null);
equal('refund-only period has no revenue count',refundOnly.count,0);
equal('refund-only period has no revenue money',refundOnly.total,0);
equal('refund and cancelled confirmations still available for accounting',refundOnly.accountingCount,2);
equal('empty period has no accounting rows',(await readAdminRevenue({from:'2027-01-01',to:'2027-01-01'},null)).accountingCount,0);

const month=await readAdminRevenue({from:'2026-11-01',to:'2026-11-30'},null);
equal('summary is not latest 300 capped',month.count,320);
equal('full-range net amount',month.total,6400);
equal('table bounded',month.orders.length,50);
const stats=await readAdminDashboardStats(), rangeStats=await readAdminDashboardRange('2026-10-01','2026-10-01');
equal('dashboard revenue agrees with whole-range report',stats.revenue,(await readAdminRevenue({from:'',to:''},null)).total);
equal('dashboard customer count unaffected',stats.customerCount,80);
equal('dashboard UK date range money agrees with report',rangeStats.revenue,day.total);
equal('dashboard UK payment count uses full payment day',rangeStats.totalOrders,2);
equal('dashboard refund-only count preserves confirmation history',(await readAdminDashboardRange('2026-10-03','2026-10-03')).totalOrders,2);
equal('dashboard unpaid attempts distinct',stats.awaitingPayment,1);

let rp=month;const orders=[...rp.orders];while(rp.nextCursor){rp=await readAdminRevenue({from:'2026-11-01',to:'2026-11-30'},decodeReportCursor(rp.nextCursor));orders.push(...rp.orders);}
equal('all table pages reachable',orders.length,320);
equal('same timestamp pages no duplicates',new Set(orders.map(o=>o.orderNumber)).size,320);
equal('all reads preserve original rows',await snapshot(),before);
for(const raw of ['bad','x'.repeat(601),Buffer.from(JSON.stringify({priority:2,at:'invalid',key:'bad'})).toString('base64url')]){
 assert.throws(()=>decodeReportCursor(raw));checks++;names.push('bad cursor refused');
}
equal('valid cursor roundtrip',decodeReportCursor(encodeReportCursor({priority:1,at:'2026-11-08T00:00:00.000Z',key:'order-1'})),{priority:1,at:'2026-11-08T00:00:00.000Z',key:'order-1'});
process.env.ADMIN_SESSION_TOKEN='fictional-report-fixture';
const auth={cookie:'wb_admin_session=fictional-report-fixture'};
for(const endpoint of [revenueGET,activityGET,rangeGET]){
 const start=queryCount;equal('unauthorised route refuses', (await endpoint(new Request('http://localhost/api/admin/test'))).status,401);equal('unauthorised route never reads database',queryCount,start);
 equal('bad cursor gives 400',(await endpoint(new Request('http://localhost/api/admin/test?cursor=bad',{headers:auth}))).status,400);
 const res=await endpoint(new Request('http://localhost/api/admin/test?from=2026-10-01&to=2026-10-01',{headers:auth}));equal('owned route passes',res.status,200);equal('report is private no-store',res.headers.get('cache-control'),'private, no-store');
}
const priorStatsQueries=queryCount;
equal('dashboard unauthorized refuses',(await statsGET(new Request('http://localhost/api/admin/stats'))).status,401);
equal('dashboard unauthorized performs no query',queryCount,priorStatsQueries);
const statsResponse=await statsGET(new Request('http://localhost/api/admin/stats',{headers:auth}));
equal('dashboard stats route passes',statsResponse.status,200);
equal('dashboard route total agrees',(await statsResponse.json()).revenue,stats.revenue);
equal('invalid date rejected',(await revenueGET(new Request('http://localhost/api/admin/revenue?from=2026-02-31',{headers:auth}))).status,400);
equal('backward date rejected',(await revenueGET(new Request('http://localhost/api/admin/revenue?from=2026-11-08&to=2026-11-07',{headers:auth}))).status,400);
equal('duplicate date rejected',(await revenueGET(new Request('http://localhost/api/admin/revenue?from=2026-11-08&from=2026-11-09',{headers:auth}))).status,400);
equal('route reads preserve original rows',await snapshot(),before);
const sources=['scripts/install-beauty-dashboard-activity.sql','src/lib/db/schema-parts/customers-and-orders.ts','src/lib/db/adminDashboardStats.ts','src/app/api/admin/stats/route.ts','src/app/api/admin/stats/range/route.ts','src/lib/adminReportPaging.ts','src/lib/db/adminActivity.ts','src/lib/db/adminRevenue.ts','src/app/api/admin/activity/route.ts','src/app/api/admin/revenue/route.ts','src/app/admin/revenue/page.tsx','src/app/admin/dashboard/page.tsx','scripts/test-beauty-dashboard-reporting.mjs'];
const dir=path.join('.local-evidence','beauty-dashboard-reporting-20261108',new Date().toISOString().replaceAll(':','-'));fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({passed:true,checks,names,sourceHashes:Object.fromEntries(sources.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),scope:'Canonical in-memory synthetic PostgreSQL only; no original/live data, network, providers or mail; actual SQL readers and route handlers exercised'},null,2));
await pg.close();console.log(JSON.stringify({passed:true,checks,receipt:path.join(dir,'receipt.json')}));
