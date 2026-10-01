import type { OrderItemRecord } from '@/lib/db';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { sendEmail } from '@/lib/email/send';
import { displayOrderItems } from '@/lib/orderTrialDisplay';

// INTERNAL mail, so it uses the ops identity rather than the customer-facing one.
//
// This goes to the Windsor Beauty team, never to a customer. Sending it from orders@, the
// address customers receive invoices and dispatch notes from, mixes two different jobs on one
// identity: internal mail is never opened by the people whose engagement builds that
// address's reputation, and if the team ever files one of these in junk it teaches the
// provider something about the address customers depend on. Decided in the 31 July 2026
// deliverability audit.
const FROM_ADDRESS = 'Windsor Beauty Ops <alerts@windsorbeauty.co.uk>';
const TO_ADDRESS = 'sales@windsorbeauty.co.uk';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  fena: 'Pay by Bank (Fena)',
  paypal: 'Credit/Debit Card (via PayPal)',
  manual: 'Manual',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
};

// 'confirmed' — Fena's signed webhook/redirect-confirm verified payment itself.
// 'awaiting_verification' — the order was just placed via a method with no
//   automatic verification (PayPal today); staff need to go check and then
//   mark it paid in admin.
// 'paid_manually' — staff already checked and clicked Mark as Paid; nothing
//   further to do.
export type AdminOrderPaymentStatus = 'confirmed' | 'awaiting_verification' | 'paid_manually';

const STATUS_BADGE_LABELS: Record<AdminOrderPaymentStatus, string> = {
  confirmed: 'Payment Confirmed',
  awaiting_verification: 'Awaiting Payment Verification',
  paid_manually: 'Paid Manually',
};

function resolvePaymentStatusNote(paymentMethod: string, paymentStatus: AdminOrderPaymentStatus): string {
  if (paymentStatus === 'awaiting_verification') {
    if (paymentMethod === 'paypal') {
      return 'Order placed with PayPal. Check your PayPal account now to see whether the payment has arrived. Match the order number and price summary below against your PayPal activity, then mark it paid in admin once confirmed.';
    }
    const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod;
    return `Order placed. Payment method: ${methodLabel}. Check the account for this payment, then mark it paid in admin once confirmed.`;
  }
  if (paymentStatus === 'paid_manually') {
    if (paymentMethod === 'paypal') {
      return 'PayPal payment verified and marked paid by admin. No further action needed.';
    }
    return 'Marked paid manually by admin. No further action needed.';
  }
  // 'confirmed'
  if (paymentMethod === 'fena') {
    return 'Paid via Fena. Funds should already be in the business bank account.';
  }
  return 'Payment confirmed. No further action needed.';
}

export interface AdminOrderNotificationParams {
  orderNumber: string;
  customerName: string;
  email: string;
  phone: string | null;
  items: OrderItemRecord[];
  subtotal: number;
  discountCode?: string | null;
  discountAmount?: number;
  // Automatic promotion / site-sale money off (orders.rule_discount_amount) —
  // shown as its own line so the visible sums always reconcile to the total.
  ruleDiscountAmount?: number;
  shippingLabel: string;
  shippingCost: number;
  paypalFee?: number;
  total: number;
  shippingAddress: string;
  paymentMethod: string;
  paymentStatus: AdminOrderPaymentStatus;
  createdAt: string;
  // Set by the Fena webhook when its signed payload's reported amount
  // doesn't match this order's total — surfaced as a prominent warning so a
  // mismatch (like the 2026-06-29 incident) is caught immediately instead of
  // relying on someone noticing a bank statement later.
  amountMismatchNote?: string | null;
}

