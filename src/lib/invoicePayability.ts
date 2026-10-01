// Whether an invoice can still be paid, and what to do when money arrives for
// an order that no longer stands (task 477f3453).
//
// What happened: an invoice-created order was cancelled from the Orders page
// on 27-29 Aug 2026. Cancelling only changed the order's status. The invoice
// stayed "viewed", so its pay page still offered the Fena link; the customer
// paid £240; and the payment notification found the order cancelled and
// returned "Already processed" without writing anything down. The bank had the
// money and the dashboard had no idea. These helpers hold the two decisions
// that were missing, in one place so the pay page, the admin routes and the
// webhook cannot drift apart again.
import type { InvoiceRow } from '@/lib/db/invoices';
import type { OrderRow } from '@/lib/db/orders';

/** Order states that close the door on paying its invoice. */
const ORDER_CLOSED: ReadonlyArray<OrderRow['status']> = ['cancelled', 'refunded'];

/** Order states an invoice cancellation may take down with it: nothing has been paid yet. */
const ORDER_UNPAID: ReadonlyArray<OrderRow['status']> = ['pending', 'awaiting_payment', 'payment_failed', 'payment_cancelled'];

/** An invoice can be paid only while it is open AND its order still stands. */
export function invoicePayable(invoiceStatus: InvoiceRow['status'], orderStatus?: OrderRow['status'] | null): boolean {
  if (invoiceStatus === 'paid' || invoiceStatus === 'cancelled' || invoiceStatus === 'draft') return false;
  if (orderStatus && ORDER_CLOSED.includes(orderStatus)) return false;
  return true;
}

/**
 * What the customer's pay page should call the invoice. A cancelled order makes
 * an unpaid invoice read as cancelled, so the page shows "no payment is due"
 * instead of a pay button. A paid invoice keeps saying paid.
 */
export function invoiceStatusForCustomer(invoiceStatus: InvoiceRow['status'], orderStatus?: OrderRow['status'] | null): InvoiceRow['status'] {
  if (invoiceStatus !== 'paid' && orderStatus && ORDER_CLOSED.includes(orderStatus)) return 'cancelled';
  return invoiceStatus;
}

/** True when cancelling the invoice should cancel this order as well. */
export function orderFollowsInvoiceCancellation(orderStatus?: OrderRow['status'] | null): boolean {
  return Boolean(orderStatus && ORDER_UNPAID.includes(orderStatus));
}

export interface PaidAfterCancelNotice {
  category: 'fena_paid_after_cancel';
  /** For the System Health page and the alert email. */
  message: string;
  /** For the order's internal notes, where whoever opens the order will see it. */
  note: string;
}

/** The words for a payment that arrived after its order was cancelled or refunded. */
export function paidAfterCancelNotice(
  order: Pick<OrderRow, 'order_number' | 'status' | 'customer_name' | 'total'>,
  reportedAmount: number | null,
  when: Date = new Date(),
): PaidAfterCancelNotice {
  const amount = reportedAmount !== null && Number.isFinite(reportedAmount)
    ? `£${reportedAmount.toFixed(2)}`
    : `£${Number(order.total).toFixed(2)}`;
  const state = order.status === 'refunded' ? 'refunded' : 'cancelled';
  const who = order.customer_name.trim() || 'The customer';
  const day = when.toLocaleString('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return {
    category: 'fena_paid_after_cancel',
    message: `${who} paid ${amount} for order ${order.order_number} after it was ${state}. The money has reached the bank, but the order stays ${state}. Decide whether to reinstate the order or refund the payment.`,
    note: `${day}: ${amount} arrived by bank transfer (Fena) after this order was ${state}. Reinstate the order or refund the payment.`,
  };
}
