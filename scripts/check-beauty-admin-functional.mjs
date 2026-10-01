import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';

// Local only. No order, email, upload, shipping or payment provider calls.
const env = parseEnv(readFileSync('.env.local', 'utf8'));
const dbUrl = new URL(env.DATABASE_URL);
assert(['localhost', '127.0.0.1'].includes(dbUrl.hostname) && dbUrl.port === '5434', 'Local test database required.');
const db = new pg.Client({ connectionString: env.DATABASE_URL });
await db.connect();
const base = 'http://localhost:3002';
let cookie = '';
let count = 0;
const cleanup = [];
async function call(path, method = 'GET', body, status = 200) {
  const r = await fetch(base + '/api/admin/' + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json().catch(() => ({}));
  assert.equal(r.status, status, `${method} ${path}: expected ${status}, received ${r.status}`);
  count++;
  return data;
}
async function restoreContent(key) {
  const {rows} = await db.query('SELECT * FROM site_content WHERE key=$1', [key]);
  cleanup.push(async () => {
    if (!rows.length) await db.query('DELETE FROM site_content WHERE key=$1', [key]);
    else { const r=rows[0]; await db.query('UPDATE site_content SET title=$2,body=$3,image_url=$4,format=$5,updated_at=$6 WHERE key=$1',[key,r.title,r.body,r.image_url,r.format,r.updated_at]); }
  });
}
try {
  const login = await fetch(base + '/api/admin/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})});
  assert.equal(login.status, 200, 'Local admin login failed');
  cookie=login.headers.get('set-cookie').split(';')[0];
  // Page data only: these routes read the local database and do not contact providers.
  for (const path of ['orders','invoices','dispatch/pending','product-costs','supplier-purchases','products/stock-report','trial-products','reviews','customers','security-reviews','member-logins','batches','system-health','shipping-settings','enquiries','qr-campaigns','qr-campaigns/analytics']) {
    await call(path);
  }
  const batchCode='LOCAL-'+Date.now();
  const batch=(await call('batches','POST',{code:batchCode,productName:'Local test',note:'Local check only'})).batch;
  cleanup.push(async()=>{await db.query('DELETE FROM batches WHERE id=$1 AND code=$2',[batch.id,batchCode]);});
  await call('batches','PATCH',{id:batch.id,active:false});
  assert.equal((await call('batches')).batches.find(x=>x.id===batch.id).active,false);
  const qrDraft={name:'Local check '+Date.now(),destinationUrl:'/shop',status:'paused'};
  const qr=(await call('qr-campaigns','POST',qrDraft,201)).campaign;
  cleanup.push(async()=>{await call('qr-campaigns/'+qr.id,'DELETE');});
  await call('qr-campaigns/'+qr.id,'PUT',{...qrDraft,name:'Local check edited'});
  assert.equal((await call('qr-campaigns/'+qr.id)).campaign.name,'Local check edited');
  const slug='local-admin-check-'+Date.now();
  const category='Local admin check '+Date.now();
  const renamed=category+' edited';
  await call('categories','POST',{name:category});
  cleanup.push(async()=>{for(const name of [category,renamed]) await db.query('DELETE FROM category_settings WHERE category=$1',[name]);});
  const originals = await call('products/catalogue');
  const template=Object.values(originals.overrides)[0];
  assert(template,'Starter catalogue required');
  let product=(await call('products/catalogue','POST',{product:{...template,slug,name:'Local admin test product',categories:[category],variants:[{dosage:'30ml',price:12},{dosage:'50ml',price:18}]}})).product;
  cleanup.push(async()=>{await call('products/catalogue/'+slug,'DELETE');});
  await call('products/catalogue','POST',{product},409);
  product=(await call('products/catalogue/'+slug,'PUT',{product:{...product,name:'Local admin test edited',variants:[{dosage:'30ml',price:13},{dosage:'50ml',price:19}]}})).product;
  assert.equal(product.variants[1].price,19);
  await call('categories','DELETE',{category},409);
  await call('categories','PATCH',{category,newName:renamed});
  assert((await call('products/catalogue')).overrides[slug].categories.includes(renamed));
  await call('categories','PATCH',{category:renamed,enabled:false});
  assert.equal((await call('categories')).categories.find(x=>x.category===renamed).enabled,false);
  await call('products/visibility','POST',{slug,hidden:true});
  assert((await call('products/visibility')).hidden.includes(slug));
  await call('products/visibility','POST',{slug,hidden:false});
  // Only update stock when no low-stock row could trigger an email.
  const low=await db.query('SELECT count(*)::int AS count FROM product_variant_stock WHERE quantity < 6 AND retired_at IS NULL');
  if(low.rows[0].count===0) {
    await call('products/stock','POST',{slug,dosage:'30ml',quantity:23});
    const stock=await call('products/stock');
    assert.equal(stock.variantStock[slug]['30ml'],23);
  } else console.log('SKIP stock save: existing low stock could send an email.');
  const code=(await call('discount-codes','POST',{code:'LOCAL-'+Date.now(),discountType:'percentage',percentage:10,scopeType:'category',scopeCategories:[renamed]},201)).code;
  cleanup.push(async()=>{await call('discount-codes/'+code.id,'DELETE');});
  await call('discount-codes/'+code.id,'PATCH',{active:false});
  assert.equal((await call('discount-codes')).codes.find(x=>x.id===code.id).active,false);
  const promoDraft={title:'Local admin test',description:'Temporary local check',promotionType:'informational',active:false,buttonText:'Shop',buttonLink:'/shop'};
  const promo=(await call('promotions','POST',promoDraft,201)).promotion;
  cleanup.push(async()=>{await call('promotions/'+promo.id,'DELETE');});
  await call('promotions/'+promo.id,'PATCH',{...promoDraft,title:'Local admin test edited'});
  assert.equal((await call('promotions')).promotions.find(x=>x.id===promo.id).title,'Local admin test edited');
  const link=(await call('nav-links','POST',{label:'Local test',href:'/shop'})).link;
  cleanup.push(async()=>{await call('nav-links/'+link.id,'DELETE');});
  await call('nav-links/'+link.id,'PUT',{label:'Local test edited',href:'/contact'});
  assert.equal((await call('nav-links')).links.find(x=>x.id===link.id).href,'/contact');
  await call('upsells/manual/'+slug,'PUT',{heading:'Local suggestions',upsellHandles:[template.slug]});
  cleanup.push(async()=>{await call('upsells/manual/'+slug,'DELETE');});
  assert.equal((await call('upsells/manual/'+slug)).override.heading,'Local suggestions');
  await restoreContent('upsell-settings');
  await call('upsells/settings','PATCH',{enabled:false});
  assert.equal((await call('upsells')).settings.enabled,false);
  await restoreContent('announcement-bar');
  await call('content','PATCH',{key:'announcement-bar',body:'Local admin check',format:'text'});
  assert.equal((await call('content')).content.find(x=>x.key==='announcement-bar').body,'Local admin check');
  console.log(`PASS: ${count} admin API checks. Products, sizes, visibility, categories, discount codes, promotions, navigation, upsells and site content saved and read back.`);
} finally {
  let failed=false;
  for(const restore of cleanup.reverse()) {try {await restore();}catch {failed=true;console.error('FAIL: a local cleanup action failed.');}}
  await db.end();
  assert(!failed,'Local cleanup must finish');
  console.log('PASS: temporary rows removed and original content restored.');
}
