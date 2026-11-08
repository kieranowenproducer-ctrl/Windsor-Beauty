import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { NextResponse } from 'next/server';
import { ensureSchema, isDbConfigured, logAutomationFailure } from '@/lib/db';
import { createEnquiry, listEnquiries, type EnquiryPriority } from '@/lib/db/enquiries';
import { sendEmail } from '@/lib/email/send';
import { enquiryAlertRecipients } from '@/lib/email/enquiryAlerts';
import { isReservedTestAddress } from '@/lib/testAddress';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  const params=new URL(request.url).searchParams;
  const raw=params.get('offset') ?? '0';
  const pinned=params.has('pinned')?Number(params.get('pinned')):null;
  if(pinned!==null && (!Number.isSafeInteger(pinned)||pinned<1)) return NextResponse.json({error:'Invalid enquiry.'},{status:400,headers});
  const offset=Number(raw), status=params.get('status') ?? 'all', source=params.get('source') ?? 'all';
  if (!/^\d+$/.test(raw)||!Number.isSafeInteger(offset)||offset>2147483447||!['all','new','replied','closed'].includes(status)||!['all','website_form','direct_email'].includes(source)) return NextResponse.json({error:'Invalid enquiry filter.'},{status:400,headers});
  if (!isDbConfigured()) return NextResponse.json({error:'Database not configured.'},{status:503,headers});
  try {
    const [rows,pinnedRows]=await Promise.all([listEnquiries(201,offset,status,source),pinned===null?Promise.resolve([]):listEnquiries(1,0,status,source,pinned)]);
    return NextResponse.json({enquiries:rows.slice(0,200),nextOffset:rows.length>200?offset+200:null,pinned:pinnedRows[0]??null},{headers});
  } catch { return NextResponse.json({error:'Could not load enquiries.'},{status:503,headers}); }
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
          from: 'Windsor Beauty Ops <alerts@windsorbeauty.is>',
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
