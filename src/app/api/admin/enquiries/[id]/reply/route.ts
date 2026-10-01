import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { findEnquiryById, recordEnquiryReply } from '@/lib/db/enquiries';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { getEnquiryReplyArchiveAddress } from '@/lib/email/enquiryReplyDelivery';
import { getReplyCaptureAddress } from '@/lib/replyCapture';
import { renderPearlEmail } from '@/lib/email/pearlEmailRender';
import {
  parsePearlReply,
  pearlReplyPlainText,
  pearlReplyValidationError,
  type ParsedPearlReply,
} from '@/lib/email/pearlReplyTemplate';
import { emailGreeting, messageStartsWithGreeting } from '@/lib/email/greeting';
import {
  orderDraftIsStale,
  orderDraftSnapshot,
  orderStatusEmailCopy,
  type OrderDraftSnapshot,
} from '@/lib/email/enquiryAutoDraft';

export const dynamic = 'force-dynamic';

// The reply goes out as Windsor Glow, never as whoever happens to be logged
// into the admin panel — that is the whole point of answering from the site.
// Reply-To points at the enquiries inbox so a customer who does hit reply lands
// back in the same place the conversation started, next to the thread it belongs
// to, rather than in sales. Changed from sales@ on task #96 (2026-07-29).
// Both are overridable from the environment: set ENQUIRY_REPLY_TO to a genuine
// no-reply address if replies should be refused outright.
const FROM_ADDRESS = process.env.ENQUIRY_REPLY_FROM || 'Windsor Glow <info@windsorglow.com>';
const REPLY_TO_ADDRESS = process.env.ENQUIRY_REPLY_TO || 'info@windsorglow.com';

function paragraphsHtml(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 18px;font-size:13px;color:#57534e;line-height:1.7;font-family:Arial">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function pearlCopyHtml(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (lines.length > 0 && lines.every((line) => line.startsWith('- '))) {
        const rows = lines.map((line) => {
          const item = line.slice(2);
          const colon = item.indexOf(':');
          const label = colon >= 0 ? item.slice(0, colon).trim() : item;
          const value = colon >= 0 ? item.slice(colon + 1).trim() : '';
          return `<tr>
            <td style="padding:9px 10px;border-bottom:1px solid #eadfca;color:#786f65;font-size:11px;line-height:1.4;font-family:Arial">${escapeHtml(label)}</td>
            <td style="padding:9px 10px;border-bottom:1px solid #eadfca;color:#292524;font-size:11px;line-height:1.4;font-weight:bold;text-align:right;font-family:Arial">${escapeHtml(value)}</td>
          </tr>`;
        }).join('');
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#ffffff;border:1px solid #eadfca">${rows}</table>`;
      }
      return paragraphsHtml(block);
    })
    .join('');
}

