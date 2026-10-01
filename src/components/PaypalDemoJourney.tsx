'use client';

import { useState } from 'react';

interface PaypalDemoJourneyProps {
  paymentUrl: string;
  initiallyConfirmed?: boolean;
}

const DEMO_TOTAL = 62.10;

export default function PaypalDemoJourney({ paymentUrl, initiallyConfirmed = false }: PaypalDemoJourneyProps) {
  const [researchConfirmed, setResearchConfirmed] = useState(initiallyConfirmed);
  const [termsConfirmed, setTermsConfirmed] = useState(initiallyConfirmed);

  const canContinue = researchConfirmed && termsConfirmed;

  return (
    <main className="min-h-screen bg-[#fbfaf7] px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 border border-[#d6b56d] bg-[#fff9e9] px-4 py-3 text-center text-xs leading-relaxed text-stone-700">
          Safe demonstration. This does not create an order or take a payment.
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <section className="border border-stone-200 bg-white p-6 shadow-[0_20px_60px_rgba(41,37,36,0.06)] sm:p-9">
            <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-[#8b6a2d]">Checkout · Payment</p>
            <h1 className="mt-3 font-serif text-3xl tracking-wide text-stone-900 sm:text-4xl">Choose how to pay</h1>
            <p className="mt-3 text-sm leading-relaxed text-stone-500">Your details and delivery choice are complete. PayPal is selected below.</p>

            <div className="mt-8 border-2 border-[#0070ba] bg-[#f7fbfe] p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded bg-[#0070ba] text-lg font-bold italic text-white">P</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-stone-900">Pay with PayPal</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-500">Pay securely on PayPal in the next step.</p>
                </div>
                <span className="flex h-5 w-5 items-center justify-center rounded-full border-[5px] border-[#0070ba] bg-white" aria-label="Selected" />
              </div>
            </div>

            <div className="mt-7 border border-[#e8d9b8] bg-[#fffdf8] p-5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500">Before you pay</p>
              <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed text-stone-600">
                <input type="checkbox" checked={researchConfirmed} onChange={event => setResearchConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b6a2d]" />
                <span>I confirm this order is for lawful research use and I am over 18.</span>
              </label>
              <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-relaxed text-stone-600">
                <input type="checkbox" checked={termsConfirmed} onChange={event => setTermsConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#8b6a2d]" />
                <span>I have read and agree to the Terms and Conditions.</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => { window.location.href = paymentUrl; }}
              disabled={!canContinue}
              className="mt-5 min-h-14 w-full bg-[#0070ba] px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-[#005ea6] disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
            >
              Pay now with PayPal · £{DEMO_TOTAL.toFixed(2)}
            </button>
            <p className="mt-3 text-center text-[10px] text-stone-400">You will go straight to PayPal. No extra payment page.</p>
          </section>

          <aside className="h-fit border border-stone-200 bg-white p-6">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500">Demo order</p>
            <div className="mt-5 space-y-3 border-b border-stone-100 pb-5 text-xs">
              <div className="flex justify-between gap-4"><span className="text-stone-500">Research order</span><span>£50.00</span></div>
              <div className="flex justify-between gap-4"><span className="text-stone-500">UK delivery</span><span>£10.00</span></div>
              <div className="flex justify-between gap-4"><span className="text-stone-500">PayPal fee</span><span>£2.10</span></div>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <span className="text-sm font-semibold text-stone-700">Total</span>
              <span className="font-serif text-3xl text-[#8b6a2d]">£{DEMO_TOTAL.toFixed(2)}</span>
            </div>
            <p className="mt-6 border-t border-stone-100 pt-5 text-[10px] leading-relaxed text-stone-400">PayPal receives the total and order reference WG-DEMO. It does not receive any product name.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
