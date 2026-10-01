'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { useDialog } from './useDialog';
import { useViewportOwner } from './viewportOwner';
import type { CartItem } from '@/contexts/CartContext';
import { trackShopAction } from '@/lib/analytics/shopTracking';
import { nonMemberPrice } from '@/lib/memberPricing';

interface Props {
  open: boolean;
  items: CartItem[];
  nonMemberTotal: number;
  onContinue: () => void;
  onClose: () => void;
}

export default function MemberPriceOfferModal({ open, items, nonMemberTotal, onContinue, onClose }: Props) {
  const memberTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const saving = Math.max(0, nonMemberTotal - memberTotal);
  const dialog = useDialog({ open, onClose, labelledBy: 'member-price-offer-title' });
  useViewportOwner(open, 'member-price-offer', { lockScroll: true });

  useEffect(() => {
    if (open) trackShopAction('member_offer_shown');
  }, [open]);

  function dismiss() {
    trackShopAction('member_offer_dismissed');
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-stone-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={dismiss}>
      <section {...dialog} onMouseDown={(event) => event.stopPropagation()} className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto overscroll-contain border border-gold-300 bg-[#fffdf8] shadow-[0_24px_80px_rgba(68,53,23,0.35)] outline-none">
        <button type="button" onClick={dismiss} aria-label="Close member price offer" className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-700 transition-colors hover:border-gold-400 hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </button>
        <div className="border-b border-gold-200 bg-[radial-gradient(circle_at_top,_#f8e9b7,_#fffdf8_64%)] px-6 pb-6 pt-8 sm:px-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold-800">Your Basket Has A Member Price</p>
          <h2 id="member-price-offer-title" className="mt-2 max-w-sm font-serif text-3xl leading-tight text-stone-900">Join free. Keep more of your order.</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-stone-700">Members pay the lower price on every item. Your basket is saved while you create your account.</p>
        </div>
        <div className="px-6 py-5 sm:px-8">
          <div className="space-y-3 border-b border-stone-200 pb-5">
            {items.slice(0, 3).map((item) => <div key={`${item.productId}-${item.variant}`} className="flex items-center gap-3"><Image src={item.image || `/images/products/${item.slug}.jpg`} alt="" width={44} height={44} className="h-11 w-11 border border-gold-100 object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-stone-900">{item.name}</p><p className="text-xs text-stone-600">{item.variant} × {item.quantity}</p></div><div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">Non-member price</p><span className="text-sm font-semibold text-stone-700">£{(nonMemberPrice(item.price) * item.quantity).toFixed(2)}</span></div></div>)}
            {items.length > 3 && <p className="text-xs text-stone-600">Plus {items.length - 3} more item{items.length === 4 ? '' : 's'}.</p>}
          </div>
          <div className="mt-5 border-2 border-gold-400 bg-gold-50 px-5 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.7),0_8px_24px_rgba(161,119,29,0.15)]">
            <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold-800">Member Price Today</p><p className="mt-1 text-xs text-stone-600">You save £{saving.toFixed(2)}</p></div><p className="font-serif text-3xl font-semibold text-gold-800">£{memberTotal.toFixed(2)}</p></div>
            <p className="mt-2 text-xs text-stone-600">Non-member basket price: <span className="line-through">£{nonMemberTotal.toFixed(2)}</span></p>
          </div>
          <Link href="/account/register" onClick={() => trackShopAction('member_offer_joined')} className="mt-5 block w-full bg-gold-700 px-5 py-4 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white transition-colors hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2">
            Yes, I Want To Save £{saving.toFixed(2)}
          </Link>
          <button type="button" onClick={() => { trackShopAction('member_offer_checkout'); onContinue(); }} className="mt-3 w-full py-3 text-center text-stone-700 transition-colors hover:text-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            <span className="block text-xs font-semibold">No, I want to pay</span>
            <span className="block font-serif text-3xl font-bold leading-none underline decoration-2 underline-offset-4">more</span>
            <span className="mt-2 block text-xs font-semibold underline underline-offset-4">Please continue as a non-member.</span>
          </button>
        </div>
      </section>
    </div>
  );
}
