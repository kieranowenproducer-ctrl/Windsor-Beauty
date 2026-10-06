import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const now = Date.parse('2026-10-06T12:00:00.000Z');
const secret = 'offline-administrator-fixture-only';
const baseMember = { id: 1, email: 'member@example.invalid', membership_status: 'member', marketing_consent: true,
  email_verified: true, account_status: 'active', banned_at: null,
  contact_consent: true, unsubscribed_at: null, unsubscribe_token: 'a'.repeat(48), contact_matches: 1, locally_suppressed: false };
function loader(overrides = {}, env = {}) {
  const cache = new Map();
  const modules = { crypto, '@/lib/email/shared': { emailDocument: input => input.bodyHtml }, ...overrides };
  const files = { '@/lib/emailAddress': 'src/lib/emailAddress.ts',
    '@/lib/email/memberChangeoverNotice': 'src/lib/email/memberChangeoverNotice.ts',
    '@/lib/storefrontHostPolicy': 'src/lib/storefrontHostPolicy.ts',
    '@/lib/email/memberNoticeSuppressions': 'src/lib/email/memberNoticeSuppressions.ts' };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Buffer, URL, Request, Response, Date: class extends Date { static now() { return now; } },
      AbortSignal, fetch: () => { throw new Error('Network prohibited'); },
      process: { env }, require: name => { if (Object.hasOwn(modules, name)) return modules[name];
        if (files[name]) return load(files[name]); throw new Error('Unexpected offline dependency'); } });
    return module.exports;
  }
  return load;
}
const core = loader()('src/lib/email/memberChangeoverNotice.ts');
function snapshot(changes={}) { return { complete:true, checkedAt:now, evidenceSha256:'b'.repeat(64),emails:new Set(),...changes }; }
function deps(changes = {}) {
  const state = { reserved: false, status: null, sends: 0, finds: 0, key: null };
  const api = {
    findMember: async () => { state.finds++; return { ...baseMember }; },
    reserve: async () => { if (state.reserved) return false; state.reserved = true; state.status = 'reserved'; return true; },
    claim: async () => { if (state.status !== 'reserved') return false; state.status = 'sending'; return true; },
    finish: async (_id, status) => { state.status = status; },
    send: async (_member, key) => { state.sends++; state.key = key; return { ok: true, id: '11111111-1111-4111-8111-111111111111' }; },
    now: () => now, suppressions: async () => snapshot(), ...changes,
  };
  return { state, api };
}

check(core.eligibleNoticeMember(baseMember), true);
for (const change of [{ membership_status: 'guest' }, { marketing_consent: false }, 
  { email_verified: false }, { account_status: 'banned' }, { banned_at: '2026-10-01' }, { contact_consent: false },
  { unsubscribed_at: '2026-10-01' }, { contact_matches: 0 }, { contact_matches: 2 }, { locally_suppressed: true },
  { unsubscribe_token: '' }, { email: 'bad' }, { id: -1 }]) check(core.eligibleNoticeMember({ ...baseMember, ...change }), false);
