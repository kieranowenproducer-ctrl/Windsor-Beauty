'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function UnsubscribePage() {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');

  // Read the token from the URL directly rather than via useSearchParams —
  // avoids the Suspense-boundary requirement that hook imposes for a value
  // we only need once, on mount.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!token) {
      setStatus('error');
      setMessage('This unsubscribe link is missing its token.');
      return;
    }

    fetch('/api/marketing/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (res.ok) {
          setStatus('done');
          setMessage(data?.email ? `${data.email} has been unsubscribed from Windsor Glow marketing emails.` : 'You have been unsubscribed from Windsor Glow marketing emails.');
        } else {
          setStatus('error');
          setMessage(data?.error || 'Something went wrong. Please try again.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Something went wrong. Please try again.');
      });
  }, []);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Glow</p>
        <h1 className="font-serif text-3xl text-stone-800 tracking-wide mb-6">Unsubscribe</h1>

        <div className="bg-white border border-gold-100 p-8">
          {status === 'loading' && (
            <p className="text-sm text-stone-600 leading-relaxed">Processing your request&hellip;</p>
          )}
          {status === 'done' && (
            <p className="text-sm text-stone-600 leading-relaxed">{message}</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-500 leading-relaxed">{message}</p>
          )}
        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          <Link href="/" className="text-gold-700 hover:text-gold-800 font-medium">
            Return to Windsor Glow
          </Link>
        </p>
      </div>
    </div>
  );
}
