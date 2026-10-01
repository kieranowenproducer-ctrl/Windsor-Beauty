'use client';

import { useState } from 'react';

export default function BackInStockForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/stock-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'done') {
    return (
      <div className="border border-gold-200 bg-gold-50/40 px-5 py-4 mb-6 text-center">
        <p className="text-xs text-stone-600">
          You&rsquo;re on the list. We&rsquo;ll email you the moment this is back in stock.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-stone-200 px-5 py-4 mb-6">
      <p className="text-xs text-stone-500 mb-3">
        Out of stock. Leave your email and we&rsquo;ll let you know the moment it&rsquo;s back.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="text-[10px] tracking-[0.18em] uppercase bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {status === 'loading' ? 'Submitting…' : 'Notify Me'}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-500 mt-2">{error}</p>}
    </form>
  );
}
