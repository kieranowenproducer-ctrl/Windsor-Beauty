'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';

// Shared review submission form. Used on the main /reviews page
// (productSlug = null) and on individual product pages (productSlug = the
// product's slug, so the review is automatically linked to that product as
// well as appearing on the main reviews page).
export default function ReviewForm({
  productSlug = null,
  onSubmitted,
}: {
  productSlug?: string | null;
  onSubmitted?: () => void;
}) {
  const isLoggedIn = useIsLoggedIn();

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          title: title.trim() || null,
          body: body.trim(),
          productSlug,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('done');
        setMessage('Thank you, your review has been submitted and will appear once approved.');
        setTitle('');
        setBody('');
        setRating(5);
        onSubmitted?.();
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to submit review.');
      }
    } catch {
      setStatus('error');
      setMessage('Failed to submit review.');
    }
  }

  if (isLoggedIn === null) {
    return <p className="text-xs text-stone-500">Checking your account…</p>;
  }

  if (isLoggedIn === false) {
    // Carry the page they are on into the sign-in, so they come straight back
    // here afterwards instead of landing on their account page with the review
    // they came to write two clicks away.
    const backHere = typeof window === 'undefined'
      ? '/reviews'
      : `${window.location.pathname}${window.location.hash || ''}`;
    return (
      <p className="text-xs text-stone-500 leading-relaxed text-center">
        Please{' '}
        <Link
          href={`/account/login?next=${encodeURIComponent(backHere)}`}
          className="text-gold-700 hover:text-gold-800 underline underline-offset-2"
        >
          log in to your account
        </Link>{' '}
        to leave a review.
      </p>
    );
  }

  if (status === 'done') {
    return (
      <div className="border border-gold-200 bg-gold-50 px-5 py-4">
        <p className="text-xs text-gold-700 leading-relaxed">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Kieran's wording, task 1e51c222, above the fields because it is called
          "Before submitting your review" and has to be read before typing, not
          found afterwards. One place in the code, so it shows on the Reviews
          page and on every product page, which is where this form appears.
          Reworded for the skincare shop on 1 October 2026; the old notice was about a different shop. */}
      <div className="border-l-2 border-gold-300 bg-gold-50/40 pl-4 pr-3 py-3">
        <p className="text-xs font-semibold text-stone-800 mb-1">Before submitting your review</p>
        <p className="text-xs leading-relaxed text-stone-600">
          Please review your experience with Windsor Beauty&rsquo;s products and service. Please
          do not include medical claims or personal details. Reviews may be moderated before they
          are shown.
        </p>
      </div>

      <div>
        <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
              className={`text-2xl leading-none transition-colors ${value <= rating ? 'text-gold-700' : 'text-stone-200 hover:text-gold-200'}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">Title (optional)</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Sum up your experience"
          className="w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm text-stone-700 placeholder-stone-500 bg-white"
        />
      </div>
      <div>
        <label className="block text-[9px] tracking-[0.22em] uppercase text-stone-500 mb-2">Your Review</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Tell us what you thought"
          rows={4}
          required
          className="w-full border border-stone-200 focus:border-gold-400 outline-none px-4 py-3 text-sm text-stone-700 placeholder-stone-500 bg-white leading-relaxed"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'loading' || !body.trim()}
        className="bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-100 disabled:text-stone-300 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? 'Submitting…' : 'Submit Review'}
      </button>
      {status === 'error' && message && (
        <p className="text-xs text-red-500">{message}</p>
      )}
    </form>
  );
}
