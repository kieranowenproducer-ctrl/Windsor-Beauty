import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { createEnquiry, listEnquiries, type EnquiryPriority } from '@/lib/db/enquiries';
import { sendEmail } from '@/lib/email/send';
import { enquiryAlertRecipients } from '@/lib/email/enquiryAlerts';
import { isReservedTestAddress } from '@/lib/testAddress';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    return NextResponse.json({ enquiries: await listEnquiries() });
  } catch {
    // Same self-healing pattern as /api/admin/qr-campaigns: the first call
    // after this feature ships runs before the tables exist, so create them
    // and retry once rather than making anyone run a migration by hand.
    try {
      await ensureSchema();
      return NextResponse.json({ enquiries: await listEnquiries() });
    } catch (err) {
      console.error('[admin/enquiries] GET failed after ensureSchema:', err);
      return NextResponse.json({ error: 'Could not load enquiries.' }, { status: 500 });
    }
  }
}

// Log an enquiry that did not come through the contact form — someone who
// phoned, emailed directly, or wrote in before enquiries were being stored —
// so it can be answered from the panel like any other.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const subjectLabel = typeof body?.subjectLabel === 'string' && body.subjectLabel.trim()
    ? body.subjectLabel.trim()
    : 'Other';
  const orderNumber = typeof body?.orderNumber === 'string' && body.orderNumber.trim()
    ? body.orderNumber.trim().toUpperCase()
    : null;
  const priority: EnquiryPriority = body?.priority === 'urgent' ? 'urgent' : body?.priority === 'normal' ? 'normal' : 'high';

  if (!name || !email || !EMAIL_PATTERN.test(email) || !message) {
    return NextResponse.json(
      { error: 'A name, a valid email address and a message are all required.' },
      { status: 400 }
    );
  }

  try {
    await ensureSchema();
    const enquiry = await createEnquiry({
      name, email, subjectKey: 'other', subjectLabel, orderNumber, message, priority, source: 'manual_email',
    });
    if (!enquiry) throw new Error('Manual enquiry was not saved');
    let staffAlertAccepted = false;
    // A manual record may be the only trace of a message that bypassed the
    // website. Send the same short action notice as other incoming cases.
    if (!isReservedTestAddress(email)) {
      try {
        const alert = await sendEmail({
          from: 'Windsor Glow Ops <alerts@windsorglow.com>',
          to: enquiryAlertRecipients(),
          subject: `${priority === 'urgent' ? 'Urgent: ' : ''}New customer case in Website Enquiries`,
          text: `A customer case has been added to Website Enquiries.\n\nCase #${enquiry.id}\n` +
            `${orderNumber ? `Order: ${orderNumber}\n` : ''}` +
            `\nOpen the admin Website Enquiries page to read and handle the message.`,
        }, { internal: true });
        if (alert.error) throw new Error(alert.error);
        staffAlertAccepted = alert.ok;
      } catch (error) {
        await logAutomationFailure('admin_email', 'A manual enquiry was saved, but its staff alert failed',
          { orderNumber, detail: error }).catch(() => {});
      }
    }
    return NextResponse.json({ enquiry, staffAlertAccepted });
  } catch (err) {
    console.error('[admin/enquiries] POST failed:', err);
    return NextResponse.json({ error: 'Could not save this enquiry.' }, { status: 500 });
  }
}
