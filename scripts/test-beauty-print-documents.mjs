import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the actual print routes, with in-memory records and no network/database.
const hostile = '<img src=x onerror="alert(1)">&';
const order = {
  order_number: 'WB-PRINT-TEST', created_at: '2026-10-01T12:00:00Z', status: 'awaiting_payment',
  customer_name: 'Buyer '+hostile, shipping_recipient: 'Recipient '+hostile,
  shipping_line1: 'Address '+hostile, shipping_line2: '', shipping_city:'Town', shipping_postcode:'TEST', shipping_country:'GB',
  email:'fixture@example.invalid', phone:'Phone '+hostile, shipping_label:'Delivery '+hostile,
  items:[{name:'Item '+hostile, variant:'30ml '+hostile, quantity:2, price:20}],
  subtotal:40, discount_amount:2, discount_code:'Code '+hostile, rule_discount_amount:3,
  shipping_cost:10, paypal_fee:1.58,total:46.58, tracking_number:'Track '+hostile,
  admin_notes:'Note '+hostile+'\nSecond line',
};
const invoice={...order, invoice_number:'WB-INVOICE-TEST',invoice_date:order.created_at,
  line_items:[{name:'Item '+hostile,quantity:2,unitPrice:20,lineTotal:40}],shipping_amount:10,
};
globalThis.__beautyPrintTest={order,invoice,configured:true};
registerHooks({ resolve(specifier,context,nextResolve) {
  const resolved=nextResolve(specifier==='next/server'?'next/server.js':specifier,context);
  if(resolved.url.endsWith('/src/lib/db.ts')) return {url:'data:text/javascript,'+encodeURIComponent(`
    export const isDbConfigured=()=>globalThis.__beautyPrintTest.configured;
    export const findOrderByNumber=async()=>globalThis.__beautyPrintTest.order;
    export const findInvoiceById=async()=>globalThis.__beautyPrintTest.invoice;
    export const PAYMENT_CONFIRMED_STATUSES=['paid','awaiting_dispatch','processing','exported','dispatched','delivered'];
  `),shortCircuit:true};
  return resolved;
}});
globalThis.fetch=async()=>{throw new Error('Network calls forbidden in print tests.');};
const packing=await import('../src/app/api/admin/orders/[orderNumber]/packing-slip/route.ts');
const print=await import('../src/app/api/admin/invoices/[id]/print/route.ts');
const request=new Request('https://example.invalid/test');
const packingParams={params:Promise.resolve({orderNumber:order.order_number})};
const render=async()=>{
  const result=await packing.GET(request,packingParams);
  assert.equal(result.status,200);
  assert.match(result.headers.get('content-type'),/text\/html/);
  return result.text();
};
try {
  const html=await render();
  assert.doesNotMatch(html,/<img src=x/,'Typed HTML must never be rendered as markup.');
  for(const label of ['Recipient','Address','Phone','Delivery','Item','30ml','Code','Track','Note']) {
    assert(html.includes(`${label} &lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;`),`${label} must be escaped.`);
  }
  assert.match(html,/Second line/);
  assert.doesNotMatch(html,/Buyer /,'Shipping recipient must take precedence over purchaser name.');
  assert.match(html,/Promotion discount<\/td><td[^>]*>−£3\.00/);
  assert.match(html,/PayPal fee<\/td><td[^>]*>£1\.58/);
  assert.match(html,/<strong>Total due<\/strong>/);
  assert.doesNotMatch(html,/<strong>Total paid<\/strong>/);
  assert.match(html,/<strong>£46\.58<\/strong>/);
  assert.match(html,/body\s*\{\s*background:\s*#ffffff;/i);
  for(const status of ['paid','awaiting_dispatch','processing','exported','dispatched','delivered']) {
    order.status=status;
    const paid=await render();
    assert.match(paid,/<strong>Total paid<\/strong>/);
    assert.doesNotMatch(paid,/<strong>Total due<\/strong>/);
  }
  order.shipping_recipient=null;
  assert.match(await render(),/Buyer &lt;img/,'Purchaser name is used when no delivery recipient exists.');
  const invoiceResult=await print.GET(request,{params:Promise.resolve({id:'1'})});
  assert.equal(invoiceResult.status,200);
  assert.match(await invoiceResult.text(),/body\s*\{\s*background:\s*#ffffff;/i,'Printed invoices must have true white backgrounds.');
  globalThis.__beautyPrintTest.order=null;
  assert.equal((await packing.GET(request,packingParams)).status,404);
  globalThis.__beautyPrintTest.configured=false;
  assert.equal((await packing.GET(request,packingParams)).status,503);
  console.log('PASS: actual packing slips escape typed fields, use the delivery recipient, show discounts and fees, distinguish unpaid/paid totals, and print on true white. Invoice print background and missing-order handling also passed.');
} finally {delete globalThis.__beautyPrintTest;}


