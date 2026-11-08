import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured, PAYMENT_CONFIRMED_STATUSES } from '@/lib/db';
import { changeDeliveryDetails, currentDeliveryDetails, deliveryChangeBlocker, deliveryDetailsVersion } from '@/lib/orderDeliveryChange';

import { hasAdminReadAccess } from '@/lib/adminReadAccess';

export const dynamic = 'force-dynamic';

// Change delivery details before dispatch (Samuel, 3 Nov 2026). The work and its
// safety rules live in src/lib/orderDeliveryChange.ts. Admin-only, like every
// route under /api/admin.

export async function GET(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orderNumber } = await props.params;
  if (!/^WB-[A-Z0-9-]+$/.test(orderNumber)) return NextResponse.json({ error: 'Use a Windsor Beauty order reference.' }, { status: 400 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  const order = await findOrderByNumber(orderNumber);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  return NextResponse.json({
    details: currentDeliveryDetails(order),
    version: deliveryDetailsVersion(order),
    customerName: order.customer_name,
    blocked: deliveryChangeBlocker(order),
    byRoyalMail: order.fulfilment_type === 'royal_mail',
    paid: PAYMENT_CONFIRMED_STATUSES.includes(order.status),
    royalMailOrderExists: Boolean(order.royal_mail_order_id) || order.royal_mail_label_status === 'pending_postage',
    oldLabelPaid: order.royal_mail_label_status === 'created',
    labelPrinted: Boolean(order.royal_mail_printed_on),
  });
}

export async function POST(request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orderNumber } = await props.params;
  if (!/^WB-[A-Z0-9-]+$/.test(orderNumber)) return NextResponse.json({ error: 'Use a Windsor Beauty order reference.' }, { status: 400 });
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Refresh this page before saving.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Send JSON delivery details.' }, { status: 415 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4096) return NextResponse.json({ error: 'Delivery details are too large.' }, { status: 413 });
  let body; try { body = JSON.parse(raw); } catch { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['recipient','line1','line2','city','postcode','country','expectedVersion'].includes(key))) return NextResponse.json({ error: 'Nothing was sent.' }, { status: 400 });

  const result = await changeDeliveryDetails(orderNumber, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const o = result.order;
  return NextResponse.json({
    order: {
      shippingAddress: o.shipping_address,
      shippingRecipient: o.shipping_recipient,
      shippingCountry: o.shipping_country,
      royalMailOrderId: o.royal_mail_order_id,
      royalMailLabelStatus: o.royal_mail_label_status,
      royalMailLabelError: o.royal_mail_label_error,
      trackingNumber: o.tracking_number,
      trackingUrl: o.tracking_url,
      adminNotes: o.admin_notes,
      royalMailPrintedOn: o.royal_mail_printed_on ?? null,
    },
    deletedRoyalMailOrders: result.deletedRoyalMailOrders,
    oldLabelWasPaid: result.oldLabelWasPaid,
    royalMail: result.royalMail && {
      ok: result.royalMail.ok,
      pending: result.royalMail.pending ?? false,
      skipped: result.royalMail.skipped ?? false,
      error: result.royalMail.error ?? null,
      trackingNumber: result.royalMail.trackingNumber ?? null,
    },
  });
}
