import { NextResponse } from 'next/server';
import {
  appendInvoiceEditLog,
  cancelInvoice,
  deleteInvoice,
  findInvoiceById,
  findOrderByNumber,
  isDbConfigured,
  logAutomationFailure,
  setOrderFulfilment,
  updateInvoice,
  updateOrderStatus,
} from '@/lib/db';
import { parseInvoiceInput } from '@/lib/invoices';
import { listTrialProducts } from '@/lib/db/trialProducts';
import { findTrialNameInInvoiceText, trialTextLeakMessage } from '@/lib/invoiceTrialTextGuard';
import { orderFollowsInvoiceCancellation } from '@/lib/invoicePayability';
import { syncOrderFinancialsFromInvoice } from '@/lib/invoiceFulfillment';
import { reverseGlowCardOrderPoints } from '@/lib/glowCardLoyalty';

export const dynamic = 'force-dynamic';

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });

  const invoice = await findInvoiceById(id);
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  return NextResponse.json({ invoice });
}

const VALID_INTENDED_PAYMENT_METHODS = new Set(['fena', 'paypal', 'cash', 'bank_transfer', 'manual']);
const VALID_FULFILMENT_TYPES = new Set(['royal_mail', 'collection', 'hand_delivered', 'no_delivery', 'other_manual']);

