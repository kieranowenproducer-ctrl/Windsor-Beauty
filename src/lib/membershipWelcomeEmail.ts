import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

// Mirrors the FROM_ADDRESS pattern used in passwordResetEmail — same verified
// windsorbeauty.co.uk sending domain, distinct display name for account mail.
const FROM_ADDRESS = 'Windsor Beauty <accounts@windsorbeauty.co.uk>';

interface MembershipWelcomeEmailParams {
  to: string;
  customerName: string;
  discountCode: string;
  rafCode?: string;
}

// Sends the membership welcome email with the customer's 10% first-order
// code. Called only after the customer's email is verified (see
// /api/account/verify-email) — the code is never shown on-screen or sent
// any other way, so this is the customer's only way to receive it.
export async function sendMembershipWelcomeEmail(params: MembershipWelcomeEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject: 'Your 10% Windsor Beauty member code',
      text:
        `${emailGreeting(params.customerName)}\n\n` +
        `Welcome to Windsor Beauty. Your account is set up and your 10% first-order discount code is ready:\n\n` +
        `${params.discountCode}\n\n` +
        `Use it at checkout on your first order. This code is unique to your account.\n\n` +
        (params.rafCode ? `You joined by invitation, so you also have a personal 5% code for later product orders of £30 or more: ${params.rafCode}. It belongs only to your account. Use one code per order. The 10% welcome offer and the 5% code cannot be combined.\n\n` : '') +
        `Thanks,\nWindsor Beauty`,
      html: emailDocument({
        title: 'Welcome to Windsor Beauty',
        headerLabel: 'Welcome',
        bodyHtml: `
        <!-- Body -->
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;">${escapeHtml(emailGreeting(params.customerName))}</p>
            <p style="margin:0 0 16px;">Welcome to Windsor Beauty. Your account is set up and your 10% first-order discount code is ready:</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:bold;letter-spacing:1px;color:#b8902a;">${escapeHtml(params.discountCode)}</p>
            <p style="margin:0 0 16px;">Use it at checkout on your first order. This code is unique to your account.</p>
            ${params.rafCode ? `<p style="margin:0 0 16px;">You joined by invitation, so you also have a personal 5% code for later product orders of £30 or more:</p>
            <p style="margin:0 0 16px;font-size:18px;font-weight:bold;letter-spacing:1px;color:#b8902a;">${escapeHtml(params.rafCode)}</p>
            <p style="margin:0 0 16px;">This code belongs only to your account. Use one code per order. The 10% welcome offer and the 5% code cannot be combined.</p>` : ''}
            <p style="margin:0;">Thanks,<br />Windsor Beauty</p>
          </td>
        </tr>`,
      }),
    });

    if (error) {
      console.error('Resend error (membership welcome):', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send threw (membership welcome):', err);
    return false;
  }
}
