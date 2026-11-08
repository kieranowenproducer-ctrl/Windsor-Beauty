// Actual canonical Beauty schema and merge functions, fictional in-memory data.
// No environment files, provider calls, preserved database or ports are used.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import path from 'node:path';
if (!process.argv[2]) throw new Error('Pass the installed isolated PGlite module path.');
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const pg = new PGlite();
const sql = async (parts,...values) => (await pg.query(parts.reduce((s,p,i)=>s+(i?`$${i}`:'')+p,''),values)).rows;
sql.query = async (text,values=[]) => (await pg.query(text,values)).rows;
globalThis.__beautyMergeSql = sql;
registerHooks({resolve(specifier,ctx,next) {
  if (specifier==='./client' && ctx.parentURL?.endsWith('/src/lib/db/schema.ts')) return {url:'data:text/javascript,export const requireDb=()=>globalThis.__beautyMergeSql;',shortCircuit:true};
  return next(specifier,ctx);
}});
globalThis.fetch = async()=>{throw new Error('External calls forbidden');};
const {ensureSchema} = await import('../src/lib/db/schema.ts');
const {customerMergeStatements} = await import('../src/lib/db/customerMergeSchema.mjs');
const dir=path.resolve('.local-evidence/customer-merge-20261108/checks',new Date().toISOString().replaceAll(':','-'));
mkdirSync(dir,{recursive:true});
const sourcePaths=['src/lib/db/customerMergeSchema.mjs','src/lib/db/schema.ts','src/lib/db/schema-parts/customer-merge.ts','scripts/test-beauty-customer-merge.mjs'];
const hashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
let checks=0;const names=[];let failure=null;
const ok=(label,v)=>{assert.ok(v,label);checks++;names.push(label);};
const equal=(label,a,b)=>{assert.deepEqual(a,b,label);checks++;names.push(label);};
const query=(q,v=[])=>pg.query(q,v);
async function rejects(label,run,pattern) {await assert.rejects(run,pattern);checks++;names.push(label);}
let nextId=20000;
async function pair() {
 const a=++nextId,b=++nextId;
 await query(`INSERT INTO customers(id,email,password_hash,first_name,last_name,marketing_consent,email_verified) VALUES
 ($1,$3,'keep-secret-hash','Kept','Fictional',false,true),($2,$4,'remove-secret-hash','Other','Fictional',true,false)`,[a,b,`keep-${a}@example.invalid`,`remove-${b}@example.invalid`]);
 return [a,b];
}
async function preview(a,b) {return (await query('SELECT wb_customer_merge_preview($1,$2) p',[a,b])).rows[0].p;}
async function merge(a,b,p,id=randomUUID()) {return (await query('SELECT wb_customer_merge_execute($1,$2,$3,$4) r',[id,a,b,p.fingerprint])).rows[0].r;}
async function row(table,id) {return (await query(`SELECT to_jsonb(t) row FROM ${table} t WHERE id=$1`,[id])).rows[0]?.row;}
async function order(customerId,email='old-address@example.invalid') {
 const id=++nextId;
 await query(`INSERT INTO orders(id,order_number,customer_id,email,customer_name,items,subtotal,discount_amount,shipping_label,shipping_cost,total,status,shipping_address,shipping_city,shipping_postcode,shipping_country)
 VALUES($1,$2,$3,$4,'Historical Buyer','[]',50,5,'Standard',10,55,'paid','Old address','Windsor','SL1 1AA','GB')`,[id,`BEAUTY-MERGE-${id}`,customerId,email]);return id;
}
try {
 await ensureSchema();
 equal('migration functions installed', (await query("SELECT count(*)::int n FROM pg_proc WHERE proname IN('wb_customer_merge_links','wb_customer_merge_preview','wb_customer_merge_execute')")).rows[0].n,3);
 for (const statement of customerMergeStatements) await pg.exec(statement);
 equal('additive migration re-applies without audit rows',(await query('SELECT count(*)::int n FROM beauty_customer_merges')).rows[0].n,0);
 await pg.exec("ALTER TABLE customer_emails DROP CONSTRAINT wb_merge_customer_fk; INSERT INTO customer_emails(direction,customer_id,email,subject,body_text) VALUES('outbound',999998,'orphan@example.invalid','historical orphan','preserved')");
 const orphanBefore=(await query("SELECT to_jsonb(t) row FROM customer_emails t WHERE subject='historical orphan'")).rows[0].row;
 for (const statement of customerMergeStatements) await pg.exec(statement);
 equal('NOT VALID migration preserves historical orphan unchanged',(await query("SELECT to_jsonb(t) row FROM customer_emails t WHERE subject='historical orphan'")).rows[0].row,orphanBefore);
 // Newly linked writes are checked even where the old canonical history had no FK.
 await rejects('new stale email history owner is refused',()=>query("INSERT INTO customer_emails(direction,customer_id,email,subject,body_text) VALUES('outbound',999999,'x@example.invalid','fictional','fictional')"),/foreign key/);
 const [a,b]=await pair(); const [unrelated]=await pair();
 const keepBefore=await row('customers',a); const unrelatedBefore=await row('customers',unrelated);
 const oid=await order(b); const orderBefore=await row('orders',oid);
 await query("INSERT INTO customer_emails(direction,customer_id,email,subject,body_text) VALUES('outbound',$1,'old@example.invalid','fictional','fictional')",[b]);
 await query("INSERT INTO customer_sessions(customer_id,token,expires_at) VALUES($1,'keep-session',now()+interval '1 day'),($2,'remove-session',now()+interval '1 day')",[a,b]);
 await query("INSERT INTO password_reset_tokens(customer_id,token,expires_at) VALUES($1,'remove-reset',now()+interval '1 day')",[b]);
 await query("INSERT INTO email_verification_tokens(customer_id,token,expires_at) VALUES($1,'remove-verify',now()+interval '1 day')",[b]);
 const p=await preview(a,b); equal('clean pair has no blockers',p.blockers,[]);
 ok('preview exposes order count',p.moves.some(x=>x.table==='orders'&&x.count===1));
 ok('preview omits credentials and token contents',!JSON.stringify(p).includes('secret-hash')&&!JSON.stringify(p).includes('remove-session'));
 const rid=randomUUID();equal('first merge result',await merge(a,b,p,rid),{keptId:a,removedId:b,replayed:false});
 equal('kept complete profile and all identity/consent fields unchanged',await row('customers',a),keepBefore);
 equal('unrelated account unchanged',await row('customers',unrelated),unrelatedBefore);
 equal('removed customer is absent',await row('customers',b),undefined);
 equal('only order customer link changes',await row('orders',oid),{...orderBefore,customer_id:a});
 equal('historical mail address stays unchanged',(await query('SELECT customer_id,email FROM customer_emails WHERE subject=$1',['fictional'])).rows,[{customer_id:a,email:'old@example.invalid'}]);
 equal('kept session remains',(await query('SELECT token FROM customer_sessions ORDER BY id')).rows,[{token:'keep-session'}]);
 equal('removed reset links revoked',(await query('SELECT count(*)::int n FROM password_reset_tokens')).rows[0].n,0);
 equal('removed verification links revoked',(await query('SELECT count(*)::int n FROM email_verification_tokens')).rows[0].n,0);
 equal('exact retry is a no-op',await merge(a,b,p,rid),{keptId:a,removedId:b,replayed:true});
 await rejects('same request cannot target another kept customer',()=>merge(unrelated,b,p,rid),/merge_request_conflict/);
 equal('one audit only',(await query('SELECT count(*)::int n FROM beauty_customer_merges')).rows[0].n,1);
 const audit=(await query('SELECT to_jsonb(t) a FROM beauty_customer_merges t')).rows[0].a;
 ok('audit holds old identity but no credentials',audit.removed_email.includes(`remove-${b}`)&&!JSON.stringify(audit).includes('secret-hash'));
 // Preserve first preview, then introduce genuine changes before execution.
 const [c,d]=await pair(); const oid2=await order(d); const fresh=await preview(c,d);
 await query("UPDATE orders SET status='refunded' WHERE id=$1",[oid2]);
 await rejects('changed history invalidates preview',()=>merge(c,d,fresh),/merge_stale/);
 equal('stale failure leaves order attached to removed account',(await row('orders',oid2)).customer_id,d);
 const p2=await preview(c,d);
 await query("UPDATE customers SET phone='07000000001' WHERE id=$1",[c]);
 await rejects('changed retained profile invalidates preview',()=>merge(c,d,p2),/merge_stale/);
 const p3=await preview(c,d);
 await pg.exec('CREATE TABLE new_protected_dependency(id serial primary key,owner_id integer REFERENCES customers(id) ON DELETE CASCADE)');
 await query('INSERT INTO new_protected_dependency(owner_id) VALUES($1)',[d]);
 await rejects('late unknown FK blocks inside transaction',()=>merge(c,d,p3),/merge_blocked/);
 ok('unknown dependency explicitly previewed',(await preview(c,d)).blockers.some(v=>v.includes('new_protected_dependency')));
 equal('protected history retained',(await query('SELECT count(*)::int n FROM new_protected_dependency')).rows[0].n,1);
 await pg.exec('DROP TABLE new_protected_dependency');
 const p4=await preview(c,d);
 await pg.exec("CREATE FUNCTION reject_fixture_delete() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture final delete refused'; END$$; CREATE TRIGGER fixture_delete_guard BEFORE DELETE ON customers FOR EACH ROW EXECUTE FUNCTION reject_fixture_delete()");
 await rejects('late delete failure rolls transaction back',()=>merge(c,d,p4),/fixture final delete/);
 equal('failed delete rolls history moves back',(await row('orders',oid2)).customer_id,d);
 equal('failed delete creates no audit',(await query('SELECT count(*)::int n FROM beauty_customer_merges WHERE removed_id=$1',[d])).rows[0].n,0);
 await pg.exec('DROP TRIGGER fixture_delete_guard ON customers; DROP FUNCTION reject_fixture_delete()');
 async function blocked(label,setup,match) { const [x,y]=await pair(); await setup(x,y);const v=await preview(x,y);ok(label+' preview',v.blockers.some(z=>match.test(z)));await rejects(label+' execution',()=>merge(x,y,v),/merge_blocked/);ok(label+' preserves both',!!await row('customers',x)&&!!await row('customers',y));}
 await blocked('removed banned',(x,y)=>query('UPDATE customers SET banned_at=now() WHERE id=$1',[y]),/not banned/);
 await blocked('kept banned',(x)=>query('UPDATE customers SET banned_at=now() WHERE id=$1',[x]),/not banned/);
 await blocked('inactive account',(x,y)=>query("UPDATE customers SET account_status='inactive' WHERE id=$1",[y]),/active/);
 await blocked('email-only invoice',(x,y)=>query("INSERT INTO invoices(invoice_number,customer_name,email,public_token) VALUES($1,'Fictional',$2,$3)",[`FIXTURE-${y}`,`remove-${y}@example.invalid`,randomUUID()]),/Invoices/);
 await blocked('email-only order',async(x,y)=>order(null,`remove-${y}@example.invalid`),/Unlinked orders/);
 await blocked('active code',(x,y)=>query("INSERT INTO discount_signups(email,code) VALUES($1,$2)",[`remove-${y}@example.invalid`,`TEST${y}`]),/active or reserved/);
 await blocked('reserved used code',(x,y)=>query("INSERT INTO discount_signups(email,code,status,reservation_token) VALUES($1,$2,'used','reserved')",[`remove-${y}@example.invalid`,`TEST${y}`]),/active or reserved/);
 await blocked('missing code owner',(x,y)=>query("UPDATE customers SET discount_code='MISSING' WHERE id=$1",[y]),/Welcome code ownership/);
 await blocked('security matched numeric evidence',(x,y)=>query("INSERT INTO security_review_cases(dedupe_key,subject_customer_id,source_event,evidence_band,summary,matched_customer_ids) VALUES($1,$2,'test','information','Fictional',$3::jsonb)",[randomUUID(),x,JSON.stringify([y])]),/Security Review/);
 await blocked('security matched string evidence',(x,y)=>query("INSERT INTO security_review_cases(dedupe_key,subject_customer_id,source_event,evidence_band,summary,matched_customer_ids) VALUES($1,$2,'test','information','Fictional',$3::jsonb)",[randomUUID(),x,JSON.stringify([String(y)])]),/Security Review/);
 await blocked('Security Review subject',(x,y)=>query("INSERT INTO security_review_cases(dedupe_key,subject_customer_id,source_event,evidence_band,summary) VALUES($1,$2,'test','information','Fictional')",[randomUUID(),y]),/security_review_cases/);
 await blocked('historic email ban',(x,y)=>query("INSERT INTO customer_bans(customer_email,action) VALUES($1,'ban')",[`remove-${y}@example.invalid`]),/Ban history/);
 const [usedKeep,usedRemove]=await pair();
 await query("INSERT INTO discount_signups(email,code,status,used_at) VALUES($1,$2,'used',now())",[`remove-${usedRemove}@example.invalid`,`USED${usedRemove}`]);
 await query('UPDATE customers SET discount_code=$1 WHERE id=$2',[`USED${usedRemove}`,usedRemove]);
 const usedBefore=(await query('SELECT to_jsonb(d) row FROM discount_signups d WHERE code=$1',[`USED${usedRemove}`])).rows[0].row;
 const usedPreview=await preview(usedKeep,usedRemove);equal('spent code without reservation is safe',usedPreview.blockers,[]);
 await merge(usedKeep,usedRemove,usedPreview);
 equal('spent code source remains unchanged',(await query('SELECT to_jsonb(d) row FROM discount_signups d WHERE code=$1',[`USED${usedRemove}`])).rows[0].row,usedBefore);
 equal('removed benefit never transferred',(await row('customers',usedKeep)).discount_code,null);
 const [aliasKeep,aliasRemove]=await pair();await query("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES($1,'fictional','Alias','Fictional')",[`REMOVE-${aliasRemove}@EXAMPLE.INVALID`]);
 ok('case-insensitive duplicate email blocks',(await preview(aliasKeep,aliasRemove)).blockers.some(v=>v.includes('Login email ownership')));
 const [e,f]=await pair(); const fp=await preview(e,f);
 await pg.exec('BEGIN ISOLATION LEVEL REPEATABLE READ');
 await rejects('stale isolation levels are refused',()=>merge(e,f,fp),/merge_isolation/);await pg.exec('ROLLBACK');
 await pg.exec('CREATE ROLE merge_unprivileged');await pg.exec('SET ROLE merge_unprivileged');
 await rejects('PUBLIC cannot invoke merge',()=>merge(e,f,fp),/permission denied/);await pg.exec('RESET ROLE');
 equal('preview declared volatile for fresh post-lock reads',(await query("SELECT provolatile FROM pg_proc WHERE proname='wb_customer_merge_preview'")).rows[0].provolatile,'v');
 for(const [file,hash] of Object.entries(hashes)) equal('source unchanged '+file,createHash('sha256').update(readFileSync(file)).digest('hex'),hash);
}catch(e){failure={name:e.name,message:e.message};}
finally {await pg.close();writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({passed:!failure,checks,names,failure,sources:hashes,inMemory:true,networkCalls:0,providerCalls:0,limitations:['Single in-memory PostgreSQL engine; no claim of independent-session contention or hosted migration acceptance.']},null,2));}
console.log(JSON.stringify({passed:!failure,checks,failure,receipt:path.join(dir,'receipt.json')}));if(failure)process.exitCode=1;