function pearlAnswerHtml(parsed: ParsedPearlReply): string {
  const lines = parsed.pearl.split('\n');
  const title = lines.shift()?.trim() || 'PEARL research answer';
  const copy = lines.join('\n').trim();
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 26px;border:1px solid #e7dcc8;border-top:3px solid #b8902a;background:#fefce8;border-radius:10px">
      <tr>
        <td style="padding:18px 20px 15px;border-bottom:1px solid #eadfca">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td width="34" height="34" bgcolor="#f4e8bd" style="width:34px;height:34px;border-radius:50%;text-align:center;color:#946d13;font-family:Georgia,serif;font-size:18px;font-weight:bold">P</td>
            <td style="padding-left:12px">
              <p style="margin:0;color:#8a681b;font-size:10px;line-height:1.2;font-weight:bold;letter-spacing:0.22em;font-family:Arial">PEARL</p>
              <p style="margin:4px 0 0;color:#8b8277;font-size:10px;line-height:1.35;font-family:Arial">Peptide Experimental Analysis Research Library</p>
            </td>
          </tr></table>
        </td>
      </tr>
      <tr>
        <td style="padding:19px 20px 2px">
          <p style="margin:0 0 8px;color:#9a741d;font-size:9px;line-height:1.2;font-weight:bold;letter-spacing:0.16em;font-family:Arial">SOURCE-LISTED ANSWER</p>
          <p style="margin:0 0 12px;color:#292524;font-family:Georgia,serif;font-size:20px;line-height:1.25">${escapeHtml(title)}</p>
          ${pearlCopyHtml(copy)}
        </td>
      </tr>
    </table>`;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email sending is not configured.' }, { status: 503 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid enquiry id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const format = body?.format === 'pearl' ? 'pearl' : body?.format === 'order' ? 'order' : 'standard';
  if (!message) {
    return NextResponse.json({ error: 'Write a reply before sending.' }, { status: 400 });
  }
  if (message.length > 10000) {
    return NextResponse.json({ error: 'That reply is too long. Please shorten it.' }, { status: 400 });
  }
  const pearlError = format === 'pearl' ? pearlReplyValidationError(message) : null;
  if (pearlError) return NextResponse.json({ error: pearlError }, { status: 400 });
  const parsedPearl = format === 'pearl' ? parsePearlReply(message) : null;

  const enquiry = await findEnquiryById(id);
  if (!enquiry) {
    return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  }

  if (format === 'order') {
    const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
    const candidate = body?.orderSnapshot as Partial<OrderDraftSnapshot> | null;
    const snapshot = candidate
      && typeof candidate.status === 'string'
      && (typeof candidate.trackingNumber === 'string' || candidate.trackingNumber === null)
      && (typeof candidate.trackingUrl === 'string' || candidate.trackingUrl === null)
      ? candidate as OrderDraftSnapshot
      : null;
    if (!orderNumber || !snapshot) {
      return NextResponse.json({ error: 'Refresh this order draft before sending it.' }, { status: 409 });
    }
    const order = await findOrderByNumber(orderNumber).catch(() => null);
    if (!order || order.email.toLowerCase() !== enquiry.email.toLowerCase()) {
      return NextResponse.json({ error: 'The order no longer matches this customer. Check it manually before replying.' }, { status: 409 });
    }
    if (orderDraftIsStale(snapshot, order)) {
      return NextResponse.json({
        error: 'The order changed after this draft was prepared. Check the refreshed details before sending.',
        refreshedDraft: orderStatusEmailCopy(order),
        orderSnapshot: orderDraftSnapshot(order),
        generatedAt: new Date().toISOString(),
      }, { status: 409 });
    }
  }

  const subject = `Re: ${enquiry.subject_label} — Windsor Glow`;
  const sentMessage = parsedPearl ? pearlReplyPlainText(parsedPearl) : message;
  const automaticGreeting = emailGreeting(enquiry.name);
  const addAutomaticGreeting = !parsedPearl && !messageStartsWithGreeting(sentMessage);
  const standardText = addAutomaticGreeting
    ? `${automaticGreeting}\n\n${sentMessage}`
    : sentMessage;
  const archiveAddress = getEnquiryReplyArchiveAddress(enquiry.email);

  // The customer's own words are quoted back so the reply makes sense on its
  // own, which matters because it is not threaded to anything in their inbox.
  const quotedHtml = `
    <div style="margin:28px 0 0;padding:14px 18px;border-left:3px solid #e7dcc8;background:#faf9f7">
      <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#a8a29e;font-family:Arial">
        Your message
      </p>
      <p style="margin:0;white-space:pre-wrap;font-size:12px;color:#78716c;font-family:Arial">${escapeHtml(enquiry.message)}</p>
    </div>`;

  // One renderer for every PEARL email on the site (task 9add1201), so an
  // email drafted on the PEARL dashboard and one sent from here are the same
  // thing drawn by the same code, not two copies that can drift.
  const pearlRendered = parsedPearl
    ? renderPearlEmail({ message: sentMessage, subject, quotedMessage: enquiry.message })
    : null;

  try {
    const { id: providerId, error } = await sendEmail({
      from: FROM_ADDRESS,
      to: enquiry.email,
      // Resend cannot write into IONOS Sent Items. A hidden copy gives the
      // team an independent mailbox record without exposing that address to
      // the customer or sending the customer a second message.
      bcc: archiveAddress ?? undefined,
      // Reply capture (task b2084076): when on, the customer's answer routes
      // through the capture address, is stored under them, and is forwarded
      // to the inbox. Off = exactly as before.
      replyTo: getReplyCaptureAddress() ?? REPLY_TO_ADDRESS,
      subject,
      text: pearlRendered
        ? pearlRendered.text
        : `${standardText}\n\n` +
          `— Windsor Glow\nwindsorglow.com\n\n` +
          `All products are supplied strictly for research purposes only. Not for human use.\n\n` +
          `--- Your original message ---\n${enquiry.message}\n`,
      html: pearlRendered ? pearlRendered.html : emailDocument({
        title: subject,
        headerLabel: parsedPearl ? 'Product information' : 'Windsor Glow',
        // No footerText override, deliberately. This goes to a CUSTOMER, and
        // the override replaced the research-use disclaimer with a bare address
        // line — so the one kind of email most likely to be ABOUT a product was
        // the one kind carrying no disclaimer (task 8a498491). The shared
        // default carries the disclaimer, and the brand line it prints above it
        // is already "Windsor Glow — windsorglow.com", which is all the override
        // was adding.
        bodyHtml: parsedPearl ? `
        <tr>
          <td style="padding:40px 40px 32px">
            ${paragraphsHtml(parsedPearl.before)}
            ${pearlAnswerHtml(parsedPearl)}
            ${paragraphsHtml(parsedPearl.after)}
            ${quotedHtml}
          </td>
        </tr>` : `
        <tr>
          <td style="padding:40px 40px 32px">
            ${addAutomaticGreeting ? `<p style="margin:0 0 20px;font-size:13px;color:#57534e;font-family:Arial">${escapeHtml(automaticGreeting)}</p>` : ''}
            <p style="margin:0;white-space:pre-wrap;font-size:13px;color:#57534e;line-height:1.7;font-family:Arial">${escapeHtml(message)}</p>
            ${quotedHtml}
          </td>
        </tr>`,
      }),
    });

    if (error) {
      console.error('[admin/enquiries/reply] Resend error:', error);
      return NextResponse.json({ error: 'The reply could not be sent. Please try again shortly.' }, { status: 502 });
    }

    // Sending and saving are separate systems. Once Resend has accepted the
    // email, never report it as unsent just because the later database write
    // failed. That wording could cause a colleague to press Send again and
    // duplicate the customer email. The provider ID and IONOS copy remain the
    // recovery trail in that unusual case.
    try {
      const reply = await recordEnquiryReply({
        enquiryId: id,
        body: sentMessage,
        fromAddress: FROM_ADDRESS,
        providerMessageId: providerId ?? null,
      });
      if (!reply) throw new Error('The database did not return the saved reply.');

      return NextResponse.json({
        success: true,
        reply,
        sentTo: enquiry.email,
        archivedTo: archiveAddress,
        recorded: true,
        providerMessageId: providerId ?? null,
      });
    } catch (recordError) {
      console.error('[admin/enquiries/reply] accepted by Resend but not recorded:', {
        providerMessageId: providerId ?? null,
        enquiryId: id,
        error: recordError,
      });
      return NextResponse.json({
        success: true,
        sentTo: enquiry.email,
        archivedTo: archiveAddress,
        recorded: false,
        providerMessageId: providerId ?? null,
        warning: archiveAddress
          ? 'The email was sent and copied to IONOS, but the dashboard record could not be saved. Do not send it again.'
          : 'The email was sent, but the dashboard record could not be saved. Do not send it again.',
      });
    }
  } catch (err) {
    console.error('[admin/enquiries/reply] send threw:', err);
    return NextResponse.json({ error: 'The reply could not be sent. Please try again shortly.' }, { status: 500 });
  }
}
