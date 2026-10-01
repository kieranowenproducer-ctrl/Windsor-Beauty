import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import {
  deletePearlEmailDraft,
  listPearlEmailDrafts,
  savePearlEmailDraft,
} from '@/lib/db/pearlEmailDrafts';
import { isSendableEmailAddress } from '@/lib/emailAddress';

export const dynamic = 'force-dynamic';

// Drafted PEARL emails on the PEARL dashboard (task 9add1201).
// Nothing here ever sends: sending is its own route, so a save can never
// become a send by accident.
//
// Protected by the admin session gate in src/proxy.ts.

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ drafts: [] });
  const drafts = await listPearlEmailDrafts().catch(() => []);
  return NextResponse.json({ drafts });
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const id = Number.isInteger(body?.id) && body.id > 0 ? Number(body.id) : null;
  const customerName = typeof body?.customerName === 'string' ? body.customerName.trim() : '';
  const customerEmail = typeof body?.customerEmail === 'string' ? body.customerEmail.trim() : '';
  const pearlTitle = typeof body?.pearlTitle === 'string' ? body.pearlTitle.trim() : '';
  const pearlAnswer = typeof body?.pearlAnswer === 'string' ? body.pearlAnswer : '';
  const subject = typeof body?.subject === 'string' ? body.subject.trim() || null : null;
  // This draft's own wrapper letter, when Kieran wants one email to read
  // differently from the standard one (task 9add1201).
  const letterOverride = typeof body?.letterOverride === 'string' ? body.letterOverride : null;

  // A draft is allowed to be half finished, because that is what a draft is.
  // The only thing refused is one with nothing in it at all.
  if (!pearlTitle && !pearlAnswer.trim() && !customerEmail) {
    return NextResponse.json({ error: 'Write something before saving a draft.' }, { status: 400 });
  }
  // An address that is present but wrong is worth catching now rather than at
  // the moment somebody presses Send.
  if (customerEmail && !isSendableEmailAddress(customerEmail)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
  }

  const draft = await savePearlEmailDraft({ id, customerName, customerEmail, pearlTitle, pearlAnswer, subject, letterOverride });
  if (!draft) return NextResponse.json({ error: 'That draft could not be saved.' }, { status: 500 });
  return NextResponse.json({ draft });
}

export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Which draft?' }, { status: 400 });
  }
  const gone = await deletePearlEmailDraft(id);
  if (!gone) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });
  return NextResponse.json({ success: true });
}
