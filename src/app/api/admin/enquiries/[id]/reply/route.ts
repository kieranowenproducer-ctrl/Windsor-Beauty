import { createHash } from 'node:crypto';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { readBeautyReplyDraft, clearSentBeautyReplyDraft, recordBeautyDraftReply } from '@/lib/db/beautyEnquiryDrafts';
import { BEAUTY_CONTACT_EMAIL, BEAUTY_CONTACT_FROM } from '@/lib/email/contactAddress';
import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { buildEnquiryReplyEmail } from '@/lib/enquiryEmails';
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';
import { findEnquiryById, recordEnquiryReply } from '@/lib/db/enquiries';
import { emailDocument, escapeHtml } from '@/lib/email/shared';
import { getEnquiryReplyArchiveAddress } from '@/lib/email/enquiryReplyDelivery';
import { getReplyCaptureAddress } from '@/lib/replyCapture';
import { emailGreeting, messageStartsWithGreeting } from '@/lib/email/greeting';
import {
  orderDraftIsStale,
  orderDraftSnapshot,
  orderStatusEmailCopy,
  type OrderDraftSnapshot,
} from '@/lib/email/enquiryAutoDraft';

export const dynamic = 'force-dynamic';

// The reply goes out as Windsor Beauty, never as whoever happens to be logged
// into the admin panel — that is the whole point of answering from the site.
// Reply-To points at the enquiries inbox so a customer who does hit reply lands
// back in the same place the conversation started, next to the thread it belongs
// to, rather than in sales. Changed from sales@ on task #96 (2026-07-29).
// Both are overridable from the environment: set ENQUIRY_REPLY_TO to a genuine
// no-reply address if replies should be refused outright.
const FROM_ADDRESS = beautyOperationalAddress(process.env.ENQUIRY_REPLY_FROM) || BEAUTY_CONTACT_FROM;
const REPLY_TO_ADDRESS = beautyOperationalAddress(process.env.ENQUIRY_REPLY_TO) || BEAUTY_CONTACT_EMAIL;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  if(request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'Reload this page before sending.'},{status:403});
  const params = await props.params;
  if (!process.env.RESEND_API_KEY_BEAUTY_IS?.trim()) {
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
  const format = body?.format === 'order' ? 'order' : 'standard';
  if (!message) {
    return NextResponse.json({ error: 'Write a reply before sending.' }, { status: 400 });
  }
  if (message.length > 10000) {
    return NextResponse.json({ error: 'That reply is too long. Please shorten it.' }, { status: 400 });
  }
  const enquiry = await findEnquiryById(id);
  if (!enquiry) {
    return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  }

  // New composer saves first. Do not send an old tab's reply over newer saved work.
  const draftRevision = body?.draftRevision;
  if (draftRevision !== undefined) {
    if (!Number.isSafeInteger(draftRevision) || draftRevision < 1 || !Number.isSafeInteger(body?.baseReplyId)) return NextResponse.json({error:'Reload the saved draft before sending.'},{status:400});
    const current=await readBeautyReplyDraft(id).catch(()=>null);
    const payload=current?.payload as {message?:string;format?:string} | null;
    if (!current || Number(current.revision)!==draftRevision || Number(current.latest_reply_id)!==body.baseReplyId || payload?.message?.trim()!==message || payload?.format!==format) return NextResponse.json({error:'The saved draft or conversation changed. Reload the saved draft and check the latest messages before sending.'},{status:409});
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

  const subject = `Re: ${enquiry.subject_label}, Windsor Beauty`;
  const sentMessage = message;
  const automaticGreeting = emailGreeting(enquiry.name);
  const addAutomaticGreeting = !messageStartsWithGreeting(sentMessage);
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

  try {
    const { id: providerId, error } = await sendEmail({
from: FROM_ADDRESS,
to: enquiry.email,
bcc: archiveAddress ?? undefined,
replyTo: getReplyCaptureAddress() ?? REPLY_TO_ADDRESS,
...buildEnquiryReplyEmail({ subject, standardText, originalMessage: enquiry.message, addAutomaticGreeting, automaticGreeting, message, quotedHtml })
}, {idempotencyKey: 'beauty-enquiry-'+createHash('sha256').update(JSON.stringify([id,body?.baseReplyId??null,enquiry.email,FROM_ADDRESS,REPLY_TO_ADDRESS,archiveAddress,format,message])).digest('hex')});

    if (error) {
      console.error('[admin/enquiries/reply] Resend error:', error);
      return NextResponse.json({ error: 'The reply could not be sent. Please try again shortly.' }, { status: 502 });
    }

    // Clear only this exact saved revision after provider acceptance, even if later
    // thread recording fails. Late saves cannot resurrect the sent text.
    const draftCleared = draftRevision === undefined ? true : await clearSentBeautyReplyDraft(id,draftRevision).then(value=>value!==undefined).catch(()=>false);

    // Sending and saving are separate systems. Once Resend has accepted the
    // email, never report it as unsent just because the later database write
    // failed. That wording could cause a colleague to press Send again and
    // duplicate the customer email. The provider ID and IONOS copy remain the
    // recovery trail in that unusual case.
    try {
      const reply = draftRevision !== undefined && providerId
        ? await recordBeautyDraftReply(id,sentMessage,FROM_ADDRESS,providerId,body.baseReplyId)
        : await recordEnquiryReply({
        enquiryId: id,
        body: sentMessage,
        fromAddress: FROM_ADDRESS,
        providerMessageId: providerId ?? null,
      });
      if (!reply) throw new Error('The database did not return the saved reply.');

      return NextResponse.json({
        success: true,
        draftCleared,
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
        draftCleared,
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
