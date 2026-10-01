'use client';

import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_STYLES,
  formatDate,
  type DispatchOrderStatus,
  type RMOrder,
} from './dispatchTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  rmStatusFilter: DispatchOrderStatus | 'all';
  setRmStatusFilter: (value: DispatchOrderStatus | 'all') => void;
  rmFilterCounts: Record<string, number>;
  rmLoading: boolean;
  filteredRmOrders: RMOrder[];
  royalMailConfigured: boolean;
  createLabel: (orderNumber: string) => void;
  creatingLabel: Record<string, boolean>;
  labelErrors: Record<string, string>;
  /* The invoice blocking a delete, per order (task 8424c048). An order that came from an invoice
     is refused on purpose; naming the invoice was not enough, so the message carries the button. */
  blockingInvoice: Record<string, { invoiceNumber: string; invoiceId: number }>;
  confirmInvoiceDelete: string | null;
  setConfirmInvoiceDelete: (orderNumber: string | null) => void;
  deleteBlockingInvoice: (orderNumber: string) => void;
  deletingInvoice: string | null;
  markDispatched: (orderNumber: string) => void;
  markingDispatched: Record<string, boolean>;
  dispatchedEmailSent: Set<string>;
  manualTrackingInputs: Record<string, string>;
  setManualTrackingInputs: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  saveManualTracking: (orderNumber: string) => void;
  savingManualTracking: Record<string, boolean>;
  deleteConfirm: string | null;
  setDeleteConfirm: (value: string | null) => void;
  deletingOrder: Record<string, boolean>;
  handleDeleteOrder: (orderNumber: string) => void;
}

