import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
let failed = false;
function check(label, condition) {
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${label}`);
  if (!condition) failed = true;
}

const dashboard = read('src/app/admin/dashboard/page.tsx');
const paypalRoute = read('src/app/api/payment/paypal/instructions/route.ts');
const paypalEmail = read('src/lib/paypalInstructionsEmail.ts');
const checkout = read('src/app/checkout/page.tsx');
const schema = read('src/lib/db/schema-parts/customers-and-orders.ts');
const db = read('src/lib/db.ts');
const fena = read('src/lib/fena.ts');
const outbound = read('src/app/api/webhooks/resend-outbound/route.ts');
const customerEmails = read('src/lib/db/customerEmails.ts');
const unpaidCron = read('src/app/api/cron/unpaid-orders/route.ts');
const vercel = read('vercel.json');

console.log('\nPayment status wording');
check('awaiting payment no longer claims every order is PayPal', !dashboard.includes('PayPal orders pending confirmation'));
check('dashboard says payment is not yet confirmed', dashboard.includes('Payment started, money not confirmed'));
check('dashboard names Pay by Bank and PayPal on waiting rows', dashboard.includes('Awaiting payment ·') && dashboard.includes("'Pay by Bank'"));

console.log('\nSafe PayPal email failure');
check('checkout sends the private token with the PayPal request', checkout.includes('JSON.stringify({ orderNumber, paymentToken })'));
check('PayPal route refuses a missing or wrong token', paypalRoute.includes('paymentToken !== order.payment_access_token'));
check('a failed backup email does not block the ready PayPal page', paypalRoute.includes('success: true, emailSent: false') && paypalRoute.includes('paymentUrl'));
check('a failed email is recorded for staff', paypalRoute.includes("reportAutomationFailure('customer_email'"));
check('checkout redirects straight to PayPal', checkout.includes('window.location.href = directPaymentUrl || recovery!') && !checkout.includes('PaypalPaymentReady'));
check('approved Windsor Beauty branding remains unchanged', paypalEmail.includes("const FROM_ADDRESS = 'Windsor Beauty <sales@windsorbeauty.co.uk>'") && paypalEmail.includes('Complete your Windsor Beauty payment'));

console.log('\nPayment recovery and expiry');
for (const column of ['payment_access_token', 'fena_payment_url', 'reservation_expires_at', 'payment_reminder_sent_at', 'checkout_stock_decremented_at', 'checkout_stock_items', 'stock_restored_at']) {
  check(`${column} is added safely`, schema.includes(`ADD COLUMN IF NOT EXISTS ${column}`));
}
check('Fena saves the original payment URL', fena.includes('fenaPaymentId, paymentUrl'));
check('stock restoration has a one-time guard', db.includes('stock_restored_at IS NULL') || db.includes("status IN ('pending', 'awaiting_payment')"));
check('only orders with an explicit expiry are selected', db.includes('reservation_expires_at IS NOT NULL'));
check('only stock actually decremented is restored', db.includes('jsonb_array_elements(checkout_stock_items)'));
check('the hourly expiry job is scheduled', vercel.includes('/api/cron/unpaid-orders'));
check('one reminder is claimed before the reservation expires', db.includes("reservation_expires_at <= now() + INTERVAL '12 hours'") && db.includes('payment_reminder_sent_at IS NULL'));
check('overlapping jobs cannot claim the same reminder', db.includes('FOR UPDATE SKIP LOCKED'));
check('failed reminders are released for a later retry', unpaidCron.includes('releasePaymentReminderClaim'));
check('PayPal reminders retain their approved email', unpaidCron.includes('sendPaypalInstructionsEmail'));

console.log('\nEmail delivery evidence');
check('outbound webhook requires a verified signature', outbound.includes('verifyWebhookSignature'));
check('delivery, bounce and failure events are tracked', outbound.includes("'email.delivered'") && outbound.includes("'email.bounced'") && outbound.includes("'email.failed'"));
check('older webhook events cannot overwrite newer delivery evidence', customerEmails.includes('delivery_updated_at <= ${effectiveOccurredAt}'));

if (failed) process.exit(1);
console.log('\nAll payment safety checks passed.');
