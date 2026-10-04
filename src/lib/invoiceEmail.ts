import { beautyOperationalAddress } from '@/lib/operationalAddress';
import type { InvoiceLineItem } from '@/lib/db';
import { INVOICE_PAYPAL_FEE_PERCENT } from '@/lib/invoices';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

// Same brand pattern as orderConfirmationEmail.ts/adminOrderNotificationEmail.ts
// (inline-CSS HTML table layout, same colours, Resend, same from-address).
// It is its own template rather than a reuse of paypalInstructionsEmail.ts's
// HTML, because that one has a different single-button layout.
const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.is>';

export interface SendInvoiceEmailParams {
  to: string;
  customerName: string;
  invoiceNumber: string;
  orderNumber: string;
  subject?: string | null;
  message?: string | null;
  footerText?: string | null;
  customerNotes?: string | null;
  lineItems: InvoiceLineItem[];
  shippingLabel?: string | null;
  shippingAmount: number;
  discountCode?: string | null;
  discountAmount: number;
  subtotal: number;
  total: number;
  dueDate?: string | null;
  fenaPaymentUrl: string | null;
  /** The customer-facing /pay/<token> page , where the T&C acknowledgement
   *  and the actual payment buttons live (audit 2026-07-07). */
  payUrl: string;
  /** No longer embedded in the email; see the note where the pixel used to be rendered.
   *  Kept on the type so the existing caller and any stored drafts keep compiling. */
  viewPixelUrl?: string;
}

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY_BEAUTY_IS?.trim()) return false;

  try {
    const { error } = await sendEmail(buildInvoiceEmail(params));

    if (error) {
      console.error('[invoiceEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[invoiceEmail] send threw:', err);
    return false;
  }
}

