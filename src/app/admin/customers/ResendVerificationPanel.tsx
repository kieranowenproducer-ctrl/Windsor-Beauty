'use client';

import Link from 'next/link';
import { formatDate, type UnverifiedCustomer } from './customerTypes';
import { cameFrom } from './cameFrom';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  unverified: UnverifiedCustomer[];
  panelResendVerification: (u: UnverifiedCustomer) => void;
  panelResendingId: number | null;
  panelResendResults: Record<number, { ok: boolean; message: string }>;
}

export default function ResendVerificationPanel({
  unverified, panelResendVerification, panelResendingId, panelResendResults,
}: Props) {
  return (
    <>
          {/* Resend-verification box (task d2796f97): at the top just like the
              pre-launch Early Subscribers list was. Only shown when someone is
              actually stuck, so a clear list never trains anyone to ignore it. */}
          {unverified.length > 0 && (
            <div className="bg-white border border-gold-300 p-5 mb-5">
              <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-1">
                Waiting To Verify Their Email
              </p>
              <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                {unverified.length === 1 ? 'This customer' : `These ${unverified.length} customers`} created an account but never clicked the verification link, so they have no member discount yet.
                Press Resend to send a fresh link now. It does not matter whether the first one failed or just went to junk.
              </p>
              <div className="border border-stone-200 divide-y divide-stone-100">
                {unverified.map(u => {
                  const result = panelResendResults[u.id];
                  return (
                    <div key={u.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/customers/${u.id}`}
                            className="text-xs text-stone-800 font-medium hover:text-gold-700 transition-colors"
                          >
                            {`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email}
                          </Link>
                          <p className="text-[10px] text-stone-500 mt-0.5">{u.email}</p>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Signed up {formatDate(u.created_at)}.
                            {u.last_sent_at
                              ? ` Link last sent ${formatDate(u.last_sent_at)}${u.times_sent > 1 ? ` (${u.times_sent} times in total)` : ''}.`
                              : ' No link has been sent yet.'}
                          </p>
                          {/* Where they came from (task c61b59f4). Same rule and same words as
                              the "Came From" column on the table below, so one customer never
                              reads two different ways on one screen. */}
                          {(() => {
                            const from = cameFrom({
                              referredBy: u.referred_by,
                              qrCampaignName: u.qr_campaign_name,
                              qrCampaignType: u.qr_campaign_type,
                            });
                            return (
                              <p className="text-[10px] mt-1">
                                <span className="text-stone-500">Came from: </span>
                                <span className={from.known ? 'text-gold-700 font-medium' : 'text-stone-300'}>
                                  {from.main}
                                </span>
                                {from.detail && <span className="text-stone-500"> ({from.detail})</span>}
                              </p>
                            );
                          })()}
                          {u.last_failure_at && (
                            <p className="text-[10px] text-red-500 mt-1">The last attempt failed at {formatDate(u.last_failure_at)}.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => panelResendVerification(u)}
                          disabled={panelResendingId === u.id}
                          className="shrink-0 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {panelResendingId === u.id ? 'Sending' : 'Resend verification email'}
                        </button>
                      </div>
                      {result && (
                        <p className={`text-[10px] mt-1.5 leading-relaxed ${result.ok ? 'text-green-700' : 'text-red-600'}`}>
                          {result.message}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
    </>
  );
}
