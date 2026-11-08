// Actual PostgreSQL-compatible schema/functions and actual handlers, synthetic memory only.
// Usage: node scripts/test-beauty-product-addresses.mjs /path/to/existing/pglite/dist/index.js
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
if(!process.argv[2])throw Error('Pass the existing PGlite module; this test never reads environment files.');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);
const db=new PGlite();
let checks=0;
const same=(a,b)=>{assert.deepEqual(a,b);checks++;};
const rejects=async(fn,pattern)=>{await assert.rejects(fn,pattern);checks++;};
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function load(file,modules={}) {
 const output=ts.transpileModule(source(file),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(output,{module,exports:module.exports,require:name=>{if(!(name in modules))throw Error('Unexpected dependency '+name);return modules[name];},process:{env:{ADMIN_SESSION_TOKEN:'synthetic-beauty-only'}},Request,Response,Headers,URL,console,Date,Map,Set,Error});
 return module.exports;
}
const sql=async(strings,...values)=>{let text=strings[0];for(let i=0;i<values.length;i++)text+=`$${i+1}`+strings[i+1];return(await db.query(text,values)).rows;};
const client={requireDb:()=>sql,isDbConfigured:()=>true};
const aliases=load('src/lib/slugAliases.ts');
const addresses=load('src/lib/productAddress.ts',{'@/lib/slugAliases':aliases});
const addressDb=load('src/lib/db/productAddresses.ts',{'./client':client,'@/lib/productAddress':addresses});
const edit=load('src/lib/db/productEdit.ts',{'./client':client,'@/lib/productAddress':addresses});
const product=(slug,name=slug)=>({id:slug,slug,name,categories:['Skin'],variants:[{dosage:'30ml',price:20}],certificate:{enabled:false}});
await db.exec('CREATE TABLE custom_products(slug text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); CREATE TABLE product_stock(slug text PRIMARY KEY,quantity integer);');
const insert=async(p)=>db.query('INSERT INTO custom_products(slug,data) VALUES($1,$2)',[p.slug,JSON.stringify(p)]);
const read=async()=>Object.fromEntries((await db.query('SELECT slug,data FROM custom_products ORDER BY slug')).rows.map(row=>[row.slug,row.data]));
const migrate=async()=>db.exec('BEGIN;'+source('scripts/install-beauty-product-addresses.sql')+'COMMIT;');
try {
 same(await addressDb.productAddressRegistryReady(),false);
 await insert(product('serum','Soft Serum')); await insert(product('cream','Night Cream'));
 await db.exec("INSERT INTO product_stock VALUES('serum',7),('cream',9)");
 const untouched=JSON.stringify(await read());
 await migrate();same(await addressDb.productAddressRegistryReady(),true);
 same(JSON.stringify(await read()),untouched);
 same((await db.query('SELECT count(*)::int n FROM beauty_product_web_addresses')).rows[0].n,7);
 await migrate();same((await db.query('SELECT count(*)::int n FROM beauty_product_web_addresses')).rows[0].n,7);
 same(addresses.addressFromName('Crème & Serum / 30 ml'),'creme-serum-30-ml');
 for(const invalid of ['','UPPER','two--dashes','../cream','https://bad','a'.repeat(91)])same(addresses.validProductAddress(invalid),false);
 same((await addressDb.changeProductAddress('serum','soft-serum','serum')).to,'soft-serum');
 same(JSON.stringify(await read()),untouched);
 same((await db.query("SELECT quantity FROM product_stock WHERE slug='serum'")).rows[0].quantity,7);
 await rejects(()=>addressDb.changeProductAddress('serum','new-serum','serum'),/address_changed_reload/);
 await rejects(()=>addressDb.changeProductAddress('cream','soft-serum','cream'),/address_in_use/);
 await rejects(()=>addressDb.changeProductAddress('serum','ghk-cu-shampoo-conditioner-bundle','soft-serum'),/invalid_product_address/);
 await rejects(()=>addressDb.changeProductAddress('serum','super-human-blend','soft-serum'),/invalid_product_address/);
 await rejects(()=>addressDb.changeProductAddress('serum','cream','soft-serum'),/address_in_use/);
 await rejects(()=>addressDb.changeProductAddress('serum','up389','soft-serum'),/address_in_use/);
 await rejects(()=>insert(product('soft-serum')),/address_in_use/);
 const decorated=await addressDb.withProductAddresses(await read());
 same(decorated.serum.webAddress,'soft-serum');
 same(addresses.resolveProductAddress(Object.values(decorated),'serum')?.address,'soft-serum');
 same(addresses.resolveProductAddress(Object.values(decorated),'soft-serum')?.product.slug,'serum');
 const updated={...decorated.serum,name:'Fresh Serum',webAddress:'attacker',previousWebAddresses:['cream']};
 same(await edit.updateProductIfUnchanged(updated,decorated.serum),true);
 same((await addressDb.withProductAddresses(await read())).serum.webAddress,'soft-serum');
 same(await edit.updateProductIfUnchanged(updated,decorated.serum),false);
 // An older full-row upsert cannot erase history or claim another product's address.
 await db.query('INSERT INTO custom_products(slug,data) VALUES($1,$2) ON CONFLICT(slug) DO UPDATE SET data=EXCLUDED.data',['serum',JSON.stringify({...updated,webAddress:'cream'})]);
 same((await addressDb.withProductAddresses(await read())).serum.webAddress,'soft-serum');
 same((await read()).serum.webAddress,undefined);
 for(let i=1;i<=55;i++)await addressDb.changeProductAddress('serum','serum-version-'+i,i===1?'soft-serum':'serum-version-'+(i-1));
 const after=await addressDb.withProductAddresses(await read());
 same(after.serum.previousWebAddresses.length,55);
 same(addresses.resolveProductAddress(Object.values(after),'soft-serum')?.address,'serum-version-55');
 same(addresses.resolveProductAddress(Object.values(after),'serum-version-1')?.address,'serum-version-55');
 same(addresses.resolveProductAddress([after.serum,{...after.cream,webAddress:'soft-serum'}],'soft-serum'),null);
 const shop=load('src/lib/shopServerData.ts',{'react':{cache:fn=>fn},'next/headers':{},'@/lib/productAccess':{},'@/data/products':{PRODUCTS:[],ALL_CATEGORIES:[]},'@/lib/siteSale':{},'@/lib/categoryUrls':{},'@/lib/slugAliases':aliases,'@/lib/productAddress':addresses,'@/lib/hairCareBundle':{},'@/lib/db':{}});
 const shopData={catalogue:Object.values(after),hidden:[],variantStock:{},reviewStats:{}};
 same(shop.productForSlug(shopData,'soft-serum')?.slug,'serum');
 same(shop.productForSlug({...shopData,hidden:['serum']},'soft-serum'),null);
 same(shop.productForSlug({...shopData,catalogue:[after.cream]},'soft-serum'),null);
 const navigation={notFound:()=>{throw Error('NOT_FOUND');},permanentRedirect:path=>{throw Error('REDIRECT:'+path);}};
 const productPage=load('src/app/shop/[slug]/page.tsx',{'next/navigation':navigation,'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'@/data/products':{cardImage:()=>null,activeVariants:p=>p.variants},'@/lib/productAddress':addresses,'@/lib/shopServerData':{loadShopServerData:async()=>shopData,productForSlug:shop.productForSlug},'../../robots':{SITE_URL:'https://beauty.invalid'},'./ProductPageClient':{default:()=>null}});
 same((await productPage.generateMetadata({params:Promise.resolve({slug:'soft-serum'})})).alternates.canonical,'https://beauty.invalid/shop/serum-version-55');
 await rejects(()=>productPage.default({params:Promise.resolve({slug:'soft-serum'})}),/REDIRECT:\/shop\/serum-version-55/);
 shopData.hidden=['serum'];
 await rejects(()=>productPage.default({params:Promise.resolve({slug:'soft-serum'})}),/NOT_FOUND/);
 shopData.hidden=[];

 await migrate();same((await addressDb.withProductAddresses(await read())).serum.webAddress,'serum-version-55');
 const auth=load('src/lib/adminReadAccess.ts');
 const route=load('src/app/api/admin/products/web-addresses/route.ts',{
   'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},'@/lib/adminReadAccess':auth,
   '@/lib/db':{...client,listCustomProducts:async()=>addressDb.withProductAddresses(await read())},
   '@/lib/db/productAddresses':addressDb,'@/lib/productAddress':addresses,
 });
 const request=(method,body,cookie='wb_admin_session=synthetic-beauty-only',origin='https://beauty.invalid')=>new Request('https://beauty.invalid/api/admin/products/web-addresses',{method,headers:{cookie,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 same((await route.GET(request('GET',null,''))).status,401);
 same((await route.GET(request('GET',null))).headers.get('cache-control'),'private, no-store');
 same((await route.POST(request('POST',{slug:'cream',address:'night-cream',expectedAddress:'cream'},'wb_ui_session=staff'))).status,401);
 same((await route.POST(request('POST',{slug:'cream',address:'night-cream',expectedAddress:'cream'},undefined,'https://foreign.invalid'))).status,403);
 same((await route.POST(request('POST',{slug:'cream',address:'night-cream',expectedAddress:'cream'}))).status,200);
 same((await route.POST(request('POST',{slug:'cream',address:'new-night',expectedAddress:'cream'}))).status,409);
 same((await route.POST(request('POST',{slug:'cream',address:'soft-serum',expectedAddress:'night-cream'}))).status,409);
 same((await route.POST(request('POST',{slug:'missing',address:'missing-new',expectedAddress:'missing'}))).status,404);
 same((await route.POST(request('POST',{slug:'cream',address:'../bad',expectedAddress:'night-cream'}))).status,400);
 await db.query("DELETE FROM custom_products WHERE slug='serum'");
 await rejects(()=>insert(product('soft-serum')),/address_in_use/);
 await rejects(()=>insert(product('serum')),/address_retired_slug/);
 same(addresses.resolveProductAddress(Object.values(await addressDb.withProductAddresses(await read())),'soft-serum'),null);
 same((await addressDb.productAddressOwners()).get('soft-serum'),'serum');
 same((await db.query('SELECT sum(quantity)::int n FROM product_stock')).rows[0].n,16);
 const created=await edit.createProductIfAbsent(product('created','Original created product'));
 same(/^[0-9]+$/.test(created.id),true);
 await rejects(()=>edit.createProductIfAbsent(product('created','Duplicate replacement')),/duplicate key/);
 same((await read()).created.name,'Original created product');
 await rejects(()=>edit.createProductIfAbsent(product('night-cream')),/address_in_use/);
 // Rolled-back reservation and content writes leave no ghost link.
 await db.exec('BEGIN');await insert(product('rollback-product'));await db.exec('ROLLBACK');
 same((await db.query("SELECT count(*)::int n FROM beauty_product_web_addresses WHERE product_slug='rollback-product'")).rows[0].n,0);

 const conflictDb=new PGlite();
 try {
   await conflictDb.exec(`CREATE TABLE custom_products(slug text PRIMARY KEY,data jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()); INSERT INTO custom_products(slug,data) VALUES('ghk-cu-shampoo-conditioner-bundle','{"slug":"ghk-cu-shampoo-conditioner-bundle"}');`);
   await rejects(()=>conflictDb.exec('BEGIN;'+source('scripts/install-beauty-product-addresses.sql')+'COMMIT;'),/address_in_use/);
   await conflictDb.exec('ROLLBACK');
   same((await conflictDb.query("SELECT to_regclass('public.beauty_product_web_addresses') relation")).rows[0].relation,null);
   same((await conflictDb.query('SELECT count(*)::int n FROM custom_products')).rows[0].n,1);
 } finally {await conflictDb.close();}
 console.log(JSON.stringify({passed:checks,scope:'Actual schema, migration, triggers, database readers/writers and routes with synthetic memory-only PostgreSQL; no hosted or browser concurrency claim.'}));
}finally{await db.close();}