// PATCH handles three distinct request shapes from the builder UI:
//   { cancel: true }                                 — cancel a sent-but-unpaid invoice
//   { ...fields, adjustment: true, adjustmentReason } — admin override of a paid invoice's financial fields
//   { ...fields }                                     — a plain edit
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });

  const existing = await findInvoiceById(id);
  if (!existing) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (body.cancel === true) {
    const cancelled = await cancelInvoice(id);
    if (!cancelled) {
      return NextResponse.json({ error: 'A paid invoice cannot be cancelled.' }, { status: 409 });
    }
    // The order made from this invoice goes with it while nothing has been
    // paid (task 477f3453), so the two never disagree about whether money is
    // owed. An order that has moved past payment is left alone.
    if (cancelled.order_number) {
      const order = await findOrderByNumber(cancelled.order_number).catch(() => null);
      if (order && orderFollowsInvoiceCancellation(order.status)) {
        const cancelledOrder = await updateOrderStatus(order.order_number, 'cancelled').catch(() => null);
        if (cancelledOrder) await reverseGlowCardOrderPoints(cancelledOrder).catch(() => {});
      }
    }
    return NextResponse.json({ invoice: cancelled });
  }

  const trialProducts = await listTrialProducts();
  const trialLeak = findTrialNameInInvoiceText(body, trialProducts);
  if (trialLeak) {
    return NextResponse.json({ error: trialTextLeakMessage(trialLeak) }, { status: 400 });
  }
  const fields = parseInvoiceInput(body, trialProducts);
  if (!fields) {
    return NextResponse.json(
      { error: 'Invalid invoice data - check the customer name/email are filled in, and every line item has a name with a valid quantity, price, and discount.' },
      { status: 400 }
    );
  }

  // Invoice number is auto-generated but admin-editable — parseInvoiceInput
  // doesn't produce it (POST generates a fresh one for new drafts), so it's
  // read separately here and defaults to the existing value when omitted.
  const invoiceNumber = typeof body.invoiceNumber === 'string' && body.invoiceNumber.trim()
    ? body.invoiceNumber.trim()
    : existing.invoice_number;

  const adjustment = body.adjustment === true;
  const adjustmentReason = typeof body.adjustmentReason === 'string' ? body.adjustmentReason.trim() : '';

  // Falls back to the invoice's current value (not a hard default) when the
  // caller omits these — updateInvoice() does a full-row overwrite, so an
  // unrelated save (e.g. editing a line item) must never silently reset a
  // cash/hand-delivered invoice back to the Royal Mail defaults.
  const intendedPaymentMethod = typeof body.intendedPaymentMethod === 'string' && VALID_INTENDED_PAYMENT_METHODS.has(body.intendedPaymentMethod)
    ? body.intendedPaymentMethod as NonNullable<typeof existing.intended_payment_method>
    : existing.intended_payment_method;
  const fulfilmentType = typeof body.fulfilmentType === 'string' && VALID_FULFILMENT_TYPES.has(body.fulfilmentType)
    ? body.fulfilmentType as typeof existing.fulfilment_type
    : existing.fulfilment_type;
  const automationFlags = body.automationFlags && typeof body.automationFlags === 'object'
    ? {
        sendPaymentLink: body.automationFlags.sendPaymentLink !== false,
        sendConfirmation: body.automationFlags.sendConfirmation !== false,
        triggerRoyalMail: body.automationFlags.triggerRoyalMail !== false,
        sendDispatchEmail: body.automationFlags.sendDispatchEmail !== false,
      }
    : existing.automation_flags;

  // Computed once up front — used both to lock a paid invoice's financials
  // below, and (for a not-yet-paid invoice) to decide whether the linked
  // order needs resyncing so a regenerated Fena link never charges a stale
  // pre-edit total again.
  const changedFinancials =
    JSON.stringify(existing.line_items) !== JSON.stringify(fields.lineItems) ||
    Number(existing.shipping_amount) !== Number(fields.shippingAmount) ||
    (existing.discount_code ?? null) !== (fields.discountCode ?? null) ||
    Number(existing.discount_amount) !== Number(fields.discountAmount) ||
    Number(existing.subtotal) !== Number(fields.subtotal) ||
    Number(existing.total) !== Number(fields.total);

  if (existing.status === 'paid') {
    if (changedFinancials && !adjustment) {
      return NextResponse.json(
        { error: 'This invoice is paid - financial fields are locked. Use the adjustment override with a reason to change them.' },
        { status: 409 }
      );
    }
    if (changedFinancials && adjustment && !adjustmentReason) {
      return NextResponse.json({ error: 'An adjustment reason is required.' }, { status: 400 });
    }
  }

  try {
    const updated = await updateInvoice(id, { invoiceNumber, ...fields, intendedPaymentMethod, fulfilmentType, automationFlags });
    if (!updated) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });

    // Once an invoice has been sent it has a linked order, and every
    // downstream consumer (dispatchOrderToRoyalMail, the confirmation/dispatch
    // email gates) reads fulfilment_type/automation_flags off the ORDER, not
    // the invoice — convertInvoiceToOrder() only copies them across once, at
    // first send. Without this, changing "Hand Delivered" + unticking Royal
    // Mail on an already-sent invoice would save on the invoice but silently
    // have no effect on the order it's actually dispatched from.
    if (existing.order_number) {
      const fulfilmentSynced = await setOrderFulfilment(existing.order_number, { fulfilmentType, automationFlags }).catch(err => {
        logAutomationFailure('invoice_order_sync', 'setOrderFulfilment threw', { orderNumber: existing.order_number, detail: err });
        return null;
      });
      if (!fulfilmentSynced) {
        await logAutomationFailure('invoice_order_sync', 'Could not sync fulfilment_type/automation_flags onto linked order (no matching order row)', { orderNumber: existing.order_number });
      }

      // Keep the linked order in step with the invoice on EVERY edit — both the
      // money fields (a regenerated Fena link reads order.total, not
      // invoice.total — the 2026-06-29 stale-total incident) AND the customer
      // contact fields (a corrected email must reach the order the Fena link is
      // built from, or the link keeps failing "customerEmail: Incorrect email").
      // Runs unconditionally, not only on a financial change, because a pure
      // email/address correction changes no money field. No-ops internally once
      // the order is paid/dispatched; returns {ok:false} rather than throwing on
      // its own internal failure, so both paths are checked.
      const syncResult = await syncOrderFinancialsFromInvoice(id).catch(err => ({ ok: false as const, error: String(err) }));
      if (!syncResult.ok) {
        await logAutomationFailure(
          'invoice_order_sync',
          'Could not sync edited invoice onto linked order - regenerated Fena link may use a stale total or email',
          { orderNumber: existing.order_number, detail: syncResult.error }
        );
      }
    }

    if (existing.status === 'paid' && adjustment && adjustmentReason) {
      await appendInvoiceEditLog(id, `Paid invoice adjusted by admin: ${adjustmentReason}`);
    } else if (['sent', 'viewed', 'payment_pending'].includes(existing.status)) {
      await appendInvoiceEditLog(id, 'Invoice edited after sending.');
    }

    const final = await findInvoiceById(id);
    return NextResponse.json({ invoice: final ?? updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update invoice.';
    if (message.includes('duplicate key')) {
      return NextResponse.json({ error: 'An invoice with that number already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Works on any invoice status — also cascades to the linked order (see
// deleteInvoice() in db.ts), so deleting an invoice removes it from Orders
// and Dispatch too, not just the Invoices list.
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const id = parseId(params.id);
  if (!id) return NextResponse.json({ error: 'Invalid invoice id.' }, { status: 400 });

  const deleted = await deleteInvoice(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
