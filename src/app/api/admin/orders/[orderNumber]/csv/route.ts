import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured, markOrdersExported } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/orders/[orderNumber]/csv
 *
 * Downloads a single-order Royal Mail Click & Drop CSV, and marks the order
 * as exported so it moves into the Dispatch page's "Enter Tracking Numbers"
 * step, same as a bulk date export would.
 * Import the file into Click & Drop → Orders → Import from spreadsheet.
 */
export async function GET(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

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

  // Royal Mail's spreadsheet import expects parcel weight in kilograms. We
  // don't track per-product weights yet, so estimate from item count
  // (50g per unit + 50g packaging, minimum 100g) — close enough for small
  // peptide vials/pens, and easy to overwrite per row before uploading.
  function estimateWeightKg(items: { quantity: number }[]): string {
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
  const headers = [
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

  const contents = order.items
    .map(item => `${item.quantity}x ${item.name}${item.variant ? ` ${item.variant}` : ''}`.trim())
    .join('; ');

  const { firstName, lastName } = splitName(order.customer_name);

  const row = [
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
    estimateWeightKg(order.items),
    Number(order.total).toFixed(2),
    'GBP',
    contents,
  ];

  const csv = [
    headers.map(csvCell).join(','),
    row.map(csvCell).join(','),
  ].join('\r\n');

  await markOrdersExported([order.order_number]);

  const filename = `${order.order_number}-royal-mail.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
