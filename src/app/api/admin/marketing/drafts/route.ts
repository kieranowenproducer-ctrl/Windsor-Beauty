import { NextResponse } from 'next/server';
import { isDbConfigured, saveMarketingDraft } from '@/lib/db';
import { formatMarketingBody } from '@/lib/marketingEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// POST /api/admin/marketing/drafts
//
// Saves the composer as a draft campaign (task 842923ab). Always an INSERT,
// never an update: saving an edit of a previous campaign or draft creates a
// new entry with its own date and time, and the one it was edited from stays
// exactly as it was.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.body === 'string' ? body.body : '';
  const sender = resolveMarketingSender(body?.sender);

  if (!subject || !text.trim()) {
    return NextResponse.json({ error: 'Please provide a subject and email body before saving a draft.' }, { status: 400 });
  }

  // The button and band are stored exactly as typed, not as the resolved
  // defaults: a draft that was never given a button must still follow the
  // template if the template's default ever changes.
  const draft = await saveMarketingDraft({
    subject,
    bodyText: text,
    bodyHtml: formatMarketingBody(text),
    sender: sender.key,
    ctaLabel: typeof body?.ctaLabel === 'string' ? body.ctaLabel.trim().slice(0, 40) || null : null,
    ctaUrl: typeof body?.ctaUrl === 'string' ? body.ctaUrl.trim().slice(0, 500) || null : null,
    headerLabel: typeof body?.headerLabel === 'string' ? body.headerLabel.trim().slice(0, 40) || null : null,
  });

  if (!draft) {
    return NextResponse.json({ error: 'Could not save the draft. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, draftId: draft.id, savedAt: draft.sent_at });
}
