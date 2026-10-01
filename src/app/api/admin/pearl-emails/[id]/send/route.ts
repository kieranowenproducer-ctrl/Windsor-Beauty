import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { findPearlEmailDraft, markPearlEmailDraftSent } from '@/lib/db/pearlEmailDrafts';
import { buildPearlReplyTemplate, pearlReplyValidationError } from '@/lib/email/pearlReplyTemplate';
import { renderPearlEmail } from '@/lib/email/pearlEmailRender';
import { sendEmail } from '@/lib/email/send';
import { isSendableEmailAddress } from '@/lib/emailAddress';

export const dynamic = 'force-dynamic';

// Sends a drafted PEARL email to the address on the draft (task 9add1201).
//
// It is built with exactly the same pieces the Website Enquiries reply uses:
// the standard letter from /admin/pearl-email, and the one renderer in
// pearlEmailRender. So what the customer receives is what the screen showed,
// by construction rather than by anyone remembering to keep two copies in step.
//
// Goes out through sendEmail, so info@windsorglow.com is blind copied like
// every other email the site sends.

const FROM_ADDRESS = process.env.ENQUIRY_REPLY_FROM || 'Windsor Glow <info@windsorglow.com>';
const REPLY_TO_ADDRESS = process.env.ENQUIRY_REPLY_TO || 'info@windsorglow.com';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Which draft?' }, { status: 400 });
  }

  const draft = await findPearlEmailDraft(id);
  if (!draft) return NextResponse.json({ error: 'Draft not found.' }, { status: 404 });

  if (draft.sent_at) {
    return NextResponse.json(
      { error: 'This one has already been sent. Copy it into a new draft if you need to send it again.' },
      { status: 409 }
    );
  }
  if (!isSendableEmailAddress(draft.customer_email)) {
    return NextResponse.json({ error: 'Put the customer\'s email address on the draft first.' }, { status: 400 });
  }
  if (!draft.pearl_title.trim() || !draft.pearl_answer.trim()) {
    return NextResponse.json({ error: 'The title and the answer both need filling in before this can go.' }, { status: 400 });
  }

  // This draft's own wrapper if it has one, otherwise the standard letter the
  // enquiry replies use (task 9add1201).
  const saved = await getSiteContent('pearl-email').catch(() => null);
  const letter = draft.letter_override?.trim()
    ? draft.letter_override
    : (typeof saved?.body === 'string' ? saved.body : null);
  const message = buildPearlReplyTemplate(
    draft.customer_name,
    draft.pearl_title,
    draft.pearl_answer,
    letter,
  );

  const invalid = pearlReplyValidationError(message);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const rendered = renderPearlEmail({ message, subject: draft.subject ?? undefined });
  if (!rendered) {
    return NextResponse.json({ error: 'That email could not be built. Check the standard letter.' }, { status: 400 });
  }

  const { error } = await sendEmail({
    from: FROM_ADDRESS,
    to: draft.customer_email,
    replyTo: REPLY_TO_ADDRESS,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
  });

  if (error) {
    return NextResponse.json({ error: 'It would not send. Please try again shortly.' }, { status: 502 });
  }

  const sent = await markPearlEmailDraftSent(id);
  return NextResponse.json({
    success: true,
    draft: sent,
    message: `Sent to ${draft.customer_email}.`,
  });
}
