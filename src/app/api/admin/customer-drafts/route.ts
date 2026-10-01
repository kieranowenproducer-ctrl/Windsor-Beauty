import { NextResponse } from 'next/server';
import { findCustomerByEmail, isDbConfigured } from '@/lib/db';
import { deleteCustomerEmailDraft, saveCustomerEmailDraft } from '@/lib/db/customerEmails';
import { isSendableEmailAddress } from '@/lib/emailAddress';
import { MAX_MESSAGE_LENGTH, MAX_SUBJECT_LENGTH } from '@/lib/customerMessageEmail';
import { resolveAdminSender } from '@/lib/email/adminSenders';

export const dynamic = 'force-dynamic';

// Drafts of one-to-one customer messages (task 72260d57): saved under the
// customer, reopened and sent any time from their Email History. Nothing
// here ever sends an email — sending stays with /api/admin/customer-message,
// and the composer clears the draft after a successful send.

// POST — body: { id?, to, sender, subject, message }. Returns { id }.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body?.message === 'string' ? body.message : '';
  const id = Number.isInteger(body?.id) && body.id > 0 ? Number(body.id) : null;

  if (!isSendableEmailAddress(to)) {
    return NextResponse.json({ error: 'That does not look like an email address, so nothing was saved.' }, { status: 400 });
  }
  if (!subject.trim() && !message.trim()) {
    return NextResponse.json({ error: 'Write something before saving a draft.' }, { status: 400 });
  }
  if (subject.length > MAX_SUBJECT_LENGTH || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'That is too long to save. Please shorten it.' }, { status: 400 });
  }

  try {
    const sender = resolveAdminSender(body?.sender);
    const customer = await findCustomerByEmail(to).catch(() => null);
    const draftId = await saveCustomerEmailDraft({
      id,
      customerId: customer?.id ?? null,
      email: to,
      senderKey: sender.key,
      subject,
      bodyText: message,
    });
    if (!draftId) {
      return NextResponse.json({ error: 'The draft could not be saved. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: draftId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'The draft could not be saved.' },
      { status: 500 }
    );
  }
}

// DELETE — ?id=123. Only drafts can be deleted; the sent and received
// history is permanent.
export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Provide the draft id.' }, { status: 400 });
  }
  try {
    const deleted = await deleteCustomerEmailDraft(id);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'The draft could not be deleted.' },
      { status: 500 }
    );
  }
}
