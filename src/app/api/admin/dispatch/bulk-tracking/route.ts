import { NextResponse } from 'next/server';
import {
  isDbConfigured,
  findOrderByNumber,
  updateOrderTracking,
  updateOrderStatus,
  markShippingEmailSent,
} from '@/lib/db';
import { sendShippingConfirmationEmail } from '@/lib/shippingEmail';

function carrierLabel(shippingLabel: string): string {
  // Every UK parcel ships as Royal Mail Tracked 24 (Kieran, 2026-07-17),
  // whatever the customer chose. Only international differs.
  if (shippingLabel.toLowerCase().includes('international')) return 'Royal Mail International Tracked';
  return 'Royal Mail Tracked 24';
}

interface TrackingEntry {
  orderNumber: string;
  trackingNumber: string;
}

interface TrackingResult {
  orderNumber: string;
  success: boolean;
  emailSent: boolean;
  error?: string;
}

/**
 * POST /api/admin/dispatch/bulk-tracking
 * Body: { entries: [{ orderNumber, trackingNumber }] }
 *
 * Saves tracking numbers for multiple orders in one request.
 * For each order: updates tracking, advances status to 'dispatched',
 * and sends the customer their dispatch email (once only).
 */
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.entries)) {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const results: TrackingResult[] = [];

  for (const entry of body.entries as TrackingEntry[]) {
    const { orderNumber, trackingNumber } = entry ?? {};
    if (!orderNumber || !trackingNumber?.trim()) {
      results.push({ orderNumber: orderNumber ?? '', success: false, emailSent: false, error: 'Missing data.' });
      continue;
    }

    try {
      const order = await findOrderByNumber(orderNumber);
      if (!order) {
        results.push({ orderNumber, success: false, emailSent: false, error: 'Order not found.' });
        continue;
      }

      await updateOrderTracking(orderNumber, trackingNumber.trim());

      const preDispatch = ['paid', 'awaiting_dispatch', 'exported', 'processing'].includes(order.status);
      if (preDispatch) {
        await updateOrderStatus(orderNumber, 'dispatched');
      }

      let emailSent = false;
      if (!order.shipping_email_sent_at) {
        emailSent = await sendShippingConfirmationEmail({
          to:           order.email,
          customerName: order.customer_name,
          orderNumber:  order.order_number,
          trackingNumber: trackingNumber.trim(),
          carrierName:  carrierLabel(order.shipping_label),
        }).catch(() => false);

        if (emailSent) {
          await markShippingEmailSent(orderNumber).catch(() => {});
        }
      }

      results.push({ orderNumber, success: true, emailSent });
    } catch (err) {
      results.push({ orderNumber, success: false, emailSent: false, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