export function buildInvoiceEmail(params: SendInvoiceEmailParams) {

  // Permanent URL , works pre-launch too (wall-exempt in proxy.ts) and
  // is unchanged at launch, so the emailed terms link never goes stale.
  const siteUrl = beautyOperationalAddress(process.env.NEXT_PUBLIC_SITE_URL) || 'https://www.windsorbeauty.is';
  const termsUrl = `${siteUrl}/terms`;

  // Trial lines lose their name before anything is drawn (task ae168547).
  const lineItems = anonymiseTrialLines(params.lineItems);
  const itemRows = lineItems.map((item) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;font-size:13px;color:#57534e">
        ${escapeHtml(item.name)}${item.description ? `<br><span style="font-size:11px;color:#a8a29e">${escapeHtml(item.description)}</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:center;font-size:13px;color:#57534e">${item.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;font-size:13px;color:#57534e">&pound;${item.unitPrice.toFixed(2)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e7e5e4;text-align:right;font-size:13px;color:#57534e">&pound;${item.lineTotal.toFixed(2)}</td>
    </tr>
  `).join('');

  const discountRow = params.discountAmount > 0 ? `
    <tr>
      <td colspan="3" style="padding:6px 0;font-size:12px;color:#a8a29e">Discount${params.discountCode ? ` (${escapeHtml(params.discountCode)})` : ''}</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#A9695D">&minus;&pound;${params.discountAmount.toFixed(2)}</td>
    </tr>
  ` : '';

  const shippingRow = params.shippingAmount > 0 || params.shippingLabel ? `
    <tr>
      <td colspan="3" style="padding:6px 0;font-size:12px;color:#a8a29e">Shipping${params.shippingLabel ? ` (${escapeHtml(params.shippingLabel)})` : ''}</td>
      <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">${params.shippingAmount === 0 ? 'Free' : `&pound;${params.shippingAmount.toFixed(2)}`}</td>
    </tr>
  ` : '';

  // One button, one destination: the /pay/<token> page hosts the Terms &
  // Conditions acknowledgement and both payment methods (bank + PayPal).
  // Direct pay links were removed from the email deliberately , a customer
  // must pass the T&C checkbox before any payment button unlocks.
  const payButtonsHtml = `
    <tr>
      <td style="padding:0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:8px 0 4px;text-align:center">
              <a href="${escapeHtml(params.payUrl)}"
                 style="display:inline-block;background:#A9695D;color:#ffffff;font-size:13px;font-weight:bold;
                        padding:14px 36px;text-decoration:none;letter-spacing:0.02em">
                Review &amp; Pay &pound;${params.total.toFixed(2)} &rarr;
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 4px;text-align:center;font-size:11px;color:#57534e;line-height:1.6">
              Pay securely by bank transfer (no fee) or PayPal
              (+${INVOICE_PAYPAL_FEE_PERCENT}% processing fee).
            </td>
          </tr>
          <tr>
            <td style="padding:4px 24px 0;text-align:center;font-size:10px;color:#a8a29e;line-height:1.6">
              By completing this payment, you confirm that you have read and agree to the
              Windsor Beauty Terms &amp; Conditions.<br />
              <a href="${escapeHtml(termsUrl)}" style="color:#A9695D;text-decoration:underline">Read Terms &amp; Conditions</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 0">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#A9695D">${escapeHtml(params.subject || 'Invoice')}</p>
            <h1 style="margin:0 0 20px;font-size:26px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">${escapeHtml(emailGreeting(params.customerName))}</h1>
            ${params.message ? `<p style="margin:0 0 24px;font-size:13px;color:#57534e;line-height:1.6;white-space:pre-line">${escapeHtml(params.message)}</p>` : ''}

            <!-- Invoice number / due date -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <td style="border:1px solid #e7dcc8;background:#fefce8;padding:10px 20px">
                  <p style="margin:0;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;margin-bottom:2px">Invoice Number</p>
                  <p style="margin:0;font-size:14px;font-family:monospace;font-weight:bold;color:#A9695D;letter-spacing:0.1em">${escapeHtml(params.invoiceNumber)}</p>
                  ${params.dueDate ? `<p style="margin:6px 0 0;font-size:11px;color:#a8a29e">Due ${escapeHtml(params.dueDate)}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Payment buttons -->
        <tr>
          <td style="padding:0 40px 8px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #3A2630;background:#fafaf9">
              <tr>
                <td style="padding:16px 24px 0;text-align:center">
                  <p style="margin:0;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#1c1917;font-weight:bold">Choose a Payment Method</p>
                </td>
              </tr>
              ${payButtonsHtml}
              <tr><td style="padding:0 24px 16px"></td></tr>
            </table>
          </td>
        </tr>

        <!-- Line items -->
        <tr>
          <td style="padding:32px 40px 0">
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Invoice Items</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
              <thead>
                <tr>
                  <th style="text-align:left;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Item</th>
                  <th style="text-align:center;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Qty</th>
                  <th style="text-align:right;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Unit</th>
                  <th style="text-align:right;font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;padding-bottom:8px;font-weight:normal">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
              <tr>
                <td colspan="3" style="padding:6px 0;font-size:12px;color:#a8a29e">Subtotal</td>
                <td style="padding:6px 0;text-align:right;font-size:12px;color:#57534e">&pound;${params.subtotal.toFixed(2)}</td>
              </tr>
              ${discountRow}
              ${shippingRow}
              <tr>
                <td colspan="3" style="padding:10px 0 6px;font-size:14px;font-weight:bold;color:#1c1917;border-top:2px solid #3A2630">Total Due</td>
                <td style="padding:10px 0 6px;text-align:right;font-size:14px;font-weight:bold;color:#A9695D;border-top:2px solid #3A2630">&pound;${params.total.toFixed(2)}</td>
              </tr>
            </table>

            ${params.customerNotes ? `
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Notes</p>
            <p style="margin:0 0 32px;font-size:13px;color:#57534e;line-height:1.7;white-space:pre-line">${escapeHtml(params.customerNotes)}</p>
            ` : ''}

            <p style="margin:0;font-size:12px;color:#a8a29e;line-height:1.6">
              Any questions about this invoice, just reply to this email, or contact
              <a href="mailto:sales@windsorbeauty.is" style="color:#A9695D;text-decoration:none">sales@windsorbeauty.is</a>
              quoting your invoice reference <strong style="color:#78716c">${escapeHtml(params.invoiceNumber)}</strong>.
            </p>
          </td>
        </tr>`;

  const html = emailDocument({
    title: `Invoice ${params.invoiceNumber}`,
    headerLabel: 'Invoice',
    bodyHtml,
    footerText: params.footerText,
    // NO TRACKING PIXEL. There used to be an invisible 1x1 image here to detect opens.
    // On a payment request that is one of the strongest spam signals there is, and Microsoft
    // in particular weights it heavily: a customer's invoice landed in junk on 31 July 2026.
    // Nothing is lost by removing it. The "viewed" status is also set when the customer opens
    // the /pay page (see api/invoices/[token]/route.ts), which is a real signal rather than a
    // guess, and the pixel's own comment admitted most clients block remote images anyway.
  });


  return {
      from: FROM_ADDRESS,
      // Replies reach a real mailbox. Without this a customer answering an invoice is
      // writing into a void, and a From address that cannot be replied to is a pattern
      // spam filters associate with phishing.
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject: `Invoice ${params.invoiceNumber} from Windsor Beauty`,
      text:
        `${emailGreeting(params.customerName)}\n\n` +
        (params.message ? `${params.message}\n\n` : '') +
        `Invoice ${params.invoiceNumber}, total due £${params.total.toFixed(2)}.\n\n` +
        `Items:\n` +
        lineItems.map(i => `  ${i.name} x${i.quantity}, £${i.lineTotal.toFixed(2)}`).join('\n') +
        `\n\n` +
        `Review and pay securely here: ${params.payUrl}\n` +
        `(Bank transfer has no fee; PayPal adds a ${INVOICE_PAYPAL_FEE_PERCENT}% processing fee.)\n\n` +
        `By completing this payment, you confirm that you have read and agree to the Windsor Beauty Terms & Conditions: ${termsUrl}\n` +
        `\nAny questions about this invoice, just reply to this email, or contact ` +
        `sales@windsorbeauty.is quoting your invoice reference ${params.invoiceNumber}.`,
      html,
    };
}
