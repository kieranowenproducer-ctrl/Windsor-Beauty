'use client';

import { INPUT_CLASS, LABEL_CLASS, roundMoney } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  shippingLabel: string;
  setShippingLabel: (value: string) => void;
  shippingAmount: string;
  setShippingAmount: (value: string) => void;
  discountCode: string;
  setDiscountCode: (value: string) => void;
  discountAmount: string;
  setDiscountAmount: (value: string) => void;
  applyDiscountCode: () => void;
  applyCodeStatus: 'idle' | 'loading' | 'error';
  applyCodeMessage: string;
  subtotal: number;
  total: number;
  financialsDisabled: boolean;
}

export default function InvoiceTotals({
  shippingLabel, setShippingLabel, shippingAmount, setShippingAmount,
  discountCode, setDiscountCode, discountAmount, setDiscountAmount,
  applyDiscountCode, applyCodeStatus, applyCodeMessage,
  subtotal, total, financialsDisabled,
}: Props) {
  return (
    <>
        {/* Shipping / discount / totals */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-4">Shipping &amp; Discount</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Shipping Label</span>
              <input type="text" value={shippingLabel} onChange={(e) => setShippingLabel(e.target.value)} disabled={financialsDisabled} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Shipping Amount (£)</span>
              <input type="number" min={0} step={0.01} value={shippingAmount} onChange={(e) => setShippingAmount(e.target.value)} disabled={financialsDisabled} className={INPUT_CLASS} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-1">
            <label className="flex flex-col gap-1.5 flex-1 min-w-[160px]">
              <span className={LABEL_CLASS}>Discount Code (optional)</span>
              <input type="text" value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} disabled={financialsDisabled} className={`${INPUT_CLASS} font-mono`} />
            </label>
            <button
              type="button"
              onClick={applyDiscountCode}
              disabled={financialsDisabled || applyCodeStatus === 'loading' || !discountCode.trim()}
              className="bg-stone-800 text-white text-[10px] tracking-[0.15em] uppercase px-4 py-2.5 hover:bg-stone-700 transition-colors disabled:opacity-50"
            >
              {applyCodeStatus === 'loading' ? 'Checking…' : 'Apply Code'}
            </button>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>or Manual Discount (£)</span>
              <input type="number" min={0} step={0.01} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} disabled={financialsDisabled} className={`${INPUT_CLASS} w-32`} />
            </label>
          </div>
          {applyCodeMessage && (
            <p className={`text-xs mb-4 ${applyCodeStatus === 'error' ? 'text-red-600' : 'text-stone-500'}`}>{applyCodeMessage}</p>
          )}

          <div className="border-t border-stone-100 pt-4 mt-4 space-y-1.5 text-xs max-w-xs ml-auto">
            <div className="flex justify-between text-stone-500">
              <span>Subtotal</span><span>£{roundMoney(subtotal).toFixed(2)}</span>
            </div>
            {Number(discountAmount) > 0 && (
              <div className="flex justify-between text-gold-700">
                <span>Discount{discountCode ? ` (${discountCode})` : ''}</span><span>&minus;£{Number(discountAmount).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-500">
              <span>Shipping</span><span>{Number(shippingAmount) === 0 ? 'Free' : `£${Number(shippingAmount).toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-stone-800 border-t border-stone-200 pt-1.5 mt-1.5">
              <span>Total Due</span><span>£{total.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-stone-500 pt-1">No VAT is applied to invoices.</p>
          </div>
        </div>
    </>
  );
}
