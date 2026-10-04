'use client';

/**
 * /checkout/success
 *
 * Redirect URL entered in Fena dashboard:
 *   https://www.windsorbeauty.co.uk/checkout/success
 *
 * Fena appends these params on return:
 *   ?order=WB-XXXX&order_id=WB-XXXX&status=paid&payment_id=<fena_id>
 *
 * When status=paid arrives in the URL we call /api/payment/fena/confirm, which
 * is a READ-ONLY status lookup (it cannot mark anything paid — see that
 * route's comment for why). If the authenticated Fena webhook has already
 * landed, this resolves instantly. If not, we fall into the same polling
 * loop used when Fena redirects without a status param at all, until the
 * webhook confirms it for real.
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AccountIncentiveBanner from '@/components/AccountIncentiveBanner';

type Stage =
  | 'resolving'
  | 'confirming'  // calling our confirm endpoint (status=paid in URL)
  | 'polling'     // no status in URL — waiting for webhook to confirm
  | 'confirmed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'unknown';

function CheckIcon() {
  return (
    <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CrossIcon() {
  return (
    <svg className="w-7 h-7 text-stone-500" viewBox="0 0 24 24" fill="none">
      <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg className="w-7 h-7 text-gold-700" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg className="w-6 h-6 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const [stage, setStage]             = useState<Stage>('resolving');
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [subtotal, setSubtotal]       = useState(0);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // ── 1. Resolve order number ───────────────────────────────────────────────
    const fromUrl =
      searchParams.get('order') ??
      searchParams.get('order_id') ??
      searchParams.get('reference') ??
      searchParams.get('ref') ??
      searchParams.get('payment_reference') ??
      searchParams.get('order_reference');

    const fromStorage =
      typeof window !== 'undefined' ? localStorage.getItem('wb_pending_order') : null;

    const ref = fromUrl ?? fromStorage;

    if (!ref) {
      setStage('unknown');
      return;
    }

    setOrderNumber(ref);

    // Clear localStorage now that we have the reference
    try { localStorage.removeItem('wb_pending_order'); } catch { /* ignore */ }

    // Shared polling loop — waits for the authenticated Fena webhook to
    // actually confirm payment in the DB. Used both when Fena redirects
    // with no status param at all, and as the fallback when status=paid is
    // in the URL but the webhook hasn't landed yet (see path 2 below).
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS  = 3000;

    const poll = async () => {
      try {
        const res  = await fetch(`/api/payment/fena/status/${encodeURIComponent(ref)}`);
        const data = res.ok ? await res.json() : null;

        if (data?.paid) {
          if (data?.subtotal) setSubtotal(Number(data.subtotal));
          setStage('confirmed');
          return;
        }
        if (data?.failed) {
          setStage('failed');
          return;
        }
        if (data?.status === 'payment_cancelled') {
          setStage('cancelled');
          return;
        }
      } catch { /* keep polling */ }

      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        pollingRef.current = setTimeout(poll, INTERVAL_MS);
      } else {
        setStage('timeout');
      }
    };

    // ── 2. Check Fena's status param in the URL ───────────────────────────────
    const urlStatus = searchParams.get('status')?.toLowerCase();

    if (urlStatus === 'paid' || urlStatus === 'completed' || urlStatus === 'success') {
      // Fena's redirect claims success — check the order's real status (this
      // call is read-only and cannot mark anything paid itself). If the
      // webhook already landed, this resolves instantly; otherwise fall into
      // the same safe polling loop used below, rather than ever trusting the
      // URL on its own.
      setStage('confirming');
      fetch('/api/payment/fena/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: ref }),
      })
        .then(async r => {
          if (!r.ok) { setStage('timeout'); return; }
          const data = await r.json().catch(() => null);
          if (data?.alreadyConfirmed) {
            if (data?.subtotal) setSubtotal(Number(data.subtotal));
            setStage('confirmed');
          } else if (data?.failed) {
            setStage('failed');
          } else if (data?.cancelled) {
            setStage('cancelled');
          } else {
            setStage('polling');
            poll();
          }
        })
        .catch(() => setStage('timeout'));
      return;
    }

    if (urlStatus === 'failed' || urlStatus === 'declined' || urlStatus === 'error') {
      setStage('failed');
      return;
    }

    if (urlStatus === 'cancelled' || urlStatus === 'canceled' || urlStatus === 'abandoned') {
      setStage('cancelled');
      return;
    }

    // ── 3. No status in URL — fall back to polling the DB ────────────────────
    setStage('polling');
    poll();

    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on arrival. It starts the payment poll and returns the cleanup that cancels it, so re-running would leave a second poll behind and hammer the order endpoint.
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (stage === 'resolving' || stage === 'confirming' || stage === 'polling') {
    const message =
      stage === 'confirming'
        ? 'Confirming your payment…'
        : stage === 'polling'
        ? 'Waiting for payment confirmation…'
        : 'Loading…';
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-gold-50 border border-gold-200 flex items-center justify-center mx-auto mb-8">
          <Spinner />
        </div>
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">One Moment</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Processing</h1>
        <p className="text-sm text-stone-500 leading-relaxed max-w-sm mx-auto">{message}</p>
      </div>
    );
  }

  if (stage === 'confirmed') {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-gold-700 flex items-center justify-center mx-auto mb-8">
          <CheckIcon />
        </div>
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">Order Confirmed</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Thank You</h1>

        {orderNumber && (
          <p className="inline-block border border-gold-200 bg-gold-50 text-gold-700 text-xs font-mono font-semibold tracking-widest px-4 py-2 mb-5">
            Order {orderNumber}
          </p>
        )}

        <p className="text-sm text-stone-500 leading-relaxed mb-3 max-w-sm mx-auto">
          Your payment has been received and your order is now being prepared.
          A confirmation email is on its way to you now.
        </p>
        <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
          Once dispatched via Royal Mail, you will receive a tracking number by email.
        </p>

        <div className="border border-gold-200 bg-gold-50/30 p-6 mb-8 text-left">
          <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">
            What Happens Next
          </p>
          <ul className="space-y-2 text-xs text-stone-500 leading-relaxed">
            <li>1. Check your inbox for your order confirmation email.</li>
            <li>2. Your order will be packaged and prepared for dispatch.</li>
            <li>3. Once dispatched, you will receive Royal Mail tracking details by email.</li>
            <li>4. Your order will arrive within the selected delivery timeframe.</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap gap-3 justify-center">
          <Link href="/shop" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
            Continue Shopping
          </Link>
          <Link href="/account" className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors">
            View My Orders
          </Link>
        </div>

        <AccountIncentiveBanner subtotal={subtotal} variant="missed" className="mt-8 max-w-sm mx-auto" />

        <p className="mt-6 text-[9px] text-stone-500">
          Questions?{' '}
          <a href="mailto:sales@windsorbeauty.is" className="text-gold-700 hover:underline">
            sales@windsorbeauty.is
          </a>
        </p>
      </div>
    );
  }

  if (stage === 'failed') {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto mb-8">
          <CrossIcon />
        </div>
        <p className="text-[9px] tracking-[0.38em] uppercase text-stone-500 mb-3">Payment Failed</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Payment Not Completed</h1>
        <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
          Your payment could not be processed. No charge has been made.
          Please try again or contact us if the problem continues.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/checkout" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
            Try Again
          </Link>
          <Link href="/contact" className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors">
            Contact Support
          </Link>
        </div>
        <p className="mt-8 text-[9px] text-stone-500">
          {orderNumber && `Quote order ${orderNumber} `}
          <a href="mailto:sales@windsorbeauty.is" className="text-gold-700 hover:underline">
            sales@windsorbeauty.is
          </a>
        </p>
      </div>
    );
  }

  if (stage === 'cancelled') {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center mx-auto mb-8">
          <CrossIcon />
        </div>
        <p className="text-[9px] tracking-[0.38em] uppercase text-stone-500 mb-3">Payment Cancelled</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Order Not Completed</h1>
        <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
          Your payment was cancelled. No charge has been made.
          Your basket is still saved if you would like to try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/checkout" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
            Return to Checkout
          </Link>
          <Link href="/shop" className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors">
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  if (stage === 'timeout') {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="w-16 h-16 rounded-full bg-gold-50 border border-gold-200 flex items-center justify-center mx-auto mb-8">
          <ClockIcon />
        </div>
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">Still Processing</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Awaiting Confirmation</h1>
        <p className="text-sm text-stone-500 leading-relaxed mb-4 max-w-sm mx-auto">
          Payment confirmation is taking a little longer than expected. This can
          occasionally happen with bank transfers.
        </p>
        <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
          If your bank confirmed the payment, your order will be processed automatically
          once confirmation arrives.{orderNumber && ` Quote ${orderNumber} if you contact us.`}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/account" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
            Check Order Status
          </Link>
          <Link href="/contact" className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors">
            Contact Support
          </Link>
        </div>
        <p className="mt-8 text-[9px] text-stone-500">
          Email:{' '}
          <a href="mailto:sales@windsorbeauty.is" className="text-gold-700 hover:underline">
            sales@windsorbeauty.is
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
      <p className="text-[9px] tracking-[0.38em] uppercase text-stone-500 mb-3">Order Reference Not Found</p>
      <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Nothing to Show</h1>
      <p className="text-sm text-stone-500 leading-relaxed mb-10 max-w-sm mx-auto">
        If you have just placed an order, check your email for a confirmation,
        or view your order history from your account.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link href="/account" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
          View My Orders
        </Link>
        <Link href="/shop" className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
          Back to Shop
        </Link>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-gold-50 border border-gold-200 flex items-center justify-center mx-auto mb-8">
        <svg className="w-6 h-6 text-gold-700 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
          <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">One Moment</p>
      <h1 className="font-serif text-4xl text-stone-800 tracking-wide">Loading</h1>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <SuccessContent />
    </Suspense>
  );
}
