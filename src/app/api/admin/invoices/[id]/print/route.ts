import { NextResponse } from 'next/server';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';
import { findInvoiceById, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// GET /api/admin/invoices/[id]/print
//
// Print-ready HTML invoice — same technique as the existing order packing
// slip (no PDF library anywhere in this codebase; browser "Print/Save as
// PDF" is the established pattern).
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return new NextResponse('Database not configured', { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return new NextResponse('Invalid invoice id', { status: 400 });
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) return new NextResponse('Invoice not found', { status: 404 });

  const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const dueDate = invoice.due_date
    ? new Date(invoice.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const billingAddress = [
    invoice.company_name,
    invoice.customer_name,
    invoice.billing_line1,
    invoice.billing_line2,
    invoice.billing_city,
    invoice.billing_postcode,
    invoice.billing_country,
  ].filter(Boolean).join('\n');

  // The delivery name goes at the top of the delivery block, where a name belongs, rather than in
  // an address line (task 77b818aa). Left blank it is simply absent, exactly as before.
  const shippingAddress = [
    invoice.shipping_recipient,
    invoice.shipping_line1,
    invoice.shipping_line2,
    invoice.shipping_city,
    invoice.shipping_postcode,
    invoice.shipping_country,
  ].filter(Boolean).join('\n');

  // Trial lines print as Product 1, Product 2 (task ae168547).
  const itemRows = anonymiseTrialLines(invoice.line_items).map((item) => {
    const batch = item.batchCodes && item.batchCodes.length
      ? `<br><span style="font-size:11px;color:#888">Batch verified: ${escapeHtml(item.batchCodes.join(', '))}</span>`
      : '';
    return `
    <tr>
      <td>${escapeHtml(item.name)}${item.description ? `<br><span style="font-size:11px;color:#888">${escapeHtml(item.description)}</span>` : ''}${batch}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">£${item.unitPrice.toFixed(2)}</td>
      <td style="text-align:right">${item.discount > 0 ? `−£${item.discount.toFixed(2)}` : '—'}</td>
      <td style="text-align:right">£${item.lineTotal.toFixed(2)}</td>
    </tr>
  `;
  }).join('');

  const discountRow = Number(invoice.discount_amount) > 0 ? `
    <tr>
      <td colspan="4" style="text-align:right">Discount${invoice.discount_code ? ` (${escapeHtml(invoice.discount_code)})` : ''}</td>
      <td style="text-align:right;color:#b8902a">−£${Number(invoice.discount_amount).toFixed(2)}</td>
    </tr>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoice.invoice_number)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 13px; color: #1a1a1a; padding: 32px 40px; max-width: 720px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 22px; font-weight: bold; letter-spacing: 0.5px; }
    .brand-sub { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #666; margin-top: 2px; }
    .ref { text-align: right; }
    .ref h2 { font-size: 15px; }
    .ref p { font-size: 12px; color: #555; margin-top: 3px; }
    .columns { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin-bottom: 6px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
    .address { white-space: pre-line; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; border-bottom: 1px solid #ccc; padding: 6px 0; text-align: left; }
    th:not(:first-child) { text-align: right; }
    td { padding: 8px 0; border-bottom: 1px solid #eee; vertical-align: top; line-height: 1.4; }
    .totals { margin-left: auto; width: 280px; }
    .totals td { border: none; padding: 4px 0; font-size: 12px; }
    .totals .grand-total td { font-size: 14px; font-weight: bold; border-top: 2px solid #1a1a1a; padding-top: 8px; }
    .notes { margin-top: 16px; padding: 10px; background: #fefce8; border: 1px solid #e7dcc8; border-radius: 4px; font-size: 12px; color: #555; white-space: pre-line; }
    .footer { border-top: 1px solid #ccc; padding-top: 16px; margin-top: 24px; font-size: 10px; color: #888; line-height: 1.6; text-align: center; }
    @media print {
      body { padding: 16px 24px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="brand">Windsor Glow</div>
      <div class="brand-sub">Research Peptides &amp; Compounds</div>
    </div>
    <div class="ref">
      <h2>Invoice</h2>
      <p>Reference: <strong>${escapeHtml(invoice.invoice_number)}</strong></p>
      <p>Date: ${invoiceDate}</p>
      ${dueDate ? `<p>Due: ${dueDate}</p>` : ''}
      <p>Status: ${invoice.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</p>
    </div>
  </div>

  ${invoice.subject ? `<p style="margin-bottom:12px;font-size:14px;font-weight:bold">${escapeHtml(invoice.subject)}</p>` : ''}
  ${invoice.message ? `<p style="margin-bottom:24px;white-space:pre-line">${escapeHtml(invoice.message)}</p>` : ''}

  <div class="columns">
    <div>
      <div class="section-title">Billed to</div>
      <div class="address">${escapeHtml(billingAddress)}</div>
      <div style="margin-top:8px;font-size:12px;color:#444">${escapeHtml(invoice.email)}${invoice.phone ? `<br>${escapeHtml(invoice.phone)}` : ''}</div>
    </div>
    ${shippingAddress ? `
    <div>
      <div class="section-title">Ship to</div>
      <div class="address">${escapeHtml(shippingAddress)}</div>
    </div>` : ''}
  </div>

  <div class="section-title" style="margin-bottom:8px">Invoice items</div>
  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center">Qty</th>
        <th>Unit price</th>
        <th>Discount</th>
        <th>Line total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals">
    <tbody>
      <tr>
        <td>Subtotal</td>
        <td style="text-align:right">£${Number(invoice.subtotal).toFixed(2)}</td>
      </tr>
      ${discountRow}
      <tr>
        <td>Shipping${invoice.shipping_label ? ` (${escapeHtml(invoice.shipping_label)})` : ''}</td>
        <td style="text-align:right">${Number(invoice.shipping_amount) === 0 ? 'Free' : `£${Number(invoice.shipping_amount).toFixed(2)}`}</td>
      </tr>
      <tr class="grand-total">
        <td><strong>Total due</strong></td>
        <td style="text-align:right"><strong>£${Number(invoice.total).toFixed(2)}</strong></td>
      </tr>
    </tbody>
  </table>

  ${invoice.customer_notes ? `<div class="notes"><strong>Notes:</strong><br>${escapeHtml(invoice.customer_notes)}</div>` : ''}

  <div class="footer">
    <p>Windsor Glow — windsorglow.com — sales@windsorglow.com</p>
    <p style="margin-top:6px">${escapeHtml(invoice.footer_text || 'All products are supplied strictly for research purposes only. Not for human use.')}</p>
  </div>

  <div class="no-print" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:10px 24px;background:#1a1a1a;color:white;border:none;cursor:pointer;font-size:14px;border-radius:4px">
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
