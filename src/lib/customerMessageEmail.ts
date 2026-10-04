import { EMAIL_COLORS, emailDocument, escapeHtml } from '@/lib/email/shared';
import { resolveAdminSender, type AdminSender } from '@/lib/email/adminSenders';
import { getReplyCaptureAddress } from '@/lib/replyCapture';
import { sendEmail } from '@/lib/email/send';
import { emailGreeting } from './email/greeting';

// A single message typed by hand in the dashboard and sent to one customer (task bc9b6309).
//
// This is a SERVICE message, not marketing, and the difference is not cosmetic:
//   - No unsubscribe link and no List-Unsubscribe headers. Those belong on bulk mail. A person
//     who unsubscribed from the newsletter must still be told their parcel is delayed.
//   - No campaign record, because there is no campaign.
//   - No "do not reply" footer unless the no-reply address was actually chosen.
// See lib/email/marketingSender.ts and lib/email/bulkHeaders.ts for the bulk path, which is
// deliberately kept separate.

const RESEND_API_KEY = process.env.RESEND_API_KEY_BEAUTY_IS?.trim();

/** Longest message worth accepting. Well past anything anyone types, short of an accident. */
export const MAX_MESSAGE_LENGTH = 8000;
export const MAX_SUBJECT_LENGTH = 200;

/**
 * Turns typed text into email HTML.
 *
 * Everything is escaped first, so a customer's own name or a stray angle bracket in the message
 * cannot become markup. Blank lines become paragraphs and single line breaks become <br>, which
 * is what someone typing into a box expects to see at the other end.
 */
function messageBodyHtml(message: string): string {
  return message
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const lines = paragraph.split('\n').map((line) => escapeHtml(line.trim())).join('<br>');
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${EMAIL_COLORS.bodyText}">${lines}</p>`;
    })
    .join('\n');
}

export function renderCustomerMessageHtml(params: {
  subject: string;
  message: string;
  customerName?: string | null;
  sender: AdminSender;
}): string {
  const greeting = params.customerName?.trim()
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${EMAIL_COLORS.headingDark}">${escapeHtml(emailGreeting(params.customerName))}</p>`
    : '';

  const bodyHtml = `<tr>
  <td class="wb-body-pad" style="padding:32px 40px 8px">
    <h1 style="margin:0 0 20px;font-size:20px;line-height:1.4;font-weight:normal;color:${EMAIL_COLORS.headingDark}">${escapeHtml(params.subject)}</h1>
    ${greeting}
    ${messageBodyHtml(params.message)}
  </td>
</tr>
<tr>
  <td class="wb-body-pad" style="padding:0 40px 32px">
    <p style="margin:0;font-size:13px;line-height:1.7;color:${EMAIL_COLORS.muted}">Windsor Beauty</p>
  </td>
</tr>`;

  return emailDocument({
    title: params.subject,
    headerLabel: 'A message for you',
    bodyHtml,
    // Only the no-reply choice earns a "do not reply" line. On the other two a reply is the
    // point of sending.
    senderNotice: params.sender.key === 'no-reply'
      ? 'This message was sent from an address that is not monitored. Please do not reply to it.'
      : null,
    preheader: params.subject,
    extraHeadHtml: `<style>
  @media only screen and (max-width: 480px) {
    .wb-body-pad { padding-left: 22px !important; padding-right: 22px !important; }
  }
</style>`,
  });
}

/** The same message as plain text, for clients that will not render HTML. */
function messagePlainText(params: { subject: string; message: string; customerName?: string | null }): string {
  const greeting = params.customerName?.trim() ? `${emailGreeting(params.customerName)}\n\n` : '';
  return `${params.subject}\n\n${greeting}${params.message.replace(/\r\n/g, '\n').trim()}\n\nWindsor Beauty\nwindsorbeauty.is`;
}

export interface SendCustomerMessageResult {
  sent: boolean;
  /** Present when it failed, already phrased for a person to read. */
  error?: string;
  /** Which address it actually went out from, so the dashboard can say so. */
  from?: string;
  /** Resend's id for the sent message, used as the thread's de-duplication key. */
  messageId?: string | null;
}

/**
 * Sends one message to one customer.
 *
 * Never throws. A dashboard that shows "sent" because an exception was swallowed somewhere is
 * worse than one that says plainly that it failed, so every path returns a result the caller
 * has to look at.
 */
export async function sendCustomerMessage(params: {
  to: string;
  subject: string;
  message: string;
  customerName?: string | null;
  sender?: unknown;
  /** What to file the copy under (task ce308493): which order, which customer. */
  filing?: { customerId?: number | null; orderRef?: string | null };
}): Promise<SendCustomerMessageResult> {
  if (!RESEND_API_KEY) {
    return { sent: false, error: 'Email is not set up on this site, so nothing was sent.' };
  }

  const sender = resolveAdminSender(params.sender);

  try {
    const html = renderCustomerMessageHtml({
      subject: params.subject,
      message: params.message,
      customerName: params.customerName,
      sender,
    });

    const { error, id } = await sendEmail({
      from: sender.from,
      // When reply capture is on, replies route through the capture address
      // so the website stores them under the customer (task b2084076) ,
      // every one is forwarded on to the team's inbox. Off = exactly as before.
      replyTo: getReplyCaptureAddress() ?? sender.replyTo,
      to: params.to,
      subject: params.subject,
      html,
      text: messagePlainText(params),
    }, {
      // Filed under the customer automatically (task ce308493).
      filing: { ...params.filing, emailType: 'admin_message' },
    });

    if (error) {
      console.error('[customerMessageEmail] Resend error:', error);
      return { sent: false, error: `The email provider refused it: ${error || 'no reason given'}.` };
    }

    return { sent: true, from: sender.address, messageId: id };
  } catch (e) {
    console.error('[customerMessageEmail] send failed:', e);
    return { sent: false, error: 'The message could not be sent. Please try again in a moment.' };
  }
}
