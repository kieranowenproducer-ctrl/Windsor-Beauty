import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { sendEmail } from '@/lib/email/send';

// INTERNAL mail, so it uses the ops identity rather than the customer-facing one —
// the same pair the new-order notification uses, for the same reason: internal mail is
// never opened by the people whose engagement builds the customer-facing address's
// reputation. Decided in the 31 July 2026 deliverability audit.
const FROM_ADDRESS = 'Windsor Beauty Ops <alerts@windsorbeauty.co.uk>';
const TO_ADDRESS = 'sales@windsorbeauty.co.uk';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';

export interface ReviewNotificationParams {
  reviewId: number;
  customerName: string;
  /** The account the review was left from, so a suspect review can be traced. */
  customerEmail?: string | null;
  rating: number;
  title: string | null;
  body: string;
  /** Display name of the product reviewed, or null for a review of the shop as a whole. */
  productName?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

// A review arrives unapproved and stays invisible to customers until someone
// approves it, so this email exists to say that out loud the moment it lands.
// It carries the review in full: the point is to be able to judge it from a
// phone and only open the admin panel to press the button.
// Pure message builder — exported so the rendered output can be inspected and
// tested without sending anything.
export function buildReviewNotificationEmail(params: ReviewNotificationParams): { subject: string; text: string; html: string } {
  const stars = '★'.repeat(Math.max(0, Math.min(5, params.rating))) + '☆'.repeat(Math.max(0, 5 - params.rating));
  const submitted = new Date(params.createdAt).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const approveUrl = `${SITE_URL}/admin/reviews`;
  const about = params.productName ? `${params.productName}` : 'Windsor Beauty';

  const bodyHtml = `
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px">
            <p style="margin:0 0 6px;font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:#AD8E54">Waiting for Approval</p>
            <h1 style="margin:0 0 20px;font-size:28px;font-weight:normal;color:#1c1917;letter-spacing:0.02em">New customer review</h1>

            <!-- Action note — what needs doing, in plain language -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px">
              <tr>
                <td style="border-left:3px solid #AD8E54;background:#fefce8;padding:10px 16px;font-size:12px;color:#57534e;line-height:1.5">
                  This review is not on the website yet. Nothing shows to customers until you approve it in the admin panel.
                </td>
              </tr>
            </table>

            <!-- The review itself -->
            <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px">
              <tr>
                <td style="border:1px solid #e7dcc8;padding:20px">
                  <p style="margin:0 0 8px;font-size:18px;color:#AD8E54;letter-spacing:0.12em">${stars} <span style="font-size:12px;color:#a8a29e;letter-spacing:0">${params.rating} out of 5</span></p>
                  ${params.title ? `<p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#1c1917">${escapeHtml(params.title)}</p>` : ''}
                  <p style="margin:0 0 14px;font-size:13px;color:#57534e;line-height:1.6;white-space:pre-wrap">${escapeHtml(params.body)}</p>
                  ${params.imageUrl ? `
                  <p style="margin:0 0 14px">
                    <img src="${escapeHtml(params.imageUrl)}" alt="Photo submitted with this review" width="240" style="display:block;max-width:240px;height:auto;border:1px solid #e7e5e4" />
                  </p>` : ''}
                  <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#78716c">${escapeHtml(params.customerName)}</p>
                </td>
              </tr>
            </table>

            <!-- Details -->
            <p style="margin:0 0 10px;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a8a29e;border-bottom:1px solid #e7e5e4;padding-bottom:8px">Details</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e;width:120px">About</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(about)}</td>
              </tr>
              ${params.customerEmail ? `
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Account</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(params.customerEmail)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Submitted</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">${escapeHtml(submitted)}</td>
              </tr>
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#a8a29e">Reference</td>
                <td style="padding:4px 0;font-size:13px;color:#57534e">Review #${params.reviewId}</td>
              </tr>
            </table>

            <!-- Approve -->
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:#AD8E54">
                  <a href="${approveUrl}" style="display:inline-block;padding:14px 32px;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:#ffffff;text-decoration:none;font-weight:bold">Review and approve</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0;font-size:11px;color:#a8a29e">Opens the Reviews page in the admin panel, on the list of everything waiting.</p>
          </td>
        </tr>
  `;

  const text = [
    `NEW CUSTOMER REVIEW - WAITING FOR APPROVAL`,
    ``,
    `${params.rating} out of 5${params.title ? ` - ${params.title}` : ''}`,
    ``,
    params.body,
    ``,
    `By: ${params.customerName}`,
    `About: ${about}`,
    ...(params.customerEmail ? [`Account: ${params.customerEmail}`] : []),
    `Submitted: ${submitted}`,
    `Reference: Review #${params.reviewId}`,
    ...(params.imageUrl ? [`Photo: ${params.imageUrl}`] : []),
    ``,
    `This review is not on the website yet. Approve it here: ${approveUrl}`,
  ].join('\n');

  return {
    subject: `Review waiting for approval: ${params.rating}/5 from ${params.customerName}`,
    text,
    html: emailDocument({
      title: 'New customer review',
      headerLabel: 'Admin Notification',
      bodyHtml,
      preheader: `${params.rating} out of 5 from ${params.customerName}, waiting for your approval.`,
      footerText: 'Internal notification from the Windsor Beauty website.',
    }),
  };
}

export async function sendReviewNotificationEmail(params: ReviewNotificationParams): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const { subject, text, html } = buildReviewNotificationEmail(params);

  try {
    const { error } = await sendEmail({
      from: FROM_ADDRESS,
      to: TO_ADDRESS,
      subject,
      text,
      html,
    }, { internal: true }); /* Internal post: not filed under a customer. */

    if (error) {
      console.error('[reviewNotificationEmail] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[reviewNotificationEmail] send threw:', err);
    return false;
  }
}
