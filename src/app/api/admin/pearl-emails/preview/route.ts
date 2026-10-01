import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { buildPearlReplyTemplate } from '@/lib/email/pearlReplyTemplate';
import { renderPearlEmail } from '@/lib/email/pearlEmailRender';

export const dynamic = 'force-dynamic';

// The finished PEARL email, drawn but not sent (task 9add1201).
//
// Kieran: "Any emails drafted on PEARL's dashboard must look identical to how
// they appear to a customer with the background etc."
//
// The preview is built HERE, by the same code as the send, rather than being
// drawn a second time in the browser. A second drawing is how a preview and a
// real email start to differ, which is the whole thing he is guarding against.
//
// Sends nothing, stores nothing. Admin-gated like every /api/admin route.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const customerName = typeof body?.customerName === 'string' ? body.customerName : '';
  const pearlTitle = typeof body?.pearlTitle === 'string' ? body.pearlTitle : '';
  const pearlAnswer = typeof body?.pearlAnswer === 'string' ? body.pearlAnswer : '';
  // A draft with its own wrapper previews with that wrapper, or the screen
  // would be showing something other than what would be sent.
  const letterOverride = typeof body?.letterOverride === 'string' ? body.letterOverride : '';

  const saved = isDbConfigured() ? await getSiteContent('pearl-email').catch(() => null) : null;
  const message = buildPearlReplyTemplate(
    customerName,
    pearlTitle,
    pearlAnswer,
    letterOverride.trim() ? letterOverride : (typeof saved?.body === 'string' ? saved.body : null),
  );

  const rendered = renderPearlEmail({ message });
  if (!rendered) {
    return NextResponse.json({ error: 'The standard letter is missing its PEARL lines.' }, { status: 400 });
  }
  return NextResponse.json({ html: rendered.html, subject: rendered.subject });
}
