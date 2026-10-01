import { NextResponse } from 'next/server';
import { findInvoiceById, isDbConfigured, setInvoiceFenaPaymentUrl } from '@/lib/db';
import { convertInvoiceToOrder } from '@/lib/invoiceFulfillment';
import { createFenaPaymentLink } from '@/lib/fena';
import { sendInvoiceEmail } from '@/lib/invoiceEmail';
import { listTrialProducts } from '@/lib/db/trialProducts';
import { findTrialNameInInvoiceText, trialTextLeakMessage } from '@/lib/invoiceTrialTextGuard';

export const dynamic = 'force-dynamic';

// POST /api/admin/invoices/[id]/send
//
// 1. Converts the invoice into a real order (idempotent — reuses the
//    existing order if this invoice has already been sent before).
// 2. Generates a live Fena payment link for that order's exact total.
// 3. Emails the customer the full invoice with both Fena and PayPal buttons.
// 4. Marks the invoice 'sent' (done inside convertInvoiceToOrder, on first send).
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });
  }

  const invoice = await findInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return NextResponse.json({ error: `Cannot send an invoice with status '${invoice.status}'.` }, { status: 409 });
  }

  // Backstop for an invoice saved before the save-time check existed: nothing
  // is converted, linked or emailed while typed text still names a trial product.
  const trialLeak = findTrialNameInInvoiceText(invoice as unknown as Record<string, unknown>, await listTrialProducts());
  if (trialLeak) {
    return NextResponse.json({ error: trialTextLeakMessage(trialLeak).replace(/^Not saved:/, 'Not sent:') }, { status: 400 });
  }

  const conversion = await convertInvoiceToOrder(id);
  if (!conversion.ok || !conversion.orderNumber) {
    return NextResponse.json({ error: conversion.error ?? 'Could not prepare this invoice for sending.' }, { status: 500 });
  }

  // A cash/in-person sale (automation_flags.sendPaymentLink = false) still
  // gets its order record created above — "Send" is also what creates that
  // record — but skips generating a Fena link and emailing the customer a
  // payment request, since there's nothing to ask them to pay online for.
  // Every ordinary invoice defaults to true, so this never changes existing
  // behaviour for a standard Fena/PayPal invoice.
  const sendPaymentLink = invoice.automation_flags?.sendPaymentLink !== false;

  let fenaPaymentUrl: string | null = null;
  let fenaError: string | null = null;
  let emailSent = false;

  if (sendPaymentLink) {
    const fenaResult = await createFenaPaymentLink(conversion.orderNumber);
    fenaPaymentUrl = fenaResult.ok ? fenaResult.paymentUrl : null;
    if (!fenaResult.ok) {
      // Keep the specific reason (Fena's validation message or our own pre-check)
      // so the admin sees the actual cause, not a generic "check Fena is configured".
      fenaError = fenaResult.detail ?? fenaResult.error;
      console.error('[admin/invoices/send] Fena link creation failed:', fenaResult.detail ?? fenaResult.error);
    }
    // Stored so the customer-facing /pay/<token> page reuses this exact
    // payment request instead of minting a new one per visit.
    if (fenaPaymentUrl) {
      await setInvoiceFenaPaymentUrl(invoice.id, fenaPaymentUrl).catch(() => {});
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';
    emailSent = await sendInvoiceEmail({
      to: invoice.email,
      customerName: invoice.customer_name,
      invoiceNumber: invoice.invoice_number,
      orderNumber: conversion.orderNumber,
      subject: invoice.subject,
      message: invoice.message,
      footerText: invoice.footer_text,
      customerNotes: invoice.customer_notes,
      lineItems: invoice.line_items,
      shippingLabel: invoice.shipping_label,
      shippingAmount: Number(invoice.shipping_amount),
      discountCode: invoice.discount_code,
      discountAmount: Number(invoice.discount_amount),
      subtotal: Number(invoice.subtotal),
      total: Number(invoice.total),
      dueDate: invoice.due_date,
      fenaPaymentUrl,
      payUrl: `${siteUrl}/pay/${invoice.public_token}`,
      viewPixelUrl: `${siteUrl}/api/invoices/${invoice.public_token}/pixel`,
    });
  }

  const final = await findInvoiceById(id);
  return NextResponse.json({ invoice: final, orderNumber: conversion.orderNumber, emailSent, fenaPaymentUrl, fenaError });
}
