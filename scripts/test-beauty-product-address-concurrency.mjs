// Fresh loopback-only PostgreSQL cluster. Uses installed binaries; never loads .env files.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import net from 'node:net';
import assert from 'node:assert/strict';
import pg from 'pg';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const run=resolve(root,'.local-evidence/product-addresses',new Date().toISOString().replace(/[:.]/g,'-'));
const databaseDir=resolve(run,'database');
const bin=resolve(root,'node_modules/@embedded-postgres/windows-x64/native/bin');
const exec=promisify(execFile);
const port=await new Promise((done,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>done(p));});});
await mkdir(run,{recursive:true});
let started=false;const clients=[];let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const errors=[];
const capture=promise=>promise.then(value=>({value}),error=>({error}));
try {
 await exec(resolve(bin,'initdb.exe'),['-D',databaseDir,'-U','postgres','-A','trust','--encoding=UTF8','--locale=C'],{windowsHide:true,timeout:30000});
 await exec(resolve(bin,'pg_ctl.exe'),['-D',databaseDir,'-l',resolve(run,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c max_connections=8`,'-w','-t','15','start'],{windowsHide:true,timeout:20000});started=true;
 for(let i=0;i<3;i++){const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:3000,query_timeout:7000});await client.connect();clients.push(client);}
 const [a,b,observer]=clients;
 const identity=(await a.query("SELECT host(inet_server_addr()) host,inet_server_port() port,current_setting('data_directory') directory")).rows[0];
 same(identity.host,'127.0.0.1');same(identity.port,port);same(resolve(identity.directory),databaseDir);
 await a.query('CREATE TABLE custom_products(slug text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE product_stock(slug text PRIMARY KEY,quantity integer);');
 for(const slug of ['one','two','three'])await a.query('INSERT INTO custom_products(slug,data)VALUES($1,$2)',[slug,JSON.stringify({id:slug,slug,name:slug,variants:[{dosage:'30ml',price:20}]})]);
 await a.query("INSERT INTO product_stock VALUES('one',7),('two',9),('three',11)");
 const schema=await readFile(resolve(root,'scripts/install-beauty-product-addresses.sql'),'utf8');
 await a.query('BEGIN');await a.query(schema);await a.query('COMMIT');
 const pid=(await b.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 async function blocked() {
   const deadline=Date.now()+3000;
   while(Date.now()<deadline){const row=(await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];if(row?.wait_event_type==='Lock'){checks++;return;}await new Promise(done=>setTimeout(done,15));}
   throw Error('Second connection never reached the expected lock wait');
 }
 const rename=(client,slug,address,expected)=>client.query('SELECT wb_change_product_address($1,$2,$3) result',[slug,address,expected]);
 const current=async slug=>(await observer.query('SELECT address FROM beauty_product_web_addresses WHERE product_slug=$1 AND is_current',[slug])).rows[0]?.address;
 // Different products simultaneously claim one URL: exactly one wins.
 await a.query('BEGIN');await rename(a,'one','shared','one');
 let pending=capture(rename(b,'two','shared','two'));await blocked();await a.query('COMMIT');
 let outcome=await pending;assert.match(outcome.error?.message??'',/address_in_use/);checks++;same(await current('one'),'shared');same(await current('two'),'two');
 // A stale content writer waits, then preserves server-owned URL history.
 await a.query('BEGIN');await rename(a,'one','next-one','shared');
 pending=capture(b.query("UPDATE custom_products SET data=data||'{\"name\":\"New name\",\"webAddress\":\"two\"}'::jsonb WHERE slug='one'"));await blocked();await a.query('COMMIT');
 outcome=await pending;same(outcome.error,undefined);same(await current('one'),'next-one');same((await observer.query("SELECT data->>'name' name,data->>'webAddress' address FROM custom_products WHERE slug='one'")).rows[0],{name:'New name',address:null});
 // Create cannot steal an address that a rename reserves while it waits.
 await a.query('BEGIN');await rename(a,'one','reserved-creation','next-one');
 pending=capture(b.query("INSERT INTO custom_products(slug,data) VALUES('reserved-creation','{\"slug\":\"reserved-creation\"}')"));await blocked();await a.query('COMMIT');
 outcome=await pending;assert.match(outcome.error?.message??'',/address_in_use/);checks++;
 same((await observer.query("SELECT count(*)::int n FROM custom_products WHERE slug='reserved-creation'")).rows[0].n,0);
 // Two open editors: the second stale address is rejected after the first commits.
 await a.query('BEGIN');await rename(a,'two','second-product','two');
 pending=capture(rename(b,'two','stale-product','two'));await blocked();await a.query('COMMIT');
 outcome=await pending;assert.match(outcome.error?.message??'',/address_changed_reload/);checks++;same(await current('two'),'second-product');
 // A rollback frees its uncommitted claim; the waiting product can take it.
 await a.query('BEGIN');await rename(a,'one','rollback-link','reserved-creation');
 pending=capture(rename(b,'two','rollback-link','second-product'));await blocked();await a.query('ROLLBACK');
 outcome=await pending;same(outcome.error,undefined);same(await current('one'),'reserved-creation');same(await current('two'),'rollback-link');
 // Delete and rename share lock order; old aliases remain reserved after deletion.
 await a.query('BEGIN');await rename(a,'three','third-product','three');
 pending=capture(b.query("DELETE FROM custom_products WHERE slug='three'"));await blocked();await a.query('COMMIT');
 outcome=await pending;same(outcome.error,undefined);
 await assert.rejects(()=>rename(a,'two','third-product','rollback-link'),/address_in_use/);checks++;
 same((await observer.query("SELECT count(*)::int n FROM beauty_product_web_addresses WHERE product_slug='three'")).rows[0].n,2);
 same((await observer.query('SELECT sum(quantity)::int n FROM product_stock')).rows[0].n,27);
 // Two concurrent new products receive distinct IDs under the same lock.
 await a.query('BEGIN');
 const createdA=await a.query("INSERT INTO custom_products(slug,data) VALUES('four','{\"slug\":\"four\",\"id\":\"1\",\"name\":\"First\"}') RETURNING data->>'id' id");
 pending=capture(b.query("INSERT INTO custom_products(slug,data) VALUES('five','{\"slug\":\"five\",\"id\":\"1\"}') RETURNING data->>'id' id"));await blocked();await a.query('COMMIT');
 outcome=await pending;same(outcome.error,undefined);same(createdA.rows[0].id!==outcome.value.rows[0].id,true);
 // Insert-only creation refuses a concurrent duplicate, keeping the first content.
 await a.query('BEGIN');await a.query("INSERT INTO custom_products(slug,data) VALUES('six','{\"slug\":\"six\",\"name\":\"Original\"}')");
 pending=capture(b.query("INSERT INTO custom_products(slug,data) VALUES('six','{\"slug\":\"six\",\"name\":\"Replacement\"}')"));await blocked();await a.query('COMMIT');
 outcome=await pending;same(outcome.error?.code,'23505');same((await observer.query("SELECT data->>'name' name FROM custom_products WHERE slug='six'")).rows[0].name,'Original');
 // No public function execution was accidentally granted by installation.
 same((await observer.query("SELECT has_function_privilege('public','public.wb_change_product_address(text,text,text)','EXECUTE') allowed")).rows[0].allowed,false);
 await writeFile(resolve(run,'receipt.json'),JSON.stringify({passed:checks,syntheticOnly:true,host:'127.0.0.1',port,scenarios:['collision','stale full-row writer','create vs rename','stale link editor','rollback','delete vs rename','stock unchanged','PUBLIC execute revoked'],errors},null,2));
 console.log(JSON.stringify({passed:checks,receipt:resolve(run,'receipt.json')}));
}catch(error){errors.push(error.message);throw error;}
finally{
 for(const client of clients)await client.end().catch(()=>{});
 if(started)await exec(resolve(bin,'pg_ctl.exe'),['-D',databaseDir,'-m','fast','-w','-t','10','stop'],{windowsHide:true,timeout:15000});
 await writeFile(resolve(run,'STOPPED.json'),JSON.stringify({at:new Date().toISOString(),ownedDirectory:databaseDir,started,stopped:true,errors}));
}
