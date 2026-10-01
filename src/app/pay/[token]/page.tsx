'use client';

// Customer-facing invoice payment page — the destination of the single
// "Review & Pay" button in every invoice email. Exempt from the coming-soon
// wall (proxy.ts), and a permanent URL, so nothing about this flow
// changes when the site launches.
//
// The Terms & Conditions acknowledgement lives here: payment buttons stay
// locked until the customer ticks the box, the tick is recorded server-side
// (timestamp + IP) via /api/invoices/[token]/accept-terms, and the full
// Terms are one click away at /terms (also wall-exempt).

import { useEffect, useState, use } from 'react';

interface LineItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  batchCodes?: string[] | null;
}

interface PayInvoice {
  invoiceNumber: string;
  orderNumber: string | null;
  customerName: string;
  invoiceDate: string | null;
  dueDate: string | null;
  subject: string | null;
  message: string | null;
  customerNotes: string | null;
  lineItems: LineItem[];
  shippingLabel: string | null;
  shippingAmount: number;
  discountCode: string | null;
  discountAmount: number;
  subtotal: number;
  total: number;
  status: string;
  paidAt: string | null;
  cancelledAt: string | null;
  termsAcceptedAt: string | null;
  payment: {
    fenaUrl: string | null;
    paypalUrl: string | null;
    paypalTotal: number;
    paypalFeePercent: number;
  } | null;
}

function money(v: number): string {
  return `£${v.toFixed(2)}`;
}

