import Link from 'next/link';
import { notFound } from 'next/navigation';
import { glowCardLoyaltyEnabled } from '@/lib/glowCardLoyalty';

export default function GlowCardTermsPage() {
  if (!glowCardLoyaltyEnabled()) notFound();
  return <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 text-stone-700">
    <p className="text-[10px] uppercase tracking-[0.25em] text-gold-700">Windsor Beauty</p>
    <h1 className="font-serif text-4xl text-stone-800 mt-2 mb-4">Beauty Card terms</h1>
    <p className="text-sm leading-relaxed mb-8">Beauty Card is a simple member reward. These rules explain exactly how points and rewards work.</p>
    <section className="mb-7"><h2 className="font-serif text-2xl text-stone-800 mb-2">Earning Beauty Points</h2><p className="text-sm leading-relaxed">A paid order earns one Beauty Point when it is placed by a signed-in Windsor Beauty member and contains at least £30 of products before discounts. Delivery does not count. It is one point per qualifying order, not per item or per pound. A guest order does not earn a point and cannot be added later. Unpaid, cancelled and refunded orders do not keep a point.</p></section>
    <section className="mb-7"><h2 className="font-serif text-2xl text-stone-800 mb-2">Referral bonus</h2><p className="text-sm leading-relaxed">Referral points are separate from spending, but are not given for account creation. A new member must join through your link, sign in and complete their first paid order with at least £30 of products. Then you and that member each receive one referral bonus point. Their qualifying first order also earns its normal order point.</p></section>
    <section className="mb-7"><h2 className="font-serif text-2xl text-stone-800 mb-2">Rewards and repeat cards</h2><p className="text-sm leading-relaxed">Five points unlock £10 off, 10 points unlock £20 off and 15 points unlock £30 off. You may claim the £10 and £20 rewards without resetting your progress. Claiming the £30 reward completes that card and starts your next card at zero. Rewards are one-use codes for your own account, valid for 12 months, on product orders of £30 or more before discounts and delivery. Only one manual code can be used per order.</p></section>
    <section className="mb-7"><h2 className="font-serif text-2xl text-stone-800 mb-2">Fair use</h2><p className="text-sm leading-relaxed">We may pause a Beauty Card while suspected duplicate accounts, manufactured referrals or reward abuse are checked. Contact Windsor Beauty if you believe a point or reward is incorrect.</p></section>
    <p className="text-xs text-stone-600 border-t border-gold-200 pt-5">Points begin only from the Beauty Card launch date. Earlier orders do not receive points. Your normal first-order membership offer remains separate.</p>
    <Link href="/account/glow-card" className="inline-block mt-7 text-sm text-gold-700 underline underline-offset-4">Back to my Beauty Card</Link>
  </main>;
}
