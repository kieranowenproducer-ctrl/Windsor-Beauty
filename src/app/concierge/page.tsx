'use client';

// The concierge's own front door, reached from the main navigation rather than
// from inside My Account (Kieran's request, 2026-08-04). One address, three
// audiences, and the server decides which one this visitor is:
//
//   signed out                -> an invitation to log in or create an account
//   signed in, not yet open   -> a coming-soon note (final testing and training)
//   signed in and allowed     -> the concierge itself, exactly as it was
//
// "Allowed" is conciergeAvailableTo() in lib/concierge/availability.ts: open to
// everyone (CONCIERGE_ACCOUNT_LIVE), signed in to the admin panel, or on the
// tester list (CONCIERGE_TEST_ACCOUNTS). Reported by /api/concierge/access,
// which answers only this question. A staff visitor with no customer account of
// their own is a member here too, and is told so, because the assistant cannot
// look up orders that do not exist. The member view now contains two isolated modes:
// the existing account Concierge and the source-grounded PEARL library. The
// account Concierge API is unchanged, and the API still refuses independently,
// which is the gate that actually holds.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import BackToHome from '@/components/BackToHome';
import ConciergeModes from '@/components/account/ConciergeModes';

type Visitor =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'waiting' }
  | { kind: 'member'; firstName: string | null; staff: boolean };

// The same chat glyph the My Account card used, kept as the concierge's mark
// so the feature stays visually recognisable in its new home.
function ConciergeMark() {
  return (
    <div className="mx-auto w-14 h-14 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center">
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-3.4-.59L3 21l1.7-4.06A7.4 7.4 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
        />
      </svg>
    </div>
  );
}

export default function ConciergePage() {
  const [visitor, setVisitor] = useState<Visitor>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/concierge/access')
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!json || !json.signedIn) return { kind: 'signed-out' } as const;
        /* Decided on the server, never here: the page cannot be talked into
         * showing the chat by a value from the browser, and an older cached
         * response reads as "not yet", the safe direction. */
        if (!json.available) return { kind: 'waiting' } as const;
        return {
          kind: 'member',
          firstName: (json.firstName ?? null) as string | null,
          staff: Boolean(json.staff),
        } as const;
      })
      .catch(() => ({ kind: 'signed-out' } as const))
      .then((next) => {
        if (!cancelled) setVisitor(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (visitor.kind === 'loading') {
    return (
      <>
        <BackToHome />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-8">
          <div aria-label="Loading the concierge" role="status" className="rounded-xl border border-stone-200 shadow-sm px-5 py-7 sm:px-7 space-y-3 mt-10">
            <div className="h-3 w-2/3 bg-gold-50 animate-pulse" />
            <div className="h-3 w-1/2 bg-gold-50 animate-pulse" />
            <div className="h-3 w-3/5 bg-gold-50 animate-pulse" />
          </div>
        </div>
      </>
    );
  }

  if (visitor.kind === 'signed-out') {
    return (
      <>
        <BackToHome />
        <div className="max-w-xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-24 text-center">
          <ConciergeMark />
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mt-6 mb-2">An Exclusive Member Service</p>
          <h1 className="inline-block border-b border-gold-400 pb-3 font-serif text-4xl text-stone-800 tracking-wide">
            AI Assistance
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed mt-6 max-w-md mx-auto">
            Our concierge gives members instant answers about their orders, deliveries and our
            published guides. PEARL also lets members explore compounds, categories
            and the evidence supplied with them.
          </p>
          <p className="text-sm text-stone-500 leading-relaxed mt-3 max-w-md mx-auto">
            It is reserved for Windsor Glow members. Log in to your account, or create one in a
            minute, and the concierge will be here waiting.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Link
              href="/account/login"
              className="inline-flex items-center justify-center w-full sm:w-auto bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 shadow-lg shadow-black/15 ring-1 ring-black/5 hover:bg-gold-800 transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/account/register"
              className="inline-flex items-center justify-center w-full sm:w-auto border border-gold-300 bg-white text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
            >
              Create Account
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (visitor.kind === 'waiting') {
    return (
      <>
        <BackToHome />
        <div className="max-w-xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-24 text-center">
          <ConciergeMark />
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mt-6 mb-2">Coming Soon</p>
          <h1 className="inline-block border-b border-gold-400 pb-3 font-serif text-4xl text-stone-800 tracking-wide">
            AI Assistance
          </h1>
          <p className="text-sm text-stone-500 leading-relaxed mt-6 max-w-md mx-auto">
            Thank you for being a member. Our concierge is in its final testing and training
            phase, so that every answer meets the standard you expect from us.
          </p>
          <p className="text-sm text-stone-500 leading-relaxed mt-3 max-w-md mx-auto">
            It will open to members very soon. You do not need to do anything: it will simply
            appear here when it is ready.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Link
              href="/account"
              className="inline-flex items-center justify-center w-full sm:w-auto bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 shadow-lg shadow-black/15 ring-1 ring-black/5 hover:bg-gold-800 transition-colors"
            >
              My Account
            </Link>
            <Link
              href="/shop"
              className="inline-flex items-center justify-center w-full sm:w-auto border border-gold-300 bg-white text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
            >
              Browse the Shop
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <BackToHome />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12">
        <div className="mx-auto mb-7 mt-6 max-w-3xl text-center">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-1">Windsor Glow</p>
          <h1 className="inline-block border-b border-gold-400 pb-3 font-serif text-4xl text-stone-800 tracking-wide">
            AI Assistance
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-stone-500">
            Choose Concierge for orders and website help, or open PEARL to explore
            compounds, categories and the evidence supplied with them.
          </p>

          {/* Staff signed in to the admin panel, with no customer account of their own.
              Said plainly so nobody reports "it would not tell me about my order" as a
              fault: there is no account here for it to look one up in. */}
          {visitor.staff && (
            <p className="mx-auto mt-4 max-w-xl border border-gold-200 bg-gold-50/60 px-4 py-3 text-xs leading-relaxed text-stone-600">
              You are signed in as a member of staff. Everything works except order questions:
              those need a customer account, and the admin login is not one. Sign in to a
              Windsor Glow account as well if you want to test those.
            </p>
          )}
        </div>

        <ConciergeModes firstName={visitor.firstName} adminPreview={visitor.staff} />
      </div>
    </>
  );
}
