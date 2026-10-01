import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { emailDocument, escapeHtml } from './email/shared';
import { sendEmail } from './email/send';
import { emailGreeting } from './email/greeting';

const FROM_ADDRESS = 'Windsor Beauty <orders@windsorbeauty.co.uk>';

export async function sendPaymentResumeEmail(params: {
  to: string; customerName: string; orderNumber: string; total: number; resumeUrl: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  const subject = `Complete your Windsor Beauty payment for order ${params.orderNumber}`;
  const text = `${emailGreeting(params.customerName)}\n\nYour order ${params.orderNumber} is reserved but payment has not been confirmed.\n\nComplete payment securely: ${params.resumeUrl}\n\nTotal due: £${params.total.toFixed(2)}\n\nThe reservation expires 48 hours after the order was placed. If you have already paid, please do not pay again. Reply to this email and we will check it.\n\nWindsor Beauty`;

  /* Rendered through the shared document, so it carries the same header and footer as every
   * other email. */
  const html = emailDocument({
    title: 'Complete your payment',
    headerLabel: 'Payment reminder',
    bodyHtml: `
      <tr>
        <td style="padding:40px 40px 32px;font-family:Arial,sans-serif;color:#57534e">
          <h1 style="margin:0 0 20px;font-size:24px;font-weight:normal;color:#1c1917">Complete your payment</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7">${escapeHtml(emailGreeting(params.customerName))} your order <strong>${escapeHtml(params.orderNumber)}</strong> is reserved but payment has not been confirmed.</p>
          <p style="margin:0 0 20px;font-size:22px;color:#1c1917">£${params.total.toFixed(2)}</p>
          <p style="margin:0 0 20px"><a href="${escapeHtml(params.resumeUrl)}" style="display:inline-block;background:#AD8E54;color:#fff;padding:14px 24px;text-decoration:none;font-size:14px">Complete payment securely</a></p>
          <p style="margin:0;font-size:12px;line-height:1.7;color:#78716c">The reservation expires 48 hours after the order was placed. If you have already paid, please do not pay again. Reply to this email and we will check it.</p>
        </td>
      </tr>`,
  });

  try {
    const { id, error } = await sendEmail({
      from: FROM_ADDRESS, replyTo: SUPPORT_REPLY_TO, to: params.to, subject, text, html,
    }, {
      // Filed under the customer automatically (task ce308493).
      filing: { orderRef: params.orderNumber, emailType: 'payment_reminder' },
    });
    if (error || !id) return false;
    return true;
  } catch { return false; }
}
