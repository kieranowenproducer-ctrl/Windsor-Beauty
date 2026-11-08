// Disposable in-memory PostgreSQL only. No env files or provider connections.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import vm from 'node:vm';
import * as crypto from 'node:crypto';
import { hasAdminReadAccess } from '../src/lib/adminReadAccess.ts';
import ts from 'typescript';
if (!process.argv[2]) throw Error('Pass the existing isolated PGlite dependency path.');
const { PGlite }=await import(pathToFileURL(path.resolve(process.argv[2])).href);
const pg=new PGlite();
const sql=async(parts,...values)=>(await pg.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
sql.query=async(text,values=[])=>(await pg.query(text,values)).rows;
globalThis.__beautyEnquirySql=sql;
registerHooks({resolve(s,c,next){
  if (s==='next/server') return next('next/server.js',c);
  if ((s==='./client'||s==='@/lib/db/client') && c.parentURL?.includes('/src/')) return {url:'data:text/javascript,export const requireDb=()=>globalThis.__beautyEnquirySql; export const isDbConfigured=()=>true;',shortCircuit:true};
  return next(s,c);
}});
globalThis.fetch=async()=>{throw Error('Real network is forbidden');};
process.env.ADMIN_SESSION_TOKEN='synthetic-beauty-enquiry-admin';
const {ensureSchema}=await import('../src/lib/db/schema.ts');
const {listEnquiries,findEnquiryById,recordEnquiryReply}=await import('../src/lib/db/enquiries.ts');
const {readBeautyReplyDraft,saveBeautyReplyDraft,clearSentBeautyReplyDraft,parseBeautyReplyDraft,recordBeautyDraftReply}=await import('../src/lib/db/beautyEnquiryDrafts.ts');
const route=await import('../src/app/api/admin/enquiries/[id]/reply-draft/route.ts');
let passed=0;
const check=(name,actual,expected)=>{assert.deepEqual(actual,expected,name);passed++;};
const q=(text,values=[])=>pg.query(text,values);
const payload={message:'Fictional saved reply',format:'standard',orderNumber:null,orderSnapshot:null};
try {
 await ensureSchema();
 const migration=fs.readFileSync('scripts/install-beauty-enquiry-drafts.sql','utf8');
 await pg.exec(migration); await pg.exec(migration);
 await q(`INSERT INTO enquiries(id,name,email,subject_key,subject_label,message,status,source,priority,created_at,updated_at)
 SELECT n,'Fictional Owner','owner@example.invalid','other','Fixture '||n,'Synthetic','new','direct_email','normal',
 '2026-01-01'::timestamptz+n*interval '1 minute','2026-01-01'::timestamptz FROM generate_series(1,205) n`);
 await pg.exec("UPDATE enquiries SET priority='urgent' WHERE id=2; UPDATE enquiries SET status='closed' WHERE id=3; UPDATE enquiries SET source='website_form' WHERE id=4");
 await q("INSERT INTO enquiry_replies(enquiry_id,body,from_address,direction,created_at) VALUES(1,'New reply on oldest case','owner@example.invalid','in','2026-11-08')");
 const first=await listEnquiries(200), second=await listEnquiries(200,200);
 check('urgent before normal',first[0].id,2);
 check('new reply lifts oldest case',first[1].id,1);
 check('complete bounded paging',first.length+second.length,205);
 check('unique page results',new Set([...first,...second].map(r=>r.id)).size,205);
 check('closed filter applies before limit',(await listEnquiries(200,0,'closed')).map(r=>r.id),[3]);
 check('source filter applies before limit',(await listEnquiries(200,0,'all','website_form')).map(r=>r.id),[4]);
 check('reply ordering preserved',first[1].replies.length,1);
 check('new draft revision',(await readBeautyReplyDraft(5)).revision,0);
 const initial=await saveBeautyReplyDraft(5,0,0,payload);
 check('first save revision',initial.revision,1);
 check('restores full payload',(await readBeautyReplyDraft(5)).payload,payload);
 check('second tab cannot overwrite revision zero',await saveBeautyReplyDraft(5,0,0,{...payload,message:'stale'}),null);
 check('save sends nothing',(await q('SELECT count(*)::int n FROM enquiry_replies WHERE enquiry_id=5')).rows[0].n,0);
 await q("INSERT INTO enquiry_replies(enquiry_id,body,from_address,direction) VALUES(5,'New inbound','owner@example.invalid','in')");
 check('new inbound rejects old draft base',await saveBeautyReplyDraft(5,1,0,payload),null);
 const latest=Number((await readBeautyReplyDraft(5)).latest_reply_id);
 const revised=await saveBeautyReplyDraft(5,1,latest,{...payload,message:'Revised'});
 check('reviewed latest message can be saved',revised.revision,2);
 check('sent old version cannot remove newer text',await clearSentBeautyReplyDraft(5,1),undefined);
 check('newer text survives',(await readBeautyReplyDraft(5)).payload.message,'Revised');
 check('clear sent exact version increments tombstone',await clearSentBeautyReplyDraft(5,2),3);
 check('late save after send refused',await saveBeautyReplyDraft(5,2,latest,payload),null);
 check('late first-tab save refused',await saveBeautyReplyDraft(5,0,latest,payload),null);
 check('sent text not restored',(await readBeautyReplyDraft(5)).payload,null);
 check('fresh drafting after clear allowed',(await saveBeautyReplyDraft(5,3,latest,payload)).revision,4);
 check('explicit discard creates tombstone',(await saveBeautyReplyDraft(5,4,latest,null)).revision,5);
 check('missing enquiry cannot create orphan',await saveBeautyReplyDraft(999,0,0,payload),null);
 check('reject foreign order prefix',parseBeautyReplyDraft({...payload,format:'order',orderNumber:'WG-123',orderSnapshot:{status:'paid'}}),null);
 check('reject oversized reply',parseBeautyReplyDraft({...payload,message:'a'.repeat(10001)}),null);
 check('no Pearl format',parseBeautyReplyDraft({...payload,format:'pearl'}),null);
 check('standard strips order context',parseBeautyReplyDraft({...payload,orderNumber:'WB-123',orderSnapshot:{status:'paid'}}),payload);
 const context={params:Promise.resolve({id:'5'})};
 const request=(method,body,headers={})=>new Request('http://localhost:3002/api/admin/enquiries/5/reply-draft',{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});
 check('GET refuses anonymous',(await route.GET(request('GET'),context)).status,401);
 const auth={cookie:'wb_admin_session=synthetic-beauty-enquiry-admin',origin:'http://localhost:3002'};
 check('draft GET works',(await route.GET(request('GET',null,auth),context)).status,200);
 check('draft GET no-store',(await route.GET(request('GET',null,auth),context)).headers.get('cache-control'),'private, no-store');
 check('save refuses cross-origin',(await route.PUT(request('PUT',{payload,revision:5,baseReplyId:latest},{...auth,origin:'https://other.invalid'}),context)).status,403);
 check('save refuses bad revision',(await route.PUT(request('PUT',{payload,revision:-1,baseReplyId:latest},auth),context)).status,400);
 check('save returns 409 stale revision',(await route.PUT(request('PUT',{payload,revision:0,baseReplyId:latest},auth),context)).status,409);
 check('save works through real handler',(await route.PUT(request('PUT',{payload,revision:5,baseReplyId:latest},auth),context)).status,200);
 check('beauty-only cookie',(await route.GET(request('GET',null,{cookie:'wg_admin_session=synthetic-beauty-enquiry-admin'}),context)).status,401);
 check('duplicate cookies refused',(await route.GET(request('GET',null,{cookie:auth.cookie+'; '+auth.cookie}),context)).status,401);
 let sent=0, providerError=false, recordingError=false;
 const sendKeys=[];
 const modules={
  'node:crypto':crypto, '@/lib/adminReadAccess':{hasAdminReadAccess},
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '@/lib/db/beautyEnquiryDrafts':{readBeautyReplyDraft,clearSentBeautyReplyDraft,recordBeautyDraftReply:async(...args)=>{if(recordingError)throw Error('synthetic recording failure');return recordBeautyDraftReply(...args);}},
  '@/lib/email/contactAddress':{BEAUTY_CONTACT_EMAIL:'suite@windsorbeauty.is',BEAUTY_CONTACT_FROM:'Windsor Beauty <suite@windsorbeauty.is>'},
  '@/lib/operationalAddress':{beautyOperationalAddress:()=>null},
  '@/lib/enquiryEmails':{buildEnquiryReplyEmail:({subject,standardText})=>({subject,text:standardText})},
  '@/lib/email/send':{sendEmail:async(_payload,options)=>{sent++;sendKeys.push(options.idempotencyKey);return providerError?{error:'synthetic refusal'}:{id:options.idempotencyKey};}},
  '@/lib/db':{findOrderByNumber:async()=>null,isDbConfigured:()=>true},
  '@/lib/db/enquiries':{findEnquiryById,recordEnquiryReply:async input=>{if(recordingError)throw Error('synthetic recording failure');return recordEnquiryReply(input);}},
  '@/lib/email/shared':{emailDocument:()=>'',escapeHtml:s=>s},
  '@/lib/email/enquiryReplyDelivery':{getEnquiryReplyArchiveAddress:()=>null},
  '@/lib/replyCapture':{getReplyCaptureAddress:()=>null},
  '@/lib/email/greeting':{emailGreeting:()=> 'Hello',messageStartsWithGreeting:()=>true},
  '@/lib/email/enquiryAutoDraft':{orderDraftIsStale:()=>false,orderDraftSnapshot:()=>({}),orderStatusEmailCopy:()=>''},
 };
 const compiled=ts.transpileModule(fs.readFileSync('src/app/api/admin/enquiries/[id]/reply/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const result={exports:{}};
 vm.runInNewContext(compiled,{module:result,exports:result.exports,require:name=>{if(!(name in modules))throw Error('Unmocked dependency '+name);return modules[name];},process:{env:{RESEND_API_KEY_BEAUTY_IS:'synthetic-not-a-key'}},console:{error:()=>{}},Response,Request,URL});
 const send=async(id,revision,baseReplyId,message=payload.message)=>result.exports.POST(new Request('http://localhost:3002/api/admin/enquiries/'+id+'/reply',{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({message,format:'standard',draftRevision:revision,baseReplyId})}),{params:Promise.resolve({id:String(id)})});
 await saveBeautyReplyDraft(6,0,0,payload);
 check('stale saved version blocks sending',(await send(6,0,0)).status,400);
 check('changed text blocks sending',(await send(6,1,0,'different')).status,409);
 check('no provider call on refused drafts',sent,0);
 providerError=true;
 check('provider refusal reported',(await send(6,1,0)).status,502);
 check('provider refusal retains saved draft',(await readBeautyReplyDraft(6)).payload,payload);
 providerError=false;
 const accepted=await send(6,1,0);
 check('accepted email reported',accepted.status,200);
 check('retry keeps stable provider key',sendKeys[0],sendKeys[1]);
 check('sent draft cleared',(await readBeautyReplyDraft(6)).payload,null);
 check('late save cannot resurrect after actual send',await saveBeautyReplyDraft(6,1,0,payload),null);
 check('repeat saved send refused',(await send(6,1,0)).status,409);
 await saveBeautyReplyDraft(7,0,0,payload); recordingError=true;
 const acceptedWithoutRecord=await (await send(7,1,0)).json();
 check('record failure says already sent',acceptedWithoutRecord.recorded,false);
 check('record failure still clears saved text',(await readBeautyReplyDraft(7)).payload,null);
 check('stale save after record failure refused',await saveBeautyReplyDraft(7,1,0,payload),null);
 check('new read revision required after accepted email',(await readBeautyReplyDraft(7)).revision,2);
 recordingError=false;
 await saveBeautyReplyDraft(8,0,0,payload);
 await Promise.all([send(8,1,0),send(8,1,0)]);
 check('concurrent same draft has stable provider key',sendKeys.at(-1),sendKeys.at(-2));
 check('concurrent accepted draft recorded once',(await q('SELECT count(*)::int n FROM enquiry_replies WHERE enquiry_id=8')).rows[0].n,1);
 await q("INSERT INTO enquiry_replies(enquiry_id,body,from_address,direction) VALUES(9,'Inbound during provider call','owner@example.invalid','in')");
 await recordBeautyDraftReply(9,'Earlier answer','suite@windsorbeauty.is','synthetic-late-provider',0);
 check('inbound during send remains open',(await findEnquiryById(9)).status,'new');
 check('unauthorised send refused',(await result.exports.POST(new Request('http://localhost:3002/api/admin/enquiries/5/reply',{method:'POST'}),context)).status,401);
 const out=path.resolve('.local-evidence/enquiry-workflow-20261108');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({at:new Date().toISOString(),passed,scope:'Canonical schema, disposable in-memory DB, actual draft GET/PUT, no providers, no existing data'},null,2));
 console.log(`${passed} enquiry workflow checks passed`);
} catch(error) { console.error(error.message); process.exitCode=1; } finally { await pg.close(); }
