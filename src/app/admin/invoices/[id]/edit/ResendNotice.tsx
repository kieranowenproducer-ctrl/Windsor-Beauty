'use client';

import type { InvoiceRow, AutomationFlags } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  // Non-null: the page returns early on line 541 before this is ever rendered.
  invoice: InvoiceRow;
  automationFlags: AutomationFlags;
  adjusting: boolean;
  setAdjusting: (value: boolean) => void;
  adjustmentReason: string;
  setAdjustmentReason: (value: string) => void;
}

export default function ResendNotice({
  invoice, automationFlags, adjusting, setAdjusting, adjustmentReason, setAdjustmentReason,
}: Props) {
  return (
    <>
        {/* The customer's already-sent invoice email contains a Fena/PayPal
            payment link with the amount baked in at send time. Editing the
            invoice updates the database and the linked order correctly, but
            does NOT retroactively fix that already-delivered email — only
            clicking Resend Invoice (which regenerates fresh payment links
            off the current total) does. Detected by comparing the latest
            edit_log entry against sent_at, both refreshed independently. */}
        {invoice.sent_at && invoice.edit_log.length > 0 &&
          new Date(invoice.edit_log[invoice.edit_log.length - 1].at).getTime() > new Date(invoice.sent_at).getTime() && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-4 py-3 mb-4 font-medium">
              This invoice was edited after it was last sent. The customer&rsquo;s email still has the old
              payment link and amount — click{' '}
              <strong>{automationFlags.sendPaymentLink ? 'Resend Payment Link' : 'Resend Invoice'}</strong> below to
              send them the current total.
            </div>
        )}

        {invoice.edit_log.length > 0 && (
          <div className="bg-stone-50 border border-stone-200 px-4 py-3 mb-6 text-xs text-stone-500">
            <p className="text-[10px] tracking-[0.15em] uppercase text-stone-400 mb-1.5">Edit History</p>
            <ul className="space-y-1">
              {invoice.edit_log.map((entry, i) => (
                <li key={i}>
                  <span className="text-stone-400">{new Date(entry.at).toLocaleString('en-GB', { timeZone: 'Europe/London' })}</span> — {entry.summary}
                </li>
              ))}
            </ul>
          </div>
        )}

        {invoice.status === 'paid' && !adjusting && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
            This invoice is paid — line items, shipping, and discount are locked. To correct a financial mistake,
            use the override below (the change will be logged on this invoice).
            <button
              onClick={() => setAdjusting(true)}
              className="block mt-2 text-[10px] tracking-[0.15em] uppercase text-amber-700 hover:text-amber-900 underline"
            >
              Adjust Financials
            </button>
          </div>
        )}
        {adjusting && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.15em] uppercase text-amber-700">Reason for adjustment (required, logged)</span>
              <input
                type="text"
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                placeholder="e.g. Customer was over-invoiced for shipping"
                className="border border-amber-300 px-3 py-2 text-xs focus:outline-none bg-white"
              />
            </label>
            <button onClick={() => { setAdjusting(false); setAdjustmentReason(''); }} className="mt-2 text-[10px] tracking-[0.15em] uppercase text-amber-700 hover:text-amber-900 underline">
              Cancel Adjustment
            </button>
          </div>
        )}
    </>
  );
}
