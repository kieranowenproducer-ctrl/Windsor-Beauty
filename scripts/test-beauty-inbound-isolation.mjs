import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as capture from '../src/lib/replyCapture.ts';
import * as routing from '../src/lib/email/inboundRouting.ts';
import * as threads from '../src/lib/email/threadReferences.ts';

// Real route, signature and routing helpers; only provider/DB/sending are
// intercepted. Synthetic fixtures cannot contact a customer or live service.
const secret = 'whsec_' + Buffer.from('synthetic-only-webhook-secret').toString('base64');
const source = readFileSync(new URL('../src/app/api/webhooks/resend-inbound/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
function harness(content, env = {}, threadRows=[]) {
  const calls = { fetched: 0, history: 0, cases: 0, alerts: 0, originalMailboxes: [], replyCases:[] };
  const seen = new Set();
  let pinned=null;
  const modules = {
    'next/server': { NextResponse: { json: (body, opts = {}) => new Response(JSON.stringify(body), { status: opts.status || 200 }) } },
    '@/lib/db': { isDbConfigured: () => true, findCustomerByEmail: async () => null, logAutomationFailure: async () => {} },
    '@/lib/db/customerEmails': { recordCustomerEmail: async ({ ourAddress }) => { calls.history++; calls.originalMailboxes.push(ourAddress); } },
    '@/lib/db/enquiries': { findEnquiryById:async id=>({id,email:content.from}),
      recordInboundEnquiryReply: async ({enquiryId}) => {calls.replyCases.push(enquiryId);return {created:true};},
      createInboundEmailEnquiry: async ({ emailId,email }) => { const created = !seen.has(emailId); seen.add(emailId); if (created) calls.cases++; return { created, enquiry: { id: 1,email } }; } },
    '@/lib/db/beautyEmailThreads':{findExactBeautyEmailThread:async(sender,mailbox,refs,parents)=>threads.exactBeautyThread(sender,mailbox,refs,threadRows,parents),
      claimBeautyInboundRoute:async()=>pinned,completeBeautyInboundRoute:async(_id,caseId)=>{pinned=caseId;},inboundRouteHash:input=>JSON.stringify(input)},
    '@/lib/email/threadReferences':threads,
    '@/lib/replyCapture': capture,
    '@/lib/email/send': { sendEmail: async () => { calls.alerts++; return { ok: true }; } },
    '@/lib/email/enquiryAlerts': { enquiryAlertRecipients: () => ['synthetic-staff@example.invalid'], isUrgentCustomerEmail: () => false },
    '@/lib/email/inboundRouting': routing,
  };
  const result = { exports: {} };
  vm.runInNewContext(compiled, { module: result, exports: result.exports, console, Buffer, process: { env: { RESEND_INBOUND_WEBHOOK_SECRET_BEAUTY_IS: secret, RESEND_INBOUND_API_KEY_BEAUTY_IS: 'synthetic-receiving', BEAUTY_INBOUND_CAPTURE_ADDRESS: 'windsor-beauty@ilkaik.resend.app', ...env } },
    require(name) { if (!(name in modules)) throw Error(`Unexpected module ${name}`); return modules[name]; },
    fetch: async (url, opts) => { assert.equal(url, 'https://api.resend.com/emails/receiving/synthetic-id'); assert.equal(opts.headers.Authorization, 'Bearer synthetic-receiving'); calls.fetched++; return { ok: true, json: async () => content }; },
  });
  const request = ({ invalid = false, stale = false } = {}) => {
    const payload = JSON.stringify({ type: 'email.received', data: { email_id: 'synthetic-id', message_id:content.message_id, received_for:content.received_for, from: content.from, to: content.to } });
    const id = 'synthetic-event'; const timestamp = String(Math.floor(Date.now() / 1000) - (stale ? 1000 : 0));
    const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${payload}`).digest('base64');
    return new Request('https://www.windsorbeauty.is/api/webhooks/resend-inbound', { method: 'POST', body: payload, headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': invalid ? 'v1,invalid' : `v1,${signature}` } });
  };
  return { route: result.exports.POST, calls, request };
}
const fixture = (from = 'customer@example.invalid', headers = { to: 'Info <info@windsorbeauty.is>', 'x-zohomail-delivered-to': 'info@windsorbeauty.is' }) => ({ id:'synthetic-id',message_id:'incoming@smtp.invalid',from, to: ['windsor-beauty@ilkaik.resend.app'], received_for: ['windsor-beauty@ilkaik.resend.app'], subject: 'Synthetic enquiry', text: 'Synthetic question', headers });
test('foreign internal staff senders cannot become Beauty customer records', async () => {
  for (const sender of ['Info <info@windsorglow.is>', 'staff@windsorglow.com', 'staff@windsorglow.co.uk', 'info@windsorbeauty.is', 'info@windsorbeauty.co.uk', 'windsor-glow@ilkaik.resend.app', 'windsor-beauty@ilkaik.resend.app']) {
    const h = harness(fixture(sender)); const res = await h.route(h.request());
    assert.equal(res.status, 200); assert.equal((await res.json()).reason, 'internal_sender');
    assert.deepEqual({ history: h.calls.history, cases: h.calls.cases, alerts: h.calls.alerts }, { history: 0, cases: 0, alerts: 0 });
  }
});
test('exact older SMTP ownership wins over newer case for the same sender',async()=>{
  const content=fixture();content.headers['in-reply-to']='<older@smtp.invalid>';
  const rows=[{id:1,email:content.from,smtp_message_id:'older@smtp.invalid',public_mailbox:'info@windsorbeauty.is'},
    {id:2,email:content.from,smtp_message_id:'newer@smtp.invalid',public_mailbox:'info@windsorbeauty.is'}];
  const h=harness(content,{},rows);assert.equal((await h.route(h.request())).status,200);
  assert.deepEqual(h.calls.replyCases,[1]);assert.equal(h.calls.cases,0);
  assert.equal((await h.route(h.request())).status,200);assert.deepEqual(h.calls.replyCases,[1]);assert.equal(h.calls.alerts,1);
});
test('standard References chain can include a proved customer SMTP ancestor and earlier original alias',async()=>{
  const content=fixture();content.headers['in-reply-to']='<older@smtp.invalid>';content.headers.references='<customer-first@smtp.invalid> <older@smtp.invalid>';
  const rows=[{id:1,email:content.from,smtp_message_id:'older@smtp.invalid',public_mailbox:'info@windsorbeauty.is'},
    {id:1,email:content.from,smtp_message_id:'customer-first@smtp.invalid',public_mailbox:'sales@windsorbeauty.is'}];
  const h=harness(content,{},rows);assert.equal((await h.route(h.request())).status,200);assert.deepEqual(h.calls.replyCases,[1]);assert.equal(h.calls.cases,0);
});
test('incoming SMTP identity missing or disagreeing with provider headers holds without customer writes',async()=>{
  for(const content of [{...fixture(),message_id:undefined},{...fixture(),headers:{...fixture().headers,'message-id':'<different@smtp.invalid>'}}]){
    const h=harness(content);assert.equal((await h.route(h.request())).status,503);assert.equal(h.calls.history+h.calls.cases+h.calls.replyCases.length,0);
  }
});
test('unknown, malformed, conflicting, wrong-owner or foreign-mailbox threads hold without history or case writes',async()=>{
  for(const [reference,subject,rows] of [
    ['<unknown@smtp.invalid>','Re: test',[]],['broken','Re: test',[]],['','Re: test',[]],
    ['<older@smtp.invalid> <newer@smtp.invalid>','Re: test',[{id:1,email:'customer@example.invalid',smtp_message_id:'older@smtp.invalid',public_mailbox:'info@windsorbeauty.is'},{id:2,email:'customer@example.invalid',smtp_message_id:'newer@smtp.invalid',public_mailbox:'info@windsorbeauty.is'}]],
    ['<older@smtp.invalid>','Re: test',[{id:1,email:'other@example.invalid',smtp_message_id:'older@smtp.invalid',public_mailbox:'info@windsorbeauty.is'}]],
    ['<glow@smtp.invalid>','Re: test',[{id:1,email:'customer@example.invalid',smtp_message_id:'glow@smtp.invalid',public_mailbox:'info@windsorglow.is'}]],
  ]){
    const content=fixture();content.subject=subject;if(reference)content.headers['in-reply-to']=reference;
    const h=harness(content,{},rows);assert.equal((await h.route(h.request())).status,503);
    assert.equal(h.calls.history+h.calls.cases+h.calls.alerts+h.calls.replyCases.length,0);
  }
});
test('same-brand verified public headers and dedicated capture preserve retry idempotency', async () => {
  const h = harness(fixture());
  for (let i = 0; i < 2; i++) assert.equal((await h.route(h.request())).status, 200);
  assert.equal(h.calls.cases, 1); assert.equal(h.calls.alerts, 1);
  assert.deepEqual(h.calls.originalMailboxes, ['info@windsorbeauty.is', 'info@windsorbeauty.is']);
});
test('missing dedicated config fails closed despite legacy credentials', async () => {
  for (const env of [{ RESEND_INBOUND_API_KEY_BEAUTY_IS: '', RESEND_INBOUND_API_KEY: 'old-receiving', RESEND_API_KEY: 'old-sending' }, { RESEND_INBOUND_WEBHOOK_SECRET_BEAUTY_IS: '', RESEND_INBOUND_WEBHOOK_SECRET: secret }, { BEAUTY_INBOUND_CAPTURE_ADDRESS: '' }, { BEAUTY_INBOUND_CAPTURE_ADDRESS: 'windsor-glow@ilkaik.resend.app' }]) {
    const h = harness(fixture(), env); assert.equal((await h.route(h.request())).status, 503); assert.equal(h.calls.fetched, 0); assert.equal(h.calls.history, 0);
  }
});
test('spoofed Beauty public headers cannot override foreign or ambiguous provider envelope', async () => {
  for (const values of [['windsor-glow@ilkaik.resend.app'], ['windsor-beauty@ilkaik.resend.app', 'windsor-glow@ilkaik.resend.app'], [], ['other@example.invalid']]) {
    const content = fixture(); content.received_for = values;
    const h = harness(content); const response=await h.route(h.request());assert.equal(response.status,values.length===1&&values[0]==='windsor-glow@ilkaik.resend.app'?200:503); assert.equal(h.calls.history, 0);
  }
});
test('known foreign capture callback is acknowledged before API or customer writes',async()=>{
  const content=fixture();content.to=['windsor-glow@ilkaik.resend.app'];content.received_for=content.to;
  const h=harness(content);const response=await h.route(h.request());assert.equal(response.status,200);assert.equal((await response.json()).reason,'other_business_transport');assert.equal(h.calls.fetched+h.calls.history+h.calls.cases+h.calls.alerts,0);
});
test('multiple original Beauty aliases hold rather than silently choosing a mailbox', async () => {
  const h = harness(fixture(undefined, { to: 'sales@windsorbeauty.is', 'x-zohomail-delivered-to': 'info@windsorbeauty.is' }));
  assert.equal((await h.route(h.request())).status, 503); assert.equal(h.calls.history, 0);
});
test('unreviewed same-business local parts hold and old mailbox provenance stays unchanged', async () => {
  const unknown = harness(fixture(undefined, { to: 'unreviewed@windsorbeauty.is' }));
  assert.equal((await unknown.route(unknown.request())).status, 503); assert.equal(unknown.calls.history, 0);
  const old = harness(fixture(undefined, { to: 'info@windsorbeauty.co.uk' }));
  assert.equal((await old.route(old.request())).status, 200); assert.deepEqual(old.calls.originalMailboxes, ['info@windsorbeauty.co.uk']);
});
test('mixed public recipients and unknown aliases hold before customer writes', async () => {
  for (const headers of [{ to: 'info@windsorbeauty.is,info@windsorglow.is' }, { to: 'info@windsorbeauty.is', 'x-zohomail-delivered-to': 'info@windsorglow.is' }, { to: 'info@windsorbeauty.is,unknown@example.invalid' }, { to: 'info@windsorbeauty.is.attacker.invalid' }]) {
    const h = harness(fixture(undefined, headers)); assert.equal((await h.route(h.request())).status, 503);
    assert.equal(h.calls.history + h.calls.cases + h.calls.alerts, 0);
  }
});
test('foreign-only public recipients are acknowledged without Beauty writes', async () => {
  const h = harness(fixture(undefined, { to: 'info@windsorglow.is' })); const res = await h.route(h.request());
  assert.equal((await res.json()).reason, 'other_business'); assert.equal(h.calls.history, 0);
});
test('domain lookalikes and unrelated senders remain customer candidates', async () => {
  for (const from of ['customer@windsorglow.is.example.invalid', 'customer@unrelated.invalid']) {
    const h = harness(fixture(from)); assert.equal((await h.route(h.request())).status, 200); assert.equal(h.calls.cases, 1);
  }
});
test('invalid and stale actual signatures reject before receiving API or writes', async () => {
  for (const options of [{ invalid: true }, { stale: true }]) {
    const h = harness(fixture()); assert.equal((await h.route(h.request(options))).status, 401); assert.equal(h.calls.fetched, 0); assert.equal(h.calls.history, 0);
  }
});

test('established orders and beautiful .is original aliases create direct cases, no invented legacy alias',async()=>{
 for(const local of ['orders','beautiful']){const mailbox=local+'@windsorbeauty.is';const h=harness(fixture(undefined,{to:mailbox,'x-zohomail-delivered-to':mailbox}));assert.equal((await h.route(h.request())).status,200);assert.equal(h.calls.cases,1);assert.deepEqual(h.calls.originalMailboxes,[mailbox]);const old=local+'@windsorbeauty.co.uk';const rejected=harness(fixture(undefined,{to:old,'x-zohomail-delivered-to':old}));assert.equal((await rejected.route(rejected.request())).status,503);assert.equal(rejected.calls.cases+rejected.calls.history,0);}
});
test('orders and beautiful replies require exact same-owner current alias, no alias crossing',async()=>{
 for(const local of ['orders','beautiful']){const mailbox=local+'@windsorbeauty.is';const content=fixture(undefined,{to:mailbox,'x-zohomail-delivered-to':mailbox,'in-reply-to':'<parent@smtp.invalid>'});for(const [owner,parentMailbox,expected]of [[content.from,mailbox,200],['foreign@example.invalid',mailbox,503],[content.from,'info@windsorbeauty.is',503]]){const h=harness(content,{},[{id:7,email:owner,smtp_message_id:'parent@smtp.invalid',public_mailbox:parentMailbox}]);assert.equal((await h.route(h.request())).status,expected);assert.equal(h.calls.cases,0);assert.equal(h.calls.replyCases.length,expected===200?1:0);}}
});

test('signed capture plus authenticated envelope accepts original public top-level To only with exact own headers',async()=>{
 const own=fixture();own.to=['info@windsorbeauty.is'];const h=harness(own);h.request=(()=>{const content=own;const payload=JSON.stringify({type:'email.received',data:{email_id:'synthetic-id',message_id:content.message_id,received_for:content.received_for,from:content.from,to:['windsor-beauty@ilkaik.resend.app']}}),id='synthetic-event',timestamp=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+timestamp+'.'+payload).digest('base64');return ()=>new Request('https://www.windsorbeauty.is/api/webhooks/resend-inbound',{method:'POST',body:payload,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature}});})();assert.equal((await h.route(h.request())).status,200);assert.equal(h.calls.cases,1);assert.deepEqual(h.calls.originalMailboxes,['info@windsorbeauty.is']);
 for(const to of ['info@windsorglow.is','unknown@example.invalid','info@windsorbeauty.is,info@windsorglow.is']){const bad=harness({...own,headers:{to,'x-zohomail-delivered-to':to}});assert.equal((await bad.route(h.request())).status,503);assert.equal(bad.calls.history+bad.calls.cases,0);}
});

test('signed actual SMTP disagreement or missing signed envelope holds before customer writes',async()=>{
 const content=fixture();const h=harness(content);for(const data of [{email_id:'synthetic-id',from:content.from,to:content.to,received_for:content.received_for,message_id:'foreign@smtp.invalid'},{email_id:'synthetic-id',from:content.from,to:content.to,message_id:content.message_id}]){const payload=JSON.stringify({type:'email.received',data}),id='synthetic-event',timestamp=String(Math.floor(Date.now()/1000));const signature=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(id+'.'+timestamp+'.'+payload).digest('base64');const request=new Request('https://www.windsorbeauty.is/api/webhooks/resend-inbound',{method:'POST',body:payload,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':'v1,'+signature}});assert.equal((await h.route(request)).status,503);assert.equal(h.calls.cases+h.calls.history,0);}
});
