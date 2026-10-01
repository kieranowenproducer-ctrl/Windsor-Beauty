'use client';

import Link from 'next/link';
import { useCart } from '@/contexts/CartContext';

interface MemberSavingsNoteProps {
  /** 'basket' before checkout, 'order' on the checkout summary. */
  context?: 'basket' | 'order';
  /** Also show guests what a member would pay less. Off where a guest banner already sits. */
  showGuest?: boolean;
  compact?: boolean;
  className?: string;
}

// Samuel, 25 Sept 2026: show people the value of being a member. A signed-in
// member sees what membership has saved them on this basket; a guest sees what
// a member would pay less. Display only: the totals are worked out elsewhere
// and this never changes what anybody is charged. Nothing shows until the
// account check has answered, so the wrong wording never flashes up first.
export default function MemberSavingsNote({ context = 'basket', showGuest = false, compact = false, className = '' }: MemberSavingsNoteProps) {
  const { isMember, memberSaving } = useCart();

  if (isMember === null || memberSaving <= 0) return null;
  if (isMember === false && !showGuest) return null;

  const where = context === 'order' ? 'order' : 'basket';
  const amount = <span className="font-semibold text-gold-700">&pound;{memberSaving.toFixed(2)}</span>;
  const box = compact
    ? 'border border-gold-200 bg-gold-50/40 px-3 py-2.5 text-[11px]'
    : 'border border-gold-200 bg-gold-50/40 px-4 py-3.5 text-xs';

  // Samuel, 26 Sept 2026 (video): the one-line note was too small and read past,
  // because people look at the total and the button and nothing else. The saving
  // is now a gold card with the figure set as large as the total beside it, in the
  // Glow Card's gradient. The slow gold shimmer on the figure is the house one from
  // the Coming Soon page; it draws the eye once and stops under reduced motion.
  if (isMember) {
    return (
      <div className={`border border-[#d8c483] bg-[linear-gradient(145deg,#fffaf0,#f2e5bf)] shadow-[0_8px_22px_rgba(111,88,35,0.08)] ${compact ? 'px-4 py-3.5' : 'px-5 py-4'} ${className}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-800">Your member saving</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={`font-serif ${compact ? 'text-3xl' : 'text-4xl'} leading-none text-gold-800 animate-glow motion-reduce:animate-none`}>
            &pound;{memberSaving.toFixed(2)}
          </span>
          <span className="text-sm font-semibold text-stone-800">saved on this {where}</span>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-stone-700">
          Because you are a Windsor Glow member. It is already taken off your prices.
        </p>
      </div>
    );
  }

  return (
    <p className={`${box} text-stone-600 leading-relaxed ${className}`}>
      Members pay {amount} less for this {where}.{' '}
      <Link href="/account/register" className="text-gold-700 font-semibold underline underline-offset-2">
        Join free
      </Link>
    </p>
  );
}
