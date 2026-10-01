// Agent-only enquiry handover endpoint (Stage 5 of the assistant merge).
//
// When the hosted concierge service gives up on a customer, THIS is where the
// record a person will see gets written: an enquiry in /admin/enquiries,
// beside the contact-form messages, marked as having come from the assistant.
// The dedupe/append logic lives in createConciergeHandover and is decided by
// the database's own unique indexes, exactly as it was when the engine ran
// inside this app — the logic never moved, only the caller did.
//
// `fixture` tells the service that this email address only exists in tests, so
// it must not write a support-case pointer row: test rows in the production
// support inbox once sat as a permanent red alarm nobody could act on.
import { NextResponse } from 'next/server';
import { createConciergeHandover, handoverLabel, type EnquiryPriority } from '@/lib/db/enquiries';
import { isReservedTestAddress } from '@/lib/testAddress';
import { sendEmail } from '@/lib/email/send';
import { logAutomationFailure } from '@/lib/db';
import { enquiryAlertRecipients } from '@/lib/email/enquiryAlerts';

export const dynamic = 'force-dynamic';

function authed(request: Request): boolean {
  const secret = process.env.AGENT_TASK_SECRET;
  return Boolean(secret) && (request.headers.get('authorization') || '') === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!authed(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await request.json().catch(() => ({}) as Record<string, unknown>);

  const conversationId = String(b.conversationId ?? '').trim();
  const kind = String(b.kind ?? 'other').slice(0, 40);
  const summary = String(b.summary ?? '').slice(0, 1000).trim();
  if (!conversationId || !summary) {
    return NextResponse.json({ ok: false, error: 'conversationId and summary required' }, { status: 400 });
  }

  const priority: EnquiryPriority = b.priority === 'urgent' ? 'urgent' : 'high';
  const attention = ['upset', 'vulnerable', 'urgent'].includes(String(b.attentionFlag))
    ? (String(b.attentionFlag) as 'upset' | 'vulnerable' | 'urgent')
    : null;
  const transcript = Array.isArray(b.transcript)
    ? (b.transcript as { role?: unknown; content?: unknown }[])
        .slice(-8)
        .map((t) => ({ role: String(t.role ?? 'user'), content: String(t.content ?? '').slice(0, 4000) }))
    : [];

  const email = b.email != null ? String(b.email).slice(0, 200) : null;
  const outcome = await createConciergeHandover({
    conversationId,
    kind,
    summary,
    reason: String(b.reason ?? 'The assistant could not answer this confidently.').slice(0, 1000),
    customerMessage: String(b.customerMessage ?? summary).slice(0, 4000),
    name: b.name != null ? String(b.name).slice(0, 120) : null,
    email,
    orderNumber: b.orderNumber != null ? String(b.orderNumber).slice(0, 40) : null,
    customerId: Number.isFinite(Number(b.customerId)) ? Number(b.customerId) : null,
    priority,
    attentionFlag: attention,
    transcript,
  });

  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error });
  }
  // The dashboard record is the source of truth. One new real handover also
  // alerts the team mailbox; retries and test fixtures create no extra mail.
  if (outcome.created && !isReservedTestAddress(email)) {
    try {
      const sent = await sendEmail({
        from: 'Windsor Glow Ops <alerts@windsorglow.com>',
        to: enquiryAlertRecipients(),
        subject: `${priority === 'urgent' ? 'Urgent: ' : ''}Customer needs help — ${handoverLabel(kind)}`,
        text: `A customer handover is waiting in Website Enquiries.\nCase #${outcome.enquiryId}\n` +
          (email ? `Customer: ${email}\n` : '') +
          (b.orderNumber ? `Order: ${String(b.orderNumber).slice(0, 40)}\n` : '') +
          `\n${summary}\n\nOpen the Windsor Glow admin dashboard to handle it.`,
      }, { internal: true });
      if (sent.error) throw new Error(sent.error);
    } catch (err) {
      await logAutomationFailure('admin_email', 'Customer handover was queued, but the staff alert failed', {
        orderNumber: b.orderNumber != null ? String(b.orderNumber).slice(0, 40) : null, detail: err,
      }).catch(() => {});
    }
  }
  return NextResponse.json({
    ok: true,
    enquiryId: outcome.enquiryId,
    created: outcome.created,
    label: handoverLabel(kind),
    fixture: isReservedTestAddress(email),
  });
}
