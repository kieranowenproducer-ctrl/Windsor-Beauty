import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { glowCardDemoDesign } from '@/lib/glowCardDemo';

export default async function DemoGlowCardTerms() {
  const request = new Request('https://www.windsorbeauty.co.uk/account/glow-card/terms', { headers: await headers() });
  const customer = await resolveCustomerFromRequest(request);
  if (!customer || !glowCardDemoDesign(customer.email)) notFound();
  return <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
    <Link href="/account/glow-card" className="text-sm text-gold-700 underline underline-offset-4">Back to my Beauty Card</Link>
    <p className="text-[10px] uppercase tracking-[0.23em] text-gold-700 mt-10">Member rewards</p>
    <h1 className="font-serif text-4xl text-stone-900 mt-3">Beauty Card terms preview</h1>
    <p className="border border-gold-200 bg-gold-50 p-4 text-sm text-stone-700 mt-6">This page is part of the three-account design demo. The wider scheme is not open, and demo stamps or codes cannot be used to pay for an order.</p>
    <div className="space-y-6 mt-8 text-sm leading-relaxed text-stone-700">
      <p>Each member can share one personal invitation link. A new member must join through that link, verify their email, sign in and place their first order. The product subtotal must be at least £30 before discounts. Delivery does not count towards the £30.</p>
      <p>Payment must be confirmed and the first order dispatched. The stamp is added after the automatic checks pass. Cancelled or refunded orders do not earn a stamp. Splitting purchases into several orders does not create extra stamps.</p>
      <p>One qualifying new member can earn one stamp for themselves and one for the member who invited them. A member's own repeat orders do not add stamps. A welcome code used on the qualifying first order does not stop the stamp. Shared phone, delivery or internet details may need staff review.</p>
      <p>Stamps 1 to 5 unlock £10 off and half-price standard UK delivery. Stamps 6 to 10 unlock £20 off and half-price standard UK delivery. Stamps 11 to 15 unlock £30 off and half-price standard UK delivery. Each stage can be claimed once and stays complete after it is claimed.</p>
      <p>Before a code is created, Windsor Beauty checks the five supporting invitations again. We may pause, refuse or revoke a stamp or unused reward where an order is refunded, details are duplicated, accounts appear connected or the scheme appears to be manipulated.</p>
      <p>Each reward belongs to the signed-in member, works once on a product order of at least £30 before delivery, and cannot be combined with another discount code. Free delivery is not reduced below £0.</p>
    </div>
  </main>;
}
