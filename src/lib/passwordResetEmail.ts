import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { SUPPORT_REPLY_TO } from './email/supportAddress';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

// Mirrors the FROM_ADDRESS pattern used in shippingEmail — same verified
// windsorbeauty.co.uk sending domain, distinct display name for account mail.
const FROM_ADDRESS = 'Windsor Beauty <accounts@windsorbeauty.co.uk>';

export function isPasswordResetEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

interface PasswordResetEmailParams {
  to: string;
  customerName: string;
  resetUrl: string;
}

// Sends the "reset your password" email with a time-limited link. Returns
// true on success — the caller should still respond with a generic message
// either way, so failures here must never reveal whether the account exists.
export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      // Replies reach a person. A customer answering an order or payment email was
      // writing into a void, and a From address that refuses replies is a pattern spam
      // filters associate with phishing (invoice junk-folder diagnosis, 31 July 2026).
      replyTo: SUPPORT_REPLY_TO,
      to: params.to,
      subject: 'Reset your Windsor Beauty password',
      text:
        `${emailGreeting(params.customerName)}\n\n` +
        `We received a request to reset the password for your Windsor Beauty account.\n\n` +
        `Reset your password: ${params.resetUrl}\n\n` +
        `This link will expire in one hour. If you did not request a password reset, you can safely ignore this email. Your password will not be changed.\n\n` +
        `Thanks,\nWindsor Beauty`,
      html: emailDocument({
        title: 'Reset your Windsor Beauty password',
        headerLabel: 'Password Reset',
        bodyHtml: `
        <!-- Body -->
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;">${escapeHtml(emailGreeting(params.customerName))}</p>
            <p style="margin:0 0 16px;">We received a request to reset the password for your Windsor Beauty account.</p>
            <p style="margin:0 0 16px;">
              <a href="${params.resetUrl}" style="color:#b8902a;">Reset your password &rarr;</a>
            </p>
            <p style="margin:0 0 16px;">This link will expire in one hour. If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>
            <p style="margin:0;">Thanks,<br />Windsor Beauty</p>
          </td>
        </tr>`,
      }),
    });

    if (error) {
      console.error('Resend error (password reset):', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send threw (password reset):', err);
    return false;
  }
}
