'use client';

import CustomerEditFields from './CustomerEditFields';
import {
  customerDisplayName,
  formatDate,
  STATUS_CHIP,
  STATUS_LABEL_MAP,
  type Customer,
  type CustomerDraft,
  type CustomerOrder,
} from './customerTypes';
import CustomerEmailButton from '@/components/admin/CustomerEmailButton';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  selected: Customer | null;
  customerOrders: CustomerOrder[];
  loadingOrders: boolean;
  editingName: boolean;
  startEditName: () => void;
  cancelEditName: () => void;
  draft: CustomerDraft;
  setField: <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => void;
  saveName: () => void;
  savingName: boolean;
  nameError: string;
  resendVerificationEmail: () => void;
  resendingVerification: boolean;
  resendVerificationResult: { ok: boolean; message: string } | null;
  setSelectedCodeStatus: (status: 'used' | 'active') => void;
  codeStatusSaving: boolean;
  codeStatusError: string;
  updateOpeningOffer: (action: 'check' | 'approve' | 'hold') => void;
  offerCheckSaving: boolean;
  offerCheckError: string;
  deleteSelectedCustomer: () => void;
  deleting: boolean;
  deleteError: string;
}

export default function CustomerDetailPanel({
  selected, customerOrders, loadingOrders,
  editingName, startEditName, cancelEditName, draft, setField, saveName, savingName, nameError,
  resendVerificationEmail, resendingVerification, resendVerificationResult,
  setSelectedCodeStatus, codeStatusSaving, codeStatusError,
  updateOpeningOffer, offerCheckSaving, offerCheckError,
  deleteSelectedCustomer, deleting, deleteError,
}: Props) {
  return (
    <>
            {/* Customer detail */}
            <div className="bg-white border border-stone-200 p-4">
              {selected ? (
                <div className="space-y-4 text-xs">
                  <div>
                    {/* WHY THE EDIT CONTROL SAYS A WORD NOW (task b7f7caf5, 7 September 2026).
                        It was a 14 pixel pencil in the palest grey on the page, with no label.
                        Every field here has been editable all along: name, email, phone, the
                        whole address, where they came from, and marketing consent. Kieran
                        reported he could not edit customers at all, and he was right in the way
                        that counts, because a control nobody can find is a control that is not
                        there. The BUTTON changed. The feature was already built. */}
                    {editingName ? (
                      <div className="space-y-2 mb-1">
                        <CustomerEditFields draft={draft} setField={setField} disabled={savingName} />
                        {nameError && <p className="text-[10px] text-red-500">{nameError}</p>}
                        <div className="flex gap-2">
                          <button
                            onClick={saveName}
                            disabled={savingName}
                            className="text-[9px] tracking-[0.18em] uppercase bg-gold-700 text-white px-3 py-1.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                          >
                            {savingName ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEditName}
                            disabled={savingName}
                            className="text-[9px] tracking-[0.18em] uppercase border border-stone-200 text-stone-500 px-3 py-1.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                        {/* Delete, in the edit form itself (task 62faf532). There has been a
                            delete at the bottom of this panel all along, but on a phone this
                            panel sits under the whole customer table and that button sits under
                            the whole order history: press Edit and it is nowhere near you.
                            Divided off and full width on its own line, never beside Save. */}
                        <div className="border-t border-stone-100 pt-2.5 mt-2.5">
                          {deleteError && <p className="text-[10px] text-red-500 mb-1.5">{deleteError}</p>}
                          <button
                            onClick={deleteSelectedCustomer}
                            disabled={deleting || savingName}
                            className="w-full min-h-11 text-[9px] tracking-[0.18em] uppercase border border-red-300 text-red-600 px-3 py-2.5 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Delete this customer'}
                          </button>
                          <p className="text-[9px] text-stone-400 mt-1.5 leading-relaxed">
                            Removes them for good. Past orders are kept. There is no undo.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-stone-700 flex items-center gap-2 flex-wrap">
                        {customerDisplayName(selected)}
                        {selected.accountStatus === 'pending_password' && (
                          <span className="inline-flex items-center text-[8px] tracking-[0.1em] uppercase px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200">Pending</span>
                        )}
                        <button
                          onClick={startEditName}
                          className="inline-flex min-h-8 items-center gap-1.5 border border-gold-200 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-700 transition-colors hover:border-gold-400 hover:bg-gold-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                        >
                          <svg aria-hidden className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                          Edit details
                        </button>
                      </p>
                    )}
                    <p className="text-stone-400">Member since {formatDate(selected.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Contact</p>
                    <p className="text-stone-600">
                      <CustomerEmailButton email={selected.email} customerName={customerDisplayName(selected)} />
                    </p>
                    <p className="text-stone-600">{selected.phone || 'No phone on file'}</p>
                  </div>
                  {/* QR campaign origin — permanent first-touch attribution */}
                  <div className="border border-stone-100 p-3">
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-2">Original Source</p>
                    {selected.qrCampaignName ? (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gold-700 shrink-0" />
                          <p className="text-xs font-semibold text-stone-700">{selected.qrCampaignName}</p>
                        </div>
                        {selected.qrCampaignType && (
                          <p className="text-[9px] text-stone-400 uppercase tracking-wider ml-4">{selected.qrCampaignType}</p>
                        )}
                        {selected.qrPartnerName && (
                          <p className="text-[9px] text-stone-500 ml-4">{selected.qrPartnerName}</p>
                        )}
                        {selected.qrCampaignSlug && (
                          <p className="text-[8px] text-stone-300 font-mono ml-4">/r/{selected.qrCampaignSlug}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-stone-200 shrink-0" />
                        <p className="text-[10px] text-stone-400">Direct / No QR campaign</p>
                      </div>
                    )}
                    {selected.referredBy && (
                      <p className="text-[9px] text-stone-400 mt-2 pt-2 border-t border-stone-50">
                        How they heard about us: {selected.referredBy}
                      </p>
                    )}
                    {selected.socialProfile && (
                      <p className="text-[9px] text-stone-500 mt-1">
                        Social profile: {selected.socialProfile}
                      </p>
                    )}
                  </div>

                  {/* Membership address, collected at registration */}
                  <div className="border border-stone-100 p-3">
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-2">Address</p>
                    {selected.addressLine1 ? (
                      <div className="text-[10px] text-stone-600 leading-relaxed">
                        <p>{selected.addressLine1}</p>
                        {selected.addressLine2 && <p>{selected.addressLine2}</p>}
                        <p>{selected.addressCity}, {selected.addressPostcode}</p>
                        <p>{selected.addressCountry}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-stone-300">No address on file.</p>
                    )}
                  </div>

                  {/* Email verification, directly above the discount it unlocks, because the two
                      questions always get asked together on a call. */}
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Email Verification</p>
                    {selected.emailVerified ? (
                      <span className="inline-block text-[8px] tracking-wider uppercase px-2 py-0.5 bg-green-50 text-green-600">
                        Verified
                      </span>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block text-[8px] tracking-wider uppercase px-2 py-0.5 bg-amber-50 text-amber-600">
                            Not verified
                          </span>
                          <button
                            type="button"
                            onClick={resendVerificationEmail}
                            disabled={resendingVerification}
                            className="text-[9px] tracking-wider uppercase px-2 py-0.5 border border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-700 disabled:opacity-40 transition-colors"
                          >
                            {resendingVerification ? 'Sending' : 'Resend verification email'}
                          </button>
                        </div>
                        <p className="text-[10px] text-stone-400 mt-1.5 leading-relaxed">
                          Resending also creates their 10% code and puts it in the email, so they get it even if they never click the link.
                        </p>
                        {resendVerificationResult && (
                          <p className={`text-[10px] mt-1.5 leading-relaxed ${resendVerificationResult.ok ? 'text-green-700' : 'text-red-600'}`}>
                            {resendVerificationResult.message}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">10% Member Discount</p>
                    {selected.discountCode ? (
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono text-xs text-gold-700">{selected.discountCode}</p>
                          <span className={`inline-block text-[8px] tracking-wider uppercase px-2 py-0.5 ${selected.discountCodeStatus === 'used' ? 'bg-green-50 text-green-600' : 'bg-stone-100 text-stone-400'}`}>
                            {selected.discountCodeStatus === 'used' ? 'Redeemed' : 'Unredeemed'}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedCodeStatus(selected.discountCodeStatus === 'used' ? 'active' : 'used')}
                            disabled={codeStatusSaving}
                            className="text-[9px] tracking-wider uppercase px-2 py-0.5 border border-stone-200 text-stone-500 hover:border-gold-300 hover:text-gold-700 disabled:opacity-40 transition-colors"
                          >
                            {codeStatusSaving
                              ? 'Saving'
                              : selected.discountCodeStatus === 'used'
                                ? 'Make available again'
                                : 'Mark as redeemed'}
                          </button>
                        </div>
                        {codeStatusError && (
                          <p className="text-[10px] text-red-600 mt-1.5">{codeStatusError}</p>
                        )}
                      </div>
                    ) : (
                      <span className="inline-block text-[8px] tracking-wider uppercase px-2 py-0.5 bg-stone-100 text-stone-400">
                        Not issued
                      </span>
                    )}
                  </div>

                  <div className="border border-stone-100 bg-stone-50 p-3">
                    <p className="mb-1 text-[9px] uppercase tracking-[0.15em] text-stone-500">
                      Historical welcome-offer evidence
                    </p>
                    <p className="text-[10px] leading-relaxed text-stone-600">
                      {selected.openingOfferReview?.status === 'review'
                        ? `Review marker: ${selected.openingOfferReview.reasons.join('; ') || 'staff check requested'}. The offer is not paused.`
                        : selected.openingOfferReview?.status === 'approved'
                          ? 'Staff approved this welcome offer.'
                          : selected.openingOfferReview?.status === 'clear'
                            ? selected.openingOfferReview.reasons.length
                              ? `Evidence recorded: ${selected.openingOfferReview.reasons.join('; ')}. The offer is not paused.`
                              : 'No matching phone, home or sign-up connection found.'
                            : 'This member has not been checked yet.'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => updateOpeningOffer('check')} disabled={offerCheckSaving} className="text-[9px] tracking-wider uppercase border border-stone-300 bg-white px-2 py-1 text-stone-600 hover:border-gold-400 disabled:opacity-40">
                        {offerCheckSaving ? 'Checking' : 'Check again'}
                      </button>
                    </div>
                    {offerCheckError && <p className="mt-1.5 text-[10px] text-red-600">{offerCheckError}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="border border-stone-100 p-3">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Paid Orders</p>
                      <p className="text-base font-semibold text-stone-700">{selected.orderCount}</p>
                    </div>
                    <div className="border border-stone-100 p-3">
                      <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Lifetime Spend</p>
                      <p className="text-base font-semibold text-gold-700">&pound;{selected.totalSpent.toFixed(2)}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Marketing Consent</p>
                    <span className={`inline-block text-[8px] tracking-wider uppercase px-2 py-0.5 ${selected.marketingConsent ? 'bg-green-50 text-green-600' : 'bg-stone-100 text-stone-400'}`}>
                      {selected.marketingConsent ? 'Opted in' : 'Not opted in'}
                    </span>
                  </div>

                  {/* Order history */}
                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-2">Orders and Payment Attempts</p>
                    {loadingOrders ? (
                      <p className="text-[10px] text-stone-300">Loading…</p>
                    ) : customerOrders.length === 0 ? (
                      <p className="text-[10px] text-stone-300">No orders found.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {customerOrders.map(o => (
                          <div key={o.order_number} className="flex items-center justify-between gap-2 py-1.5 border-b border-stone-50">
                            <div>
                              <p className="font-mono text-[10px] text-stone-600">{o.order_number}</p>
                              <p className="text-[9px] text-stone-400">{formatDate(o.created_at)}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-semibold text-gold-700">&pound;{Number(o.total).toFixed(2)}</span>
                              <span className={`text-[8px] tracking-wider uppercase px-1.5 py-0.5 ${STATUS_CHIP[o.status] ?? 'bg-stone-100 text-stone-500'}`}>
                                {STATUS_LABEL_MAP[o.status] ?? o.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Destructive — removes login/sessions/membership details.
                      Past orders are kept (customer_id set to NULL via FK),
                      never deleted, so order history/revenue reporting is unaffected. */}
                  <div className="border-t border-stone-100 pt-3">
                    {deleteError && <p className="text-[10px] text-red-500 mb-2">{deleteError}</p>}
                    <button
                      onClick={deleteSelectedCustomer}
                      disabled={deleting}
                      className="w-full text-[9px] tracking-[0.18em] uppercase border border-red-200 text-red-500 px-3 py-2.5 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Delete Account'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-center">
                  <p className="text-xs text-stone-300">Select a customer to view details</p>
                </div>
              )}
            </div>
    </>
  );
}
