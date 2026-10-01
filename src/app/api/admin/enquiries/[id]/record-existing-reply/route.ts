import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { findEnquiryById, recordExistingEnquiryReply } from '@/lib/db/enquiries';

export const dynamic = 'force-dynamic';

const FROM_ADDRESS = process.env.ENQUIRY_REPLY_FROM || 'Windsor Beauty <info@windsorbeauty.co.uk>';
const PROVIDER_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records an email that the provider already accepted outside the dashboard.
 * This route does not import or call an email service, so it cannot resend the
 * customer message while repairing its audit trail.
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
  const providerMessageId = typeof body?.providerMessageId === 'string'
    ? body.providerMessageId.trim()
    : '';
  if (!message || message.length > 10000 || !PROVIDER_MESSAGE_ID.test(providerMessageId)) {
    return NextResponse.json({ error: 'A valid sent message and provider reference are required.' }, { status: 400 });
  }

  try {
    const enquiry = await findEnquiryById(enquiryId);
    if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });

    const result = await recordExistingEnquiryReply({
      enquiryId,
      body: message,
      fromAddress: FROM_ADDRESS,
      providerMessageId,
    });
    if (!result) {
      return NextResponse.json({ error: 'That provider reference belongs to another enquiry.' }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      recorded: true,
      alreadyRecorded: !result.created,
      reply: result.reply,
      enquiryStatusPreserved: enquiry.status === 'closed' ? 'closed' : 'replied',
    });
  } catch (error) {
    console.error('[admin/enquiries/record-existing-reply] failed:', error);
    return NextResponse.json({ error: 'The existing email record could not be saved.' }, { status: 500 });
  }
}
