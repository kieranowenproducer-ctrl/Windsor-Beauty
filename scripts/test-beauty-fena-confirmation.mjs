// Actual webhook route, with in-memory orders and intercepted side effects.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const state={};
globalThis.__beautyWebhookTest=state;
const mock=new Map([
 ['/src/lib/db.ts',`
 export const isDbConfigured=()=>true;
 export const findOrderByNumber=async()=>({...globalThis.__beautyWebhookTest.order});
 export const findCustomerById=async()=>null;
 export const logAutomationFailure=async(kind)=>{globalThis.__beautyWebhookTest.failures.push(kind);};
 export const setOrderStatusFromPayment=async()=>{const s=globalThis.__beautyWebhookTest;s.order.status='paid';return {...s.order};};
 export const markOrderPaidByAdmin=async()=>{const s=globalThis.__beautyWebhookTest;s.order.status='awaiting_dispatch';return {...s.order};};
 export const setOrderPaymentAmountMismatch=async()=>{throw new Error('Unexpected amount mismatch');};
 export const updateOrderNotes=async()=>{};
 `],
 ['/src/lib/orderConfirmationEmail.ts',`export const sendOrderConfirmationEmail=async()=>{const s=globalThis.__beautyWebhookTest;s.confirmations++;return s.emailSucceeds;};`],
 ['/src/lib/adminOrderNotificationEmail.ts',`export const sendAdminOrderNotificationEmail=async()=>{globalThis.__beautyWebhookTest.staffNotices++;return true;};`],
 ['/src/lib/royalMailDispatch.ts',`export const dispatchOrderToRoyalMail=async()=>{globalThis.__beautyWebhookTest.dispatches++;return {ok:true,skipped:true};};`],
 ['/src/lib/invoiceFulfillment.ts',`export const onInvoiceOrderPaid=async()=>{globalThis.__beautyWebhookTest.invoiceUpdates++;};`],
 ['/src/lib/glowCardLoyalty.ts',`export const awardGlowCardOrderPoint=async()=>null; export const markGlowCardVoucherUsedForPaidOrder=async()=>false;`],
 ['/src/lib/glowCardMilestoneEmail.ts',`export const sendGlowCardMilestoneEmail=async()=>{throw new Error('Unexpected reward email');};`],
 ['/src/lib/automationAlertEmail.ts',`export const sendAutomationAlertEmail=async()=>{throw new Error('Unexpected automation alert');};`],
]);
registerHooks({resolve(specifier,context,nextResolve){const result=nextResolve(specifier==='next/server'?'next/server.js':specifier,context);for(const [suffix,source] of mock)if(result.url.endsWith(suffix))return {url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};return result;}});
globalThis.fetch=async()=>{throw new Error('Network forbidden');};
process.env.FENA_WEBHOOK_SECRET='intercepted-test-only';
const {POST}=await import('../src/app/api/webhooks/fena/route.ts');
function reset(flags,emailSucceeds=true){Object.assign(state,{order:{order_number:'WB-TEST',status:'awaiting_payment',automation_flags:flags,email:'fixture@example.invalid',customer_name:'Test',items:[],total:0.5,subtotal:0.5,shipping_cost:0,discount_amount:0,paypal_fee:0,payment_method:'fena'},emailSucceeds,confirmations:0,staffNotices:0,dispatches:0,invoiceUpdates:0,failures:[]});}
const request=(status='paid',key='intercepted-test-only')=>new Request('https://example.invalid/api/webhooks/fena?key='+key,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reference:'WB-TEST',status,amount:'0.50'})});
try{
 for(const flags of [{sendConfirmation:false},{sendConfirmation:true},undefined]){
  reset(flags);
  assert.equal((await POST(request('paid','wrong'))).status,401);
  assert.equal(state.confirmations,0);
  assert.equal((await POST(request('rejected'))).status,200);
  assert.equal(state.order.status,'awaiting_payment');
  assert.equal((await POST(request())).status,200);
  assert.equal(state.order.status,'awaiting_dispatch');
  assert.equal(state.confirmations,flags?.sendConfirmation===false?0:1);
  assert.equal(state.staffNotices,1,'Staff still receive their notice.');
  assert.equal(state.dispatches,1);assert.equal(state.invoiceUpdates,1);
  assert.deepEqual(state.failures,['fena_payment_not_completed'],'Intentional email skip is not an error.');
  const replay=await POST(request());assert.equal(await replay.text(),'Already processed');
  assert.equal(state.confirmations,flags?.sendConfirmation===false?0:1);
  assert.equal(state.staffNotices,1);assert.equal(state.dispatches,1);assert.equal(state.invoiceUpdates,1);
 }
 reset(undefined,false);
 await POST(request());
 assert.deepEqual(state.failures,['customer_email'],'A real email send failure is still recorded.');
 console.log('PASS: Fena webhook honours confirmation-off, keeps default and enabled emails, preserves staff notices, refuses wrong secrets, leaves rejected orders unpaid, ignores replay and records real email failure.');
}finally{delete globalThis.__beautyWebhookTest;}
