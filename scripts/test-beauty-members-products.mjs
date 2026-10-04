// Actual SQL and actual handlers, memory-only. No production env/provider reads.
import test,{after} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {pathToFileURL} from 'node:url';import vm from 'node:vm';import ts from 'typescript';
if(!process.argv[2])throw Error('Pass isolated PGlite dist/index.js; live DB unsupported.');
const {PGlite}=await import(pathToFileURL(process.argv[2]).href);const db=new PGlite();after(()=>db.close());
await db.exec(`CREATE TABLE product_visibility(slug TEXT PRIMARY KEY,hidden BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE custom_products(slug TEXT PRIMARY KEY,data JSONB NOT NULL);
CREATE TABLE customers(id INTEGER PRIMARY KEY,account_status TEXT,membership_status TEXT,banned_at TIMESTAMPTZ,email_verified BOOLEAN);
CREATE TABLE customer_sessions(customer_id INTEGER,token TEXT,expires_at TIMESTAMPTZ);
INSERT INTO customers VALUES(1,'active','member',NULL,false),(2,'pending_password','member',NULL,false),(3,'active','pending',NULL,true),(4,'active','rejected',NULL,true),(5,'inactive','member',NULL,true),(6,'active','member',now(),true);
INSERT INTO customer_sessions SELECT id,'session-'||id,now()+interval '1 day' FROM customers;
INSERT INTO customer_sessions VALUES(1,'expired',now()-interval '1 day');
INSERT INTO product_visibility(slug,hidden) VALUES('hidden',true);
CREATE TABLE review_product_links(review_id INTEGER,product_slug TEXT);
INSERT INTO review_product_links VALUES(1,'restricted'),(2,'public');`);
const sql=async(strings,...values)=>{let text=strings[0];for(let i=0;i<values.length;i++)text+=`$${i+1}`+strings[i+1];return(await db.query(text,values)).rows;};
const client={requireDb:()=>sql,isDbConfigured:()=>true};const env={ADMIN_SESSION_TOKEN:'real-beauty-admin'};let cookie='';
function compile(source,modules){const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const module={exports:{}};vm.runInNewContext(output,{module,exports:module.exports,require:name=>{if(!(name in modules))throw Error('Unexpected dependency '+name);return modules[name];},process:{env},console,Response,Request,Headers,URL,Date,Buffer});return module.exports;}
const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');const load=(file,modules)=>compile(source(file),modules);
const dbSource=source('src/lib/db.ts');const start=dbSource.indexOf('export async function findCustomerByValidSessionToken');
// The actual session SQL calls requireDb in its lexical scope.
const sessionFnSource=dbSource.slice(start,dbSource.indexOf('export async function deleteCustomerSession',start));
const sessions=compile("import { requireDb } from './client';\n"+sessionFnSource,{'./client':client});
const products={public:{id:'public',slug:'public',name:'Public product',categories:['Skin'],variants:[{dosage:'30ml',price:10}]},restricted:{id:'restricted',slug:'restricted',name:'Private product',categories:['Skin'],variants:[{dosage:'30ml',price:20}]},hidden:{id:'hidden',slug:'hidden',name:'Hidden product',categories:['Skin'],variants:[{dosage:'30ml',price:30}]}};
for(const [slug,product]of Object.entries(products))await db.query('INSERT INTO custom_products VALUES($1,$2)',[slug,JSON.stringify(product)]);
const queryDb={...client,...sessions,listCustomProducts:async()=>Object.fromEntries((await sql`SELECT slug,data FROM custom_products`).map(row=>[row.slug,row.data]))};
const auth=load('src/lib/auth.ts',{'crypto':await import('node:crypto'),'@/lib/db':queryDb});
const access=load('src/lib/productAccess.ts',{'next/headers':{cookies:async()=>({get:name=>{const value=auth.getSessionTokenFromRequest(new Request('https://beauty.invalid',{headers:{cookie}}),name);return value?{value}:undefined;}})},'@/lib/auth':auth,'@/lib/db':queryDb,'@/lib/db/client':client,'./productVisibility':load('src/lib/productVisibility.ts',{})});
const next={'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}}};
const catalogue=load('src/app/api/products/catalogue/route.ts',{...next,'@/lib/db':queryDb,'@/lib/productAccess':access});
const cart=load('src/app/api/cart/validate/route.ts',{'@/lib/db':queryDb,'@/lib/productAccess':access});
const admin=load('src/app/api/admin/products/members-only/route.ts',{'@/lib/db':queryDb,'@/lib/productAccess':access});
const request=(cookie='',body=null)=>new Request('https://beauty.invalid/api/test',{method:body?'POST':'GET',headers:{cookie},...(body?{body:JSON.stringify(body)}:{})});

test('old schema defaults OFF and refuses flag writes without installing schema',async()=>{
 assert.equal((await access.productAccessRules()).get('hidden').membersOnly,false);
 await assert.rejects(()=>access.setProductMembersOnly('restricted',true));
 assert.equal((await db.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='product_visibility' AND column_name='members_only'")).rows[0].n,0);
 await db.exec(readFileSync(new URL('./beauty-members-only-products-REVIEW-ONLY.sql',import.meta.url),'utf8'));
 await access.setProductMembersOnly('restricted',true);await access.setProductMembersOnly('hidden',true);
 assert.equal((await db.query("SELECT hidden,members_only FROM product_visibility WHERE slug='hidden'")).rows[0].hidden,true);
});

test('actual server catalogue never trusts fake UI/admin/foreign cookies, pending/rejected/inactive/expired sessions',async()=>{
 for(const cookie of ['', 'wb_ui_session=member','wb_admin_session=fake','wg_customer_session=session-1','wb_customer_session=expired',...['2','3','4','5','6'].map(id=>'wb_customer_session=session-'+id)]){
  const response=await catalogue.GET(request(cookie));assert.equal(response.status,200);assert.deepEqual(Object.keys((await response.json()).overrides),['public']);
  assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('vary'),'Cookie');
 }
});

test('actual eligible legacy unverified member and real staff see restricted live products, hidden always wins',async()=>{
 for(const cookie of ['wb_customer_session=session-1','wb_admin_session=real-beauty-admin']){const response=await catalogue.GET(request(cookie));assert.deepEqual(Object.keys((await response.json()).overrides),['public','restricted']);}
 const publicAfterMember=await catalogue.GET(request());assert.deepEqual(Object.keys((await publicAfterMember.json()).overrides),['public']);
});

test('actual saved-cart validation removes forbidden/hidden/unknown slugs per current session and flag changes',async()=>{
 const body={slugs:['public','restricted','hidden','unknown']};
 assert.deepEqual((await(await cart.POST(request('',body))).json()).allowedSlugs,['public']);
 assert.deepEqual((await(await cart.POST(request('wb_customer_session=session-1',body))).json()).allowedSlugs,['public','restricted']);
 await db.exec("UPDATE customers SET membership_status='pending' WHERE id=1");
 assert.deepEqual((await(await cart.POST(request('wb_customer_session=session-1',body))).json()).allowedSlugs,['public']);
 await db.exec("UPDATE customers SET membership_status='member' WHERE id=1");
});

test('actual admin toggle checks real admin cookie, never unhides or changes other product flags',async()=>{
 assert.equal((await admin.POST(request('wb_ui_session=staff',{slug:'hidden',membersOnly:false}))).status,401);
 assert.equal((await admin.POST(request('wb_admin_session=real-beauty-admin',{slug:'hidden',membersOnly:false}))).status,200);
 assert.deepEqual((await db.query("SELECT hidden,members_only FROM product_visibility WHERE slug='hidden'")).rows[0],{hidden:true,members_only:false});
 assert.equal((await access.productAccessRules()).get('restricted').membersOnly,true);
 assert.equal((await admin.POST(request('wb_admin_session=real-beauty-admin',{slug:'missing',membersOnly:true}))).status,404);
});

test('actual review SQL excludes every review linked to an inaccessible product',async()=>{
 const reviews=[{id:1,body:'Restricted product review'},{id:2,body:'Public review'}];
 assert.deepEqual((await access.filterProductReviews(reviews,await access.loadProductAccess(request()))).map(r=>r.id),[2]);
 assert.deepEqual((await access.filterProductReviews(reviews,await access.loadProductAccess(request('wb_customer_session=session-1')))).map(r=>r.id),[1,2]);
});

// Import stubs trap side effects; session/access/catalogue SQL above remain real.
function inertModules(file){const ast=ts.createSourceFile(file,source(file),ts.ScriptTarget.Latest,true);const modules={};for(const node of ast.statements){if(!ts.isImportDeclaration(node)||node.importClause?.isTypeOnly)continue;const name=node.moduleSpecifier.text;const exports={};for(const e of node.importClause?.namedBindings?.elements??[]){if(!e.isTypeOnly)exports[e.propertyName?.text??e.name.text]=()=>{throw Error('Unexpected side effect '+name+'.'+e.name.text);};}modules[name]=exports;}return modules;}
let reachedPricing=0;
const orderFile='src/app/api/checkout/place-order/route.ts';const orderModules=inertModules(orderFile);
orderModules['@/lib/productAccess']=access;
orderModules['@/lib/productVisibility']=load('src/lib/productVisibility.ts',{});
orderModules['next/server']=next['next/server'];
orderModules['@/lib/phoneNumber']={normalisePhoneNumber:()=>'+447700900123',PHONE_ERROR:'phone'};
orderModules['@/lib/db']={isDbConfigured:()=>true,getShippingSettings:async()=>{throw Error('Stop before side effects');}};
orderModules['@/lib/orderPricing']={isValidItem:()=>true};
orderModules['@/lib/auth']={resolveCustomerFromRequest:async req=>{reachedPricing++;return null;}};
orderModules['@/lib/shipping']={getProductsBySlug:async access=>new Map(Object.entries(await queryDb.listCustomProducts()).filter(([slug])=>accessMay(slug,access)))};
const accessMay=access.mayAccessProduct;
const order=load(orderFile,orderModules);
const orderBody={items:[{slug:'restricted',name:'Private product',variant:'30ml',quantity:1,price:20}],email:'test@example.invalid',customerName:'Test User',shippingAddress:'Test address',shippingLabel:'Standard',phone:'07700900123',confirmations:{terms:true}};
test('actual checkout refuses forbidden saved items before account/order/stock/payment side effects',async()=>{
 for(const cookie of ['', 'wb_ui_session=member','wb_customer_session=session-3','wb_customer_session=session-4','wb_customer_session=session-5'])assert.equal((await order.POST(request(cookie,orderBody))).status,403);
 assert.equal(reachedPricing,0);
 assert.equal((await order.POST(request('wb_customer_session=session-1',orderBody))).status,503);assert.equal(reachedPricing,1);
});
const cookieModule={'next/headers':{cookies:async()=>({get:name=>{const value=auth.getSessionTokenFromRequest(request(cookie),name);return value?{value}:undefined;}})}};
const saleModule=load('src/lib/siteSale.ts',{'./discountCodes':{itemMatchesDiscountScope:()=>true},'./money':{roundMoney:v=>v}});
const shopDb={...queryDb,getHiddenProductSlugs:async()=>['hidden'],getProductStockMap:async()=>({public:1,restricted:2,hidden:3}),getProductVariantStockMap:async()=>({}),getActivePercentagePromotion:async()=>null,getReviewStatsForProducts:async()=>({}),getProductSoldCounts:async()=>({}),getSiteContent:async()=>null,listCategories:async()=>[]};
const shop=load('src/lib/shopServerData.ts',{'react':{cache:fn=>fn},...cookieModule,'@/lib/productAccess':access,'@/lib/db':shopDb,'@/data/products':{PRODUCTS:[],ALL_CATEGORIES:['Skin'],DEFAULT_STORAGE_INSTRUCTIONS_HTML:'',mergeProducts:(_,overrides)=>Object.values(overrides)},'@/lib/siteSale':saleModule,'@/lib/categoryUrls':{categorySlug:v=>v.toLowerCase()},'@/lib/slugAliases':{PRETTY_SLUG:{},shopUrl:v=>'/shop/'+v}});
const sitemap=load('src/app/sitemap.ts',{'@/lib/categoryUrls':{categoryUrl:v=>'/shop/category/'+v},'@/lib/shopServerData':shop,'@/lib/slugAliases':{shopUrl:v=>'/shop/'+v},'./robots':{SITE_URL:'https://beauty.invalid'}});
test('actual server direct-product resolution, public search/feed and member-to-guest render isolation',async()=>{
 cookie='';let data=await shop.loadShopServerData();assert.equal(shop.productForSlug(data,'restricted'),null);assert.equal(shop.productForSlug(data,'hidden'),null);
 cookie='wb_customer_session=session-1';data=await shop.loadShopServerData();assert.equal(shop.productForSlug(data,'restricted').slug,'restricted');assert.equal(shop.productForSlug(data,'hidden'),null);assert.deepEqual(Array.from(data.membersOnly),['restricted']);
 assert.deepEqual((await shop.searchableProducts()).map(p=>p.slug),['public']);assert.ok(!(await sitemap.default()).some(row=>row.url.includes('/shop/restricted')));
 cookie='';assert.deepEqual((await shop.loadShopServerData()).catalogue.map(p=>p.slug),['public']);
});
test('visibility query failures fail closed for catalogue, direct pages, saved carts and sitemap',async()=>{
 await db.exec('ALTER TABLE product_visibility RENAME TO visibility_unavailable');
 try {assert.equal((await catalogue.GET(request())).status,503);assert.equal((await cart.POST(request('',{slugs:['restricted']}))).status,503);assert.equal((await shop.loadShopServerData()).catalogue.length,0);assert.equal((await shop.searchableProducts()).length,0);}finally{await db.exec('ALTER TABLE visibility_unavailable RENAME TO product_visibility');}
});

const promotionEngine=await import('../src/lib/promotionRules.ts');
const promotion=load('src/app/api/cart/promotion-preview/route.ts',{'@/lib/productVisibility':load('src/lib/productVisibility.ts',{}),'@/lib/productAccess':access,'next/server':next['next/server'],'@/lib/db':{isDbConfigured:()=>true,listActivePromotionRules:async()=>[{id:1,name:'Test member gift',type:'spend_threshold',priority:1,config:{minSpend:1,scope:{type:'all'},rewardType:'free_item',freeItem:{slug:'restricted',dosage:'30ml',quantity:1}}}]},'@/lib/shipping':orderModules['@/lib/shipping'],'@/lib/money':{sumMoney:vs=>vs.reduce((a,b)=>a+b,0)},'@/lib/memberPricing':{priceForCustomer:price=>price},'@/lib/auth':{resolveCustomerFromRequest:async()=>null},'@/lib/promotionRules':promotionEngine});
test('actual promotion engine never awards a restricted gift to guests; eligible member can receive it',async()=>{
 const body={items:[{slug:'public',variant:'30ml',quantity:1}]};
 const guest=await promotion.POST(request('',body));assert.equal(guest.status,200);assert.deepEqual((await guest.json()).freeItems,[]);
 const member=await promotion.POST(request('wb_customer_session=session-1',body));assert.equal(member.status,200);assert.equal((await member.json()).freeItems[0].slug,'restricted');
 assert.equal((await promotion.POST(request('',{items:[{slug:'restricted',quantity:1}]}))).status,403);
});
const upsellEngine=await import('../src/lib/upsells.ts');
const upsell=load('src/app/api/upsells/route.ts',{'@/lib/productAccess':access,'next/server':next['next/server'],'@/lib/db':{...shopDb,getUpsellRulesForTriggers:async()=>[{id:1,trigger_handle:'public',upsell_handle:'restricted',priority:1,active:true,start_date:null,end_date:null,custom_message:null}],getManualUpsellOverridesForTriggers:async()=>[]},'@/data/products':{PRODUCTS:[],mergeProducts:(_,overrides)=>Object.values(overrides)},'@/lib/upsells':upsellEngine});
test('actual upsell handler excludes restricted candidates and restricted trigger/heading probes',async()=>{
 const url='https://beauty.invalid/api/upsells?basket=public&primary=restricted';
 const guest=await upsell.GET(new Request(url));assert.equal(guest.status,200);assert.deepEqual((await guest.json()).recommendations,[]);
 const member=await upsell.GET(new Request(url,{headers:{cookie:'wb_customer_session=session-1'}}));assert.equal((await member.json()).recommendations[0].slug,'restricted');
 const probe=await upsell.GET(new Request('https://beauty.invalid/api/upsells?basket=restricted&primary=restricted'));assert.equal((await probe.json()).enabled,false);
});
