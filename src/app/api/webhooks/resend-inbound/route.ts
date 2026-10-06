import { NextResponse } from 'next/server';
import { BEAUTY_CAPTURE, BEAUTY_INBOUND_MAILBOXES, beautyInboundEnvelope } from '@/lib/email/beautyInboundEnvelope';
import { findCustomerByEmail, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { recordCustomerEmail } from '@/lib/db/customerEmails';
import { createInboundEmailEnquiry, findEnquiryById, recordInboundEnquiryReply, type InboundAttachment } from '@/lib/db/enquiries';
import { findExactBeautyEmailThread, claimBeautyInboundRoute, completeBeautyInboundRoute, inboundRouteHash } from '@/lib/db/beautyEmailThreads';
import { emailThreadReferences, emailDirectParents, normaliseMessageId } from '@/lib/email/threadReferences';
import { findOrderRef, verifyWebhookSignature } from '@/lib/replyCapture';
import { sendEmail } from '@/lib/email/send';
import { enquiryAlertRecipients, isUrgentCustomerEmail } from '@/lib/email/enquiryAlerts';
import { isIgnoredInboundSender, isSimpleAcknowledgement, visibleInboundEmailText } from '@/lib/email/inboundRouting';

export const dynamic = 'force-dynamic';

// Resend "email.received" webhook. The webhook carries metadata only, so the
// message and attachment list are fetched from the receiving API. Direct mail
// becomes a dashboard case; replies to an open captured thread re-open it.
//
// Deliberately NOT behind the admin login: Resend calls it from outside. The
// svix signature (RESEND_INBOUND_WEBHOOK_SECRET_BEAUTY_IS) is the authentication — an
// unsigned or mis-signed request is refused.
//
// The original mailbox keeps its original message. A short staff action alert
// is sent once per provider message, without forwarding customer mail in a loop.

const FORWARD_FROM = 'Windsor Beauty Ops <alerts@windsorbeauty.is>';

interface ReceivedEmailContent {
  id: string;
  message_id?: string;
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
  const receivingKey = process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim();
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
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET_BEAUTY_IS;
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

  let event: { type?: string; data?: { email_id?: string; message_id?: string; received_for?: string[]; from?: string; to?: string[]; subject?: string } };
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
  // A public To header alone does not prove a business route. The approved
  // capture target must agree in the signed event and fetched provider envelope.
  // Keep this callback off until the dedicated Beauty forward is proved.
  const approvedCapture = process.env.BEAUTY_INBOUND_CAPTURE_ADDRESS?.trim().toLowerCase();
  if (approvedCapture !== 'windsor-beauty@ilkaik.resend.app' || !process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim()) {
    return NextResponse.json({ error: 'Dedicated Beauty receiving is not configured.' }, { status: 503 });
  }
  // Account-level callbacks can include the existing Glow capture. A known
  // foreign envelope is acknowledged without reading or ingesting its mail.
  const signedEnvelope = beautyInboundEnvelope(meta.received_for);
  if (!signedEnvelope) return NextResponse.json({error:'Provider capture routing is unknown or ambiguous.'},{status:503});
  if (signedEnvelope.capture !== BEAUTY_CAPTURE) return NextResponse.json({ignored:true,reason:'other_business_transport'});
  const content = await fetchReceivedEmail(emailId);
  if (!content) return NextResponse.json({ error: 'Received email could not be read yet.' }, { status: 503 });
  if(content.id!==emailId || typeof meta.from!=='string' || typeof content.from!=='string' || !meta.from || !content.from || bareAddress(meta.from)!==bareAddress(content.from))return NextResponse.json({error:'Provider message identity does not agree.'},{status:503});
  const fetchedEnvelope = beautyInboundEnvelope(content.received_for);
  if (!fetchedEnvelope || fetchedEnvelope.capture !== BEAUTY_CAPTURE ||
      signedEnvelope.originalMailbox !== fetchedEnvelope.originalMailbox) {
    return NextResponse.json({error:'Provider capture routing is unknown or ambiguous.'},{status:503});
  }
  const typedTo = (values: unknown) => Array.isArray(values) && values.length > 0 &&
    values.every(value => typeof value === 'string' && value.trim() && !/[\r\n,;]/.test(value)) &&
    new Set(values.map(value => bareAddress(value))).size === values.length;
  if (!typedTo(meta.to) || !typedTo(Array.isArray(content.to) ? content.to : [content.to])) {
    return NextResponse.json({error:'Authenticated recipient identity is incomplete.'},{status:503});
  }
  const fetchedSmtp = normaliseMessageId(content.message_id);
  const incomingHeaderSmtp = Object.entries(content.headers ?? {}).filter(([name]) => name.toLowerCase() === 'message-id');
  if (!fetchedSmtp || normaliseMessageId(meta.message_id) !== fetchedSmtp || incomingHeaderSmtp.length > 1 ||
      (incomingHeaderSmtp.length === 1 && normaliseMessageId(incomingHeaderSmtp[0][1]) !== fetchedSmtp)) {
    return NextResponse.json({error:'Incoming SMTP identity is missing or conflicting.'},{status:503});
  }
  const fromAddress = bareAddress(content.from || meta.from || '');
  if (!fromAddress) return NextResponse.json({ ignored: true });

  // Internal mail from either business must not become a customer case or
  // trigger an action alert. The original message stays in its mailbox.
  const internalDomains = ['@windsorbeauty.co.uk', '@windsorbeauty.is', '@windsorglow.com', '@windsorglow.co.uk', '@windsorglow.is'];
  const internalCaptures = ['windsor-beauty@ilkaik.resend.app', 'windsor-glow@ilkaik.resend.app'];
  if (internalDomains.some(domain => fromAddress.endsWith(domain)) || internalCaptures.includes(fromAddress)) {
    return NextResponse.json({ ignored: true, reason: 'internal_sender' });
  }

  if (!isDbConfigured()) return NextResponse.json({ error: 'Email queue is not configured.' }, { status: 503 });
  // Verified provider content preserves Zoho's original public To in headers;
  // the top-level To is the forwarding capture address, not the public mailbox.
  const recipientHeaderRows = Object.entries(content.headers ?? {}).filter(([name]) =>
    ['to','x-zohomail-delivered-to'].includes(name.toLowerCase()));
  if (!recipientHeaderRows.length || recipientHeaderRows.some(([,value]) => typeof value !== 'string') ||
      new Set(recipientHeaderRows.map(([name]) => name.toLowerCase())).size !== recipientHeaderRows.length) {
    return NextResponse.json({error:'Original mailbox routing is unknown or ambiguous.'},{status:503});
  }
  const recipientHeaders = recipientHeaderRows.map(([,value]) => value);
  if (!recipientHeaders.flatMap(value => value.split(',')).map(bareAddress).some(value => value && value !== approvedCapture)) {
    return NextResponse.json({error:'Original mailbox routing is unknown or ambiguous.'},{status:503});
  }
  const providerPublicTo = [...(Array.isArray(meta.to)?meta.to:[]),...(Array.isArray(content.to)?content.to:[content.to])].filter(value=>typeof value==='string'&&bareAddress(value)!==approvedCapture);
  const recipientValues = [...recipientHeaders,...providerPublicTo,
    ...[signedEnvelope.originalMailbox, fetchedEnvelope.originalMailbox].filter((value): value is string => value !== null)];
  const originalTo = Array.from(new Set(recipientValues.filter((value): value is string => typeof value === 'string')
    .flatMap(value => value.split(',')).map(bareAddress).filter(value => value && value !== approvedCapture)));
  const ownDomains = ['@windsorbeauty.co.uk', '@windsorbeauty.is'];
  const foreignDomains = ['@windsorglow.com', '@windsorglow.co.uk', '@windsorglow.is'];
  const ownRecipients = originalTo.filter(address => address === 'windsor-beauty@ilkaik.resend.app' || ownDomains.some(domain => address.endsWith(domain)));
  const foreignRecipients = originalTo.filter(address => address === 'windsor-glow@ilkaik.resend.app' || foreignDomains.some(domain => address.endsWith(domain)));
  const unknownRecipients = originalTo.filter(address => ![...ownRecipients, ...foreignRecipients].includes(address));
  if (foreignRecipients.length && !ownRecipients.length && !unknownRecipients.length) {
    return NextResponse.json({ ignored: true, reason: 'other_business' });
  }
  if (!ownRecipients.length || foreignRecipients.length || unknownRecipients.length) {
    return NextResponse.json({ error: 'Original mailbox routing is unknown or ambiguous.' }, { status: 503 });
  }
  // Different public aliases need an explicit reviewed mapping. Never silently
  // replace the original mailbox with the capture address or another alias.
  if (ownRecipients.length !== 1 || !BEAUTY_INBOUND_MAILBOXES.has(ownRecipients[0])) {
    return NextResponse.json({ error: 'Original public mailbox is unknown or ambiguous.' }, { status: 503 });
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
  const receivedCaptureAddress = approvedCapture;
  // Customer history records the verified original public mailbox. The
  // provider envelope remains a separate transport value for reply detection.
  const ourAddress = ownRecipients[0];
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
    const references = emailThreadReferences(content.headers);
    const explicitParents=emailDirectParents(content.headers);
    // References is chronological; its last exact mapped ID is the parent
    // when a mail client omits In-Reply-To. All ancestors still require proof.
    const directParents=explicitParents.length?explicitParents:references.slice(-1);
    const headerSmtp=Object.entries(content.headers||{}).find(([name])=>name.toLowerCase()==='message-id')?.[1];
    const smtpId=normaliseMessageId(content.message_id || headerSmtp);
    if(!smtpId || !normaliseMessageId(content.message_id) || !normaliseMessageId(meta.message_id) || normaliseMessageId(meta.message_id)!==smtpId || (content.message_id && headerSmtp && normaliseMessageId(headerSmtp)!==smtpId))throw new Error('Incoming SMTP identity is missing or conflicting.');
    const appearsReply = references.length > 0 || /^\s*re\s*:/i.test(subject);
    const exactThread = references.length ? await findExactBeautyEmailThread(fromAddress, ourAddress, references,directParents) : null;
    if (appearsReply && !exactThread) {
      return NextResponse.json({ error: 'Exact email thread ownership is missing or ambiguous. Retry required.' }, { status: 503 });
    }
    const pinnedCase = await claimBeautyInboundRoute({providerId: emailId,smtpId,
      hash: inboundRouteHash({smtpId,fromAddress,ourAddress,receivedCaptureAddress,subject,bodyText,attachments,references,directParents}),
      sender: fromAddress,mailbox: ourAddress,capture: receivedCaptureAddress,target: exactThread?.id ?? null});
    const enquiry = pinnedCase ? await findEnquiryById(pinnedCase) : exactThread;
    if (pinnedCase && (!enquiry || enquiry.email.trim().toLowerCase() !== fromAddress)) throw new Error('Recorded email case ownership changed.');
    const customer = await findCustomerByEmail(fromAddress).catch(() => null);
    const knownName = `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim();
    if (!suppliedName && knownName) name = knownName;
    if (pinnedCase) {
      enquiryId = pinnedCase;
      autoClosedAcknowledgement = isSimpleAcknowledgement(bodyText);
    } else if (enquiry) {
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
      if (!recorded || recorded.enquiry.email.trim().toLowerCase() !== fromAddress) throw new Error('Could not create incoming email enquiry safely.');
      enquiryId = recorded.enquiry.id;
      newlyRecorded = recorded.created;
    }
    await completeBeautyInboundRoute(emailId, enquiryId);
    await recordCustomerEmail({direction:'received',customerId:customer?.id ?? null,email:fromAddress,
      ourAddress,subject,bodyText:bodyText || '(See attached files.)',providerId:emailId,orderRef});
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