export default function DispatchOrderList({
  rmStatusFilter, setRmStatusFilter, rmFilterCounts, rmLoading, filteredRmOrders,
  royalMailConfigured, createLabel, creatingLabel, labelErrors,
  blockingInvoice, confirmInvoiceDelete, setConfirmInvoiceDelete, deleteBlockingInvoice, deletingInvoice,
  markDispatched, markingDispatched, dispatchedEmailSent,
  manualTrackingInputs, setManualTrackingInputs, saveManualTracking, savingManualTracking,
  deleteConfirm, setDeleteConfirm, deletingOrder, handleDeleteOrder,
}: Props) {
  return (
    <>
            {/* Status filter chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {([
                { label: `All (${rmFilterCounts.all})`, value: 'all' },
                { label: `Paid (${rmFilterCounts.paid})`, value: 'paid' },
                { label: `Awaiting Dispatch (${rmFilterCounts.awaiting_dispatch})`, value: 'awaiting_dispatch' },
                { label: `Processing (${rmFilterCounts.processing})`, value: 'processing' },
                { label: `Exported (${rmFilterCounts.exported})`, value: 'exported' },
                { label: `Recently Dispatched (${rmFilterCounts.dispatched})`, value: 'dispatched' },
              ] as { label: string; value: DispatchOrderStatus | 'all' }[]).map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setRmStatusFilter(value)}
                  className={`text-[9px] tracking-[0.15em] uppercase px-3 py-1.5 border transition-colors ${
                    rmStatusFilter === value
                      ? 'bg-gold-700 text-white border-gold-500'
                      : 'border-stone-200 text-stone-400 hover:border-gold-300 hover:text-gold-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Order list */}
            {rmLoading ? (
              <div className="border border-stone-200 bg-white px-6 py-8 text-center">
                <p className="text-xs text-stone-400">Loading orders...</p>
              </div>
            ) : filteredRmOrders.length === 0 ? (
              <div className="border border-stone-200 bg-white px-6 py-8 text-center">
                <p className="text-xs text-stone-400">
                  {rmStatusFilter === 'all' ? 'No orders are waiting to be dispatched.' : 'No orders match this filter.'}
                </p>
              </div>
            ) : (
              <div className="border border-stone-200 bg-white divide-y divide-stone-100">
                {filteredRmOrders.map(o => (
                  <div key={o.orderNumber} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-gold-700 tracking-wider">{o.orderNumber}</span>
                          <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${DISPATCH_STATUS_STYLES[o.status]}`}>
                            {DISPATCH_STATUS_LABELS[o.status]}
                          </span>
                          {o.shippingCountry && o.shippingCountry.toUpperCase() !== 'GB' && (
                            <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-indigo-50 text-indigo-500">International</span>
                          )}
                          {o.paymentMethod === 'paypal' && (
                            <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-blue-50 text-[#0070ba]">PayPal</span>
                          )}
                        </div>
                        <div className="text-xs text-stone-700 mt-0.5">{o.customerName}</div>
                        <div className="text-[10px] text-stone-400">{o.email} · {formatDate(o.createdAt)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-medium text-stone-700">£{o.total.toFixed(2)}</div>
                        <div className="text-[10px] text-stone-400">{o.shippingLabel}</div>
                        {o.parcelWeightGrams != null && (
                          <div className="text-[10px] text-stone-400">
                            {o.parcelWeightGrams}g{o.parcelPackageFormat ? ` · ${o.parcelPackageFormat}` : ''}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {o.royalMailLabelStatus === 'created' ? (
                        <>
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-green-50 text-green-600">Label Created</span>
                          {o.trackingNumber && (
                            o.trackingUrl ? (
                              <a href={o.trackingUrl} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-gold-700 hover:underline">
                                {o.trackingNumber}
                              </a>
                            ) : (
                              <span className="text-[10px] font-mono text-stone-600">{o.trackingNumber}</span>
                            )
                          )}
                          <a
                            href={`/api/admin/orders/${encodeURIComponent(o.orderNumber)}/label?type=postageLabel`}
                            target="_blank" rel="noreferrer"
                            className="text-[9px] tracking-[0.15em] uppercase border border-stone-200 text-stone-500 px-3 py-1.5 hover:border-gold-300 hover:text-gold-700 transition-colors"
                          >
                            Download Label
                          </a>
                          {o.shippingCountry && o.shippingCountry.toUpperCase() !== 'GB' && (
                            <>
                              <a
                                href={`/api/admin/orders/${encodeURIComponent(o.orderNumber)}/label?type=CN22`}
                                target="_blank" rel="noreferrer"
                                className="text-[9px] tracking-[0.15em] uppercase border border-stone-200 text-stone-500 px-3 py-1.5 hover:border-gold-300 hover:text-gold-700 transition-colors"
                              >
                                CN22
                              </a>
                              <a
                                href={`/api/admin/orders/${encodeURIComponent(o.orderNumber)}/label?type=CN23`}
                                target="_blank" rel="noreferrer"
                                className="text-[9px] tracking-[0.15em] uppercase border border-stone-200 text-stone-500 px-3 py-1.5 hover:border-gold-300 hover:text-gold-700 transition-colors"
                              >
                                CN23
                              </a>
                            </>
                          )}
                          {o.status !== 'dispatched' ? (
                            <button
                              onClick={() => markDispatched(o.orderNumber)}
                              disabled={markingDispatched[o.orderNumber]}
                              className="text-[9px] tracking-[0.15em] uppercase bg-gold-700 text-white px-3 py-1.5 hover:bg-gold-800 disabled:opacity-50 transition-colors"
                            >
                              {markingDispatched[o.orderNumber] ? 'Updating…' : 'Mark Dispatched & Send Tracking'}
                            </button>
                          ) : (dispatchedEmailSent.has(o.orderNumber) || o.shippingEmailSentAt) ? (
                            <span className="text-[9px] text-green-600">
                              Tracking sent{o.shippingEmailSentAt ? ` ${formatDate(o.shippingEmailSentAt)}` : ''}
                            </span>
                          ) : null}
                        </>
                      ) : o.royalMailLabelStatus === 'pending_postage' ? (
                        <>
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-amber-50 text-amber-600">Awaiting Royal Mail Payment</span>
                          <button
                            onClick={() => createLabel(o.orderNumber)}
                            disabled={!royalMailConfigured || creatingLabel[o.orderNumber]}
                            className="text-[9px] tracking-[0.15em] uppercase bg-stone-700 text-white px-3 py-1.5 hover:bg-stone-800 disabled:opacity-50 transition-colors"
                          >
                            {creatingLabel[o.orderNumber] ? 'Checking…' : 'Check Royal Mail Status'}
                          </button>
                        </>
                      ) : (
                        <>
                          {o.royalMailLabelStatus === 'error' && (
                            <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-red-50 text-red-500">Label Error</span>
                          )}
                          <button
                            onClick={() => createLabel(o.orderNumber)}
                            disabled={!royalMailConfigured || creatingLabel[o.orderNumber]}
                            className="text-[9px] tracking-[0.15em] uppercase bg-gold-700 text-white px-3 py-1.5 hover:bg-gold-800 disabled:opacity-50 transition-colors"
                          >
                            {creatingLabel[o.orderNumber] ? 'Creating…' : o.royalMailLabelStatus === 'error' ? 'Retry Label' : 'Create Label'}
                          </button>
                          {o.royalMailLabelStatus === 'error' && (
                            deleteConfirm === o.orderNumber ? (
                              <span className="flex items-center gap-2">
                                <span className="text-[9px] text-red-500">Delete permanently?</span>
                                <button
                                  onClick={() => handleDeleteOrder(o.orderNumber)}
                                  disabled={deletingOrder[o.orderNumber]}
                                  className="text-[9px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                                >
                                  {deletingOrder[o.orderNumber] ? 'Deleting…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="text-[9px] tracking-[0.15em] uppercase text-stone-400 hover:text-stone-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(o.orderNumber)}
                                className="text-[9px] tracking-[0.15em] uppercase border border-stone-200 text-stone-400 px-3 py-1.5 hover:border-red-300 hover:text-red-500 transition-colors"
                              >
                                Delete Order
                              </button>
                            )
                          )}
                        </>
                      )}
                    </div>

                    {o.royalMailLabelStatus === 'pending_postage' && (
                      <div className="mt-2 border border-amber-100 bg-amber-50/60 px-3 py-2.5 space-y-2">
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                          Royal Mail created {o.royalMailOrderId ? <>order <span className="font-mono">#{o.royalMailOrderId}</span></> : 'this shipment'} in Click &amp; Drop, but won&apos;t release a tracking number until postage is paid manually there. Pay for it in Click &amp; Drop, then press &quot;Check Royal Mail Status&quot; above to pull the tracking number in automatically — or paste it below once you have it.
                        </p>
                        {/* Wraps on a phone (task 1fb77058). The box would not
                            shrink below its placeholder, so Save Tracking Number
                            sat 43px past the edge of a 390px screen — and this
                            page clips rather than scrolls, so it could not be
                            reached at all. You could not finish a dispatch. */}
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={manualTrackingInputs[o.orderNumber] ?? ''}
                            onChange={e => setManualTrackingInputs(prev => ({ ...prev, [o.orderNumber]: e.target.value }))}
                            placeholder="Paste tracking number, e.g. TT123456789GB"
                            className="flex-1 min-w-[180px] border border-amber-200 focus:border-gold-400 outline-none px-2.5 py-1.5 text-xs text-stone-700 bg-white tracking-wider uppercase"
                          />
                          <button
                            onClick={() => saveManualTracking(o.orderNumber)}
                            disabled={!manualTrackingInputs[o.orderNumber]?.trim() || savingManualTracking[o.orderNumber]}
                            className="text-[9px] tracking-[0.15em] uppercase border border-amber-300 text-amber-700 px-3 py-1.5 hover:bg-amber-100 disabled:opacity-40 transition-colors shrink-0"
                          >
                            {savingManualTracking[o.orderNumber] ? 'Saving…' : 'Save Tracking Number'}
                          </button>
                        </div>
                      </div>
                    )}

                    {labelErrors[o.orderNumber] ? (
                      <>
                      <p className="text-[9px] text-red-500 mt-1.5 leading-relaxed">{labelErrors[o.orderNumber]}</p>
                      {/* The way out of that message: it says what it will delete before it does it. */}
                      {blockingInvoice[o.orderNumber] && (
                        confirmInvoiceDelete === o.orderNumber ? (
                          <div className="mt-2 border border-gold-200 bg-gold-50/50 px-3 py-2.5">
                            <p className="text-[9px] text-stone-700 mb-2 leading-relaxed">
                              This deletes invoice <span className="font-semibold">{blockingInvoice[o.orderNumber].invoiceNumber}</span> and
                              order <span className="font-semibold">{o.orderNumber}</span> with it. It cannot be undone.
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => deleteBlockingInvoice(o.orderNumber)}
                                disabled={deletingInvoice === o.orderNumber}
                                className="bg-red-600 text-white text-[9px] tracking-[0.15em] uppercase px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
                              >
                                {deletingInvoice === o.orderNumber ? 'Deleting…' : 'Yes, delete both'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmInvoiceDelete(null)}
                                className="text-[9px] tracking-[0.15em] uppercase text-stone-500 px-3 py-2 hover:text-stone-700"
                              >
                                Keep them
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmInvoiceDelete(o.orderNumber)}
                            className="mt-2 border border-red-300 text-red-600 text-[9px] tracking-[0.15em] uppercase px-4 py-2 hover:bg-red-50 transition-colors"
                          >
                            Delete invoice {blockingInvoice[o.orderNumber].invoiceNumber} and the order
                          </button>
                        )
                      )}
                      </>
                    ) : o.royalMailLabelStatus === 'error' && o.royalMailLabelError ? (
                      <p className="text-[9px] text-red-500 mt-1.5 leading-relaxed">{o.royalMailLabelError}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
    </>
  );
}