for (const [url, mode, hosts, allowed] of [
  ['https://windsorbeauty.is/x','public','windsorbeauty.is,www.windsorbeauty.is',true],
  ['https://www.windsorbeauty.is/x','public','windsorbeauty.is,www.windsorbeauty.is',true],
  ['https://windsorbeauty.com/x','public','windsorbeauty.is,www.windsorbeauty.is',false],
  ['http://windsorbeauty.is/x','public','windsorbeauty.is,www.windsorbeauty.is',false],
  ['https://windsorbeauty.is/x','legacy','windsorbeauty.is,www.windsorbeauty.is',false],
  ['https://windsorbeauty.is/x','public','',false],
  ['https://windsorbeauty.is/x','public','windsorbeauty.is,www.windsorbeauty.is,windsorbeauty.com',false],
  ['https://windsorbeauty.is/x','public','windsorbeauty.is,windsorbeauty.is',false],
  ['https://windsorbeauty.is:444/x','public','windsorbeauty.is,www.windsorbeauty.is',false],
]) check(core.noticeLaunchPermits(url, mode, hosts), allowed);
check(core.snapshotAllowsMember(snapshot(),baseMember,now),true);
for(const change of [{complete:false},{evidenceSha256:''},{checkedAt:now-300001},{checkedAt:now+1},{emails:new Set([baseMember.email])}]) {
  check(core.snapshotAllowsMember(snapshot(change),baseMember,now),false);
}
check(core.noticeIdempotencyKey(1) === core.noticeIdempotencyKey(1), true);
check(core.noticeIdempotencyKey(1) === core.noticeIdempotencyKey(2), false);
const payload = core.noticePayload(baseMember);
check(payload.to, baseMember.email); check(payload.from, core.MEMBER_CHANGEOVER_FROM);
check(/https?:\/\/[^\s"<>]*windsorbeauty\.(com|co\.uk)/i.test(JSON.stringify(payload)), false);
check(payload.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
check(payload.text.includes('Email preferences: https://windsorbeauty.is/unsubscribe?token='), true);
check(payload.text.includes('This address is not monitored. For help, email info@windsorbeauty.is.'), true);

const once = deps();
check((await core.sendOneMemberNotice(1, once.api)).outcome, 'sent');
check((await core.sendOneMemberNotice(1, once.api)).status, 409);
check(once.state.sends, 1); check(once.state.key, core.noticeIdempotencyKey(1));
const concurrent = deps();
await Promise.all([core.sendOneMemberNotice(1, concurrent.api),core.sendOneMemberNotice(1, concurrent.api)]);
check(concurrent.state.sends, 1);
for (const send of [async () => { throw new Error('unknown network outcome'); }, async () => ({ ok: false, id: null }), async () => ({ ok: true, id: null })]) {
  const d = deps({ send }); check((await core.sendOneMemberNotice(1, d.api)).status, 503);
  check(d.state.status, 'held'); check((await core.sendOneMemberNotice(1, d.api)).status, 409);
}
const loss = deps({ finish: async () => { throw new Error('storage unavailable'); } });
check((await core.sendOneMemberNotice(1, loss.api)).outcome, 'held-unknown-outcome');
check((await core.sendOneMemberNotice(1, loss.api)).status, 409); check(loss.state.sends, 1);
let reads = 0;
const changed = deps({ findMember: async () => ++reads===1 ? baseMember : { ...baseMember, marketing_consent: false } });
check((await core.sendOneMemberNotice(1, changed.api)).outcome,'held-before-send'); check(changed.state.sends,0);
const expiry = deps({ now: () => now + 300001 });
check((await core.sendOneMemberNotice(1, expiry.api)).status,409); check(expiry.state.reserved,false);
const unavailable=deps({suppressions:async()=>{throw Error('permission denied');}});
check((await core.sendOneMemberNotice(1,unavailable.api)).status,503);check(unavailable.state.reserved,false);

const routeState = { sends: 0, reservations: new Set() };
const db = { findMemberChangeoverRecipient: async () => baseMember, memberChangeoverReviewRows: async () => [{...baseMember,already_reserved:false}],
  reserveMemberChangeover: async member => { if(routeState.reservations.has(member.id))return false;routeState.reservations.add(member.id);return true; },
  claimMemberChangeover: async () => true, finishMemberChangeover: async () => {} };
const routeEnv = { ADMIN_SESSION_TOKEN: secret, RESEND_API_KEY_BEAUTY_IS: 'offline-never-used', WINDSOR_STOREFRONT_MODE:'public', VISITOR_TRACKING_ALLOWED_HOSTS:'windsorbeauty.is,www.windsorbeauty.is' };
const modules = { '@/lib/auth': { getSessionTokenFromRequest: request => request.headers.get('cookie')?.split('wb_admin_session=')[1] ?? null },
  '@/lib/db/client': { isDbConfigured: () => true }, '@/lib/db/memberChangeoverNotice': db,
  '@/lib/email/send': { sendEmail: async () => { routeState.sends++;return {ok:true,id:'11111111-1111-4111-8111-111111111111'}; } },
  '@/lib/email/memberNoticeSuppressions': { readMemberNoticeSuppressions: async () => snapshot() } };
const route = loader(modules,routeEnv)('src/app/api/admin/member-changeover/route.ts');
const body = { action:'send-one',campaignKey:core.MEMBER_CHANGEOVER_CAMPAIGN,approvedContentHash:core.MEMBER_CHANGEOVER_CONTENT_HASH,
  retirementAndMemberSmokeApproved:true,customerId:1 };
function request(changes={},cookie=secret,origin='https://windsorbeauty.is') { return new Request('https://windsorbeauty.is/api/admin/member-changeover',{
  method:'POST',headers:{cookie:`wb_admin_session=${cookie}`,origin,'content-type':'application/json'},body:JSON.stringify({...body,...changes}) }); }
check((await route.POST(request({},'wrong'))).status,401);
check((await route.POST(request({},secret,'https://foreign.invalid'))).status,403);
for(const host of ['windsorbeauty.com','www.windsorbeauty.co.uk','windsorbeauty.is.attacker.invalid','windsorbeauty.is,evil.invalid','windsorbeauty.is:bad','windsorbeauty.is:444','']) {
  const r=request();r.headers.set('host',host);r.headers.set('x-forwarded-host','windsorbeauty.is');
  check((await route.POST(r)).status,403);
}
const internal=new Request('https://internal.example.invalid/api/admin/member-changeover',{method:'POST',
  headers:{host:'windsorbeauty.is',cookie:`wb_admin_session=${secret}`,origin:'https://windsorbeauty.is'},body:JSON.stringify({...body,approvedContentHash:'wrong'})});
check((await route.POST(internal)).status,400);
check((await route.POST(request({approvedContentHash:'wrong'}))).status,400);
check((await route.POST(request({retirementAndMemberSmokeApproved:false}))).status,400); check(routeState.sends,0);
check((await route.POST(request())).status,200); check(routeState.sends,1);
check((await route.POST(request())).status,409); check(routeState.sends,1);
const preview=await route.GET(new Request('https://windsorbeauty.is/api/admin/member-changeover',{headers:{cookie:`wb_admin_session=${secret}`}}));
check(preview.status,200);check((await preview.json()).counts.eligible,1);
const closed = loader(modules,{...routeEnv,WINDSOR_STOREFRONT_MODE:'legacy'})('src/app/api/admin/member-changeover/route.ts');
check((await closed.POST(request())).status,503); check(routeState.sends,1);
const adapter=loader()('src/lib/email/memberNoticeSuppressions.ts').readMemberNoticeSuppressions;
const timestamp=loader()('src/lib/email/memberNoticeSuppressions.ts').validSuppressionCreatedAt;
for(const value of ['2026-10-06 23:47:56.678+00','2026-10-06T23:47:56.678Z','2026-10-06T23:47:56.678+01:00','2024-02-29 12:00:00.123456+00']) check(timestamp(value),true);
for(const value of ['2026-02-29 12:00:00+00','2026-10-06 24:00:00+00','2026-10-06 12:60:00+00','2026-10-06 12:00:60+00',
 '2026-10-06 12:00:00+99','2026-10-06 12:00:00+14:01','2026-10-06T12:00:00+00','2026-10-06 12:00:00','today','2026-10-06 12:00:00.1234567+00'])check(timestamp(value),false);
const row=(id,email='blocked@example.invalid')=>({id,email,origin:'bounce',source_id:null,created_at:'2026-10-01T00:00:00Z'});
let calls=[];
const fetchPages=async(url,options)=>{calls.push({url:String(url),options});return Response.json(calls.length===1?
  {object:'list',has_more:true,data:[row('one')]}:{object:'list',has_more:false,data:[row('two','second@example.invalid')]});};
const complete=await adapter('offline-key',fetchPages,()=>now);
check(complete.complete,true);check(complete.emails.has('blocked@example.invalid'),true);check(calls.length,2);
check(calls[0].url,'https://api.resend.com/suppressions?limit=100');check(calls[1].url,'https://api.resend.com/suppressions?limit=100&after=one');
check(calls[0].options.redirect,'error');check(calls[0].options.method,'GET');check(calls[0].options.cache,'no-store');
const documented=await adapter('offline-key',async()=>Response.json({object:'list',has_more:false,data:[{...row('docs-row'),created_at:'2026-10-06 23:47:56.678+00'}]}),()=>now);
check(documented.complete,true);check(documented.emails.has('blocked@example.invalid'),true);
for(const response of [
  ()=>new Response(null,{status:403}),()=>Response.json({object:'list',has_more:true,data:[]}),
  ()=>Response.json({object:'list',has_more:false,data:[{...row('one'),email:'bad'}]}),
  ()=>Response.json({object:'list',has_more:false,data:[{...row('one'),origin:'unknown'}]}),
  ()=>Response.json({object:'list',has_more:false,data:[row('one'),row('one')]}),
  ()=>Response.json({object:'list',has_more:'false',data:[]}),()=>Response.json({object:'list',has_more:false,data:[{...row('one'),source_id:2}]}),
  ()=>({ok:true,redirected:true,url:'https://foreign.invalid',json:async()=>({})}),
  ()=>({ok:true,redirected:false,url:'https://foreign.invalid',json:async()=>({})}),
  ()=>{throw Error('timeout');},
]){let refused=false;try{await adapter('offline-key',async()=>response(),()=>now);}catch{refused=true;}check(refused,true);}
let cycleRefused=false;try{await adapter('offline-key',async()=>Response.json({object:'list',has_more:true,data:[row('repeat')]}),()=>now);}catch{cycleRefused=true;}check(cycleRefused,true);
let pages=0, boundRefused=false;try{await adapter('offline-key',async()=>Response.json({object:'list',has_more:true,data:[row(`id${++pages}`)]}),()=>now);}catch{boundRefused=true;}check(boundRefused,true);check(pages,10);
let noKey=false;try{await adapter('',async()=>{throw Error('must not fetch');},()=>now);}catch{noKey=true;}check(noKey,true);
const legacy=loader()('src/app/api/admin/launch/send/route.ts');
for(const value of [{},{action:'send'},{testTo:'owner@example.invalid'},{testTo:'member@example.invalid'}]){
 const r=new Request('https://windsorbeauty.is/api/admin/launch/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
 check((await legacy.POST(r)).status,409);
}
console.log(JSON.stringify({passed:true,checks,actualModulesAndHandler:true,noNetwork:true,noProviderOrProductionDb:true}));
