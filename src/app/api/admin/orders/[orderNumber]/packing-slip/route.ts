import { NextResponse } from 'next/server';
import { findOrderByNumber, isDbConfigured } from '@/lib/db';

/**
 * GET /api/admin/orders/[orderNumber]/packing-slip
 *
 * Returns a print-ready HTML packing slip / delivery note for an order.
 * Admin opens this in a new tab and uses the browser's Print function.
 *
 * Includes:
 *   - Windsor Beauty header
 *   - Order reference and date
 *   - Customer details (name, address, email, phone)
 *   - Ordered items with quantities and prices
 *   - Subtotal, discount, shipping, total
 *   - Tracking number (if already assigned)
 *   - Footer with the shop's name, website and orders address
 */
export async function GET(_request: Request, props: { params: Promise<{ orderNumber: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return new NextResponse('Database not configured', { status: 503 });
  }

  const order = await findOrderByNumber(params.orderNumber);
  if (!order) {
    return new NextResponse('Order not found', { status: 404 });
  }

  const orderDate = new Date(order.created_at).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const addressLines = [
    order.customer_name,
    order.shipping_line1,
    order.shipping_line2,
    order.shipping_city,
    order.shipping_postcode,
    order.shipping_country,
  ].filter(Boolean).join('\n');

  const itemRows = order.items.map((item) => `
    <tr>
      <td>${item.name}</td>
      <td>${item.variant}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">£${Number(item.price).toFixed(2)}</td>
      <td style="text-align:right">£${(Number(item.price) * item.quantity).toFixed(2)}</td>
    </tr>
  `).join('');

  const discountRow = Number(order.discount_amount) > 0 ? `
    <tr>
      <td colspan="4" style="text-align:right">Discount${order.discount_code ? ` (${order.discount_code})` : ''}</td>
      <td style="text-align:right;color:#c0392b">−£${Number(order.discount_amount).toFixed(2)}</td>
    </tr>
  ` : '';

  const trackingRow = order.tracking_number ? `
    <tr>
      <td colspan="5" style="padding-top:8px">
        <strong>Tracking number:</strong> ${order.tracking_number}
      </td>
    </tr>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Packing Slip ${order.order_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; color: #3A2630; padding: 32px 40px; max-width: 720px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3A2630; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
    .brand-sub { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #666; margin-top: 2px; }
    .order-ref { text-align: right; }
    .order-ref h2 { font-size: 15px; }
    .order-ref p { font-size: 12px; color: #555; margin-top: 3px; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 6px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .address { white-space: pre-line; line-height: 1.6; }
    .contact { line-height: 1.8; font-size: 12px; color: #444; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #ccc; padding: 6px 0; text-align: left; }
    th:last-child, th:nth-child(4), th:nth-child(3) { text-align: right; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; vertical-align: top; line-height: 1.4; }
    .totals { margin-left: auto; width: 260px; }
    .totals td { border: none; padding: 4px 0; font-size: 12px; }
    .totals .grand-total td { font-size: 14px; font-weight: bold; border-top: 2px solid #3A2630; padding-top: 8px; }
    .shipping-bar { background: #f5f5f5; border: 1px solid #e0e0e0; padding: 10px 14px; border-radius: 4px; margin-bottom: 24px; font-size: 12px; }
    .shipping-bar strong { display: block; margin-bottom: 2px; }
    .footer { border-top: 1px solid #ccc; padding-top: 16px; font-size: 10px; color: #888; line-height: 1.6; text-align: center; }
    @media print {
      body { padding: 16px 24px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand">Windsor Beauty</div>
      <div class="brand-sub">Skincare</div>
    </div>
    <div class="order-ref">
      <h2>Packing Slip</h2>
      <p>Order: <strong>${order.order_number}</strong></p>
      <p>Date: ${orderDate}</p>
      <p>Status: ${order.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
    </div>
  </div>

  <div class="columns">
    <div>
      <div class="section-title">Ship to</div>
      <div class="address">${addressLines}</div>
    </div>
    <div>
      <div class="section-title">Customer contact</div>
      <div class="contact">
        <div>${order.email}</div>
        ${order.phone ? `<div>${order.phone}</div>` : ''}
      </div>
    </div>
  </div>

  <div class="shipping-bar">
    <strong>Delivery method</strong>
    ${order.shipping_label}${order.tracking_number ? `, <strong>Tracking: ${order.tracking_number}</strong>` : ''}
  </div>

  <div class="section-title" style="margin-bottom:8px">Order items</div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Variant</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit price</th>
        <th style="text-align:right">Line total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <table class="totals">
    <tbody>
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right">£${Number(order.subtotal).toFixed(2)}</td>
      </tr>
      ${discountRow}
      <tr>
        <td>Shipping (${order.shipping_label})</td>
        <td style="text-align:right">£${Number(order.shipping_cost).toFixed(2)}</td>
      </tr>
      ${trackingRow}
      <tr class="grand-total">
        <td><strong>Total paid</strong></td>
        <td style="text-align:right"><strong>£${Number(order.total).toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  ${order.admin_notes ? `<div style="margin-top:16px;padding:10px;background:#fffbe6;border:1px solid #e8d44d;border-radius:4px;font-size:11px;color:#555"><strong>Admin notes:</strong><br>${order.admin_notes.replace(/\n/g, '<br>')}</div>` : ''}

  <div class="footer">
    <p>Windsor Beauty, windsorbeauty.co.uk, orders@windsorbeauty.co.uk</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:10px 24px;background:#3A2630;color:white;border:none;cursor:pointer;font-size:14px;border-radius:4px">
      Print / Save as PDF
    </button>
  </div>

</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
