import { NextResponse } from 'next/server';
import { isDbConfigured, listOrdersForCSVExport, markOrdersExported } from '@/lib/db';
import { londonDateString } from '@/lib/date';

export const dynamic = 'force-dynamic';

function csvCell(value: string | null | undefined): string {
  const str = value ?? '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Service register codes are specific to this Click & Drop account
// (Settings -> Shipping services) — confirmed working codes:
// TOLP48 = Royal Mail Tracked 48, TOLP24 = Royal Mail Tracked 24,
// ITROLP = Royal Mail International Tracked.
// Every UK parcel ships as Tracked 24 (TOLP24), regardless of the customer's
// chosen option (Kieran, 2026-07-17). Only international differs.
function resolveServiceCode(shippingLabel: string): string {
  if (shippingLabel.toLowerCase().includes('international')) return 'ITROLP';
  return 'TOLP24';
}

// Click & Drop's default "DDMMYYYY" date setting actually expects DD/MM/YYYY
// (e.g. 26/05/2026), not the ISO format we store dates in.
function formatDateForExport(isoDate: string): string {
  const date = new Date(isoDate);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

// Click & Drop's "First Name"/"Last Name" fields are separate, so split our
// single stored name on the first space.
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { firstName: trimmed, lastName: '' };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

// Royal Mail's spreadsheet import expects parcel weight in kilograms. Orders
// placed since the per-product shipping snapshot was introduced carry their
// real calculated parcel weight in `parcel_weight_grams` — use that. Older
// orders placed before the snapshot existed fall back to a rough estimate
// from item count (50g per unit + 50g packaging, minimum 100g), easy to
// overwrite per row before uploading.
function estimateWeightKg(items: { quantity: number }[], parcelWeightGrams: number | null): string {
  if (parcelWeightGrams) return (parcelWeightGrams / 1000).toFixed(2);
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const weightKg = Math.max(0.1, totalUnits * 0.05 + 0.05);
  return weightKg.toFixed(2);
}

// Headers match Royal Mail Click & Drop's recognised import field names
// (Order reference, Date, First Name, Last Name, Company Name, Address
// Line 1/2, City, County, Postcode, Country, Phone, Email, Service Code,
// Package Format, Weight, Total, Currency Code, Special instructions) so
// they appear directly in the column-mapping dropdowns. Package Format
// must be one of Royal Mail's recognised values: Letter, Large Letter, or
// Parcel — "Parcel" is used for every order here.
const CSV_HEADERS = [
  'Order reference',
  'Date',
  'First Name',
  'Last Name',
  'Company Name',
  'Address Line 1',
  'Address Line 2',
  'City',
  'County',
  'Postcode',
  'Country',
  'Phone',
  'Email',
  'Service Code',
  'Package Format',
  'Weight',
  'Total',
  'Currency Code',
  'Special instructions',
];

/**
 * GET /api/admin/dispatch/csv?date=YYYY-MM-DD
 *
 * Generates a multi-row Royal Mail Click & Drop CSV for all un-exported
 * paid orders on the given date (or all un-exported orders if no date supplied).
 * Also marks every included order as 'exported' so they don't appear again.
 */
export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date'); // optional YYYY-MM-DD filter

  const allOrders = await listOrdersForCSVExport();
  const orders = date
    ? allOrders.filter(o => londonDateString(o.created_at) === date)
    : allOrders;

  if (orders.length === 0) {
    return NextResponse.json(
      { error: 'No orders ready to export for this date.' },
      { status: 404 }
    );
  }

  const rows = orders.map(order => {
    const contents = order.items
      .map(i => `${i.quantity}x ${i.name}${i.variant ? ` ${i.variant}` : ''}`.trim())
      .join('; ');

    const { firstName, lastName } = splitName(order.customer_name);

    return [
      order.order_number,
      order.created_at ? formatDateForExport(order.created_at) : '',
      firstName,
      lastName,
      '',
      order.shipping_line1 ?? '',
      order.shipping_line2 ?? '',
      order.shipping_city ?? '',
      '',
      order.shipping_postcode ?? '',
      order.shipping_country ?? 'United Kingdom',
      order.phone ?? '',
      order.email,
      resolveServiceCode(order.shipping_label),
      'Parcel',
      estimateWeightKg(order.items, order.parcel_weight_grams),
      Number(order.total).toFixed(2),
      'GBP',
      contents,
    ].map(csvCell).join(',');
  });

  const csv = [CSV_HEADERS.map(csvCell).join(','), ...rows].join('\r\n');

  // Mark all included orders as exported so they don't appear in future downloads
  await markOrdersExported(orders.map(o => o.order_number));

  const dateLabel = date ?? londonDateString(new Date());
  const filename = `windsor-beauty-dispatch-${dateLabel}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