// Internal "new order" notification sent to sales@windsorbeauty.co.uk once payment
// is confirmed — mirrors sendOrderConfirmationEmail's layout but adds the
// operational details staff need (phone, payment method, full order value
// breakdown, timestamp) that the customer-facing email omits.
// Pure message builder — exported so the rendered output can be inspected and
// tested without sending anything.
export function buildAdminOrderNotificationEmail(params: AdminOrderNotificationParams): { subject: string; text: string; html: string } {
  const visibleItems = displayOrderItems(params.items);
  const itemRows = visibleItems.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;font-size:13px;color:#57534e">
        ${escapeHtml(i.name)}${i.variant ? ` <span style="color:#a8a29e">(${escapeHtml(i.variant)})</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:center;font-size:13px;color:#57534e">
        ${i.quantity}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;font-size:13px;color:#57534e">
        &pound;${(Number(i.price) * i.quantity).toFixed(2)}
      </td>
    </tr>
  `).join('');

  // A discount with no code (invoice manual discount, first-order 10%) must
  // still appear in writing — condition on the amount alone.
  const discountRow = Number(params.discountAmount) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Discount${params.discountCode ? ` (${escapeHtml(params.discountCode)})` : ''}</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#b8902a">&minus;&pound;${Number(params.discountAmount).toFixed(2)}</td>
    </tr>
  ` : '';

  const ruleDiscountRow = Number(params.ruleDiscountAmount) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Promotional discount</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#b8902a">&minus;&pound;${Number(params.ruleDiscountAmount).toFixed(2)}</td>
    </tr>
  ` : '';

  const paypalFeeRow = params.paymentMethod === 'paypal' && Number(params.paypalFee) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">PayPal processing fee (3%)</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${Number(params.paypalFee).toFixed(2)}</td>
    </tr>
  ` : '';

  const paymentMethodLabel = PAYMENT_METHOD_LABELS[params.paymentMethod] ?? params.paymentMethod;
  const statusBadgeLabel = STATUS_BADGE_LABELS[params.paymentStatus];
  const statusNote = resolvePaymentStatusNote(params.paymentMethod, params.paymentStatus);
  const orderDate = new Date(params.createdAt).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">${escapeHtml(statusBadgeLabel)}</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">${escapeHtml(params.customerName)}</h1>

            ${params.amountMismatchNote ? `
            <!-- Amount mismatch warning — Fena's reported charge didn't match this order's total -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px">
              <tr>
                <td style="border:1px solid #fca5a5;background:#fef2f2;padding:12px 16px;font-size:12px;color:#991b1b;line-height:1.5;font-weight:bold">
                  AMOUNT MISMATCH: ${escapeHtml(params.amountMismatchNote)} Check this order before treating it as fully paid.
                </td>
              </tr>
            </table>
            ` : ''}

            <!-- Action note — what (if anything) staff need to do, in plain language -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px">
              <tr>
                <td style="border-left:3px solid #b8902a;background:#fefce8;padding:10px 16px;font-size:12px;color:#57534e;line-height:1.5">
                  ${escapeHtml(statusNote)}
                </td>
              </tr>
            </table>

            <!-- Order number badge -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="border:1px solid #e7dcc8;background:#fefce8;padding:10px 20px">
                  <p style="margin:0;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;margin-bottom:2px">Order Reference</p>
                  <p style="margin:0;font-size:14px;font-family:monospace;font-weight:bold;color:#b8902a;letter-spacing:0.1em">${escapeHtml(params.orderNumber)}</p>
                </td>
              </tr>
            </table>

            <!-- Customer details -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Customer Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e;width:120px">Email</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(params.email)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Phone</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${params.phone ? escapeHtml(params.phone) : 'Not given'}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Payment Method</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(paymentMethodLabel)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Date / Time</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(orderDate)}</td>
              </tr>
            </table>

            <!-- Items -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Order Items</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <thead>
                <tr>
                  <th style="text-align:left;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Product</th>
                  <th style="text-align:center;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Qty</th>
                  <th style="text-align:right;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            <!-- Totals -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Subtotal</td>
                <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${Number(params.subtotal).toFixed(2)}</td>
              </tr>
              ${ruleDiscountRow}
              ${discountRow}
              <tr>
                <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">Shipping (${escapeHtml(params.shippingLabel)})</td>
                <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">${Number(params.shippingCost) === 0 ? 'Free' : `&pound;${Number(params.shippingCost).toFixed(2)}`}</td>
              </tr>
              ${paypalFeeRow}
              <tr>
                <td colspan="2" style="padding:10px 0 6px;font-size:14px;font-weight:bold;color:#1c1917;border-top:2px solid #1a1a1a">Order Value</td>
                <td style="padding:10px 0 6px;text-align:right;font-size:14px;font-weight:bold;color:#b8902a;border-top:2px solid #1a1a1a">&pound;${Number(params.total).toFixed(2)}</td>
              </tr>
            </table>

            <!-- Delivery address -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Shipping Address</p>
            <p style="margin:0;font-size:13px;color:#57534e;line-height:1.7;white-space:pre-line">${escapeHtml(params.shippingAddress)}</p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: `New order ${params.orderNumber}`,
    headerLabel: 'New Order Received',
    bodyHtml,
    footerText: 'Internal Order Notification',
  });

  // Lead the subject with the payment method so a PayPal order is obvious at an
  // inbox glance (PayPal has no payment webhook, so staff must go and verify it).
  const subjectMethodWord =
    params.paymentMethod === 'paypal' ? 'PayPal ' :
    params.paymentMethod === 'fena' ? 'Fena ' :
    params.paymentMethod === 'bank_transfer' ? 'Bank transfer ' :
    params.paymentMethod === 'cash' ? 'Cash ' :
    params.paymentMethod === 'manual' ? 'Manual ' : '';
  const subject = `${params.amountMismatchNote ? 'AMOUNT MISMATCH: ' : ''}New ${subjectMethodWord}order ${params.orderNumber} (£${Number(params.total).toFixed(2)}), ${statusBadgeLabel}`;
  const text =
    (params.amountMismatchNote ? `AMOUNT MISMATCH: ${params.amountMismatchNote} Check this order before treating it as fully paid.\n\n` : '') +
    `New order received.\n\n` +
    `Order: ${params.orderNumber}\n` +
    `Customer: ${params.customerName}\n` +
    `Email: ${params.email}\n` +
    `Phone: ${params.phone ?? '-'}\n` +
    `Payment method: ${paymentMethodLabel}\n` +
    `Status: ${statusBadgeLabel}. ${statusNote}\n` +
    `Date: ${orderDate}\n\n` +
    `Items:\n` +
    visibleItems.map(i => `  ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}, £${(Number(i.price) * i.quantity).toFixed(2)}`).join('\n') +
    `\n\nOrder value: £${Number(params.total).toFixed(2)}\n\n` +
    `Shipping address:\n${params.shippingAddress}`;

  return { subject, text, html };
}

export async function sendAdminOrderNotificationEmail(params: AdminOrderNotificationParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const { subject, text, html } = buildAdminOrderNotificationEmail(params);

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      subject,
      text,
      html,
    }, { internal: true }); /* Internal post: not filed under a customer. */

    if (error) {
      console.error('[adminOrderNotificationEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[adminOrderNotificationEmail] send threw:', err);
    return false;
  }
}
