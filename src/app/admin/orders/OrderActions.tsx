'use client';

import { useState } from 'react';
import SentEmailViewer from '@/components/admin/SentEmailViewer';
import {
  FULFILMENT_LABELS,
  ORDER_STATUS_TRANSITIONS,
  PAYMENT_CONFIRMED_STATUSES,
  STATUS_LABELS,
  formatDate,
  type Order,
  type OrderStatus,
} from './orderTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  selectedOrder: Order;
  isOnCooldown: (key: string, orderNumber: string) => boolean;
  confirmStatusChange: (from: OrderStatus, to: OrderStatus) => Promise<boolean>;
  updateStatus: (orderNumber: string, status: OrderStatus) => void;
  markOrderPaid: (orderNumber: string, paidVia?: 'fena' | 'paypal') => void;
  markingPaid: boolean;
  markPaidResult: { orderNumber: string; emailSent: boolean } | null;
  createRoyalMailLabel: (orderNumber: string) => void;
  creatingLabel: boolean;
  labelActionError: { orderNumber: string; message: string } | null;
  markDispatchedAndSendTracking: (orderNumber: string) => void;
  markingDispatchedRM: boolean;
  downloadRoyalMailCSV: (orderNumber: string) => void;
  exportingCsv: boolean;
  csvExportError: string | null;
  updateTracking: (orderNumber: string, trackingNumber: string) => void;
  savingTracking: boolean;
  trackingEmailSent: string | null;
  markOrderDelivered: (orderNumber: string) => void;
  markingDelivered: boolean;
  resendOrderEmails: (orderNumber: string) => void;
  resendingOrderEmails: boolean;
  resendOrderEmailsResult: { orderNumber: string; ok: boolean; message: string } | null;
  resendPaymentLink: (orderNumber: string, via: 'fena' | 'paypal') => void;
  resendingPaymentLink: boolean;
  paymentLinkResult: { orderNumber: string; ok: boolean; message: string; paymentUrl?: string } | null;
  resendDispatchEmail: (orderNumber: string) => void;
  resendingEmail: boolean;
  resendEmailResult: { orderNumber: string; ok: boolean } | null;
  setNotesDraft: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  saveNotes: (orderNumber: string) => void;
  savingNotes: boolean;
  deleteConfirm: string | null;
  setDeleteConfirm: (value: string | null) => void;
  deletingOrder: boolean;
  handleDeleteOrder: (orderNumber: string) => void;
}

