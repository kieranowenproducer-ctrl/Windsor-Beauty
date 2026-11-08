// Actual builders and contact/reply routes, synthetic DB/provider boundaries.
// No environment file, live customer, network request or email is used.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const sent=[],enquiries=[],replies=[];let checks=0,networkCalls=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const eq=(value,expected,label)=>{assert.deepEqual(value,expected,label);checks++;};
const order={order_number:'WB-SUITE123',customer_name:'Synthetic Customer',email:'customer@example.invalid',items:[{name:'Sample serum',variant:'30ml',quantity:2,price:20}],total:50,status:'paid',created_at:'2026-11-08T12:00:00Z'};
globalThis.__suiteTest={send:async(payload,options)=>{sent.push({payload,options});return{ok:true,id:'11111111-1111-4111-8111-111111111111',error:null};},order,enquiries,replies};
for(const name of ['DATABASE_URL','DATABASE_URL_UNPOOLED','POSTGRES_URL','SUPPORT_REPLY_TO','ENQUIRY_REPLY_FROM','ENQUIRY_REPLY_TO','REPLY_CAPTURE_ADDRESS','NEXT_PUBLIC_SITE_URL'])delete process.env[name];
process.env.RESEND_API_KEY_BEAUTY_IS='synthetic-capture-only';process.env.EMAIL_ARCHIVE_TO='off';process.env.ENQUIRY_REPLY_ARCHIVE_TO='off';
const mocks=new Map([
 ['/src/lib/email/send.ts','export const sendEmail=globalThis.__suiteTest.send;'],
 ['/src/lib/db.ts',`export const isDbConfigured=()=>true;export const ensureSchema=async()=>{};export const findCustomerByValidSessionToken=async()=>null;export const findOrderByNumber=async ref=>ref===globalThis.__suiteTest.order.order_number?globalThis.__suiteTest.order:null;export const logAutomationFailure=async()=>{};export const listPendingStockAlerts=async()=>[];export const markStockAlertsNotified=async()=>{};`],
 ['/src/lib/shipping.ts','export const getProductsBySlug=async()=>({});'],
 ['/src/lib/db/enquiries.ts',`export const createEnquiry=async value=>{globalThis.__suiteTest.enquiries.push(value);return{id:7,...value};};export const findEnquiryById=async id=>id===7?{id:7,name:'Synthetic Customer',email:'customer@example.invalid',subject_label:'Order Enquiry',message:'Where is my sample order?',order_number:'WB-SUITE123'}:null;export const recordEnquiryReply=async value=>{globalThis.__suiteTest.replies.push(value);return{id:9,...value};};`],
 ['/src/lib/db/formLimits.ts',"export const clientIpOf=()=> '127.0.0.1';export const isFormRateLimited=async()=>false;export const logFormAttempt=async()=>{};export const RATE_LIMIT_MESSAGE='Try later';"],
]);
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='next/server')return{url:'data:text/javascript,export const NextResponse=Response;',shortCircuit:true};const hit=nextResolve(specifier,context);for(const[suffix,source]of mocks)if(hit.url.endsWith(suffix))return{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true};return hit;}});
globalThis.fetch=async()=>{networkCalls++;throw Error('Network is forbidden');};
const contact=await import('../src/lib/email/contactAddress.ts');
const {DEFAULT_ADMIN_SENDER,resolveAdminSender}=await import('../src/lib/email/adminSenders.ts');
eq(DEFAULT_ADMIN_SENDER,'suite','Dashboard default is Suite');eq(resolveAdminSender(undefined).from,contact.BEAUTY_CONTACT_FROM,'Default reply sender');eq(resolveAdminSender('sales').address,'sales@windsorbeauty.is','Explicit legacy sender remains available');
const {parseContactContent}=await import('../src/lib/contactContent.ts'),{parseFooterContent}=await import('../src/lib/footerContent.ts');
const old=['info@windsorbeauty.is','sales@windsorbeauty.co.uk','beautiful@windsorbeauty.is'];
eq(parseContactContent({body:JSON.stringify({emails:old.map(email=>({email,label:'Old label'}))})}).emails,[{email:contact.BEAUTY_CONTACT_EMAIL,label:contact.BEAUTY_CONTACT_LABEL}],'Stored old contact display folds into one Suite address');
eq(parseFooterContent({body:JSON.stringify({emails:old.map(address=>({address,label:'Old label'}))})}).emails,[{address:contact.BEAUTY_CONTACT_EMAIL,label:contact.BEAUTY_CONTACT_LABEL}],'Stored old footer display folds into one Suite address');
eq(contact.beautyPublicContactAddress('sales@windsorbeauty.is.attacker.invalid'),'sales@windsorbeauty.is.attacker.invalid','No domain substring rewriting');
eq(contact.beautyPublicContactAddress('custom@example.invalid'),'custom@example.invalid','Unrelated explicit contact preserved');
const base={to:order.email,customerName:order.customer_name,orderNumber:order.order_number};
const customerModules=[
 ['orderConfirmationEmail','sendOrderConfirmationEmail',{...base,items:order.items,subtotal:40,shippingLabel:'Tracked 24',shippingCost:10,total:50,shippingAddress:'Synthetic address only'}],
 ['shippingEmail','sendShippingConfirmationEmail',{...base,trackingNumber:'SYNTHETIC123',carrierName:'Royal Mail',trackingUrl:'https://www.royalmail.com/track-your-item#/tracking-results/SYNTHETIC123'}],
 ['invoiceEmail','sendInvoiceEmail',{...base,invoiceNumber:'INV-SUITE123',lineItems:[{type:'product',discount:0,name:'Sample serum',quantity:2,unitPrice:20,lineTotal:40}],subtotal:40,shippingAmount:10,discountAmount:0,total:50,fenaPaymentUrl:null,payUrl:'https://www.windsorbeauty.is/pay/synthetic'}],
 ['paymentLinkEmail','sendPaymentLinkEmail',{...base,total:50,paymentUrl:'https://www.windsorbeauty.is/pay/synthetic'}],
 ['paymentResumeEmail','sendPaymentResumeEmail',{...base,total:50,resumeUrl:'https://www.windsorbeauty.is/resume-payment/synthetic'}],
 ['passwordResetEmail','sendPasswordResetEmail',{...base,resetUrl:'https://www.windsorbeauty.is/account/reset-password?token=synthetic'}],
 ['verifyEmailEmail','sendVerifyEmail',{...base,verifyUrl:'https://www.windsorbeauty.is/account/verify-email?token=synthetic'}],
 ['membershipWelcomeEmail','sendMembershipWelcomeEmail',{...base,discountCode:'SYNTHETIC'}],
];
for(const[name,fn,params]of customerModules){const loaded=await import(`../src/lib/${name}.ts`);ok(await loaded[fn](params),name+' captured successfully');const {payload}=sent.at(-1);eq(payload.from,contact.BEAUTY_CONTACT_FROM,name+' sender');eq(payload.replyTo,contact.BEAUTY_CONTACT_EMAIL,name+' reply');eq(payload.to,order.email,name+' keeps customer recipient');ok(payload.text&&payload.html,name+' both parts retained');ok(!/\$\{BEAUTY_CONTACT/.test(payload.text+payload.html),name+' no unrendered placeholder');if(['orderConfirmationEmail','shippingEmail','invoiceEmail'].includes(name)){ok((payload.text+payload.html).includes('suite@windsorbeauty.is'),name+' contact copy');ok((payload.text+payload.html).includes(name==='invoiceEmail'?'INV-SUITE123':'WB-SUITE123'),name+' exact order/invoice reference');}}
const stock=(await import('../src/lib/backInStockEmail.ts')).buildBackInStockEmail({to:order.email,productName:'Sample serum',productUrl:'https://www.windsorbeauty.is/shop/sample'});eq(stock.from,contact.BEAUTY_CONTACT_FROM,'Stock customer sender');eq(stock.replyTo,contact.BEAUTY_CONTACT_EMAIL,'Stock customer reply');
const staffModules=[
 ['adminOrderNotificationEmail','sendAdminOrderNotificationEmail',[{...customerModules[0][2],email:order.email,phone:null,paymentMethod:'paypal',paymentStatus:'awaiting_verification',createdAt:order.created_at}]],
 ['lowStockAlertEmail','sendLowStockAlertEmail',[[{slug:'sample',name:'Sample serum',dosage:'30ml',quantity:2}],5]],
 ['reviewNotificationEmail','sendReviewNotificationEmail',[{reviewId:3,customerName:order.customer_name,customerEmail:order.email,rating:5,title:'Synthetic review',body:'Synthetic test only',createdAt:order.created_at}]],
 ['automationAlertEmail','sendAutomationAlertEmail',[{category:'admin_email',message:'Synthetic delivery failure',subject:order.order_number}]],
];
for(const[name,fn,args]of staffModules){ok(await(await import(`../src/lib/${name}.ts`))[fn](...args),name+' captured');eq(sent.at(-1).payload.to,contact.BEAUTY_CONTACT_EMAIL,name+' staff destination');eq(sent.at(-1).options.internal,true,name+' internal filing remains');}
const {EMAIL_PREVIEW_TYPES,buildEmailPreview}=await import('../src/lib/email/previews.ts');for(const type of EMAIL_PREVIEW_TYPES){const preview=buildEmailPreview(type);ok(preview.subject&&preview.text&&preview.html,type+' complete preview');}
const request=body=>new Request('https://www.windsorbeauty.is/api/contact/send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const contactRoute=await import('../src/app/api/contact/send/route.ts');const start=sent.length;
eq((await contactRoute.POST(request({name:order.customer_name,email:order.email,subject:'order',orderNumber:order.order_number,message:'Where is my order?'}))).status,200,'Actual contact route accepts synthetic order enquiry');
eq(sent.length,start+2,'One staff notification and one acknowledgement');eq(sent[start].payload.to,[contact.BEAUTY_CONTACT_EMAIL],'Staff enquiry to Suite');eq(sent[start].payload.replyTo,order.email,'Staff can reply directly to exact customer');ok(sent[start].payload.text.includes('ORDER ON FILE')&&sent[start].payload.text.includes(order.order_number),'Staff notification links actual order');
eq(sent[start+1].payload.from,contact.BEAUTY_CONTACT_FROM,'Customer acknowledgement from Suite');eq(sent[start+1].payload.replyTo,contact.BEAUTY_CONTACT_EMAIL,'Customer replies to Suite');eq(enquiries[0].orderNumber,order.order_number,'Dashboard enquiry keeps exact order link');
const replyRoute=await import('../src/app/api/admin/enquiries/[id]/reply/route.ts');eq((await replyRoute.POST(request({message:'Your order is being checked.'}),{params:Promise.resolve({id:'7'})})).status,200,'Actual staff reply route succeeds');
eq(sent.at(-1).payload.from,contact.BEAUTY_CONTACT_FROM,'Staff reply sender');eq(sent.at(-1).payload.to,order.email,'Staff reply exact recipient');eq(sent.at(-1).payload.replyTo,contact.BEAUTY_CONTACT_EMAIL,'Staff reply return address');eq(replies[0].fromAddress,contact.BEAUTY_CONTACT_FROM,'Saved thread records actual Suite sender');
eq(networkCalls,0,'No network');
const dir=new URL('../.local-evidence/suite-email-20261108/capture-'+new Date().toISOString().replace(/[:.]/g,'-')+'/',import.meta.url);mkdirSync(dir,{recursive:true});const files=['src/lib/email/contactAddress.ts','src/lib/email/supportAddress.ts','src/lib/email/adminSenders.ts','src/lib/contactContent.ts','src/lib/footerContent.ts','src/app/api/contact/send/route.ts','src/app/api/admin/enquiries/[id]/reply/route.ts',...customerModules.map(([name])=>'src/lib/'+name+'.ts'),...staffModules.map(([name])=>'src/lib/'+name+'.ts'),'scripts/test-beauty-suite-email.mjs'];
writeFileSync(new URL('receipt.json',dir),JSON.stringify({passed:true,checks,capturedMessages:sent.length,networkCalls:0,databaseOpened:false,providerAcceptanceProved:false,sourceHashes:Object.fromEntries(files.map(name=>[name,createHash('sha256').update(readFileSync(new URL('../'+name,import.meta.url))).digest('hex')]))},null,2)+'\n');
console.log(JSON.stringify({passed:true,checks,capturedMessages:sent.length,receipt:new URL('receipt.json',dir).href}));
