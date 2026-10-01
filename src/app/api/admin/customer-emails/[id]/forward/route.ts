import { NextResponse } from 'next/server';
import { findCustomerByEmail, isDbConfigured } from '@/lib/db';
import { getCustomerEmail } from '@/lib/db/customerEmails';
import { sendEmail } from '@/lib/email/send';
import { ADMIN_SENDERS } from '@/lib/email/adminSenders';

// Send a saved email again (task ce308493).
//
// Kieran, 19 September 2026: "there must also be options to re-forward that email to a customer
// should the customer not receive that email or customer wants a copy of that email."
//
// IT SENDS THE SAVED COPY, NOT A FRESH ONE. That is the point of it: a customer who says "I never
// got the dispatch email" should receive the email that was sent, with the tracking number that was
// in it, not a newly built one that may now read differently because the order has moved on since.
//
// It will send to somebody else if an address is given, which is what makes a saved email reusable:
// the same answer, sent to the next person who asks the same question. The copy of that new send is
// filed under the new recipient by sendEmail like any other, so the history stays straight.

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not connected.' }, { status: 503 });
  const { id: raw } = await props.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'That is not an email we can send.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const requested = typeof body?.to === 'string' ? body.to.trim().toLowerCase() : '';

  try {
    const saved = await getCustomerEmail(id);
    if (!saved) return NextResponse.json({ error: 'That email is no longer saved.' }, { status: 404 });

    const to = requested || saved.email;
    if (!EMAIL_PATTERN.test(to)) {
      return NextResponse.json({ error: 'That is not a valid email address.' }, { status: 400 });
    }
    if (!saved.body_html && !saved.body_text) {
      return NextResponse.json(
        { error: 'This one was saved before we kept a copy of the wording, so there is nothing to send.' },
        { status: 409 }
      );
    }

    // Sent from the ordinary sales identity rather than whatever originally sent it: some of the
    // shop's emails go out from addresses on other verified domains, and sending from one of those
    // by hand would either fail or land somewhere a reply cannot come back from.
    const customer = await findCustomerByEmail(to).catch(() => null);
    const { ok, error } = await sendEmail({
      from: ADMIN_SENDERS.sales.from,
      replyTo: ADMIN_SENDERS.sales.replyTo,
      to,
      subject: saved.subject,
      html: saved.body_html ?? undefined,
      text: saved.body_text || undefined,
    }, {
      filing: {
        customerId: customer?.id ?? null,
        orderRef: saved.order_ref,
        emailType: saved.email_type ? `${saved.email_type}_resent` : 'resent',
      },
    });

    if (!ok) {
      return NextResponse.json({ error: error || 'The email could not be sent.' }, { status: 502 });
    }
    return NextResponse.json({ sent: true, to });
  } catch {
    return NextResponse.json({ error: 'The email could not be sent. Please try again.' }, { status: 500 });
  }
}
