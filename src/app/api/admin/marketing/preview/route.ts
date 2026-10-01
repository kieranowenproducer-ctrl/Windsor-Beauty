import { NextResponse } from 'next/server';
import { formatMarketingBody, renderMarketingEmailHtml } from '@/lib/marketingEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// Renders the campaign HTML exactly as it will be sent, using a placeholder
// unsubscribe link, so the admin can preview before sending. The chosen sender
// is honoured here too, so the preview shows the do-not-reply footer line
// whenever the send would carry it (task 286b1863).
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const text = typeof body?.body === 'string' ? body.body : '';
  const sender = resolveMarketingSender(body?.sender);

  if (!subject || !text.trim()) {
    return NextResponse.json({ error: 'Please provide a subject and email body.' }, { status: 400 });
  }

  const html = renderMarketingEmailHtml({
    subject,
    bodyHtml: formatMarketingBody(text),
    unsubscribeUrl: 'https://windsorglow.com/unsubscribe?token=preview',
    sender: sender.key,
    ctaLabel: typeof body?.ctaLabel === 'string' ? body.ctaLabel : null,
    ctaUrl: typeof body?.ctaUrl === 'string' ? body.ctaUrl : null,
    headerLabel: typeof body?.headerLabel === 'string' ? body.headerLabel : null,
  });

  return NextResponse.json({ html, sender: sender.key, sentFrom: sender.address });
}
