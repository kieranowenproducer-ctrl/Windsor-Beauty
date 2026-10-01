import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Kept below Vercel's ~4.5MB serverless request-body ceiling — see the
// products upload route for the full explanation.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// Body: multipart/form-data with a single "file" field.
// Returns { url } pointing at the uploaded photo on Vercel Blob storage —
// used for admin-editable site content images (e.g. the About page).
export async function POST(request: Request) {
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
    return NextResponse.json({ error: 'Image is too large. Maximum size is 4MB.' }, { status: 400 });
  }

  const filename = `content/${crypto.randomUUID()}.${extension}`;

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
            'This Blob store is configured for private access, but site images need to be public so visitors can see them. In the Vercel dashboard, open Storage → the Blob store and switch its access to Public (or create a new store with Public access selected).',
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
