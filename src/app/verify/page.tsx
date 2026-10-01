'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import BackToHome from '@/components/BackToHome';

type Status =
  | 'idle'
  | 'loading'
  | 'verified'
  | 'already_used'
  | 'invalid'
  | 'order_not_found'
  | 'email_mismatch'
  | 'no_account'
  | 'error';

interface VerifyResult {
  status: Status;
  message: string;
  productName?: string | null;
  batchRef?: string | null;
  purity?: string | null;
}

function VerifyPageInner() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState(() => searchParams.get('code')?.trim().toUpperCase() ?? '');
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<VerifyResult | null>(null);

  const canSubmit =
    code.trim().length > 0 &&
    orderNumber.trim().length > 0 &&
    email.trim().length > 0 &&
    status !== 'loading';

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('loading');
    setResult(null);
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          orderNumber: orderNumber.trim(),
          email: email.trim(),
        }),
      });
      const data = await res.json();
      setStatus(data.status as Status);
      setResult(data);
    } catch {
      setStatus('error');
      setResult({ status: 'error', message: 'Something went wrong. Please check your connection and try again.' });
    }
  }

  function reset() {
    setCode('');
    setOrderNumber('');
    setEmail('');
    setStatus('idle');
    setResult(null);
  }

  const showForm = status === 'idle' || status === 'loading';

  return (
    <>
      <BackToHome />
      <div className="max-w-lg mx-auto px-4 sm:px-6 pt-8 pb-20">

        <div className="text-center mb-12">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">
            Authenticity
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">
            Product Verification
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed max-w-sm mx-auto">
            Enter the verification code from your product label, along with your order number and
            the email address associated with your Windsor Glow account, to confirm authenticity.
          </p>
        </div>

        <div className="border border-gold-100 p-8 sm:p-10 mb-8">

          {showForm && (
            <form onSubmit={handleVerify} className="space-y-5">
              <div>
                <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WG-2025-1042A"
                  required
                  className="w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm tracking-widest text-stone-700 placeholder-stone-200 uppercase bg-white"
                />
              </div>

              <div>
                <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">
                  Order Number
                </label>
                <input
                  type="text"
                  value={orderNumber}
                  onChange={e => setOrderNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. WG-AB2C3D"
                  required
                  className="w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm text-stone-700 placeholder-stone-500 bg-white uppercase tracking-wider"
                />
                <p className="text-[10px] text-stone-500 mt-1.5">
                  Found in your order confirmation email.
                </p>
              </div>

              <div>
                <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm text-stone-700 placeholder-stone-500 bg-white"
                />
                <p className="text-[10px] text-stone-500 mt-1.5">
                  Must match your Windsor Glow account and the email used at checkout.
                </p>
              </div>

              <p className="text-[10px] text-stone-500 leading-relaxed">
                Each verification code can only be used once. All three fields above are required.
                Your submission is logged for fraud-prevention and audit purposes.
              </p>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-100 disabled:text-stone-300 disabled:cursor-not-allowed"
              >
                {status === 'loading' ? 'Checking…' : 'Verify Product'}
              </button>
            </form>
          )}

          {/* Verified */}
          {status === 'verified' && result && (
            <div className="border border-gold-200 bg-gold-50 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-gold-700 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gold-700 mb-1">Product Verified</p>
                  <p className="text-xs text-stone-500 mb-4 leading-relaxed">{result.message}</p>
                  {(result.productName || result.batchRef || result.purity) && (
                    <div className="space-y-2">
                      {result.productName && (
                        <div className="flex justify-between text-[10px]">
                          <span className="tracking-[0.12em] uppercase text-stone-500">Product</span>
                          <span className="font-medium text-stone-600 text-right">{result.productName}</span>
                        </div>
                      )}
                      {result.batchRef && (
                        <div className="flex justify-between text-[10px]">
                          <span className="tracking-[0.12em] uppercase text-stone-500">Batch Ref</span>
                          <span className="font-medium text-stone-600 text-right">{result.batchRef}</span>
                        </div>
                      )}
                      {result.purity && (
                        <div className="flex justify-between text-[10px]">
                          <span className="tracking-[0.12em] uppercase text-stone-500">Purity</span>
                          <span className="font-medium text-stone-600 text-right">{result.purity}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button onClick={reset} className="mt-5 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Verify Another Code
              </button>
            </div>
          )}

          {/* Already used */}
          {status === 'already_used' && result && (
            <div className="border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M6 3v3.5M6 8.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Code Already Used</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{result.message}</p>
                </div>
              </div>
              <button onClick={reset} className="mt-5 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Try Another Code
              </button>
            </div>
          )}

          {/* Code not recognised */}
          {status === 'invalid' && result && (
            <div className="border border-red-100 bg-red-50/50 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-red-400 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-1">Code Not Recognised</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{result.message}</p>
                </div>
              </div>
              <button onClick={reset} className="mt-5 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Try Again
              </button>
            </div>
          )}

          {/* Order not found */}
          {status === 'order_not_found' && result && (
            <div className="border border-red-100 bg-red-50/50 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-red-400 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-1">Order Not Found</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{result.message}</p>
                </div>
              </div>
              <button onClick={reset} className="mt-5 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Try Again
              </button>
            </div>
          )}

          {/* Email does not match order */}
          {status === 'email_mismatch' && result && (
            <div className="border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M6 3v3.5M6 8.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Email Address Does Not Match</p>
                  <p className="text-xs text-stone-500 leading-relaxed">{result.message}</p>
                </div>
              </div>
              <button onClick={reset} className="mt-5 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Try Again
              </button>
            </div>
          )}

          {/* Account required (guest checkout) */}
          {status === 'no_account' && result && (
            <div className="border border-stone-200 bg-stone-50 p-5">
              <div className="flex gap-3">
                <div className="w-5 h-5 rounded-full bg-stone-400 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="4" r="2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M2 10c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-stone-700 mb-1">Account Required</p>
                  <p className="text-xs text-stone-500 leading-relaxed mb-4">{result.message}</p>
                  <div className="flex flex-col gap-2">
                    <Link
                      href="/account/login"
                      className="block text-center bg-gold-700 text-white text-[9px] tracking-[0.2em] uppercase py-2.5 hover:bg-gold-800 transition-colors"
                    >
                      Sign In to Your Account
                    </Link>
                    <Link
                      href="/account/register"
                      className="block text-center border border-stone-300 text-stone-500 text-[9px] tracking-[0.2em] uppercase py-2.5 hover:border-gold-400 hover:text-gold-800 transition-colors"
                    >
                      Create an Account
                    </Link>
                  </div>
                </div>
              </div>
              <button onClick={reset} className="mt-4 w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-500 py-1 transition-colors">
                Back
              </button>
            </div>
          )}

          {/* Generic error */}
          {status === 'error' && result && (
            <div className="border border-stone-200 bg-stone-50 p-5">
              <p className="text-xs font-semibold text-stone-600 mb-1">Unable to Verify Right Now</p>
              <p className="text-xs text-stone-500 leading-relaxed mb-4">{result.message}</p>
              <button onClick={reset} className="w-full text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border border-stone-200 py-2 transition-colors">
                Try Again
              </button>
            </div>
          )}

        </div>

        <div className="text-center border-t border-gold-100 pt-8">
          <h3 className="text-[9px] tracking-[0.25em] uppercase text-stone-500 font-semibold mb-3">
            Where to Find Your Code
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed max-w-xs mx-auto mb-6">
            Your unique verification code is printed on the product label and included on your
            certificate of analysis. Each code is valid for one check only.
          </p>
            {/* Dosage guide link removed: members-only (task 98b6dcc6). */}
        </div>

      </div>
    </>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyPageInner />
    </Suspense>
  );
}
