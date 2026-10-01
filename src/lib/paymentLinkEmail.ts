import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

const FROM_ADDRESS = 'Windsor Glow <orders@windsorglow.com>';

// Sends a customer their bank payment link again (task d0d5effb).
//
// The case it exists for, in the customer's own words: "I've gone to make the
// bank transfer but lost the page and now can't get back to make payment."
// Until now there was nothing to send her. The checkout hands the Fena link
// straight to the browser and keeps no copy, and the order page shows a status
// with no way to pay from it, so a closed tab ended the order.
//
// Deliberately short, and deliberately does NOT list what was ordered. The
// order confirmation does that once the money lands; this is one job, one
// button, and nothing in it that has to be kept in step with the catalogue.
export interface PaymentLinkEmailParams {
  to: string;
  customerName: string;
  orderNumber: string;
  total: number;
  paymentUrl: string;
}

export async function sendPaymentLinkEmail(params: PaymentLinkEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const amount = `£${Number(params.total).toFixed(2)}`;
  const subject = `Your payment link for order ${params.orderNumber}`;

  const text =
    `${emailGreeting(params.customerName)}\n\n` +
    `Here is the payment link for your Windsor Glow order ${params.orderNumber}, for ${amount}.\n\n` +
    `${params.paymentUrl}\n\n` +
    `The link opens your own banking app or website to approve the payment. ` +
    `Nothing is taken until you approve it.\n\n` +
    `If the link has stopped working, or anything else goes wrong, just reply to this email ` +
    `and we will send you a new one.\n\n` +
    `Thanks,\nWindsor Glow`;

  try {
    const { id, error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. This email is the one a customer is most likely
      // to answer, because they are already stuck.
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject,
      text,
      html: emailDocument({
        title: subject,
        headerLabel: 'Your Payment Link',
        preheader: `Pay ${amount} for order ${escapeHtml(params.orderNumber)}`,
        bodyHtml: `
        <!-- Body -->
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;">${escapeHtml(emailGreeting(params.customerName))}</p>
            <p style="margin:0 0 24px;">
              Here is the payment link for your order
              <strong>${escapeHtml(params.orderNumber)}</strong>, for <strong>${amount}</strong>.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${escapeHtml(params.paymentUrl)}"
                 style="display:inline-block;background:#b8902a;color:#ffffff;text-decoration:none;padding:14px 28px;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600">
                Pay ${amount}
              </a>
            </p>
            <p style="margin:0 0 16px;color:#57534e;">
              The link opens your own banking app or website to approve the payment.
              Nothing is taken until you approve it.
            </p>
            <p style="margin:0 0 16px;color:#57534e;">
              If the button does not work, copy this into your browser:<br />
              <span style="word-break:break-all;color:#b8902a;">${escapeHtml(params.paymentUrl)}</span>
            </p>
            <p style="margin:0 0 16px;color:#57534e;">
              If the link has stopped working, or anything else goes wrong, just reply to this
              email and we will send you a new one.
            </p>
            <p style="margin:0;">Thanks,<br />Windsor Glow</p>
          </td>
        </tr>`,
      }),
    }, {
      // Filed under the customer automatically (task ce308493). This says which order it is
      // about and what kind of email it is, so the history reads as English and the orders
      // screen can find the very email it sent.
      filing: { orderRef: params.orderNumber, emailType: 'payment_link' },
    });

    if (error) {
      console.error('[paymentLinkEmail] Resend error:', error);
      return false;
    }
    if (id) {
    }
    return true;
  } catch (err) {
    console.error('[paymentLinkEmail] send threw:', err);
    return false;
  }
}
