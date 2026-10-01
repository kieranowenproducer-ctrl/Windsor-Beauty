import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import {
  deleteClosedEnquiry,
  findEnquiryById,
  setEnquiryStatus,
  type EnquiryStatus,
} from '@/lib/db/enquiries';

export const dynamic = 'force-dynamic';

const STATUSES: EnquiryStatus[] = ['new', 'replied', 'closed'];

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid enquiry id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status;
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: `Status must be one of: ${STATUSES.join(', ')}.` }, { status: 400 });
  }

  const updated = await setEnquiryStatus(id, status);
  if (!updated) {
    return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  }
  return NextResponse.json({ enquiry: updated });
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid enquiry id.' }, { status: 400 });
  }

  const enquiry = await findEnquiryById(id);
  if (!enquiry) {
    return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  }
  if (enquiry.status !== 'closed') {
    return NextResponse.json(
      { error: 'Close this enquiry before deleting it.' },
      { status: 409 },
    );
  }

  // The status is checked again inside the DELETE query. This prevents an
  // enquiry being removed if somebody reopens it in another tab at this point.
  const deleted = await deleteClosedEnquiry(id);
  if (!deleted) {
    return NextResponse.json(
      { error: 'This enquiry changed before it could be deleted. Refresh and try again.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true });
}
