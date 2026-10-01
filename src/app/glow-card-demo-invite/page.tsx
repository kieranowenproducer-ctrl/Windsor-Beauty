import Link from 'next/link';
import { notFound } from 'next/navigation';

const names = { passport: 'Gilded Passport' };

export default async function GlowCardDemoInvite({ searchParams }: { searchParams: Promise<{ design?: string }> }) {
  const { design } = await searchParams;
  if (!design || !(design in names)) notFound();
  return <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
    <p className="text-[10px] uppercase tracking-[0.24em] text-gold-700">Windsor Glow member invitation</p>
    <h1 className="font-serif text-5xl text-stone-900 mt-4">A friend invited you</h1>
    <p className="text-base leading-relaxed text-stone-700 mt-6">A Windsor Glow member can share a personal link. When a new member joins and their first qualifying order is checked, both members can earn one Glow Card stamp.</p>
    <div className="border border-gold-300 bg-gold-50 p-5 mt-8"><p className="text-sm font-semibold text-gold-900">Design preview: {names[design as keyof typeof names]}</p><p className="text-sm text-stone-700 mt-2">This is a demo invitation. It does not register a referral or add a real stamp.</p></div>
    <Link href="/" className="inline-block mt-8 border border-gold-700 px-5 py-3 text-sm text-gold-900 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">Explore Windsor Glow</Link>
  </main>;
}
