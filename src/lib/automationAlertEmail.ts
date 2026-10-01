import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { sendEmail } from '@/lib/email/send';

// Internal mail, so it uses the ops identity rather than the customer-facing
// one — same pair and same reasoning as the review and new-order notifications
// (31 July 2026 deliverability audit). sales@ is the inbox the team already
// watches for "something needs you", so an alert lands where the others do
// instead of creating a second place to check.
const FROM_ADDRESS = 'Windsor Beauty Ops <alerts@windsorbeauty.co.uk>';
const TO_ADDRESS = 'sales@windsorbeauty.co.uk';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';

// Plain-English titles. The category slug is a database value; nobody reading
// this on a phone at the weekend should have to decode it.
const CATEGORY_TITLES: Record<string, string> = {
  verification_email: 'A customer did not get their verification email',
  verification_email_bulk: 'Some verification emails failed in a bulk resend',
  customer_email: 'A customer email failed to send',
  admin_email: 'An internal notification email failed to send',
  royal_mail_dispatch: 'A Royal Mail dispatch failed',
  invoice_fulfillment: 'An invoice could not be fulfilled',
  invoice_order_sync: 'An invoice did not sync to its order',
  fena_webhook: 'A payment webhook failed',
  duplicate_account_suspected: 'Someone may have opened a second account for a second discount',
  welcome_offer_blocked: 'A customer could not use their welcome code, and is waiting on us',
  opening_offer_review: 'A welcome offer needs checking',
};

export interface AutomationAlertParams {
  category: string;
  message: string;
  /** Who or what it happened to — a customer email, an order number. */
  subject?: string | null;
  detail?: string | null;
  /** What the reader should do about it, in one sentence. */
  whatToDo?: string | null;
}

// Pure message builder — exported so the rendered output can be inspected
// without sending anything.
export function buildAutomationAlertEmail(params: AutomationAlertParams): { subject: string; text: string; html: string } {
  const title = CATEGORY_TITLES[params.category] ?? 'Something on the website failed';
  const healthUrl = `${SITE_URL}/admin/system-health`;
  const whatToDo = params.whatToDo
    ?? 'Open System Health in the admin panel to see the full record and anything else that has failed.';

  const lines = [
    title,
    '',
    params.subject ? `Who it affects: ${params.subject}` : null,
    `What happened: ${params.message}`,
    '',
    whatToDo,
    '',
    `System Health: ${healthUrl}`,
    '',
    params.detail ? `Technical detail:\n${params.detail}` : null,
    '',
    'Windsor Beauty',
  ].filter(l => l !== null);

  return {
    subject: `Windsor Beauty: ${title}`,
    text: lines.join('\n'),
    html: emailDocument({
      title,
      headerLabel: 'Needs Attention',
      preheader: params.subject ? `${title}: ${params.subject}` : title,
      bodyHtml: `
        <tr>
          <td style="padding:40px;font-size:14px;color:#44403c;line-height:1.6">
            <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1c1917;">${escapeHtml(title)}</p>
            ${params.subject ? `<p style="margin:0 0 8px;"><strong>Who it affects:</strong> ${escapeHtml(params.subject)}</p>` : ''}
            <p style="margin:0 0 24px;"><strong>What happened:</strong> ${escapeHtml(params.message)}</p>
            <p style="margin:0 0 24px;">${escapeHtml(whatToDo)}</p>
            <p style="margin:0 0 24px;">
              <a href="${healthUrl}" style="display:inline-block;background:#AD8E54;color:#ffffff;font-size:12px;letter-spacing:0.05em;text-transform:uppercase;padding:12px 28px;text-decoration:none;">Open System Health</a>
            </p>
            ${params.detail ? `<p style="margin:0 0 8px;font-size:11px;color:#78716c;">Technical detail</p><pre style="margin:0 0 16px;padding:12px;background:#fafaf9;border:1px solid #e7e5e4;font-size:11px;color:#57534e;white-space:pre-wrap;">${escapeHtml(params.detail)}</pre>` : ''}
            <p style="margin:0;">Windsor Beauty</p>
          </td>
        </tr>`,
    }),
  };
}

export async function sendAutomationAlertEmail(params: AutomationAlertParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const { subject, text, html } = buildAutomationAlertEmail(params);

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      subject,
      text,
      html,
    }, { internal: true }); /* Internal post: not filed under a customer. */
    if (error) {
      console.error('Resend error (automation alert):', error);
      return false;
    }
    return true;
  } catch (err) {
    // Never rethrow: this is the alert about a failure, and it must not become
    // a second failure that takes down the flow it is reporting on.
    console.error('Resend send threw (automation alert):', err);
    return false;
  }
}
