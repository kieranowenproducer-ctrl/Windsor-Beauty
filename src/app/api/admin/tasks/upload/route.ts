import { NextResponse } from 'next/server';
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { getMember } from '@/lib/tasks/identity';
import { tsql } from '@/lib/tasks/db';
import { IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from '@/lib/tasks/media';

export const dynamic = 'force-dynamic';

// Task media uploads -> Vercel Blob via PRESIGNED URLs: the browser asks this
// route for a one-off signed PUT URL, then sends the file straight to Blob
// storage. The file never passes through the serverless function, so the old
// ~4MB request-body ceiling is gone — which is what makes video possible.
// This project authenticates to Blob via OIDC (BLOB_STORE_ID + runtime token)
// in production; the signed token carries the size/type limits, so the rules
// are enforced by Blob itself, not just by the browser.
// Limits: photos 10MB, videos 200MB (~2-3 min of 1080p iPhone footage).
export async function POST(request: Request) {
  const me = await getMember();
  if (!me) return NextResponse.json({ error: 'Pick who you are first' }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return NextResponse.json({ error: 'File storage is not configured (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID).' }, { status: 503 });
  }
  const b = await request.json().catch(() => ({}));
  const filename = String(b.filename ?? 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const contentType = String(b.contentType ?? '');
  const isVideo = contentType.startsWith('video/');
  const allowed = isVideo ? VIDEO_TYPES : IMAGE_TYPES;
  if (!allowed.includes(contentType)) {
    return NextResponse.json({ error: 'Upload a photo (JPEG, PNG, WebP, GIF) or a video (.mp4, .mov, .webm).' }, { status: 400 });
  }
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (Number(b.size) > maxBytes) {
    return NextResponse.json({ error: isVideo ? 'Videos must be under 200MB.' : 'Photos must be under 10MB.' }, { status: 400 });
  }

  try {
    const pathname = `tasks/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`;
    const token = await issueSignedToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxBytes,
      validUntil: Date.now() + 60 * 60 * 1000, // slow mobile uploads get an hour
    });
    const { presignedUrl } = await presignUrl(token, { pathname, operation: 'put', access: 'public' });
    // Server-derived public URL (v3 Stage 4): the presigned host is the storage
    // endpoint; the final public URL is the store's public hostname + pathname.
    // Sent as a fallback so an unreadable PUT response can't sink a good upload.
    let publicUrl: string | undefined;
    try {
      const host = new URL(presignedUrl).hostname; // <store>.blob.vercel-storage.com or similar
      const store = host.split('.')[0];
      if (store) publicUrl = `https://${store}.public.blob.vercel-storage.com/${pathname}`;
    } catch { /* fallback stays undefined; the PUT response URL is still primary */ }
    // Upload ledger (video-upload diagnostics): every presign is recorded; the
    // attachment insert marks it completed. An attempt with no completion =
    // the transfer died in the browser (network/timeout/closed tab) — finally
    // visible instead of silent.
    await tsql()`INSERT INTO upload_attempts (pathname, filename, content_type, size_bytes, member_name)
      VALUES (${pathname}, ${filename}, ${contentType}, ${Number(b.size) || null}, ${me.name ?? null})`.catch(() => {});
    return NextResponse.json({ ok: true, presignedUrl, pathname, publicUrl });
  } catch (err) {
    console.error(`[task-upload] presign FAILED (${contentType}, ${Number(b.size)}B):`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not prepare the upload — the storage service refused. Try again; if it persists, tell Kieran.', stage: 'presign' }, { status: 502 });
  }
}
