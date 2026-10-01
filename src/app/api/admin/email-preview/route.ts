import { NextResponse } from 'next/server';
import { buildEmailPreview, EMAIL_PREVIEW_TYPES, type EmailPreviewType } from '@/lib/email/previews';

// Admin-only through proxy.ts. Pure sample rendering: no recipient, customer lookup or send.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = (url.searchParams.get('type') || 'paid').toLowerCase();
  if (!(EMAIL_PREVIEW_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `Choose an email type: ${EMAIL_PREVIEW_TYPES.join(', ')}.` }, { status: 400 });
  }
  const message = buildEmailPreview(type as EmailPreviewType);
  const format = url.searchParams.get('format');
  if (format === 'json') return NextResponse.json(message);
  if (format === 'text') return new NextResponse(`Subject: ${message.subject}\n\n${message.text}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  return new NextResponse(message.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
