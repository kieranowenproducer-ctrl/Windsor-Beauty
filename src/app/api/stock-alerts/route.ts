import { NextResponse } from 'next/server';
import { createStockAlert, isDbConfigured } from '@/lib/db';
import { clientIpOf, isFormRateLimited, logFormAttempt, RATE_LIMIT_MESSAGE } from '@/lib/db/formLimits';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/;

// POST /api/stock-alerts
// Called from the product page's "Notify me when back in stock" form.
// Body: { email: string, slug: string }
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'This feature is temporarily unavailable.' }, { status: 503 });
  }

  const ip = clientIpOf(request);
  if (await isFormRateLimited('stock-alert', ip)) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  await logFormAttempt('stock-alert', ip);

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (!slug || !SLUG_PATTERN.test(slug)) {
    return NextResponse.json({ error: 'Invalid product.' }, { status: 400 });
  }

  await createStockAlert(email, slug);

  return NextResponse.json({ success: true });
}
