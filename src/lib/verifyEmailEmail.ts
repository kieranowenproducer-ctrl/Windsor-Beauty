import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { EMAIL_VERIFICATION_TOKEN_HOURS } from '@/lib/auth';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

// Mirrors the FROM_ADDRESS pattern used in passwordResetEmail/membershipWelcomeEmail.
const FROM_ADDRESS = 'Windsor Beauty <accounts@windsorbeauty.co.uk>';
// A monitored inbox — a transactional sender with no working reply path is a
// negative engagement signal to Gmail/Outlook and strands confused customers.
const REPLY_TO = 'sales@windsorbeauty.co.uk';

export function isVerifyEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

interface VerifyEmailParams {
  to: string;
  customerName: string;
  verifyUrl: string;
  /**
   * 'initial'  — sent at signup.
   * 'reminder' — the single automatic follow-up for accounts still
   *              unverified after the first window (see
   *              /api/cron/verification-reminders). Different subject +
   *              copy so it reads as a deliberate final notice, and so the
   *              two sends never look like an accidental duplicate.
   */
  variant?: 'initial' | 'reminder';
  /**
   * Their 10% member code, included in the body.
   *
   * ONLY ever set for an admin-initiated resend. On a public sign-up the code deliberately stays
   * behind the link, because otherwise anyone can farm codes with addresses they do not own. A
   * member of staff pressing a button for a named customer is not that, and the whole reason they
   * are pressing it is that the normal route has already failed this person once. Making them
   * clear the same hurdle a second time would defeat the point.
   */
  discountCode?: string | null;
}

// Sent at signup (both /account/register and the Coming Soon
// /api/launch/subscribe) and again once by the reminder cron. The 10%
// discount code is deliberately NOT included anywhere until the link below
// is clicked — see /api/account/verify-email for where the code is issued.
//
// Deliverability notes (audit 2026-07-07): subject deliberately avoids
// promo-scented wording ("claim", "10%", "code") — the discount is explained
// in the body instead; a plain-text part is always included; reply-to points
// at a monitored inbox. Domain-level auth (SPF/DKIM/DMARC) is DNS-side —
// see the audit report for the records.
export async function sendVerifyEmail(params: VerifyEmailParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const hours = EMAIL_VERIFICATION_TOKEN_HOURS;
  const isReminder = params.variant === 'reminder';

  const subject = isReminder
    ? 'Reminder: confirm your email to activate your Windsor Beauty account'
    : 'Confirm your email address for Windsor Beauty';
  const preheader = isReminder
    ? `Final reminder. Your new verification link is valid for ${hours} hours.`
    : `One click to activate your account. Your link is valid for ${hours} hours.`;

  const introText = isReminder
    ? `This is a friendly final reminder from Windsor Beauty. You created a member account but have not yet verified your email address, so we have generated a fresh verification link for you.`
    : `Thanks for creating a Windsor Beauty account. Please verify your email address to activate your account and unlock your first-order member discount.`;

  const code = params.discountCode ?? null;
  const codeIntro = code
    ? `Here is your 10% member discount code. You can use it on your first order straight away, whether or not you click the link below.`
    : '';
  // With the code already in their hands, verifying is about the account rather than the reward,
  // so the link is described honestly instead of dangling something they have already been given.
  const codeVerifyLine = code
    ? `Please still confirm your email address using the button below. It is what lets us send you order confirmations and tracking.`
    : '';

  const expiryLine = `This link will expire in ${hours} hours. If you did not create this account, you can safely ignore this email.`;
  const spamLine = `Tip: if our emails are not in your inbox, please check your spam or junk folder and mark us as safe so your discount code arrives correctly.`;
  const reminderClosing = isReminder
    ? `This is the last automatic reminder we will send. You can also request a new link at any time by logging in at windsorbeauty.co.uk/account.`
    : '';

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to: params.to,
      replyTo: REPLY_TO,
      subject,
      text:
        `${emailGreeting(params.customerName)}\n\n` +
        `${introText}\n\n` +
        (code ? `${codeIntro}\n\nYour code: ${code}\n\n${codeVerifyLine}\n\n` : '') +
        `Verify your email: ${params.verifyUrl}\n\n` +
        `${expiryLine}\n\n` +
        `${spamLine}\n\n` +
        (reminderClosing ? `${reminderClosing}\n\n` : '') +
        `Thanks,\nWindsor Beauty`,
      html: emailDocument({
        title: isReminder ? 'Reminder: verify your email' : 'Verify your email',
        headerLabel: isReminder ? 'Verification Reminder' : 'Verify Your Email',
        preheader,
        bodyHtml: `
        <!-- Body -->
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;">${escapeHtml(emailGreeting(params.customerName))}</p>
            <p style="margin:0 0 16px;">${escapeHtml(introText)}</p>
            ${code ? `
            <p style="margin:0 0 12px;">${escapeHtml(codeIntro)}</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
              <tr><td style="border:1px solid #e7e5e4;background:#fafaf9;padding:14px 24px;font-family:monospace;font-size:18px;letter-spacing:0.08em;color:#1c1917;">${escapeHtml(code)}</td></tr>
            </table>
            <p style="margin:0 0 24px;">${escapeHtml(codeVerifyLine)}</p>` : ''}
            <p style="margin:0 0 24px;">
              <a href="${params.verifyUrl}" style="display:inline-block;background:#AD8E54;color:#ffffff;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;padding:12px 28px;text-decoration:none;">Verify Email Address</a>
            </p>
            <p style="margin:0 0 16px;"><strong>${escapeHtml(expiryLine)}</strong></p>
            <p style="margin:0 0 16px;font-size:12px;color:#78716c;">${escapeHtml(spamLine)}</p>
            ${reminderClosing ? `<p style="margin:0 0 16px;font-size:12px;color:#78716c;">${escapeHtml(reminderClosing)}</p>` : ''}
            <p style="margin:0;">Thanks,<br />Windsor Beauty</p>
          </td>
        </tr>`,
      }),
    });

    if (error) {
      console.error('Resend error (verify email):', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send threw (verify email):', err);
    return false;
  }
}
