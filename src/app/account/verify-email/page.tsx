'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Stage = 'checking' | 'verifying' | 'done' | 'error';

export default function VerifyEmailPage() {
  const [stage, setStage] = useState<Stage>('checking');
  const [error, setError] = useState('');
  const ranRef = useRef(false);

  // Read the token from the URL directly rather than via useSearchParams —
  // avoids the Suspense-boundary requirement for a value we only need once,
  // on mount. Auto-submits immediately — there is no form input to collect,
  // clicking the email link is the only action needed.
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      setStage('error');
      setError('This verification link is missing or invalid.');
      return;
    }

    setStage('verifying');
    fetch('/api/account/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async r => {
        const data = await r.json().catch(() => null);
        if (r.ok) {
          setStage('done');
        } else {
          setStage('error');
          setError(data?.error || 'We could not verify your email. Please request a new link and try again.');
        }
      })
      .catch(() => {
        setStage('error');
        setError('Something went wrong. Please try again.');
      });
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Beauty</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Verify Your Email</h1>
        </div>

        <div className="beauty-form-panel p-6 sm:p-8 text-center">
          {(stage === 'checking' || stage === 'verifying') && (
            <p className="text-sm text-stone-500 leading-relaxed">Verifying your email&hellip;</p>
          )}

          {stage === 'done' && (
            <>
              <p className="text-[10px] tracking-[0.3em] uppercase text-gold-700 font-semibold mb-3">
                Email Verified
              </p>
              <p className="text-sm text-stone-600 leading-relaxed mb-6">
                Your email is confirmed. Your 10% first-order discount code is on its way to your inbox now.
              </p>
              <Link
                href="/account"
                className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors"
              >
                Go to My Account
              </Link>
            </>
          )}

          {stage === 'error' && (
            <>
              <p className="text-sm text-stone-600 leading-relaxed mb-4">{error}</p>
              <Link
                href="/account"
                className="inline-block text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800 font-medium"
              >
                Go to my account to resend a verification link
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
