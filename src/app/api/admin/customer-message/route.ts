import { NextResponse } from 'next/server';
import { isSendableEmailAddress } from '@/lib/emailAddress';
import { findCustomerByEmail, isDbConfigured } from '@/lib/db';
import { recordCustomerEmail } from '@/lib/db/customerEmails';
import { recordDashboardMessageOnThread } from '@/lib/db/enquiries';
import { findOrderRef } from '@/lib/replyCapture';
import {
  MAX_MESSAGE_LENGTH,
  MAX_SUBJECT_LENGTH,
  sendCustomerMessage,
} from '@/lib/customerMessageEmail';

export const dynamic = 'force-dynamic';

// Send one message to one customer, from wherever their email address appears in the dashboard
// (task bc9b6309).
//
// Access: everything under /api/admin is behind the admin login by src/proxy.ts, apart from a
// short named allowlist this route is deliberately not on. Nothing extra is needed here, and
// nothing here should assume otherwise.
//
// This is not the marketing route. It sends to exactly one address, the one the dashboard was
// showing, and it does not consult the unsubscribe list: a service message about somebody's own
// order has to reach them whether or not they want the newsletter.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message : '';
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() || null : null;

  if (!isSendableEmailAddress(to)) {
    return NextResponse.json(
      { error: 'That does not look like an email address, so nothing was sent.' },
      { status: 400 }
    );
  }
  if (!subject) {
    return NextResponse.json({ error: 'Please give the message a subject.' }, { status: 400 });
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return NextResponse.json(
      { error: `The subject is too long. Please keep it under ${MAX_SUBJECT_LENGTH} characters.` },
      { status: 400 }
    );
  }
  if (!message.trim()) {
    return NextResponse.json({ error: 'Please write a message before sending.' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: 'That message is too long to send. Please shorten it.' },
      { status: 400 }
    );
  }

  /* Who this is and what it is about, worked out BEFORE the send (task ce308493) so it can be
   * handed to the sender and filed with the copy. It used to be worked out afterwards, purely to
   * write a record here; that record has gone, because sendEmail now files every customer email
   * under the customer and keeps the formatted version this one never did. Doing both would race
   * for the same row. The lookup stays because the enquiry thread below still needs it. */
  const customer = isDbConfigured() ? await findCustomerByEmail(to).catch(() => null) : null;
  const orderRef = findOrderRef(`${subject}\n${message}`);

  const result = await sendCustomerMessage({
    to,
    subject,
    message,
    customerName,
    sender: body?.sender,
    filing: { customerId: customer?.id ?? null, orderRef },
  });

  if (!result.sent) {
    // 502, not 500: the request was fine, the send was not. The dashboard shows result.error
    // to the person as it stands, so it is written for a reader rather than a log.
    return NextResponse.json({ error: result.error || 'The message could not be sent.' }, { status: 502 });
  }

  // The copy of this message is filed by sendEmail itself (task ce308493), so nothing is written
  // here any more. What is still needed is the enquiry thread.
  let enquiryId: number | null = null;
  if (isDbConfigured()) {
    // And onto a Website Enquiries thread, so the conversation is somewhere a person reads and
    // their reply lands underneath what we said rather than opening a case on its own.
    if (result.messageId) {
      enquiryId = await recordDashboardMessageOnThread({
        name: customerName || `${customer?.first_name ?? ''} ${customer?.last_name ?? ''}`.trim(),
        email: to,
        subject,
        message,
        fromAddress: result.from ?? '',
        providerMessageId: result.messageId,
        orderNumber: orderRef,
      });
    }
  }

  return NextResponse.json({ sent: true, to, from: result.from, enquiryId });
}
