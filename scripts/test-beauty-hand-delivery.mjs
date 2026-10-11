// Exercise the actual checkout route with an isolated catalogue and sessions.
// No database, emails, stock movements or payment-provider requests leave this test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const state = { customer: null, orders: [], redeemed: 0 };
globalThis.__handDeliveryTest = state;
const angela = { id: 1, email: 'angela.jones99a@gmail.com', email_verified: true, account_status: 'active', banned_at: null, first_name: 'Angela', last_name: 'Jones' };
const product = { id: '1', slug: 'test-serum', name: 'Test Serum', categories: ['Skincare'], variants: [{ dosage: '30ml', price: 20 }] };
state.product = product;
const routeSource = readFileSync(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
const overrides = {
  db: {
    isDbConfigured: '()=>true',
    findCustomerByValidSessionToken: 'async token=>token==="fixture-session"?globalThis.__handDeliveryTest.customer:null',
    findCustomerByEmail: 'async()=>null',
    listCustomProducts: 'async()=>({"test-serum":globalThis.__handDeliveryTest.product})',
    getShippingSettings: 'async()=>({uk_standard_rate_pence:1000,international_rate_pence:4000,free_shipping_threshold_pence:0,default_weight_grams:100,default_package_format:"smallParcel",packaging_weight_grams:20})',
    listActivePromotionRules: 'async()=>[]',
    findInsufficientVariantStock: 'async()=>[]',
    decrementProductVariantStock: 'async()=>[]',
    findDiscountCodeByCode: 'async code=>code==="SAVE10"?{code,active:true,percentage:10,discount_type:"percentage",scope_type:"all",times_redeemed:0,usage_limit:null,expires_at:null,min_order_value:null}:null',
    redeemDiscountCodeAtomic: 'async()=>{globalThis.__handDeliveryTest.redeemed++;return true}',
    createOrder: 'async params=>{globalThis.__handDeliveryTest.orders.push(params);return {...params,order_number:params.orderNumber,payment_access_token:"test-only"}}',
  },
  productAccess: {
    loadProductAccess: 'async()=>({rules:new Map(),audience:{isAdmin:false,isMember:true}})',
    mayAccessProduct: '()=>true', filterProductRecords: 'rows=>rows',
    productJson: '(body,init)=>Response.json(body,init)',
  },
};
const inert = new Set(['welcomeDiscount','discountRefusalAlert','db/ipActivity','db/securityReviews','retireProducts','db/openingOfferProtection','memberReferrals','glowCardLoyalty','affiliates','automationFailure']);
const mocks = new Map();
for (const match of routeSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/([^'"]+)['"]/g)) {
  const [, fields, name] = match;
  if (!overrides[name] && !inert.has(name)) continue;
  const names = fields.split(',').map(v=>v.trim()).filter(v=>v && !v.startsWith('type '));
  const exports = new Map(names.map(n=>[n, overrides[name]?.[n] ?? 'async()=>null']));
  if (name === 'db') exports.set('findCustomerByValidSessionToken', overrides.db.findCustomerByValidSessionToken);
  mocks.set(`/src/lib/${name}.ts`, [...exports].map(([n, fn])=>`export const ${n}=${fn};`).join('\n'));
}
mocks.set('/src/lib/genericNames.ts', 'export const outboundItemName=(item)=>item.name;export const outboundSku=()=>"fixture";export const logGenericNameAudit=async()=>{};');
registerHooks({resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return { url: 'data:text/javascript,'+encodeURIComponent('export const NextResponse=Response;export const after=()=>{};'), shortCircuit:true };
  const result=nextResolve(specifier,context);
  for (const [suffix,source] of mocks) if(result.url.endsWith(suffix)) return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};
  return result;
}});
globalThis.fetch=async()=>{throw new Error('Network forbidden');};
const { POST } = await import('../src/app/api/checkout/place-order/route.ts');
const { hasHandDelivery } = await import('../src/lib/handDelivery.ts');
const request = (extra={}, signedIn=true) => new Request('https://example.invalid/api/checkout/place-order', { method:'POST', headers:{'content-type':'application/json',...(signedIn?{cookie:'wb_customer_session=fixture-session'}:{})}, body:JSON.stringify({items:[{name:'Test Serum',slug:'test-serum',variant:'30ml',price:0.01,quantity:2}],email:angela.email,customerName:'Angela Jones',phone:'07123456789',shippingAddress:'Test Lane, Windsor, SL4 1AA, GB',address:{line1:'Test Lane',city:'Windsor',postcode:'SL4 1AA',country:'GB'},shippingLabel:'Hand delivered',shippingCost:999,subtotal:0.02,total:0.02,paymentMethod:'fena',confirmations:{terms:true},...extra}) });
try {
  state.customer=angela;
  assert.equal(hasHandDelivery({...angela,email:' ANGELA.JONES99A@GMAIL.COM '}),true);
  for (const customer of [null,{...angela,email:'other@example.invalid'},{...angela,email:'angela.jones998@gmail.com'},{...angela,email_verified:false}]) {
    state.customer=customer;
    assert.equal((await POST(request())).status,403);
  }
  state.customer=angela;
  assert.equal((await POST(request({},false))).status,403,'Typing Angela\'s email as a guest is insufficient');
  assert.equal((await POST(request({address:{country:'FR'},phone:'+447123456789'}))).status,403);
  assert.equal(state.orders.length,0,'Rejected attempts create no order');
  assert.equal((await POST(request({email:'forged@example.invalid',discountCode:'SAVE10'}))).status,200);
  const hand=state.orders.at(-1);
  assert.equal(hand.email,angela.email);
  assert.equal(hand.subtotal,40);
  assert.equal(hand.shippingCost,0);
  assert.equal(hand.discountAmount,4);
  assert.equal(hand.total,36);
  assert.equal(hand.fulfilmentType,'hand_delivered');
  assert.equal(hand.automationFlags.triggerRoyalMail,false);
  assert.equal(hand.automationFlags.sendDispatchEmail,false);
  assert.equal(hand.automationFlags.sendConfirmation,true);
  assert.equal(state.redeemed,1);
  assert.equal((await POST(request({shippingLabel:'UK Delivery',shippingCost:0}))).status,200);
  assert.equal(state.orders.at(-1).shippingCost,10);
  assert.equal(state.orders.at(-1).total,50);
  assert.equal(state.orders.at(-1).fulfilmentType,undefined,'Ordinary dispatch defaults remain in place');
  assert.equal((await POST(request({paymentMethod:'paypal'}))).status,200);
  assert.equal(state.orders.at(-1).shippingCost,0);
  assert.equal(state.orders.at(-1).paypalFee,1.4,'Existing PayPal fee is unchanged');
  assert.equal(state.orders.at(-1).total,41.4);
  console.log('PASS: account exception, guest and wrong-account refusal, UK address guard, authoritative £0 shipping, product pricing, discount redemption, postal alternative and PayPal fee.');
} finally { delete globalThis.__handDeliveryTest; }
