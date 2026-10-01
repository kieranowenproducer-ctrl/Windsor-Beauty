import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { findEnquiryById, recordInboundEnquiryReply } from '@/lib/db/enquiries';

export const dynamic = 'force-dynamic';

/**
 * Puts a reply the customer sent to our own inbox onto their enquiry (task bb0a850f).
 *
 * The twin of record-existing-reply, which does the same job for an email WE sent outside the
 * dashboard. This one is for the other direction, and it is the half that was missing: Emma
 * answered a website enquiry straight to info@windsorbeauty.co.uk and there was no way at all to get
 * her words onto the thread, so the enquiry sat there reading as answered and finished.
 *
 * Automatic capture handles this on its own once the inbound address is switched on. This stays
 * useful either way, because info@ is printed on the contact page and people will always write to
 * it directly, and because a conversation is not worth losing over a setting nobody has got to yet.
 *
 * It never sends anything. No email service is imported here, so it cannot mail the customer while
 * it repairs the record.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const { id: rawId } = await props.params;
  const enquiryId = Number(rawId);
  if (!Number.isInteger(enquiryId)) {
    return NextResponse.json({ error: 'Invalid enquiry id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 10000) {
    return NextResponse.json({ error: 'Paste in what the customer wrote.' }, { status: 400 });
  }

  try {
    const enquiry = await findEnquiryById(enquiryId);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });

    // Their address comes from the enquiry, never from the request: this route decides whose
    // message it is from the record, so a typed-in address cannot put words in someone's mouth.
    const result = await recordInboundEnquiryReply({
      enquiryId,
      body: message,
      fromAddress: enquiry.email,
      providerMessageId: null,
    });
    if (!result) {
      return NextResponse.json({ error: 'The customer message could not be saved.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, reply: result.reply, enquiryStatus: 'new' });
  } catch (error) {
    console.error('[admin/enquiries/record-customer-reply] failed:', error);
    return NextResponse.json({ error: 'The customer message could not be saved.' }, { status: 500 });
  }
}
