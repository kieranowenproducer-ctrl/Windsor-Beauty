// Proves the reporting rule agreed on 9 September 2026:
// a checkout attempt is useful operational evidence, but it becomes an order
// in sales/customer figures only after payment is confirmed.
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let failed = false;
function check(label, condition) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failed = true;
}

const schema = read('src/lib/db/schema-parts/customers-and-orders.ts');
const ordersDb = read('src/lib/db/orders.ts');
const db = read('src/lib/db.ts');
const marketing = read('src/lib/db/marketing.ts');
const visits = read('src/lib/db/siteVisits.ts');
const activityApi = read('src/app/api/admin/activity/route.ts');
const dashboard = read('src/app/admin/dashboard/page.tsx');
const ordersPage = read('src/app/admin/orders/page.tsx');
const accountApi = read('src/app/api/account/me/route.ts');
const accountPage = read('src/app/account/page.tsx');

console.log('\nPayment confirmation is permanent');
check('the database stores when payment was confirmed',
  schema.includes('ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ'));
check('old completed orders receive an honest historical fallback',
  schema.includes('SET payment_confirmed_at = created_at'));
check('a deploy can safely add the column before the setup button is pressed',
  ordersDb.includes('ensureOrderPaymentConfirmationTracking'));
check('Fena confirmation stamps the payment time',
  /setOrderStatusFromPayment[\s\S]{0,900}payment_confirmed_at[\s\S]{0,200}now\(\)/.test(db));
check('staff-confirmed PayPal and manual payments stamp the payment time',
  /markOrderPaidByAdmin[\s\S]{0,650}payment_confirmed_at\s*=\s*COALESCE\(payment_confirmed_at, now\(\)\)/.test(db));
check('later status changes never replace the first confirmation time',
  /updateOrderStatus[\s\S]{0,800}COALESCE\(payment_confirmed_at, now\(\)\)/.test(db));

console.log('\nSales and customer figures count paid orders only');
check('dashboard total requires confirmed payment',
  db.includes('COUNT(*) FILTER (WHERE payment_confirmed_at IS NOT NULL)::int AS total_orders'));
check('date reports use the payment date',
  /COUNT\(\*\) FILTER \([\s\S]{0,120}payment_confirmed_at >=/.test(db));
check('customer order count requires confirmed payment',
  db.includes('COUNT(o.id) FILTER (WHERE o.payment_confirmed_at IS NOT NULL)::int AS order_count'));
check('customer spend requires confirmed payment',
  /SUM\(o\.total\) FILTER \([\s\S]{0,120}o\.payment_confirmed_at IS NOT NULL/.test(db));
check('customer profile count uses confirmation, not row count',
  db.includes("orders.filter(o => o.payment_confirmed_at !== null).length"));
check('email marketing shows paid-order counts',
  (marketing.match(/o\.payment_confirmed_at IS NOT NULL/g) ?? []).length >= 2);
check('customer account count and spend start from paid orders',
  accountApi.includes('const paidOrders = orders.filter') && accountApi.includes('orderCount: paidOrders.length'));
check('customer account calls the figure Paid Orders',
  accountPage.includes('Paid Orders'));

console.log('\nUnpaid attempts stay visible without pretending to be sales');
check('dashboard calls the headline Paid Orders',
  (dashboard.match(/label: 'Paid Orders'/g) ?? []).length >= 2);
check('activity calls an unpaid row a Payment attempt',
  dashboard.includes("event.paymentConfirmedAt ? 'Order' : 'Payment attempt'"));
check('orders page headline counts payment confirmations',
  ordersPage.includes('orders.filter(o => o.paymentConfirmedAt !== null).length'));
check('orders page reports waiting attempts separately',
  ordersPage.includes('payment attempt'));

console.log('\nConversion reports do not treat checkout attempts as purchases');
check('visitor reports require confirmed payment',
  (visits.match(/o\.payment_confirmed_at IS NOT NULL/g) ?? []).length >= 3);
check('activity uses the paid time after confirmation',
  activityApi.includes('at: o.payment_confirmed_at ?? o.created_at'));

if (failed) process.exit(1);
console.log('\nAll paid-order counting checks passed.\n');
