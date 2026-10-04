'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface PaymentState {
  orderNumber: string; total: number; paymentMethod: string; paid: boolean;
  expired: boolean; payable: boolean; paymentUrl: string | null; expiresAt: string | null;
}

export default function ResumePaymentPage() {
  const params = useParams<{ token: string }>();
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/payment/resume/${encodeURIComponent(params.token)}`)
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Payment link could not be opened.');
        setPayment(data);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Payment link could not be opened.'));
  }, [params.token]);

  return (
    <main className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
      <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">Secure Payment</p>
      <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-5">Complete Your Order</h1>
      {!payment && !error && <p className="text-sm text-stone-500">Checking your payment link…</p>}
      {error && <p className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {payment && (
        <div className="border border-stone-200 bg-white p-6 text-left">
          <p className="text-xs text-stone-500">Order <strong className="font-mono text-stone-800">{payment.orderNumber}</strong></p>
          <p className="font-serif text-3xl text-stone-800 mt-2 mb-5">£{payment.total.toFixed(2)}</p>
          {payment.paid ? (
            <p className="bg-green-50 border border-green-200 p-4 text-sm text-green-700">This order is already paid. You do not need to pay again.</p>
          ) : payment.expired ? (
            <p className="bg-stone-50 border border-stone-200 p-4 text-sm text-stone-600">This unpaid reservation has expired. Please return to the shop to place a new order.</p>
          ) : payment.paymentUrl ? (
            <>
              <p className="text-sm text-stone-500 mb-5">Your order is reserved but payment has not been confirmed.</p>
              <a href={payment.paymentUrl} className="block text-center bg-gold-700 text-white text-[10px] tracking-[0.2em] uppercase px-6 py-3.5 hover:bg-gold-800">
                Pay securely now
              </a>
            </>
          ) : (
            <p className="bg-gold-50 border border-gold-200 p-4 text-sm text-gold-700">The original payment page is unavailable. Please contact sales@windsorbeauty.is and quote {payment.orderNumber}.</p>
          )}
        </div>
      )}
      <Link href="/shop" className="inline-block mt-6 text-xs text-gold-700 hover:underline">Return to the shop</Link>
    </main>
  );
}
