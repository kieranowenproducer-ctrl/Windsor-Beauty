import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db';
import { isInboundAttachmentRecorded } from '@/lib/db/enquiries';

export const dynamic = 'force-dynamic';

// The admin cookie gate in proxy.ts protects this route. Staff fetch a fresh
// one-hour Resend URL on demand; no expiring public URL is stored in the case.
export async function GET(request: Request) {
  const receivingKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
  if (!isDbConfigured() || !receivingKey) {
    return NextResponse.json({ error: 'Attachment access is not configured.' }, { status: 503 });
  }
  const url = new URL(request.url);
  const emailId = url.searchParams.get('emailId') ?? '';
  const attachmentId = url.searchParams.get('attachmentId') ?? '';
  if (!/^[a-zA-Z0-9-]{8,80}$/.test(emailId) || !/^[a-zA-Z0-9-]{8,80}$/.test(attachmentId)) {
    return NextResponse.json({ error: 'Invalid attachment reference.' }, { status: 400 });
  }
  if (!await isInboundAttachmentRecorded(emailId, attachmentId)) {
    return NextResponse.json({ error: 'Attachment is not on a recorded enquiry.' }, { status: 404 });
  }
  const metaResponse = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`, {
    headers: { Authorization: `Bearer ${receivingKey}` }, cache: 'no-store',
  });
  if (!metaResponse.ok) return NextResponse.json({ error: 'Attachment could not be opened.' }, { status: 502 });
  const meta = await metaResponse.json() as { download_url?: string; filename?: string; content_type?: string; size?: number };
  if (!meta.download_url || (meta.size ?? 0) > 20_000_000) {
    return NextResponse.json({ error: 'Attachment is unavailable or too large.' }, { status: 413 });
  }
  const downloadUrl = new URL(meta.download_url);
  if (downloadUrl.protocol !== 'https:' || !downloadUrl.hostname.endsWith('.resend.com')) {
    return NextResponse.json({ error: 'Attachment location was refused.' }, { status: 502 });
  }
  const fileResponse = await fetch(downloadUrl, { cache: 'no-store' });
  if (!fileResponse.ok || !fileResponse.body) {
    return NextResponse.json({ error: 'Attachment download failed.' }, { status: 502 });
  }
  const filename = (meta.filename ?? 'attachment').replace(/[\r\n"\\]/g, '_');
  return new Response(fileResponse.body, {
    headers: {
      'Content-Type': meta.content_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