export default function OrderActions({
  selectedOrder, isOnCooldown, confirmStatusChange, updateStatus,
  markOrderPaid, markingPaid, markPaidResult,
  createRoyalMailLabel, creatingLabel, labelActionError,
  markDispatchedAndSendTracking, markingDispatchedRM,
  downloadRoyalMailCSV, exportingCsv, csvExportError,
  updateTracking, savingTracking, trackingEmailSent,
  markOrderDelivered, markingDelivered,
  resendOrderEmails, resendingOrderEmails, resendOrderEmailsResult,
  resendPaymentLink, resendingPaymentLink, paymentLinkResult,
  resendDispatchEmail, resendingEmail, resendEmailResult,
  setNotesDraft, saveNotes, savingNotes,
  deleteConfirm, setDeleteConfirm, deletingOrder, handleDeleteOrder,
}: Props) {
  /* Seeing the dispatch email that actually went out (task ce308493). Kieran: "when I go onto
     orders and it says dispatch, tracking email sent, it must also show the sign. And if I want to
     press a button next to it, I can see the email sent to the customer."
     Kept local to this component: it is one button and a window, and threading two more pieces of
     state through the orders page for it would only spread the feature out. */
  const [dispatchEmail, setDispatchEmail] = useState<{ subject: string; html: string | null; text: string } | null>(null);
  const [loadingDispatchEmail, setLoadingDispatchEmail] = useState(false);
  const [dispatchEmailError, setDispatchEmailError] = useState('');

  async function openDispatchEmail(orderNumber: string) {
    setLoadingDispatchEmail(true);
    setDispatchEmailError('');
    try {
      const listRes = await fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/emails`);
      const listData = await listRes.json().catch(() => null);
      const sent: { id: number; type: string | null }[] = Array.isArray(listData?.emails) ? listData.emails : [];
      /* The newest dispatch email for this order; the list comes back newest first, so a resend
         wins, which is right: the one that matters is the last one they were actually sent. */
      const dispatch = sent.find(e => (e.type || '').startsWith('dispatch')) ?? sent[0];
      if (!dispatch) {
        throw new Error('There is no saved copy of that email. Copies are kept from now on.');
      }
      const res = await fetch(`/api/admin/customer-emails/${dispatch.id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.email) throw new Error(data?.error || 'It could not be opened.');
      setDispatchEmail({ subject: data.email.subject, html: data.email.body_html, text: data.email.body_text });
    } catch (err) {
      setDispatchEmailError(err instanceof Error ? err.message : 'It could not be opened.');
    } finally {
      setLoadingDispatchEmail(false);
    }
  }

  return (
    <>
                  {/* Send the payment link again (task d0d5effb). First thing in this column
                      on purpose: when an order is sitting unpaid, "they cannot pay" is the
                      question you are here to answer, and it used to have no answer at all.
                      The checkout hands the bank link straight to the browser and keeps no
                      copy, so a customer who closed the tab had nowhere to go back to. */}
                  {['pending', 'awaiting_payment', 'payment_failed', 'payment_cancelled'].includes(selectedOrder.status) && (
                    <div className="mb-4 border border-stone-200 p-4">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-2">Customer Cannot Pay?</p>
                      <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                        Emails {selectedOrder.email} a fresh payment link for this order. Nothing is
                        charged and the order does not change. The link also appears here, so you can
                        paste it into your own reply.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        {/* The order's own payment route leads. Both are offered, because
                            Kieran asked for "the Fena or PayPal payment links" and a customer
                            stuck on one is often happy to use the other. */}
                        {(selectedOrder.paymentMethod === 'paypal'
                          ? ['paypal', 'fena']
                          : ['fena', 'paypal']
                        ).map((via, index) => (
                          <button
                            key={via}
                            onClick={() => resendPaymentLink(selectedOrder.orderNumber, via as 'fena' | 'paypal')}
                            disabled={resendingPaymentLink || isOnCooldown('resend-payment-link', selectedOrder.orderNumber)}
                            className={`flex-1 min-h-11 text-[10px] tracking-[0.15em] uppercase font-semibold py-2.5 px-3 transition-colors disabled:opacity-50 ${
                              index === 0
                                ? 'bg-gold-700 text-white hover:bg-gold-800'
                                : 'border border-stone-300 text-stone-600 hover:border-gold-400 hover:text-gold-700'
                            }`}
                          >
                            {resendingPaymentLink
                              ? 'Sending…'
                              : isOnCooldown('resend-payment-link', selectedOrder.orderNumber)
                                ? 'Sent ✓'
                                : via === 'fena' ? 'Send bank link' : 'Get PayPal link'}
                          </button>
                        ))}
                      </div>
                      {paymentLinkResult?.orderNumber === selectedOrder.orderNumber && (
                        <div className={`mt-3 px-3 py-2 border text-[10px] leading-relaxed ${
                          paymentLinkResult.ok
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-red-200 bg-red-50 text-red-600'
                        }`}>
                          <p>{paymentLinkResult.message}</p>
                          {paymentLinkResult.paymentUrl && (
                            <p className="mt-1.5 break-all select-all text-stone-600">
                              {paymentLinkResult.paymentUrl}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mark as Paid — for PayPal / manual orders awaiting payment */}
                  {selectedOrder.paymentMethod === 'paypal' && ['pending', 'awaiting_payment'].includes(selectedOrder.status) && (
                    <div className="mb-4 border border-[#0070ba]/30 bg-blue-50/20 p-4">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-2">PayPal Payment</p>
                      {/* The Royal Mail line was missing, and it is the one that spends money:
                          marking an order paid also asks Royal Mail for the postage label
                          (markOrderPaidManually.ts calls dispatchOrderToRoyalMail). */}
                      <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                        Once you have received payment via PayPal, click below to confirm the order, move it to dispatch,
                        and email the customer their order confirmation. This also asks Royal Mail for the postage label,
                        which costs the postage.
                      </p>
                      <button
                        onClick={() => markOrderPaid(selectedOrder.orderNumber, 'paypal')}
                        disabled={markingPaid || isOnCooldown('mark-paid', selectedOrder.orderNumber)}
                        className="w-full bg-[#0070ba] text-white text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:bg-[#005ea6] transition-colors disabled:opacity-50"
                      >
                        {markingPaid ? 'Updating…' : isOnCooldown('mark-paid', selectedOrder.orderNumber) ? 'Marked Paid ✓' : 'Mark as Paid'}
                      </button>
                    </div>
                  )}

                  {/* Mark as Paid — fallback for a Fena order whose webhook never
                      confirmed it automatically (e.g. a payload-format mismatch on
                      Fena's side). Only verify and use this after confirming the
                      funds actually arrived — Fena normally needs no manual step. */}
                  {selectedOrder.paymentMethod === 'fena' && ['pending', 'awaiting_payment'].includes(selectedOrder.status) && (
                    <div className="mb-4 border border-gold-300 bg-gold-50/30 p-4">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-2">Fena Payment - Not Auto-Confirmed</p>
                      <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                        Fena's webhook normally confirms this automatically. If you've checked your bank/Fena dashboard
                        and the payment has genuinely landed, click below to confirm the order manually, move it to
                        dispatch, and email the customer their order confirmation. This also asks Royal Mail for the
                        postage label, which costs the postage.
                      </p>
                      <button
                        onClick={() => markOrderPaid(selectedOrder.orderNumber, 'fena')}
                        disabled={markingPaid || isOnCooldown('mark-paid', selectedOrder.orderNumber)}
                        className="w-full bg-gold-700 text-white text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                      >
                        {markingPaid ? 'Updating…' : isOnCooldown('mark-paid', selectedOrder.orderNumber) ? 'Marked Paid ✓' : 'Mark as Paid'}
                      </button>
                    </div>
                  )}

                  {/* Mark-as-paid email result — persists after the box above disappears */}
                  {markPaidResult?.orderNumber === selectedOrder.orderNumber && (
                    <div className={`mb-4 -mt-2 px-3 py-2 border text-[10px] leading-relaxed ${
                      markPaidResult.emailSent ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'
                    }`}>
                      {markPaidResult.emailSent
                        ? `Order confirmed - confirmation email sent to ${selectedOrder.email}.`
                        : 'Order marked as paid, but the confirmation email failed to send. check RESEND_API_KEY_BEAUTY_IS.'}
                    </div>
                  )}

                  {/* Status update — only offers sensible next steps from the
                      current status (see ORDER_STATUS_TRANSITIONS), so this
                      can't be used to set e.g. "dispatched" on an order
                      that was never marked paid. */}
                  <div className="mb-4">
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                      Update Status
                    </label>
                    {ORDER_STATUS_TRANSITIONS[selectedOrder.status].length === 0 ? (
                      <>
                        <select disabled className="w-full border border-stone-200 px-2 py-2 text-xs text-stone-500 bg-stone-50">
                          <option>{STATUS_LABELS[selectedOrder.status]}</option>
                        </select>
                        <p className="text-[9px] text-stone-300 mt-1">This is a final status and cannot be changed further.</p>
                      </>
                    ) : (
                      <select
                        value={selectedOrder.status}
                        onChange={async e => {
                          const nextStatus = e.target.value as OrderStatus;
                          // Held onto before awaiting: the question is now answered on the page,
                          // so the handler returns before the answer arrives.
                          const select = e.target;
                          if (await confirmStatusChange(selectedOrder.status, nextStatus)) {
                            updateStatus(selectedOrder.orderNumber, nextStatus);
                          } else {
                            select.value = selectedOrder.status;
                          }
                        }}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      >
                        <option value={selectedOrder.status}>{STATUS_LABELS[selectedOrder.status]} (current)</option>
                        {ORDER_STATUS_TRANSITIONS[selectedOrder.status].map(s => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Manual fulfilment — collection / hand-delivered / no
                      delivery / other-manual orders never touch Royal Mail,
                      so they get one simple "mark it complete" action
                      instead of the label/CSV/tracking-number flow below,
                      which only makes sense for an order going by post. */}
                  {selectedOrder.fulfilmentType !== 'royal_mail' && (
                    <div className="mb-4 border border-purple-100 bg-purple-50/20 p-4">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-2">
                        {FULFILMENT_LABELS[selectedOrder.fulfilmentType]}
                      </p>
                      <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                        This order is set to {FULFILMENT_LABELS[selectedOrder.fulfilmentType].toLowerCase()} - it never goes
                        through Royal Mail, so no label, tracking number, or CSV export applies here.
                      </p>
                      {!PAYMENT_CONFIRMED_STATUSES.includes(selectedOrder.status) ? (
                        <p className="text-[10px] text-stone-500 leading-relaxed">
                          Confirm payment before marking this order delivered
                          {selectedOrder.paymentMethod === 'paypal' || selectedOrder.paymentMethod === 'fena'
                            ? ' - use "Mark as Paid" above once funds have cleared.'
                            : '.'}
                        </p>
                      ) : selectedOrder.status === 'delivered' ? (
                        <p className="text-[10px] text-green-600">Delivered.</p>
                      ) : (
                        <button
                          onClick={() => markOrderDelivered(selectedOrder.orderNumber)}
                          disabled={markingDelivered}
                          className="w-full bg-purple-500 text-white text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:bg-purple-600 disabled:opacity-50 transition-colors"
                        >
                          {markingDelivered ? 'Updating…' : 'Mark as Delivered'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Royal Mail label — primary dispatch system */}
                  {selectedOrder.fulfilmentType === 'royal_mail' && (
                  <div className="mb-4 border border-gold-100 bg-gold-50/20 p-4">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500">
                        Royal Mail Label
                      </p>
                      <div className="flex gap-1.5">
                        {selectedOrder.royalMailLabelStatus === 'created' && (
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-green-50 text-green-600">Label Created</span>
                        )}
                        {selectedOrder.royalMailLabelStatus === 'error' && (
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-red-50 text-red-500">Label Error</span>
                        )}
                        {selectedOrder.shippingCountry && selectedOrder.shippingCountry.toUpperCase() !== 'GB' && (
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-indigo-50 text-indigo-500">International</span>
                        )}
                      </div>
                    </div>

                    {!PAYMENT_CONFIRMED_STATUSES.includes(selectedOrder.status) ? (
                      <p className="text-[10px] text-stone-500 leading-relaxed">
                        Confirm payment before a Royal Mail label can be created
                        {selectedOrder.paymentMethod === 'paypal' || selectedOrder.paymentMethod === 'fena'
                          ? ' - use "Mark as Paid" above once funds have cleared.'
                          : '.'}
                      </p>
                    ) : selectedOrder.royalMailLabelStatus === 'created' ? (
                      <div className="space-y-2.5">
                        <div className="text-[10px] text-stone-500 space-y-0.5">
                          {selectedOrder.trackingNumber && (
                            <p>
                              Tracking:{' '}
                              {selectedOrder.trackingUrl ? (
                                <a href={selectedOrder.trackingUrl} target="_blank" rel="noreferrer" className="text-gold-700 hover:underline font-mono">
                                  {selectedOrder.trackingNumber}
                                </a>
                              ) : (
                                <span className="font-mono text-stone-600">{selectedOrder.trackingNumber}</span>
                              )}
                            </p>
                          )}
                          {selectedOrder.parcelWeightGrams != null && (
                            <p>Parcel: {selectedOrder.parcelWeightGrams}g{selectedOrder.parcelPackageFormat ? ` · ${selectedOrder.parcelPackageFormat}` : ''}</p>
                          )}
                        </div>

                        {/* Prominent link to Royal Mail's own tracking page, which shows the
                            live delivery status, delivery timing, and the signed-for proof of
                            delivery. Falls back to the public tracking URL for the number if
                            Click & Drop did not return a direct trackingUrl. */}
                        {(selectedOrder.trackingUrl || selectedOrder.trackingNumber) && (
                          <a
                            href={selectedOrder.trackingUrl || `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(selectedOrder.trackingNumber!)}`}
                            target="_blank" rel="noreferrer"
                            className="flex items-center justify-center gap-1.5 w-full border border-gold-300 bg-gold-50 text-gold-700 text-[10px] tracking-[0.14em] uppercase font-semibold py-2.5 hover:bg-gold-100 transition-colors"
                          >
                            Delivery status &amp; proof of delivery &rarr;
                          </a>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          <a
                            href={`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/label?type=postageLabel`}
                            target="_blank" rel="noreferrer"
                            className="flex-1 text-center border border-stone-200 text-stone-500 text-[9px] tracking-[0.12em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors"
                          >
                            Postage Label
                          </a>
                          <a
                            href={`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/label?type=despatchNote`}
                            target="_blank" rel="noreferrer"
                            className="flex-1 text-center border border-stone-200 text-stone-500 text-[9px] tracking-[0.12em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors"
                          >
                            Despatch Note
                          </a>
                          {selectedOrder.shippingCountry && selectedOrder.shippingCountry.toUpperCase() !== 'GB' && (
                            <>
                              <a
                                href={`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/label?type=CN22`}
                                target="_blank" rel="noreferrer"
                                className="flex-1 text-center border border-stone-200 text-stone-500 text-[9px] tracking-[0.12em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors"
                              >
                                CN22
                              </a>
                              <a
                                href={`/api/admin/orders/${encodeURIComponent(selectedOrder.orderNumber)}/label?type=CN23`}
                                target="_blank" rel="noreferrer"
                                className="flex-1 text-center border border-stone-200 text-stone-500 text-[9px] tracking-[0.12em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors"
                              >
                                CN23
                              </a>
                            </>
                          )}
                        </div>

                        {selectedOrder.status !== 'dispatched' && selectedOrder.status !== 'delivered' ? (
                          <button
                            onClick={() => markDispatchedAndSendTracking(selectedOrder.orderNumber)}
                            disabled={markingDispatchedRM || isOnCooldown('dispatch', selectedOrder.orderNumber)}
                            className="w-full bg-gold-700 text-white text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:bg-gold-800 disabled:opacity-50 transition-colors"
                          >
                            {markingDispatchedRM ? 'Updating…' : isOnCooldown('dispatch', selectedOrder.orderNumber) ? 'Dispatched ✓' : 'Mark Dispatched & Send Tracking'}
                          </button>
                        ) : selectedOrder.shippingEmailSentAt ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[9px] text-green-600">
                              <span aria-hidden="true">&#10003;</span> Tracking email sent to customer on {formatDate(selectedOrder.shippingEmailSentAt)}.
                            </p>
                            <button
                              type="button"
                              onClick={() => openDispatchEmail(selectedOrder.orderNumber)}
                              disabled={loadingDispatchEmail}
                              className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                            >
                              {loadingDispatchEmail ? 'Opening...' : 'See the email'}
                            </button>
                          </div>
                        ) : null}

                        {trackingEmailSent === selectedOrder.orderNumber && (
                          <div className="border border-green-200 bg-green-50 text-green-700 px-3 py-2 text-[10px] leading-relaxed">
                            Dispatched - tracking email sent to {selectedOrder.email}.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedOrder.royalMailLabelStatus === 'error' && selectedOrder.royalMailLabelError && (
                          <p className="text-[9px] text-red-500 leading-relaxed">{selectedOrder.royalMailLabelError}</p>
                        )}
                        <button
                          onClick={() => createRoyalMailLabel(selectedOrder.orderNumber)}
                          disabled={creatingLabel}
                          className="w-full bg-gold-700 text-white text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:bg-gold-800 disabled:opacity-50 transition-colors"
                        >
                          {creatingLabel ? 'Creating…' : selectedOrder.royalMailLabelStatus === 'error' ? 'Retry Royal Mail Label' : 'Create Royal Mail Label'}
                        </button>
                        {labelActionError?.orderNumber === selectedOrder.orderNumber && (
                          <p className="text-[9px] text-red-500 leading-relaxed">{labelActionError.message}</p>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Manual CSV / fallback dispatch system */}
                  {selectedOrder.fulfilmentType === 'royal_mail' && (
                  <div className="mb-4 border border-stone-200 bg-stone-50/50 p-4">
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">
                      Manual CSV / Fallback Dispatch
                    </p>
                    <p className="text-[9px] text-stone-500 mb-3 leading-relaxed">
                      Use this if the Royal Mail label above isn&apos;t available, for orders the
                      API can&apos;t handle yet, or as an emergency backup.
                    </p>
                    <div className="space-y-2 mb-3">
                      {[
                        { n: '1', text: 'Download the Royal Mail CSV below' },
                        { n: '2', text: 'In Click & Drop: Orders → Import from spreadsheet → upload the file' },
                        { n: '3', text: 'Royal Mail generates your label - print it and attach to the parcel' },
                        { n: '4', text: 'Copy the tracking number from Click & Drop and paste it below' },
                      ].map(({ n, text }) => (
                        <div key={n} className="flex gap-2.5">
                          <span className="w-4 h-4 rounded-full bg-stone-400 text-white text-[8px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{n}</span>
                          <p className="text-[10px] text-stone-500 leading-relaxed">{text}</p>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => downloadRoyalMailCSV(selectedOrder.orderNumber)}
                      disabled={exportingCsv}
                      className="flex items-center justify-center gap-2 w-full border border-stone-300 text-stone-600 text-[10px] tracking-[0.2em] uppercase font-semibold py-2.5 hover:border-gold-300 hover:text-gold-700 disabled:opacity-50 transition-colors"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M8 12l-4-4h2.5V3h3v5H12L8 12z"/>
                        <path d="M2 13h12v1.5H2z"/>
                      </svg>
                      {exportingCsv ? 'Preparing CSV...' : 'Download Royal Mail CSV'}
                    </button>
                    {csvExportError && (
                      <p className="text-[9px] text-red-500 mt-2">{csvExportError}</p>
                    )}
                    {selectedOrder.status === 'exported' && (
                      <p className="text-[9px] text-green-600 mt-2">
                        Exported - once Royal Mail gives you a tracking number, paste it below (or on the
                        Dispatch page) to mark this order dispatched and email the customer.
                      </p>
                    )}
                    {selectedOrder.shippingEmailSentAt && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-[9px] text-green-600">
                          <span aria-hidden="true">&#10003;</span> Tracking email sent to customer on {formatDate(selectedOrder.shippingEmailSentAt)}.
                        </p>
                        <button
                          type="button"
                          onClick={() => openDispatchEmail(selectedOrder.orderNumber)}
                          disabled={loadingDispatchEmail}
                          className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.14em] uppercase px-3 py-1.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                        >
                          {loadingDispatchEmail ? 'Opening...' : 'See the email'}
                        </button>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Tracking number — postal-carrier concept only; collection/
                      hand-delivered/no-delivery/other-manual orders have no
                      carrier, so this (and the email it triggers, addressed
                      "via Royal Mail Tracked 48") would be actively wrong for
                      them. */}
                  {selectedOrder.fulfilmentType === 'royal_mail' && (
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                      Tracking Number - paste from Click &amp; Drop
                    </label>
                    <input
                      type="text"
                      key={selectedOrder.orderNumber}
                      defaultValue={selectedOrder.trackingNumber || ''}
                      placeholder="e.g. AA123456789GB"
                      onBlur={e => {
                        const value = e.target.value.trim();
                        if (value !== (selectedOrder.trackingNumber || '')) updateTracking(selectedOrder.orderNumber, value);
                      }}
                      className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                    />
                    <p className="text-[8px] mt-1 leading-relaxed">
                      {savingTracking
                        ? <span className="text-stone-500">Saving…</span>
                        : trackingEmailSent === selectedOrder.orderNumber
                          ? <span className="text-green-600">Saved - dispatch email sent to {selectedOrder.email}</span>
                          : <span className="text-stone-300">Saving the tracking number automatically emails the customer and marks the order as dispatched.</span>}
                    </p>
                  </div>
                  )}

                  {/* Mark as Delivered — royal_mail only; other fulfilment
                      types get their own Mark as Delivered button inside the
                      manual-fulfilment panel above instead. */}
                  {selectedOrder.fulfilmentType === 'royal_mail' && selectedOrder.status === 'dispatched' && (
                    <div className="mb-4">
                      <button
                        onClick={() => markOrderDelivered(selectedOrder.orderNumber)}
                        disabled={markingDelivered}
                        className="w-full border border-green-200 text-green-700 text-[10px] tracking-[0.18em] uppercase py-2.5 hover:border-green-400 hover:bg-green-50 transition-colors disabled:opacity-50"
                      >
                        {markingDelivered ? 'Saving…' : 'Mark as Delivered'}
                      </button>
                    </div>
                  )}

                  {/* Resend order confirmation + admin notification emails */}
                  {PAYMENT_CONFIRMED_STATUSES.includes(selectedOrder.status) && (
                    <div className="mb-4">
                      <button
                        onClick={() => resendOrderEmails(selectedOrder.orderNumber)}
                        disabled={resendingOrderEmails || isOnCooldown('resend-order-emails', selectedOrder.orderNumber)}
                        className="w-full border border-stone-200 text-stone-500 text-[10px] tracking-[0.18em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors disabled:opacity-50"
                      >
                        {resendingOrderEmails
                          ? 'Sending…'
                          : isOnCooldown('resend-order-emails', selectedOrder.orderNumber)
                            ? 'Sent - resend again shortly'
                            : 'Resend Order Emails'}
                      </button>
                      {resendOrderEmailsResult?.orderNumber === selectedOrder.orderNumber && (
                        <p className={`text-[9px] mt-1 text-center ${resendOrderEmailsResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {resendOrderEmailsResult.message}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Resend dispatch email */}
                  {selectedOrder.fulfilmentType === 'royal_mail' && selectedOrder.trackingNumber && ['dispatched', 'delivered'].includes(selectedOrder.status) && (
                    <div className="mb-4">
                      <button
                        onClick={() => resendDispatchEmail(selectedOrder.orderNumber)}
                        disabled={resendingEmail || isOnCooldown('resend', selectedOrder.orderNumber)}
                        className="w-full border border-stone-200 text-stone-500 text-[10px] tracking-[0.18em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors disabled:opacity-50"
                      >
                        {resendingEmail
                          ? 'Sending…'
                          : isOnCooldown('resend', selectedOrder.orderNumber)
                            ? 'Sent - resend again in a few seconds'
                            : 'Resend Dispatch Email'}
                      </button>
                      {resendEmailResult?.orderNumber === selectedOrder.orderNumber && (
                        <p className={`text-[9px] mt-1 text-center ${resendEmailResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {resendEmailResult.ok ? 'Email resent successfully.' : 'Failed to send - check RESEND_API_KEY_BEAUTY_IS.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Internal notes */}
                  <div className="mb-4">
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                      Internal Notes
                    </label>
                    <textarea
                      key={selectedOrder.orderNumber}
                      rows={3}
                      defaultValue={selectedOrder.adminNotes || ''}
                      onChange={e => setNotesDraft(prev => ({ ...prev, [selectedOrder.orderNumber]: e.target.value }))}
                      placeholder="Notes visible only to you - not sent to the customer."
                      className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors resize-none"
                    />
                    <button
                      onClick={() => saveNotes(selectedOrder.orderNumber)}
                      disabled={savingNotes}
                      className="mt-1 text-[9px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors disabled:opacity-40"
                    >
                      {savingNotes ? 'Saving…' : 'Save Notes'}
                    </button>
                  </div>

                  {/* Delete order */}
                  <div className="mt-5 pt-5 border-t border-stone-100">
                    {deleteConfirm === selectedOrder.orderNumber ? (
                      <div className="border border-red-200 bg-red-50 p-3">
                        <p className="text-[10px] text-red-600 mb-2.5 leading-relaxed">
                          This will permanently delete the order. This cannot be undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDeleteOrder(selectedOrder.orderNumber)}
                            disabled={deletingOrder}
                            className="flex-1 bg-red-500 text-white text-[9px] tracking-[0.18em] uppercase py-2 hover:bg-red-600 transition-colors disabled:opacity-50"
                          >
                            {deletingOrder ? 'Deleting…' : 'Confirm Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="flex-1 border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase py-2 hover:border-stone-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(selectedOrder.orderNumber)}
                        className="w-full border border-red-200 text-red-400 text-[9px] tracking-[0.18em] uppercase py-2 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Delete Order
                      </button>
                    )}
                  </div>

      {dispatchEmailError && (
        <p className="text-[9px] text-red-600 mt-2">{dispatchEmailError}</p>
      )}
      {dispatchEmail && (
        <SentEmailViewer
          subject={dispatchEmail.subject}
          html={dispatchEmail.html}
          text={dispatchEmail.text}
          onClose={() => setDispatchEmail(null)}
        />
      )}
    </>
  );
}
