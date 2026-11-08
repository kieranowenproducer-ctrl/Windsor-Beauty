// Actual staff handler and SQL with an isolated database. Registration results
// are injected; authentication uses a real signed ES256 assertion and verifier.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import vm from 'node:vm';import ts from 'typescript';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {PGlite}=await import(pathToFileURL(path.resolve(process.argv[2])).href);
import * as verifier from '@simplewebauthn/server';
const db=new PGlite(),require=createRequire(import.meta.url);
const sql=(parts,...values)=>({text:parts.reduce((q,s,i)=>q+(i?'$'+i:'')+s,''),values,then(resolve,reject){return db.query(this.text,this.values).then(r=>r.rows).then(resolve,reject);}});
sql.transaction=queries=>db.transaction(async tx=>{const result=[];for(const q of queries)result.push((await tx.query(q.text,q.values)).rows);return result;});
const env={WB_PASSKEY_ORIGIN:'http://localhost:3002',WB_ADMIN_PASSKEYS_ENABLED:'true',ADMIN_USERNAME:'private-staff',ADMIN_PASSWORD:'FictionalStaffPassword!',ADMIN_SESSION_TOKEN:'f'.repeat(64)};
const load=(file,deps={})=>{const m={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,process:{env},Buffer,URL,Request,Date,Uint8Array,require(n){if(n==='node:crypto')return require(n);if(n in deps)return deps[n];throw Error('Unexpected '+n);}});return m.exports;};
const cookies=(r,name)=>r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)||null;
const next={NextResponse:{json(body,{status=200,headers={}}={}){const r=new Response(JSON.stringify(body),{status,headers});r.cookieWrites=[];r.cookies={set(...v){r.cookieWrites.push(v);}};return r;}}};
let assertions=0;const equal=(a,b)=>{assert.deepEqual(a,b);assertions++;};
let keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=keys.publicKey.export({format:'jwk'});
let publicKey=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(jwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(jwk.y,'base64url')]);
let registrationId=Buffer.from('test-staff-key').toString('base64url'),beforeVerify=async()=>{};
try{
 const installer=readFileSync('scripts/sql/admin-passkeys-install.sql','utf8');await db.exec(installer);await db.exec(installer);
 const policy=load('src/lib/passkeys/policy.ts');
 const store=load('src/lib/passkeys/store.ts',{'@/lib/db/client':{requireDb:()=>sql}});
 const admin=load('src/lib/passkeys/admin.ts',{'next/server':next,'@/lib/db/client':{requireDb:()=>sql},'@/lib/auth':{getSessionTokenFromRequest:cookies,CUSTOMER_SESSION_COOKIE:'wb_customer_session'},'./policy':policy,'./store':store,
 '@simplewebauthn/server':{...verifier,async verifyRegistrationResponse(o){equal(o.requireUserVerification,true);equal(o.expectedOrigin,env.WB_PASSKEY_ORIGIN);await beforeVerify();return {verified:true,registrationInfo:{credential:{id:registrationId,publicKey,counter:0,transports:['internal']},credentialDeviceType:'multiDevice',credentialBackedUp:true}};}}});
 const call=(action,body={},cookie='',origin=env.WB_PASSKEY_ORIGIN)=>admin.adminPasskeyAction(new Request(env.WB_PASSKEY_ORIGIN+'/api/admin/passkeys/'+action,{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)}),action);
 const staff='wb_admin_session='+env.ADMIN_SESSION_TOKEN;
 const challengeCookie=r=>'wb_admin_passkey_challenge='+r.cookieWrites.find(v=>v[0]==='wb_admin_passkey_challenge')[1];
 equal((await call('register-options',{password:env.ADMIN_PASSWORD})).status,401);
 equal((await call('register-options',{password:env.ADMIN_PASSWORD},'wb_customer_session=customer')).status,401);
 equal((await call('credentials',{},staff,'https://wrong.example')).status,403);
 env.WB_ADMIN_PASSKEYS_ENABLED='false';equal((await call('authenticate-options')).status,403);env.WB_ADMIN_PASSKEYS_ENABLED='true';
 equal((await call('register-options',{password:'wrong'},staff)).status,401);
 let r=await call('register-options',{password:env.ADMIN_PASSWORD},staff),options=await r.json();equal(r.status,200);equal(options.authenticatorSelection.userVerification,'required');equal(options.authenticatorSelection.residentKey,'required');
 equal(admin.isAdminPasskeyHandle(options.user.id),true);equal(admin.isAdminPasskeyHandle(Buffer.alloc(32).toString('base64url')),false);
 const handle=options.user.id,setupCookie=challengeCookie(r);
 equal((await call('register-verify',{response:{}},setupCookie)).status,401);
 r=await call('register-verify',{response:{},label:"Kieran's iPhone"},staff+';'+setupCookie);equal(r.status,200);
 equal((await call('register-verify',{response:{}},staff+';'+setupCookie)).status,400);
 equal((await db.query('SELECT count(*)::int n FROM admin_passkeys')).rows[0].n,1);
 equal((await (await call('credentials',{},staff)).json()).credentials.length,1);
 const assertion=(challenge,flags=5,counter=1)=>{const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin:env.WB_PASSKEY_ORIGIN,crossOrigin:false}));const count=Buffer.alloc(4);count.writeUInt32BE(counter);const data=Buffer.concat([createHash('sha256').update('localhost').digest(),Buffer.from([flags]),count]);return{id:registrationId,rawId:registrationId,type:'public-key',clientExtensionResults:{},response:{userHandle:handle,authenticatorData:data.toString('base64url'),clientDataJSON:client.toString('base64url'),signature:sign('sha256',Buffer.concat([data,createHash('sha256').update(client).digest()]),keys.privateKey).toString('base64url')}};};
 r=await call('authenticate-options');options=await r.json();const authCookie=challengeCookie(r);
 r=await call('authenticate-verify',{response:assertion(options.challenge),rememberMe:false},authCookie);equal(r.status,200);equal((await r.json()).redirect,'/admin/dashboard');
 equal(r.cookieWrites.find(v=>v[0]==='wb_admin_session')[2].maxAge,7*86400);equal(r.cookieWrites.find(v=>v[0]==='wb_customer_session')[2].maxAge,0);
 equal((await call('authenticate-verify',{response:assertion(options.challenge)},authCookie)).status,400);
 const freshAuth=async(responseFn)=>{const start=await call('authenticate-options');const o=await start.json();return call('authenticate-verify',{response:responseFn(o.challenge)},challengeCookie(start));};
 equal((await freshAuth(c=>assertion(c,1,2))).status,503); // Real verifier rejects missing user verification.
 equal((await freshAuth(c=>assertion('wrong-challenge',5,2))).status,503);
 equal((await freshAuth(c=>({...assertion(c,5,2),response:{...assertion(c,5,2).response,userHandle:Buffer.alloc(32).toString('base64url')}}))).status,401);
 const good=assertion('common-route-challenge',5,2);r=await admin.authenticateAdminPasskey(good,'common-route-challenge',policy.passkeyConfig(),true);equal(r.status,200);equal(r.cookieWrites.find(v=>v[0]==='wb_admin_session')[2].maxAge,30*86400);
 // Two independent staff devices, named separately, both opening the dashboard.
 const kieranKey={keys,publicKey,registrationId};
 keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const samuelJwk=keys.publicKey.export({format:'jwk'});
 publicKey=Buffer.concat([Buffer.from('a5010203262001215820','hex'),Buffer.from(samuelJwk.x,'base64url'),Buffer.from('225820','hex'),Buffer.from(samuelJwk.y,'base64url')]);
 registrationId=Buffer.from('samuel-independent-staff-key').toString('base64url');
 await db.exec('DELETE FROM admin_passkey_rate_buckets');
 r=await call('register-options',{password:env.ADMIN_PASSWORD},staff);
 equal((await call('register-verify',{response:{},label:"Samuel's iPhone"},staff+';'+challengeCookie(r))).status,200);
 const list=(await (await call('credentials',{},staff)).json()).credentials;
 equal(list.length,2);equal(new Set(list.map(k=>k.label)),new Set(["Kieran's iPhone","Samuel's iPhone"]));
 r=await freshAuth(c=>assertion(c,5,1));equal(r.status,200);equal((await r.json()).redirect,'/admin/dashboard');
 const samuelKey={keys,publicKey,registrationId};
 ({keys,publicKey,registrationId}=kieranKey);
 r=await freshAuth(c=>assertion(c,5,4));equal(r.status,200);equal((await r.json()).redirect,'/admin/dashboard');
 equal((await call('revoke',{credentialId:registrationId,password:'wrong'},staff)).status,401);
 await db.exec('DELETE FROM admin_passkey_rate_buckets');
 r=await call('revoke',{credentialId:registrationId,password:env.ADMIN_PASSWORD},staff);equal(r.status,200);equal(r.cookieWrites.find(v=>v[0]==='wb_admin_session')[2].maxAge,0);
 ({keys,publicKey,registrationId}=samuelKey);
 equal((await freshAuth(c=>assertion(c,5,2))).status,200); // Removing Kieran's key leaves Samuel's valid.
 ({keys,publicKey,registrationId}=kieranKey);
 equal((await freshAuth(c=>assertion(c,5,3))).status,401);
 equal((await db.query("SELECT count(*)::int n FROM admin_passkey_events WHERE event='revoked'")).rows[0].n,1);
 await db.exec('UPDATE admin_passkeys SET revoked_at=NULL');env.ADMIN_PASSWORD='ChangedStaffPassword!';equal((await freshAuth(c=>assertion(c,5,3))).status,401);env.ADMIN_PASSWORD='FictionalStaffPassword!';
 await db.exec('DELETE FROM admin_passkey_rate_buckets');
 r=await call('register-options',{password:env.ADMIN_PASSWORD},staff);await db.exec("UPDATE admin_passkey_challenges SET expires_at=now()-interval '1 second' WHERE purpose='register'");equal((await call('register-verify',{response:{}},staff+';'+challengeCookie(r))).status,400);
 await db.exec('DELETE FROM admin_passkey_rate_buckets');registrationId=Buffer.from('over-cap-key').toString('base64url');r=await call('register-options',{password:env.ADMIN_PASSWORD},staff);
 beforeVerify=async()=>{await db.exec("INSERT INTO admin_passkeys(credential_id,identity_key,public_key,counter,device_type,backed_up,label) SELECT 'cap-'||n,u.identity_key,'AA',0,'multiDevice',true,'Capacity fixture' FROM admin_passkey_users u CROSS JOIN generate_series(1,8) n");};
 equal((await call('register-verify',{response:{}},staff+';'+challengeCookie(r))).status,409);beforeVerify=async()=>{};
 equal((await db.query('SELECT count(*)::int n FROM admin_passkeys WHERE revoked_at IS NULL')).rows[0].n,10);
 equal((await call('register-options',{password:env.ADMIN_PASSWORD},staff)).status,400);
 const proxy=readFileSync('src/proxy.ts','utf8');equal(proxy.includes("'/api/admin/passkeys/authenticate-options','/api/admin/passkeys/authenticate-verify'"),true);
 equal(proxy.includes("'/api/admin/passkeys/register-options'].includes"),false);
 equal(policy.passkeyConfig({WB_PASSKEY_ORIGIN:'https://windsorbeauty.is'}).rpID,'windsorbeauty.is');
 for(const origin of ['https://windsorglow.is','https://example.test','https://windsorbeauty.is.evil.test']) { assert.throws(()=>policy.passkeyConfig({WB_PASSKEY_ORIGIN:origin}));assertions++; }
 mkdirSync('.local-evidence/security-parity-20261108',{recursive:true});
 const receipt={passed:true,assertions,database:'isolated PGlite',network:false,realSignedStaffAssertions:true,installerIdempotent:true,physicalDeviceTest:false,twoIndependentStaffKeys:true,oneRevocationPreservesOtherKey:true};
 writeFileSync('.local-evidence/security-parity-20261108/PASSKEY-RECEIPT.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await db.close();}
