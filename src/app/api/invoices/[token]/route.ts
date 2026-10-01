import { NextResponse } from 'next/server';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';
import {
  findInvoiceByPublicToken,
  findOrderByNumber,
  isDbConfigured,
  markInvoiceViewed,
  setInvoiceFenaPaymentUrl,
} from '@/lib/db';
import { invoicePayable, invoiceStatusForCustomer } from '@/lib/invoicePayability';
import { createFenaPaymentLink } from '@/lib/fena';
import { buildPaypalLink } from '@/lib/paypalInstructionsEmail';
import { calculateInvoicePaypalFee, INVOICE_PAYPAL_FEE_PERCENT } from '@/lib/invoices';
import { roundMoney } from '@/lib/money';

export const dynamic = 'force-dynamic';

// GET /api/invoices/[token]
//
// Public, token-gated, read-only — powers the customer-facing /pay/[token]
// page. The response is SHAPED: only fields the customer already received in
// their invoice email are exposed. Never return the raw row — it carries
// internal_notes and edit_log, which are admin-only.
//
// Payment links: the Fena URL generated at send time is stored on the
// invoice and reused here. For invoices sent before fena_payment_url existed
// a link is generated once on first view and stored, so a revisit never
// mints a second Fena payment request.
export async function GET(_request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const invoice = await findInvoiceByPublicToken(params.token);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  // Opening the pay page is at least as strong a "viewed" signal as the
  // email tracking pixel — same sent -> viewed guard applies.
  await markInvoiceViewed(invoice.id).catch(() => {});

  // The order behind the invoice can be cancelled on its own from the Orders
  // page, and until task 477f3453 that left this page still offering the pay
  // buttons: a customer paid £240 for a cancelled order that way. A cancelled
  // or refunded order now closes the invoice here, whatever the invoice row says.
  const order = invoice.order_number ? await findOrderByNumber(invoice.order_number).catch(() => null) : null;
  const payable = invoicePayable(invoice.status, order?.status);
  const sendPaymentLink = invoice.automation_flags?.sendPaymentLink !== false;

  let fenaUrl: string | null = invoice.fena_payment_url;
  if (!fenaUrl && payable && sendPaymentLink && invoice.order_number) {
    const result = await createFenaPaymentLink(invoice.order_number);
    if (result.ok) {
      fenaUrl = result.paymentUrl;
      await setInvoiceFenaPaymentUrl(invoice.id, fenaUrl).catch(() => {});
    }
  }

  const total = Number(invoice.total);
  const paypalFee = calculateInvoicePaypalFee(total);
  const paypalTotal = roundMoney(total + paypalFee);
  const paypalUrl =
    payable && sendPaymentLink && invoice.order_number
      ? buildPaypalLink(invoice.order_number, paypalTotal)
      : null;

  return NextResponse.json({
    invoice: {
      invoiceNumber: invoice.invoice_number,
      orderNumber: invoice.order_number,
      customerName: invoice.customer_name,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      subject: invoice.subject,
      message: invoice.message,
      customerNotes: invoice.customer_notes,
      // The customer's own pay page never sees a trial product's name
      // (task ae168547).
      lineItems: anonymiseTrialLines(invoice.line_items),
      shippingLabel: invoice.shipping_label,
      shippingAmount: Number(invoice.shipping_amount),
      discountCode: invoice.discount_code,
      discountAmount: Number(invoice.discount_amount),
      subtotal: Number(invoice.subtotal),
      total,
      status: invoiceStatusForCustomer(invoice.status, order?.status),
      paidAt: invoice.paid_at,
      cancelledAt: invoice.cancelled_at,
      termsAcceptedAt: invoice.terms_accepted_at,
      payment: payable
        ? {
            fenaUrl,
            paypalUrl,
            paypalTotal,
            paypalFeePercent: INVOICE_PAYPAL_FEE_PERCENT,
          }
        : null,
    },
  });
}