export default function PayInvoicePage(props: { params: Promise<{ token: string }> }) {
  const params = use(props.params);
  const [invoice, setInvoice] = useState<PayInvoice | null>(null);
  const [loadError, setLoadError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    fetch(`/api/invoices/${params.token}`)
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (!r.ok || !data?.invoice) {
          setLoadError(
            r.status === 404
              ? 'We could not find this invoice. Please use the link from your email, or contact us at sales@windsorglow.com.'
              : 'Something went wrong loading your invoice. Please try again shortly.'
          );
          return;
        }
        setInvoice(data.invoice);
        if (data.invoice.termsAcceptedAt) setAgreed(true);
      })
      .catch(() => setLoadError('Something went wrong loading your invoice. Please check your connection and try again.'));
  }, [params.token]);

  async function handleAgreeChange(checked: boolean) {
    setAgreed(checked);
    if (checked && invoice && !invoice.termsAcceptedAt && !recording) {
      setRecording(true);
      // Fire-and-forget with a silent retry path: the checkbox stays usable
      // even if this write hiccups — acceptance is re-recorded on click-through.
      fetch(`/api/invoices/${params.token}/accept-terms`, { method: 'POST' })
        .catch(() => {})
        .finally(() => setRecording(false));
    }
  }

  const paid = invoice?.status === 'paid';
  const cancelled = invoice?.status === 'cancelled';
  const payment = invoice?.payment ?? null;

  return (
    <div className="min-h-screen bg-stone-100 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Glow</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">
            {paid ? 'Invoice Paid' : 'Review & Pay'}
          </h1>
        </div>

        {loadError && (
          <div className="bg-white border border-stone-200 p-8 text-center">
            <p className="text-sm text-stone-600 leading-relaxed">{loadError}</p>
          </div>
        )}

        {!invoice && !loadError && (
          <div className="bg-white border border-stone-200 p-8 text-center">
            <p className="text-sm text-stone-500">Loading your invoice&hellip;</p>
          </div>
        )}

        {invoice && (
          <div className="bg-white border border-stone-200">
            {/* Invoice header */}
            <div className="px-6 sm:px-8 py-6 border-b border-stone-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] tracking-[0.2em] uppercase text-stone-500 mb-1">Invoice</p>
                  <p className="text-sm font-semibold text-stone-800">{invoice.invoiceNumber}</p>
                  {invoice.orderNumber && (
                    <p className="text-xs text-stone-500 mt-0.5">Order {invoice.orderNumber}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] tracking-[0.2em] uppercase text-stone-500 mb-1">Total</p>
                  <p className="font-serif text-2xl text-stone-800">{money(invoice.total)}</p>
                  {invoice.dueDate && !paid && !cancelled && (
                    <p className="text-xs text-stone-500 mt-0.5">Due {invoice.dueDate}</p>
                  )}
                </div>
              </div>
              <p className="text-sm text-stone-600 mt-4">Hi {invoice.customerName.split(' ')[0]},</p>
              {invoice.message && (
                <p className="text-xs text-stone-500 leading-relaxed mt-2 whitespace-pre-line">{invoice.message}</p>
              )}
            </div>

            {/* Line items */}
            <div className="px-6 sm:px-8 py-6 border-b border-stone-100">
              <table className="w-full">
                <thead>
                  <tr className="text-[10px] tracking-[0.14em] uppercase text-stone-500">
                    <th className="text-left pb-2 font-medium">Item</th>
                    <th className="text-center pb-2 font-medium">Qty</th>
                    <th className="text-right pb-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      <td className="py-2.5 text-sm text-stone-700">
                        {item.name}
                        {item.description && (
                          <span className="block text-[11px] text-stone-500">{item.description}</span>
                        )}
                        {item.batchCodes && item.batchCodes.length > 0 && (
                          <span className="block text-[11px] text-stone-500 mt-0.5">
                            Batch verified: <span className="font-mono text-stone-600">{item.batchCodes.join(', ')}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-sm text-stone-500 text-center">{item.quantity}</td>
                      <td className="py-2.5 text-sm text-stone-700 text-right">{money(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 pt-3 border-t border-stone-100 space-y-1.5 text-sm">
                <div className="flex justify-between text-stone-500">
                  <span>Subtotal</span><span>{money(invoice.subtotal)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-gold-700">
                    <span>Discount{invoice.discountCode ? ` (${invoice.discountCode})` : ''}</span>
                    <span>&minus;{money(invoice.discountAmount)}</span>
                  </div>
                )}
                {(invoice.shippingAmount > 0 || invoice.shippingLabel) && (
                  <div className="flex justify-between text-stone-500">
                    <span>Shipping{invoice.shippingLabel ? ` (${invoice.shippingLabel})` : ''}</span>
                    <span>{invoice.shippingAmount === 0 ? 'Free' : money(invoice.shippingAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-800 font-semibold pt-1.5 border-t border-stone-100">
                  <span>Total</span><span>{money(invoice.total)}</span>
                </div>
              </div>
            </div>

            {/* Status / payment section */}
            {paid ? (
              <div className="px-6 sm:px-8 py-8 text-center">
                <p className="text-[10px] tracking-[0.3em] uppercase text-gold-700 font-semibold mb-2">Paid — Thank You</p>
                <p className="text-sm text-stone-500 leading-relaxed">
                  This invoice has been paid in full. A confirmation email has been sent to you.
                </p>
              </div>
            ) : cancelled ? (
              <div className="px-6 sm:px-8 py-8 text-center">
                <p className="text-sm text-stone-500 leading-relaxed">
                  This invoice has been cancelled and no payment is due. If you believe this is a
                  mistake, please contact us at sales@windsorglow.com.
                </p>
              </div>
            ) : (
              <div className="px-6 sm:px-8 py-6">
                {/* Terms & Conditions acknowledgement — gates the buttons */}
                <div className="border border-gold-200 bg-gold-50/50 px-4 py-4 mb-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => handleAgreeChange(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
                    />
                    <span className="text-xs text-stone-600 leading-relaxed">
                      By completing this payment, I confirm that I have read and agree to the
                      Windsor Glow <span className="font-semibold">Terms &amp; Conditions</span>.
                    </span>
                  </label>
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener"
                    className="inline-block mt-3 ml-7 text-[11px] font-semibold tracking-[0.12em] uppercase text-gold-700 hover:text-gold-700 border-b border-gold-300 pb-0.5"
                  >
                    Read Terms &amp; Conditions
                  </a>
                </div>

                {!agreed && (
                  <p className="text-[11px] text-stone-500 text-center mb-4">
                    Please tick the box above to unlock the payment options.
                  </p>
                )}

                <div className={agreed ? '' : 'opacity-40 pointer-events-none select-none'} aria-disabled={!agreed}>
                  {payment?.fenaUrl && (
                    <a
                      href={agreed ? payment.fenaUrl : undefined}
                      className="block w-full text-center bg-gold-700 text-white text-[11px] font-semibold tracking-[0.18em] uppercase py-4 hover:bg-gold-800 transition-colors"
                    >
                      Pay {money(invoice.total)} by Bank &rarr;
                    </a>
                  )}
                  {payment?.paypalUrl && (
                    <>
                      <a
                        href={agreed ? payment.paypalUrl : undefined}
                        className="block w-full text-center bg-[#0070ba] text-white text-[11px] font-semibold tracking-[0.18em] uppercase py-4 mt-3 hover:opacity-90 transition-opacity"
                      >
                        Pay {money(payment.paypalTotal)} via PayPal &rarr;
                      </a>
                      <p className="text-[10px] text-stone-500 text-center leading-relaxed mt-2">
                        PayPal payments include a {payment.paypalFeePercent}% processing fee — total via
                        PayPal is {money(payment.paypalTotal)} instead of {money(invoice.total)}. Pay by
                        Bank has no fee.
                      </p>
                    </>
                  )}
                  {!payment?.fenaUrl && !payment?.paypalUrl && (
                    <p className="text-sm text-stone-500 text-center leading-relaxed">
                      Online payment is not available for this invoice. Please reply to your invoice
                      email or contact sales@windsorglow.com to arrange payment.
                    </p>
                  )}
                </div>
              </div>
            )}

            {invoice.customerNotes && (
              <div className="px-6 sm:px-8 py-4 border-t border-stone-100">
                <p className="text-[11px] text-stone-500 leading-relaxed whitespace-pre-line">{invoice.customerNotes}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-[10px] text-stone-500 text-center leading-relaxed mt-6">
          Windsor Glow &mdash; windsorglow.com
          <br />
          All products are supplied strictly for research purposes only. Not for human use.
        </p>
      </div>
    </div>
  );
}
