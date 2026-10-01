'use client';

import { INPUT_CLASS, LABEL_CLASS, PAYMENT_METHOD_OPTIONS, type InvoiceRow, type PaymentMethod } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  // Non-null: the page returns early on line 541 before this is ever rendered.
  invoice: InvoiceRow;
  intendedPaymentMethod: PaymentMethod;
  paypalNote: string;
  setPaypalNote: (value: string) => void;
  handleMarkPaid: () => void;
  markingPaypalPaid: boolean;
  paypalResult: { ok: boolean; message: string } | null;
}

export default function MarkPaidPanel({
  invoice, intendedPaymentMethod, paypalNote, setPaypalNote,
  handleMarkPaid, markingPaypalPaid, paypalResult,
}: Props) {
  return (
    <>
        {/* Mark as Paid */}
        {invoice.order_number && invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
          <div className="bg-white border border-stone-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">Mark as Paid</h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              {intendedPaymentMethod === 'paypal'
                ? 'There is no automatic PayPal confirmation - check the Windsor Beauty PayPal account directly, then confirm here with a note (e.g. the transaction reference).'
                : `Confirms this invoice was paid via ${PAYMENT_METHOD_OPTIONS.find((o) => o.value === intendedPaymentMethod)?.label ?? intendedPaymentMethod}. A note is optional.`}
              {' '}This decrements stock and runs whichever automations above are still checked.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1.5 flex-1 min-w-[220px]">
                <span className={LABEL_CLASS}>Confirmation Note {intendedPaymentMethod === 'paypal' ? '(required)' : '(optional)'}</span>
                <input type="text" value={paypalNote} onChange={(e) => setPaypalNote(e.target.value)} placeholder={intendedPaymentMethod === 'paypal' ? 'e.g. PayPal txn 7XJ123456' : 'e.g. Paid in cash on collection'} className={INPUT_CLASS} />
              </label>
              <button
                onClick={handleMarkPaid}
                disabled={markingPaypalPaid}
                className="bg-stone-800 text-white text-[10px] tracking-[0.15em] uppercase px-5 py-3 hover:bg-stone-700 transition-colors disabled:opacity-50"
              >
                {markingPaypalPaid ? 'Confirming…' : 'Mark as Paid'}
              </button>
            </div>
            {paypalResult && (
              <p className={`text-xs mt-3 ${paypalResult.ok ? 'text-green-700' : 'text-red-600'}`}>{paypalResult.message}</p>
            )}
          </div>
        )}
    </>
  );
}
