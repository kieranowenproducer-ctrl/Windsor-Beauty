import { NextResponse } from 'next/server';
import { findInvoiceByPublicToken, isDbConfigured, markInvoiceViewed } from '@/lib/db';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF, base64-encoded.
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64'
);

// GET /api/invoices/[token]/pixel
//
// Tracking pixel embedded in the invoice email — best-effort "viewed"
// signal only, since most mail clients block remote images by default.
// markInvoiceViewed() only advances 'sent' -> 'viewed', never downgrades a
// later state, so this is safe to hit any number of times.
export async function GET(_request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (isDbConfigured()) {
    const invoice = await findInvoiceByPublicToken(params.token);
    if (invoice) {
      await markInvoiceViewed(invoice.id).catch(() => {});
    }
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
