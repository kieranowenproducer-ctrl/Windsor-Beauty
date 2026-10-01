import { NextResponse } from 'next/server';
import { findCustomerByEmail, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { recordCustomerEmail } from '@/lib/db/customerEmails';
import { attachEarlierSentMessages, createInboundEmailEnquiry, findEnquiryForCustomerEmail, recordInboundEnquiryReply, type InboundAttachment } from '@/lib/db/enquiries';
import { findOrderRef, verifyWebhookSignature } from '@/lib/replyCapture';
import { sendEmail } from '@/lib/email/send';
import { enquiryAlertRecipients, isUrgentCustomerEmail } from '@/lib/email/enquiryAlerts';
import { isCapturedThreadReply, isIgnoredInboundSender, isSimpleAcknowledgement, visibleInboundEmailText } from '@/lib/email/inboundRouting';

export const dynamic = 'force-dynamic';

// Resend "email.received" webhook. The webhook carries metadata only, so the
// message and attachment list are fetched from the receiving API. Direct mail
// becomes a dashboard case; replies to an open captured thread re-open it.
//
// Deliberately NOT behind the admin login: Resend calls it from outside. The
// svix signature (RESEND_INBOUND_WEBHOOK_SECRET) is the authentication — an
// unsigned or mis-signed request is refused.
//
// The original mailbox keeps its original message. A short staff action alert
// is sent once per provider message, without forwarding customer mail in a loop.

const FORWARD_FROM = 'Windsor Beauty Ops <alerts@windsorbeauty.co.uk>';

interface ReceivedEmailContent {
  from: string;
  to: string[] | string;
  subject: string;
  text: string | null;
  html: string | null;
  received_for?: string[];
  attachments?: Array<{ id: string; filename: string; content_type: string; size: number }>;
  headers?: Record<string, string>;
}

// The webhook only says an email exists; its words live behind the API.
async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmailContent | null> {
  const receivingKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
  if (!receivingKey) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${receivingKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as ReceivedEmailContent;
  } catch {
    return null;
  }
}

function bareAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim().toLowerCase();
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!secret) {
    // Capture is not switched on. Saying so plainly beats a mystery 500.
    return NextResponse.json({ error: 'Inbound email capture is not configured.' }, { status: 503 });
  }

  const payload = await request.text();
  const ok = verifyWebhookSignature({
    secret,
    id: request.headers.get('svix-id') ?? '',
    timestamp: request.headers.get('svix-timestamp') ?? '',
    signatureHeader: request.headers.get('svix-signature') ?? '',
    payload,
  });
  if (!ok) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; from?: string; to?: string[]; subject?: string } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: 'Not JSON.' }, { status: 400 });
  }
  if (event.type !== 'email.received' || !event.data) {
    // Other event types are none of this route's business; acknowledged so
    // Resend does not retry them forever.
    return NextResponse.json({ ignored: true });
  }

  const meta = event.data;
  const emailId = meta.email_id;
  if (!emailId) return NextResponse.json({ error: 'Missing received email id.' }, { status: 400 });
  const content = await fetchReceivedEmail(emailId);
  if (!content) return NextResponse.json({ error: 'Received email could not be read yet.' }, { status: 503 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Email queue is not configured.' }, { status: 503 });
  const fromAddress = bareAddress(content.from || meta.from || '');
  if (!fromAddress) return NextResponse.json({ ignored: true });

  // Never ingest or forward our own outbound addresses — that way a bounce,
  // an auto-reply loop or a misdirected internal email cannot echo around.
  if (fromAddress.endsWith('@windsorbeauty.co.uk')) {
    return NextResponse.json({ ignored: true });
  }

  // Royal Mail sends receipts, label confirmations and Click & Drop notices to
  // the shared mailbox. They are operational emails, not customer questions.
  // Leave the original message in the mailbox, but do not create an enquiry,
  // store customer history or raise a staff alert from it.
  if (isIgnoredInboundSender(fromAddress)) {
    return NextResponse.json({ ignored: true });
  }

  const autoSubmitted = Object.entries(content.headers ?? {})
    .find(([key]) => key.toLowerCase() === 'auto-submitted')?.[1]
    ?.split(';')[0].trim().toLowerCase() ?? '';
  // Mailbox forwarding can label a genuine customer note "auto-forwarded".
  // Reject machine answers while still accepting those forwarded enquiries.
  if (autoSubmitted && autoSubmitted !== 'no' && autoSubmitted !== 'auto-forwarded') {
    return NextResponse.json({ ignored: true });
  }
  const subject = content.subject ?? meta.subject ?? '(no subject)';
  const rawBodyText = content.text
    ?? (content.html ? content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
    ?? '';
  const bodyText = visibleInboundEmailText(rawBodyText);
  const ourAddress = content.received_for?.[0] ? bareAddress(content.received_for[0]) :
    (Array.isArray(meta.to) && meta.to.length ? bareAddress(meta.to[0]) : null);
  const attachments: InboundAttachment[] = (content.attachments ?? [])
    .filter(item => item.id && item.filename)
    .map(item => ({ id: item.id, emailId, filename: item.filename, contentType: item.content_type, size: item.size }));
  if (!bodyText && !attachments.length) return NextResponse.json({ ignored: true });
  const nameMatch = (content.from || meta.from || '').match(/^\s*([^<]+)\s*</);
  const suppliedName = nameMatch?.[1]?.replace(/^"|"$/g, '').trim() || '';
  let name = suppliedName || fromAddress;
  const orderRef = findOrderRef(`${subject}\n${bodyText}`);
  const urgent = isUrgentCustomerEmail(`${subject}\n${bodyText}`);

  let enquiryId: number | null = null;
  let newlyRecorded = false;
  let autoClosedAcknowledgement = false;

  try {
    const customer = await findCustomerByEmail(fromAddress).catch(() => null);
    const knownName = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim();
    if (!suppliedName && knownName) name = knownName;
    await recordCustomerEmail({
      direction: 'received',
      customerId: customer?.id ?? null,
      email: fromAddress,
      ourAddress,
      subject,
      bodyText: bodyText || '(See attached files.)',
      providerId: emailId,
      orderRef,
    });

    // Replies to a dashboard thread return to that thread. A new direct message
    // gets its own case rather than being hidden under customer email history.
    const captureAddress = process.env.REPLY_CAPTURE_ADDRESS?.trim().toLowerCase();
    const originalRecipients = (Array.isArray(content.to) ? content.to : [content.to]).map(bareAddress);
    const isThreadReply = isCapturedThreadReply({
      captureAddress, receivedFor: ourAddress, originalRecipients, headers: content.headers,
    });
    const enquiry = isThreadReply ? await findEnquiryForCustomerEmail(fromAddress) : null;
    if (enquiry) {
      autoClosedAcknowledgement = isSimpleAcknowledgement(bodyText);
      const attached = await recordInboundEnquiryReply({
        enquiryId: enquiry.id, body: bodyText || '(See attached files.)', fromAddress,
        providerMessageId: emailId, attachments, closeAsAcknowledged: autoClosedAcknowledgement,
      });
      if (!attached) throw new Error('Could not attach incoming reply to its enquiry.');
      enquiryId = enquiry.id;
      newlyRecorded = attached.created;
    } else {
      const recorded = await createInboundEmailEnquiry({
        emailId, name, email: fromAddress, subject,
        orderNumber: orderRef, message: bodyText || '(See attached files.)',
        attachments, priority: urgent ? 'urgent' : 'high',
      });
      if (!recorded) throw new Error('Could not create incoming email enquiry.');
      enquiryId = recorded.enquiry.id;
      // Anything we already said to them goes on the thread above their message, so whoever opens
      // the case reads a conversation rather than one side of one.
      if (recorded.created) await attachEarlierSentMessages({ enquiryId, email: fromAddress });
      newlyRecorded = recorded.created;
    }
  } catch (err) {
    console.error('[resend-inbound] queue failed:', err);
    return NextResponse.json({ error: 'Incoming email was not queued. Retry required.' }, { status: 503 });
  }

  // One action alert for each new provider email. A webhook retry creates no
  // second alert. The original IONOS message remains in its mailbox.
  if (newlyRecorded && !autoClosedAcknowledgement) {
    try {
      const alert = await sendEmail({
        from: FORWARD_FROM,
        to: enquiryAlertRecipients(),
        replyTo: fromAddress,
        subject: `${urgent ? 'Urgent: ' : ''}Customer email needs attention - ${subject}`,
        text:
          `A customer message is waiting in Website Enquiries.\n` +
          `Case #${enquiryId}\nFrom: ${name} <${fromAddress}>\n` +
          (orderRef ? `Order: ${orderRef}\n` : '') +
          (attachments.length ? `Attachments: ${attachments.map(item => item.filename).join(', ')}\n` : '') +
          `\nOpen the Windsor Beauty admin dashboard to handle it.\n\n${bodyText.slice(0, 2000)}`,
      }, { internal: true });
      if (alert.error) throw new Error(alert.error);
    } catch (err) {
      console.error('[resend-inbound] action alert failed:', err);
      await logAutomationFailure('admin_email', 'Incoming customer email was queued, but the staff alert failed', {
        orderNumber: orderRef, detail: err,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, enquiryId, autoClosedAcknowledgement });
}
