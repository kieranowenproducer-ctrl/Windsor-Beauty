'use client';

import Link from 'next/link';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';
import { percentOf } from '@/lib/money';

interface AccountIncentiveBannerProps {
  /** Member-price saving shown to a guest. */
  subtotal: number;
  /**
   * 'incentive' — shown before purchase, encourages signing up to save now.
   * 'missed' — shown after a guest checkout, highlights the saving they missed.
   */
  variant?: 'incentive' | 'missed';
  /** The exact member saving for this basket. When given, it replaces the "at least 20%" estimate. */
  saving?: number;
  className?: string;
}

export default function AccountIncentiveBanner({ subtotal, variant = 'incentive', saving, className = '' }: AccountIncentiveBannerProps) {
  const isLoggedIn = useIsLoggedIn();

  if (isLoggedIn !== false || subtotal <= 0) return null;

  const savings = percentOf(subtotal, 20);

  if (variant === 'missed') {
    return (
      <div className={`border border-gold-200 bg-gold-50/30 p-5 text-center ${className}`}>
        <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Next Time, Save More</p>
        <p className="text-xs text-stone-500 leading-relaxed mb-3">
          Members pay lower prices across the shop. Create an account before your next order.
        </p>
        <Link
          href="/account/register"
          className="inline-block text-[9px] tracking-[0.2em] uppercase text-gold-700 border border-gold-200 px-5 py-2 hover:border-gold-400 hover:bg-gold-50 transition-colors"
        >
          Create Account
        </Link>
      </div>
    );
  }

  return (
    <div className={`border border-gold-200 bg-gold-50/40 px-4 py-3.5 ${className}`}>
      <p className="text-xs text-stone-600 leading-relaxed">
        {saving !== undefined && saving > 0 ? (
          <>
            Members pay <span className="font-semibold text-gold-700">&pound;{saving.toFixed(2)}</span> less for this basket. Membership is free.{' '}
          </>
        ) : (
          <>
            Members pay at least 20% less. On this basket, that is a saving of at least{' '}
            <span className="font-semibold text-gold-700">&pound;{savings.toFixed(2)}</span>.{' '}
          </>
        )}
        <Link href="/account/register" className="text-gold-700 hover:text-gold-700 font-semibold underline underline-offset-2">
          Sign up
        </Link>
        {' '}or{' '}
        <Link href="/account/login" className="text-gold-700 hover:text-gold-700 font-semibold underline underline-offset-2">
          log in
        </Link>
        .
      </p>
    </div>
  );
}
