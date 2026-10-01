import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { resolveCustomerFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// Body: multipart/form-data with a single "file" field. Only logged-in
// customers can attach a photo to a review.
// Returns { url } pointing at the uploaded photo on Vercel Blob storage.
export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Please log in to upload a photo.' }, { status: 401 });
  }

  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: 'Image storage is not configured. Set BLOB_READ_WRITE_TOKEN in environment variables.' },
      { status: 503 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Provide a file in the "file" field.' }, { status: 400 });
  }

  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: 'Unsupported image type. Please upload a JPEG, PNG, or WebP file.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large. Maximum size is 5MB.' }, { status: 400 });
  }

  const filename = `reviews/${crypto.randomUUID()}.${extension}`;

  try {
    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.toLowerCase().includes('private store')) {
      return NextResponse.json(
        {
          error:
            'This Blob store is configured for private access, but review photos need to be public so they can be displayed. In the Vercel dashboard, open Storage → the Blob store and switch its access to Public (or create a new store with Public access selected).',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: message || 'Failed to upload image.' },
      { status: 500 }
    );
  }
}
