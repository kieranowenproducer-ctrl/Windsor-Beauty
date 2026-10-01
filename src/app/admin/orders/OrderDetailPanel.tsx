'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  ACCOUNT_LINK_LABELS, ACCOUNT_LINK_STYLES, FULFILMENT_LABELS, STATUS_LABELS, STATUS_STYLES,
  formatDate, type Order,
} from './orderTypes';
import CustomerEmailButton from '@/components/admin/CustomerEmailButton';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  selectedOrder: Order | null;
  setSelectedOrder: (order: Order | null) => void;
  orderFailures: { id: number; category: string; message: string; created_at: string }[];
  orderEmails: { id: number; type: string | null; status: string | null; subject: string; sentAt: string; updatedAt: string | null }[];
  orderActions: ReactNode;
}

export default function OrderDetailPanel({
  selectedOrder, setSelectedOrder, orderFailures, orderEmails, orderActions,
}: Props) {
  return (
    <>
            {/* Order detail. On xl the side-by-side column is unchanged; below it the
                detail would stack underneath the full-length table (off-screen on a
                phone, so tapping a row looked like it did nothing) — there it opens
                as a full-screen drawer instead. */}
            <div
              className={
                selectedOrder
                  ? 'fixed inset-0 z-50 overflow-y-auto bg-white p-5 xl:static xl:inset-auto xl:z-auto xl:overflow-visible xl:border xl:border-stone-200'
                  : 'hidden xl:block bg-white border border-stone-200 p-5'
              }
            >
              {selectedOrder ? (
                <div>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="xl:hidden flex items-center gap-2 -ml-1 mb-4 p-1 text-[10px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                  >
                    &larr; Back to orders
                  </button>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-mono font-semibold text-stone-700">{selectedOrder.orderNumber}</p>
                      <p className="text-[9px] text-stone-500">{formatDate(selectedOrder.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${STATUS_STYLES[selectedOrder.status] ?? 'bg-stone-50 text-stone-500'}`}>
                        {STATUS_LABELS[selectedOrder.status] ?? selectedOrder.status}
                      </span>
                      {selectedOrder.paymentMethod && (
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${selectedOrder.paymentMethod === 'paypal' ? 'bg-blue-50 text-[#0070ba]' : 'bg-stone-50 text-stone-500'}`}>
                          {selectedOrder.paymentMethod === 'paypal' ? 'PayPal' : selectedOrder.paymentMethod === 'fena' ? 'Pay by Bank' : selectedOrder.paymentMethod}
                        </span>
                      )}
                      {selectedOrder.invoiceId && (
                        <Link
                          href={`/admin/invoices/${selectedOrder.invoiceId}/edit`}
                          className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-gold-50 text-gold-700 hover:bg-gold-100 transition-colors"
                        >
                          Invoice Order
                        </Link>
                      )}
                      {selectedOrder.fulfilmentType !== 'royal_mail' && (
                        <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-purple-50 text-purple-500">
                          {FULFILMENT_LABELS[selectedOrder.fulfilmentType]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* What the site failed to do for this order. First thing under the header on
                      purpose: if a confirmation email never sent, that is the most important fact
                      about this order and it used to be invisible from here. */}
                  {orderFailures.length > 0 && (
                    <div className="border border-red-300 bg-red-50 px-3 py-2.5 mb-5">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-red-600 font-semibold mb-1.5">
                        {orderFailures.length === 1 ? 'Something failed on this order' : `${orderFailures.length} things failed on this order`}
                      </p>
                      <ul className="space-y-1.5">
                        {orderFailures.map(f => (
                          <li key={f.id} className="text-[10px] text-stone-700 leading-relaxed">
                            {f.message}
                            <span className="text-stone-500"> ({formatDate(f.created_at)})</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[9px] text-stone-500 mt-2">
                        Use the resend buttons below to try again. This list does not clear itself, it is a record of what happened.
                      </p>
                    </div>
                  )}

                  {orderEmails.length > 0 && (
                    <div className="border border-stone-200 bg-stone-50 px-3 py-2.5 mb-5">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 font-semibold mb-1.5">Customer Email Delivery</p>
                      <ul className="space-y-1.5">
                        {orderEmails.map(email => (
                          <li key={email.id} className="flex items-center justify-between gap-3 text-[10px] text-stone-600">
                            <span>{email.type === 'payment_link' || email.type === 'payment_reminder' ? 'Payment email' : email.type === 'dispatch' ? 'Tracking email' : 'Order confirmation'}</span>
                            <span className={email.status === 'delivered' ? 'text-green-700' : ['bounced','failed','complained','suppressed'].includes(email.status || '') ? 'text-red-600' : 'text-gold-700'}>
                              {(email.status || 'sent').replace('_', ' ')} · {formatDate(email.updatedAt || email.sentAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-3 mb-5 text-xs">
                    {/* Invoice notes carried over from the invoice editor (task e6e75b32):
                        the "Message to customer" box and both notes fields are shown here
                        so invoice context is never hidden from the Orders screen. Admin
                        eyes only; nothing here is sent to the customer from this view. */}
                    {(selectedOrder.invoiceMessage || selectedOrder.invoiceInternalNotes || selectedOrder.invoiceCustomerNotes) && (
                      <div className="bg-gold-50/60 border border-gold-200 px-3 py-2.5 space-y-2">
                        <p className="text-[9px] tracking-[0.15em] uppercase text-gold-700">
                          From invoice{selectedOrder.invoiceSubject ? ` - ${selectedOrder.invoiceSubject}` : ''}
                        </p>
                        {selectedOrder.invoiceMessage && (
                          <div>
                            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-0.5">Message to customer</p>
                            <p className="text-stone-700 whitespace-pre-wrap">{selectedOrder.invoiceMessage}</p>
                          </div>
                        )}
                        {selectedOrder.invoiceCustomerNotes && (
                          <div>
                            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-0.5">Customer-facing notes</p>
                            <p className="text-stone-700 whitespace-pre-wrap">{selectedOrder.invoiceCustomerNotes}</p>
                          </div>
                        )}
                        {selectedOrder.invoiceInternalNotes && (
                          <div>
                            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-0.5">Internal admin notes</p>
                            <p className="text-stone-700 whitespace-pre-wrap">{selectedOrder.invoiceInternalNotes}</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Customer</p>
                      <p className="text-stone-700">{selectedOrder.customerName}</p>
                      <p className="text-stone-500">
                        <CustomerEmailButton email={selectedOrder.email} customerName={selectedOrder.customerName} />
                      </p>
                    </div>
                    {/* How this order reached the account it is attached to (task e0858a61).
                        Sits with the customer because it is a fact about the person, not the
                        parcel. An order carrying an account is not proof anybody signed in: the
                        shop also attaches an order when the typed email happens to match a
                        member. Those two used to look identical from here, which is why nobody
                        could answer the question about order WB-63U39T. */}
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">How they ordered</p>
                      <span className={`inline-block text-[9px] leading-relaxed px-2 py-0.5 ${ACCOUNT_LINK_STYLES[selectedOrder.accountLink] ?? 'bg-stone-50 text-stone-500'}`}>
                        {ACCOUNT_LINK_LABELS[selectedOrder.accountLink] ?? selectedOrder.accountLink}
                      </span>
                      {selectedOrder.accountLink === 'email_match' && (
                        <p className="text-[9px] text-stone-500 mt-1 leading-relaxed">
                          The order is on this member&rsquo;s record, but nobody proved they were signed in.
                        </p>
                      )}
                    </div>
                    {/* WHAT THEY CONFIRMED BEFORE PAYING. The sentences are shown, not a tick and
                        a label, because the sentences are the record: the wording will change one
                        day, and an old order has to keep saying what THAT customer agreed to.
                        An order with nothing here says so plainly rather than looking confirmed. */}
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Confirmed before paying</p>
                      {selectedOrder.checkoutConfirmations?.statements?.length ? (
                        <>
                          <ul className="space-y-1">
                            {selectedOrder.checkoutConfirmations.statements.map((statement, idx) => (
                              <li key={idx} className="flex items-start gap-1.5 text-stone-600 leading-relaxed">
                                <span aria-hidden="true" className="text-green-700 mt-[1px]">&#10003;</span>
                                <span>{statement}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[9px] text-stone-500 mt-1">
                            Ticked {new Date(selectedOrder.checkoutConfirmations.confirmedAt).toLocaleString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="text-[9px] text-stone-500 leading-relaxed">
                          Not recorded. This order was placed before the confirmations were kept, or was
                          created from an invoice rather than at the checkout.
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Items</p>
                      <ul className="space-y-1">
                        {selectedOrder.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between text-stone-600">
                            <span>{item.quantity} &times; {item.name} <span className="text-stone-500">({item.variant})</span></span>
                            <span className="text-stone-500">&pound;{(item.price * item.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Delivery Address</p>
                      <p className="text-stone-600 leading-relaxed">{selectedOrder.shippingAddress}</p>
                      <p className="text-stone-500 mt-0.5">{selectedOrder.shippingLabel}</p>
                    </div>
                    {selectedOrder.appliedRules.length > 0 && (
                      <div>
                        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Promotions Applied</p>
                        <ul className="space-y-1">
                          {selectedOrder.appliedRules.map(rule => (
                            <li key={rule.ruleId} className="flex justify-between text-gold-700 gap-3">
                              <span>{rule.description}</span>
                              <span className="shrink-0">&minus;&pound;{rule.discountAmount.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedOrder.ruleDiscountAmount > 0 && (
                      <div>
                        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Rule Discount</p>
                        <p className="text-stone-600">&minus;&pound;{selectedOrder.ruleDiscountAmount.toFixed(2)}</p>
                      </div>
                    )}
                    {(selectedOrder.discountCode || selectedOrder.discountAmount > 0) && (
                      <div>
                        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">{selectedOrder.discountCode ? 'Discount Code' : 'Discount'}</p>
                        <p className="text-stone-600">
                          {selectedOrder.discountCode && <span className="font-mono">{selectedOrder.discountCode}{' '}</span>}
                          &minus;&pound;{selectedOrder.discountAmount.toFixed(2)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Referral Source</p>
                      {selectedOrder.qrCampaignSlug ? (
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold-700 shrink-0" />
                            <p className="text-stone-700 font-medium text-xs">{selectedOrder.qrCampaignName ?? selectedOrder.qrCampaignSlug}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {selectedOrder.qrCampaignType && (
                              <span className="text-[8px] tracking-wider uppercase text-stone-500 bg-stone-50 border border-stone-100 px-1.5 py-0.5">{selectedOrder.qrCampaignType}</span>
                            )}
                            {selectedOrder.qrPartnerName && (
                              <span className="text-[8px] text-stone-500">{selectedOrder.qrPartnerName}</span>
                            )}
                          </div>
                          <p className="text-[8px] text-stone-300 font-mono mt-1">/r/{selectedOrder.qrCampaignSlug}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-200 shrink-0" />
                          <p className="text-stone-500 text-xs">Direct / No campaign</p>
                        </div>
                      )}
                    </div>
                    {selectedOrder.paypalFee > 0 && (
                      <div>
                        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">PayPal Processing Fee (3%)</p>
                        <p className="text-stone-600">&pound;{selectedOrder.paypalFee.toFixed(2)}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Order Total</p>
                      <p className="text-base font-semibold text-gold-700">&pound;{selectedOrder.total.toFixed(2)}</p>
                    </div>
                  </div>

                  {orderActions}
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-center">
                  <p className="text-xs text-stone-300">Select an order to view details</p>
                </div>
              )}
            </div>
    </>
  );
}
