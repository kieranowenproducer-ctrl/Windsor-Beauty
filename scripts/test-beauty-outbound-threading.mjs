import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as capture from '../src/lib/replyCapture.ts';
import {normaliseMessageId} from '../src/lib/email/threadReferences.ts';
function load(file,modules,env={},fetch){const result={exports:{}};const compiled=ts.transpileModule(readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(compiled,{exports:result.exports,module:result,require:name=>{if(!(name in modules))throw Error(`Unexpected ${name}`);return modules[name];},process:{env},console,AbortSignal,fetch});return result.exports;}
const key=Buffer.from('synthetic-outbound-signature-only');const secret=`whsec_${key.toString('base64')}`;
const legacy='whsec_'+Buffer.from('synthetic-legacy').toString('base64');
const provider='00000000-0000-4000-8000-000000000001';
function harness(env={},fetch){const calls={metadata:[],delivery:0,invitation:0,reads:0};const metadata=load('src/lib/email/beautySentMetadata.ts',{'./threadReferences':{normaliseMessageId}},env,async(...args)=>{calls.reads++;if(!fetch)throw Error('Unexpected API read');return fetch(...args);});
  const route=load('src/app/api/webhooks/resend-outbound/route.ts',{'next/server':{NextResponse:{json:(body,opts={})=>new Response(JSON.stringify(body),{status:opts.status||200})}},'@/lib/replyCapture':capture,
    '@/lib/db/customerEmails':{updateCustomerEmailDelivery:async()=>{calls.delivery++;return true;}},'@/lib/affiliates':{markInvitationEmailFailedByProvider:async()=>{calls.invitation++;}},
    '@/lib/db/beautyEmailThreads':{recordVerifiedBeautySmtpMetadata:async input=>{calls.metadata.push(input);}},'@/lib/email/beautySentMetadata':metadata,'@/lib/email/threadReferences':{normaliseMessageId}},
    {RESEND_OUTBOUND_WEBHOOK_SECRET_BEAUTY_IS:secret,RESEND_OUTBOUND_WEBHOOK_SECRET:legacy,...env});return {calls,route};}
const event=(data={})=>({type:'email.sent',data:{email_id:provider,from:'Info <info@windsorbeauty.is>',to:['member@example.invalid'],reply_to:['info@windsorbeauty.is'],message_id:'<exact@smtp.invalid>',...data}});
function request(value,secretKey=key,invalid=false){const body=JSON.stringify(value),id='synthetic',timestamp=String(Math.floor(Date.now()/1000));const sig=crypto.createHmac('sha256',secretKey).update(`${id}.${timestamp}.${body}`).digest('base64');return new Request('https://www.windsorbeauty.is/api/webhooks/resend-outbound',{method:'POST',body,headers:{'svix-id':id,'svix-timestamp':timestamp,'svix-signature':invalid?'v1,invalid':`v1,${sig}`}});}
test('dedicated signed Beauty metadata records exact provider and SMTP IDs, legacy cannot claim ownership',async()=>{
  const h=harness();assert.equal((await h.route.POST(request(event()))).status,200);assert.equal(h.calls.metadata[0].providerId,provider);assert.equal(h.calls.metadata[0].messageId,'<exact@smtp.invalid>');
  const old=harness();assert.equal((await old.route.POST(request(event(),Buffer.from('synthetic-legacy')))).status,200);assert.equal(old.calls.metadata.length,0);assert.equal(old.calls.delivery,1);
});
test('documented real-format July2026 SMTP ID remains distinct from its provider UUID',async()=>{
  const providerId='01a107fa-0775-7307-a0a3-ae57d324d246';
  const smtp='<010201a107fa0948-a83fea8a-8177-46f4-8c4e-3b9dba216ff9-000000@eu-west-1.amazonses.com>';
  const h=harness();const value=event({email_id:providerId,message_id:smtp});
  assert.equal((await h.route.POST(request(value))).status,200);
  assert.equal(h.calls.metadata[0].providerId,providerId);assert.equal(h.calls.metadata[0].messageId,smtp);assert.notEqual(h.calls.metadata[0].messageId,providerId);assert.equal(h.calls.reads,0);
});
test('invalid signatures and foreign-business senders cause no metadata or delivery writes',async()=>{
  for(const [value,invalid]of [[event(),true],[event({from:'info@windsorglow.is'}),false]]){const h=harness();await h.route.POST(request(value,key,invalid));assert.equal(h.calls.metadata.length+h.calls.delivery,0);}
});
test('dedicated secret cannot reuse legacy identity and ambiguous Reply-To holds',async()=>{
  const shared=harness({RESEND_OUTBOUND_WEBHOOK_SECRET:secret});assert.equal((await shared.route.POST(request(event()))).status,503);assert.equal(shared.calls.delivery,0);
  const ambiguous=harness();assert.equal((await ambiguous.route.POST(request(event({reply_to:['info@windsorbeauty.is','sales@windsorbeauty.is']})))).status,503);assert.equal(ambiguous.calls.delivery,0);
});
test('missing SMTP ID stays held with GET off, never reads send-only or legacy keys',async()=>{
  const h=harness({RESEND_API_KEY_BEAUTY_IS:'sending-only',RESEND_API_KEY:'old',RESEND_INBOUND_API_KEY:'old-receiving'});assert.equal((await h.route.POST(request(event({message_id:undefined})))).status,503);assert.equal(h.calls.reads+h.calls.delivery,0);
});
test('explicit read fallback validates provider identity and uses only dedicated receiving key',async()=>{
  const env={BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED:'true',RESEND_INBOUND_API_KEY_BEAUTY_IS:'synthetic-receiving',RESEND_API_KEY_BEAUTY_IS:'sending-only'};
  const h=harness(env,async(url,opts)=>{assert.equal(url,`https://api.resend.com/emails/${provider}`);assert.equal(opts.headers.Authorization,'Bearer synthetic-receiving');return {ok:true,json:async()=>({id:provider,message_id:'<verified@smtp.invalid>',from:'info@windsorbeauty.is',to:['member@example.invalid'],reply_to:['info@windsorbeauty.is']})};});
  assert.equal((await h.route.POST(request(event({message_id:undefined})))).status,200);assert.equal(h.calls.metadata[0].messageId,'verified@smtp.invalid');assert.equal(h.calls.reads,1);
});
test('unrelated Beauty transactional sender keeps delivery tracking without claiming enquiry metadata',async()=>{
  const h=harness();assert.equal((await h.route.POST(request(event({from:'orders@windsorbeauty.is',message_id:undefined})))).status,200);assert.equal(h.calls.delivery,1);assert.equal(h.calls.metadata.length+h.calls.reads,0);
});

test('missing signed Reply-To never guesses From; authenticated capture override or absent API field holds',async()=>{
 const off=harness();assert.equal((await off.route.POST(request(event({reply_to:undefined})))).status,503);assert.equal(off.calls.reads+off.calls.metadata.length+off.calls.delivery,0);
 for(const reply_to of [['windsor-glow@ilkaik.resend.app'],undefined]){
  const h=harness({BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED:'true',RESEND_INBOUND_API_KEY_BEAUTY_IS:'synthetic-receiving'},async()=>({ok:true,json:async()=>({id:provider,message_id:'<exact@smtp.invalid>',from:'info@windsorbeauty.is',to:['member@example.invalid'],reply_to})}));
  assert.equal((await h.route.POST(request(event({reply_to:undefined})))).status,503);assert.equal(h.calls.reads,1);assert.equal(h.calls.metadata.length+h.calls.delivery,0);
 }
});

test('authenticated GET cannot override a conflicting signed SMTP identity',async()=>{
 const h=harness({BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED:'true',RESEND_INBOUND_API_KEY_BEAUTY_IS:'synthetic-receiving'},async()=>({ok:true,json:async()=>({id:provider,message_id:'<different@smtp.invalid>',from:'info@windsorbeauty.is',to:['member@example.invalid'],reply_to:['info@windsorbeauty.is']})}));assert.equal((await h.route.POST(request(event({reply_to:undefined})))).status,503);assert.equal(h.calls.reads,1);assert.equal(h.calls.metadata.length+h.calls.delivery,0);
});
