import { NextResponse } from 'next/server';
import { buildOrderConfirmationEmail } from '@/lib/orderConfirmationEmail';
import { buildShippingConfirmationEmail } from '@/lib/shippingEmail';

/**
 * Look at the emails a customer actually gets, without sending one.
 *
 * Kieran asked on 5 September 2026 (task 8a498491) to be shown what the "paid"
 * and "dispatched" emails look like, and to be able to check the research-use
 * disclaimer is on the bottom of them. Rather than paste him a mock-up, this
 * renders the REAL templates through the REAL builders, so what he sees on
 * screen is what lands in an inbox.
 *
 * THIS ROUTE SENDS NOTHING. It has no Resend call and it takes no recipient.
 * It reads no customer either: the figures below are obviously-fake sample
 * data, so nobody's order or address can leak out of a preview.
 *
 * Admin only. `/api/admin/*` is held behind the admin session cookie in
 * src/proxy.ts and this route is deliberately NOT on that file's exemption
 * list, so a signed-out visitor gets a 401 before reaching this code.
 *
 *   /api/admin/email-preview?type=paid        → the order confirmation
 *   /api/admin/email-preview?type=dispatched  → the tracking email
 *   ...&format=text                           → the plain-text half instead
 */

export const dynamic = 'force-dynamic';

/** Obvious sample data. Nothing here is a real customer, order or address. */
const SAMPLE = {
  to: 'sample.customer@example.com',
  customerName: 'Sample Customer',
  orderNumber: 'WG-SAMPLE',
  trackingNumber: 'AB123456789GB',
  carrierName: 'Royal Mail',
};

const TYPES = ['paid', 'dispatched'] as const;
type PreviewType = (typeof TYPES)[number];

function build(type: PreviewType): { subject: string; text: string; html: string } {
  if (type === 'dispatched') {
    return buildShippingConfirmationEmail({
      to: SAMPLE.to,
      customerName: SAMPLE.customerName,
      orderNumber: SAMPLE.orderNumber,
      trackingNumber: SAMPLE.trackingNumber,
      carrierName: SAMPLE.carrierName,
    });
  }

  // "Mark as paid" sends the order confirmation — see the mark-paid route.
  return buildOrderConfirmationEmail({
    to: SAMPLE.to,
    customerName: SAMPLE.customerName,
    orderNumber: SAMPLE.orderNumber,
    items: [
      { name: 'Sample Peptide', variant: '10mg', quantity: 2, price: 30, slug: 'sample-peptide' },
      { name: 'Bacteriostatic Water', variant: '3ml', quantity: 1, price: 4.99, slug: 'bac-water' },
    ],
    subtotal: 64.99,
    shippingLabel: 'Royal Mail Tracked 24',
    shippingCost: 4.95,
    total: 69.94,
    shippingAddress: 'Sample Customer\n1 Example Street\nSampleton\nSA1 1AA',
    glowCard: {
      earnedPoint: true,
      reason: 'earned' as const,
      points: 4,
      cycle: 1,
      nextMilestone: 5,
      nextRewardAmount: 10,
      pointsAway: 1,
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asked = (url.searchParams.get('type') || 'paid').toLowerCase();
  const format = (url.searchParams.get('format') || 'html').toLowerCase();

  if (!TYPES.includes(asked as PreviewType)) {
    return NextResponse.json(
      { error: `Unknown email type '${asked}'. Choose one of: ${TYPES.join(', ')}.` },
      { status: 400 },
    );
  }

  let built: { subject: string; text: string; html: string };
  try {
    built = build(asked as PreviewType);
  } catch (err) {
    console.error('[admin/email-preview] could not build the sample:', err);
    return NextResponse.json({ error: 'Could not build that sample email.' }, { status: 500 });
  }

  if (format === 'text') {
    return new NextResponse(`Subject: ${built.subject}\n\n${built.text}`, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  if (format === 'json') {
    return NextResponse.json(built);
  }

  // Rendered as the email itself, so it can be looked at and screenshotted.
  return new NextResponse(built.html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
