import { NextResponse } from 'next/server';
import { isDbConfigured, listOrdersForCSVExport, listExportedOrdersAwaitingTracking } from '@/lib/db';
import { londonDateString } from '@/lib/date';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const [exportOrders, trackOrders] = await Promise.all([
    listOrdersForCSVExport(),
    listExportedOrdersAwaitingTracking(),
  ]);

  // Group export-ready orders by calendar date (newest date first)
  const byDate = new Map<string, typeof exportOrders>();
  for (const o of exportOrders) {
    const date = londonDateString(o.created_at);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(o);
  }

  const toExport = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, orders]) => ({
      date,
      orders: orders.map(o => ({
        orderNumber: o.order_number,
        customerName: o.customer_name,
        email: o.email,
        shippingLabel: o.shipping_label,
        total: Number(o.total),
        createdAt: o.created_at,
      })),
    }));

  const toTrack = trackOrders.map(o => ({
    orderNumber: o.order_number,
    customerName: o.customer_name,
    email: o.email,
    shippingLabel: o.shipping_label,
    total: Number(o.total),
    exportedAt: o.exported_at,
  }));

  return NextResponse.json({ toExport, toTrack });
}
