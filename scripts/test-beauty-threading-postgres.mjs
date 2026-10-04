// Isolated actual SQL proof. Sole argument is temporary PGlite dist/index.js.
// No production environment or provider is read. One queued connection is not
// a multi-connection contention proof.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import * as references from '../src/lib/email/threadReferences.ts';
if(!process.argv[2])throw Error('Pass isolated PGlite path. No live DB supported.');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();after(()=>db.close());
await db.exec(`CREATE TABLE enquiries(id SERIAL PRIMARY KEY,email TEXT NOT NULL,name TEXT,subject_key TEXT,subject_label TEXT,order_number TEXT,message TEXT,status TEXT DEFAULT 'closed',source TEXT,priority TEXT,attention_flag TEXT,created_at TIMESTAMPTZ DEFAULT now(),updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE enquiry_replies(id SERIAL PRIMARY KEY,enquiry_id INTEGER REFERENCES enquiries(id),body TEXT,from_address TEXT,provider_message_id TEXT,direction TEXT DEFAULT 'out',created_at TIMESTAMPTZ DEFAULT now());
INSERT INTO enquiries(id,email) VALUES(1,'member@example.invalid'),(2,'member@example.invalid'),(3,'other@example.invalid');`);
const sql=async(strings,...values)=>{let statement=strings[0];for(let i=0;i<values.length;i++)statement+=`$${i+1}`+strings[i+1];return (await db.query(statement,values)).rows;};
function load(file,modules){const result={exports:{}};const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(compiled,{module:result,exports:result.exports,require:name=>{if(!(name in modules))throw Error(`Unexpected module ${name}`);return modules[name];},console,Date,Buffer});return result.exports;}
const client={requireDb:()=>sql};
const enquiries=load('src/lib/db/enquiries.ts',{'crypto':crypto,'./client':client});
const threads=load('src/lib/db/beautyEmailThreads.ts',{'crypto':crypto,'./client':client,'./enquiries':enquiries,'@/lib/email/threadReferences':references});
test('runtime refuses absent thread schema without installing tables',async()=>{
  await assert.rejects(()=>threads.findExactBeautyEmailThread('member@example.invalid','info@windsorbeauty.is',['unknown@smtp.invalid']));
  assert.equal((await db.query("SELECT to_regclass('beauty_enquiry_smtp_metadata') AS relation")).rows[0].relation,null);
  await db.exec(readFileSync(new URL('./beauty-threading-schema-review.sql',import.meta.url),'utf8'));
});
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
const metadata=(providerId,messageId,customerTo='member@example.invalid')=>({providerId,messageId,from:'info@windsorbeauty.is',customerTo,replyTo:'info@windsorbeauty.is'});
test('callback-before-save metadata remains durable then joins exact saved provider reply',async()=>{
  await threads.recordVerifiedBeautySmtpMetadata(metadata(ids[0],'<older@smtp.invalid>'));
  assert.equal(await threads.findExactBeautyEmailThread('member@example.invalid','info@windsorbeauty.is',['older@smtp.invalid']),null);
  await db.query('INSERT INTO enquiry_replies(enquiry_id,provider_message_id,from_address) VALUES($1,$2,$3)',[1,ids[0],'Windsor Beauty <info@windsorbeauty.is>']);
  assert.equal((await threads.findExactBeautyEmailThread('member@example.invalid','info@windsorbeauty.is',['older@smtp.invalid'])).id,1);
});
test('same sender multiple cases, unknown, conflicting, foreign owner/mailbox IDs hold exactly',async()=>{
  await db.query('INSERT INTO enquiry_replies(enquiry_id,provider_message_id,from_address) VALUES($1,$2,$3)',[2,ids[1],'info@windsorbeauty.is']);
  await threads.recordVerifiedBeautySmtpMetadata(metadata(ids[1],'newer@smtp.invalid'));
  assert.equal((await threads.findExactBeautyEmailThread('member@example.invalid','info@windsorbeauty.is',['older@smtp.invalid'])).id,1);
  for(const [email,mailbox,refs]of [['member@example.invalid','info@windsorbeauty.is',['older@smtp.invalid','newer@smtp.invalid']],['other@example.invalid','info@windsorbeauty.is',['older@smtp.invalid']],['member@example.invalid','info@windsorglow.is',['older@smtp.invalid']],['member@example.invalid','info@windsorbeauty.is',['glow@smtp.invalid']],['member@example.invalid','info@windsorbeauty.is',['older@smtp.invalid','unknown@smtp.invalid']]])assert.equal(await threads.findExactBeautyEmailThread(email,mailbox,refs),null);
});
test('metadata retry cannot change SMTP, customer, alias or business, or collide another provider',async()=>{
  await threads.recordVerifiedBeautySmtpMetadata(metadata(ids[0],'older@smtp.invalid'));
  for(const value of [{...metadata(ids[0],'different@smtp.invalid')},{...metadata(ids[0],'older@smtp.invalid'),customerTo:'other@example.invalid'},{...metadata(ids[0],'older@smtp.invalid'),replyTo:'sales@windsorbeauty.is'},{...metadata(ids[2],'glow@smtp.invalid'),from:'info@windsorglow.is'},metadata(ids[2],'older@smtp.invalid')])await assert.rejects(()=>threads.recordVerifiedBeautySmtpMetadata(value));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM beauty_enquiry_smtp_metadata')).rows[0].n,2);
});
test('incoming provenance and final case remain immutable through retry and conflicting completion',async()=>{
  const input={providerId:'incoming-one',smtpId:'customer-incoming@smtp.invalid',hash:'same-content',sender:'member@example.invalid',mailbox:'sales@windsorbeauty.is',capture:'windsor-beauty@ilkaik.resend.app',target:1};
  assert.equal(await threads.claimBeautyInboundRoute(input),null);
  await assert.rejects(()=>threads.completeBeautyInboundRoute(input.providerId,2));
  await assert.rejects(()=>threads.completeBeautyInboundRoute(input.providerId,3));
  await threads.completeBeautyInboundRoute(input.providerId,1);
  assert.equal(await threads.claimBeautyInboundRoute(input),1);
  for(const changed of [{hash:'changed'},{smtpId:'different@smtp.invalid'},{sender:'other@example.invalid'},{mailbox:'info@windsorglow.is'},{capture:'windsor-glow@ilkaik.resend.app'},{target:2}])await assert.rejects(()=>threads.claimBeautyInboundRoute({...input,...changed}));
  await assert.rejects(()=>threads.completeBeautyInboundRoute(input.providerId,2));
  assert.equal((await db.query('SELECT recorded_enquiry_id FROM beauty_inbound_email_routes WHERE provider_id=$1',[input.providerId])).rows[0].recorded_enquiry_id,1);
  assert.equal((await threads.findExactBeautyEmailThread('member@example.invalid','info@windsorbeauty.is',['customer-incoming@smtp.invalid','older@smtp.invalid'],['older@smtp.invalid'])).id,1);
  await assert.rejects(()=>threads.claimBeautyInboundRoute({...input,providerId:'second-forward-id'}));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM beauty_inbound_email_routes WHERE smtp_message_id=$1',[input.smtpId])).rows[0].n,1);
});
test('actual incoming reply SQL records once, does not reopen on duplicate or cross-case retry',async()=>{
  const input={enquiryId:1,body:'Synthetic followup',fromAddress:'member@example.invalid',providerMessageId:'received-unique',attachments:[]};
  const values=await Promise.all([enquiries.recordInboundEnquiryReply(input),enquiries.recordInboundEnquiryReply(input)]);
  assert.equal(values.filter(value=>value?.created).length,1);
  await db.query("UPDATE enquiries SET status='closed' WHERE id=1");
  assert.equal((await enquiries.recordInboundEnquiryReply(input)).created,false);
  assert.equal(await enquiries.recordInboundEnquiryReply({...input,enquiryId:2}),null);
  assert.equal(await enquiries.recordInboundEnquiryReply({...input,fromAddress:'other@example.invalid'}),null);
  assert.equal((await db.query('SELECT status FROM enquiries WHERE id=1')).rows[0].status,'closed');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM enquiry_replies WHERE provider_message_id=$1',[input.providerMessageId])).rows[0].n,1);
});
