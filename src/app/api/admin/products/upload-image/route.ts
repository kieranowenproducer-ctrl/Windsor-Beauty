import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Kept below Vercel's ~4.5MB serverless request-body ceiling — above that,
// the platform itself rejects the request before this code ever runs. The
// admin upload components compress photos client-side first, so a real
// camera photo should land well under this regardless.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// Vercel now connects Blob stores via OIDC (short-lived tokens resolved at
// request time from BLOB_STORE_ID), rather than the older long-lived
// BLOB_READ_WRITE_TOKEN — a project can be fully working with only the former
// present. Recognise either so a correctly-connected OIDC store isn't
// reported as "not configured".
function isBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

// Body: multipart/form-data with a single "file" field.
// Returns { url } pointing at the uploaded photo on Vercel Blob storage —
// the only place product images can live, since the app's filesystem is
// read-only at runtime once deployed.
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

  const filename = `products/${crypto.randomUUID()}.${extension}`;

  try {
    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    // Storefront photos must be publicly viewable by anonymous shoppers, so the
    // Blob store has to be created/configured with public access — this specific
    // API error means it's currently set to private and needs reconfiguring in
    // the Vercel dashboard (Storage tab → the Blob store → access settings).
    if (message.toLowerCase().includes('private store')) {
      return NextResponse.json(
        {
          error:
            'This Blob store is configured for private access, but product photos need to be public so shoppers can see them. In the Vercel dashboard, open Storage → the Blob store and switch its access to Public (or create a new store with Public access selected).',
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
