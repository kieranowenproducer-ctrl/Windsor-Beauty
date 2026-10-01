import type { OrderItemRecord } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { emailGreeting } from './email/greeting';

// Sent to customers who chose PayPal at checkout
// (see src/app/api/payment/paypal/instructions/route.ts). It can use its own
// Resend key (RESEND_API_KEY_PAYPAL), so do not change the sending address
// without confirming that key is authorised for it.
const FROM_ADDRESS = 'Windsor Beauty <sales@windsorbeauty.co.uk>';

export interface PaypalInstructionsParams {
  to: string;
  customerName: string;
  orderNumber: string;
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
}

/**
 * Builds the PayPal payment URL for this order.
 *
 * Priority:
 *   1. PAYPAL_ME_URL env var (e.g. https://paypal.me/yourname) → appends /{amount}GBP
 *   2. PAYPAL_RECEIVING_EMAIL env var → classic PayPal send-money link (pre-fills amount + reference)
 *   3. Fallback text with no clickable link (tells customer to send manually)
 */
export function buildPaypalLink(orderNumber: string, total: number): string {
  const meUrl = process.env.PAYPAL_ME_URL?.replace(/\/$/, '');
  if (meUrl) {
    return `${meUrl}/${total.toFixed(2)}GBP`;
  }

  const email = process.env.PAYPAL_RECEIVING_EMAIL;
  if (email) {
    const params = new URLSearchParams({
      cmd:           '_xclick',
      business:      email,
      item_name:     `Windsor Beauty Order ${orderNumber}`,
      amount:        total.toFixed(2),
      currency_code: 'GBP',
      no_shipping:   '1',
    });
    return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`;
  }

  return '';
}

// Uses its own API key when one is set, and the main key otherwise.
const RESEND_API_KEY = process.env.RESEND_API_KEY_PAYPAL || process.env.RESEND_API_KEY;

export async function sendPaypalInstructionsEmail(params: PaypalInstructionsParams): Promise<boolean> {
  if (!RESEND_API_KEY) return false;

  const paypalLink = buildPaypalLink(params.orderNumber, params.total);
  const paypalEmail = process.env.PAYPAL_RECEIVING_EMAIL ?? 'sales@windsorbeauty.co.uk';

  const itemRows = params.items.map(i => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;font-size:13px;color:#57534e">
        ${escapeHtml(i.name)}${i.variant ? ` <span style="color:#a8a29e">(${escapeHtml(i.variant)})</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:center;font-size:13px;color:#57534e">${i.quantity}</td>
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

  const paypalFeeRow = Number(params.paypalFee) > 0 ? `
    <tr>
      <td colspan="2" style="padding:6px 0;font-size:12px;color:#a8a29e">PayPal processing fee (3.5%)</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${Number(params.paypalFee).toFixed(2)}</td>
    </tr>
  ` : '';

  const paypalButtonHtml = paypalLink ? `
    <tr>
      <td style="padding:24px 0 8px;text-align:center">
        <a href="${escapeHtml(paypalLink)}"
           style="display:inline-block;background:#0070ba;color:#ffffff;font-size:14px;font-weight:bold;
                  padding:14px 36px;text-decoration:none;border-radius:4px;letter-spacing:0.02em">
          Pay &pound;${params.total.toFixed(2)} via PayPal &rarr;
        </a>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 0 0;text-align:center;font-size:11px;color:#a8a29e">
        Button not working? Copy this link into your browser:<br>
        <span style="font-size:10px;word-break:break-all;color:#78716c">${escapeHtml(paypalLink)}</span>
      </td>
    </tr>
  ` : `
    <tr>
      <td style="padding:24px 0 8px;text-align:center;font-size:13px;color:#57534e">
        Send &pound;${params.total.toFixed(2)} GBP via PayPal to:<br>
        <strong style="font-size:14px;color:#0070ba">${escapeHtml(paypalEmail)}</strong>
      </td>
    </tr>
  `;

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 0">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#b8902a">One Step Left</p>
            <h1 style="margin:0 0 16px;font-size:26px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">
              Complete your payment via PayPal
            </h1>
            <p style="margin:0 0 24px;font-size:13px;color:#57534e;line-height:1.6">
              ${escapeHtml(emailGreeting(params.customerName))} your order has been reserved.
              Click the button below to complete your payment through PayPal.
              Your order will be prepared once payment is received.
            </p>

            <!-- Order reference -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <td style="border:1px solid #e7dcc8;background:#fefce8;padding:10px 20px">
                  <p style="margin:0;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;margin-bottom:2px">Your Order Reference</p>
                  <p style="margin:0;font-size:14px;font-family:monospace;font-weight:bold;color:#b8902a;letter-spacing:0.1em">${escapeHtml(params.orderNumber)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- PayPal button -->
        <tr>
          <td style="padding:0 40px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #0070ba;background:#f0f8ff">
              <tr>
                <td style="padding:20px 24px 0;text-align:center">
                  <p style="margin:0;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#0070ba;font-weight:bold">
                    Pay Securely via PayPal
                  </p>
                </td>
              </tr>
              ${paypalButtonHtml}
              <tr>
                <td style="padding:16px 24px 20px;text-align:center">
                  <p style="margin:0;font-size:11px;color:#a8a29e;line-height:1.5">
                    When paying, your name and order reference
                    <strong style="color:#78716c">${escapeHtml(params.orderNumber)}</strong>
                    will help us match your payment automatically.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Order summary -->
        <tr>
          <td style="padding:32px 40px 0">
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Order Summary</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
              <thead>
                <tr>
                  <th style="text-align:left;font-size:9px;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Product</th>
                  <th style="text-align:center;font-size:9px;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Qty</th>
                  <th style="text-align:right;font-size:9px;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
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
                <td colspan="2" style="padding:10px 0 6px;font-size:15px;font-weight:bold;color:#1c1917;border-top:2px solid #1a1a1a">Total Due</td>
                <td style="padding:10px 0 6px;text-align:right;font-size:15px;font-weight:bold;color:#0070ba;border-top:2px solid #1a1a1a">&pound;${Number(params.total).toFixed(2)}</td>
              </tr>
            </table>

            <p style="margin:0 0 32px;font-size:12px;color:#a8a29e;line-height:1.6;background:#fefce8;border:1px solid #e7dcc8;padding:12px 16px">
              <strong style="color:#57534e">Important:</strong> Your order is reserved but will only be confirmed once payment is received.
              If payment is not received within 48 hours, the reservation will be released.
            </p>

            <p style="margin:0 0 32px;font-size:12px;color:#a8a29e;line-height:1.6">
              Any questions, just reply to this email, or contact
              <a href="mailto:sales@windsorbeauty.co.uk" style="color:#b8902a;text-decoration:none">sales@windsorbeauty.co.uk</a>
              and include your order reference <strong style="color:#78716c">${escapeHtml(params.orderNumber)}</strong>.
            </p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: `Complete your payment for order ${params.orderNumber}`,
    headerLabel: 'Complete Your Payment',
    bodyHtml,
    footerBrandLine: 'Windsor Beauty',
  });

  try {
    const { id, error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject: `Complete your Windsor Beauty payment for order ${params.orderNumber}`,
      text:
        `${emailGreeting(params.customerName)}\n\n` +
        `Your Windsor Beauty order ${params.orderNumber} has been reserved.\n\n` +
        `To complete your order, please send £${params.total.toFixed(2)} GBP via PayPal.\n\n` +
        (paypalLink ? `PayPal payment link: ${paypalLink}\n\n` : `PayPal email: ${paypalEmail}\n\n`) +
        `Order reference: ${params.orderNumber}\n` +
        `Total due: £${params.total.toFixed(2)}\n\n` +
        `Items:\n` +
        params.items.map(i => `  ${i.name}${i.variant ? ` (${i.variant})` : ''} x${i.quantity}`).join('\n') +
        `\n\nYour order will be confirmed once payment is received.\n\n` +
        `Any questions, just reply to this email, or contact sales@windsorbeauty.co.uk and include your order reference ${params.orderNumber}.`,
      html,
    }, {
      apiKey: RESEND_API_KEY,
      // Filed under the customer automatically (task ce308493), same as every other email.
      filing: { orderRef: params.orderNumber, emailType: 'payment_link' },
    });

    if (error) {
      console.error('[paypalInstructionsEmail] Resend error:', error);
      return false;
    }
    if (id) {
    }
    return true;
  } catch (err) {
    console.error('[paypalInstructionsEmail] send threw:', err);
    return false;
  }
}
