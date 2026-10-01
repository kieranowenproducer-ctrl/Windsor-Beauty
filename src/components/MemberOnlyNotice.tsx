import Link from 'next/link';
import BackToHome from '@/components/BackToHome';

/**
 * What somebody sees instead of the calculator or the dosage guide when they are not signed in
 * (task 98b6dcc6).
 *
 * IT SAYS WHY. A wall that just says "members only" reads as a trick to make you register. This
 * says what the page is, who it is for, and that an account is free, because the honest reason is
 * one we are happy to print: reconstitution arithmetic is laboratory guidance, and it should not
 * sit on the open web next to a buy button.
 *
 * It is a 200, not a 404. The page exists and the visitor is being told how to reach it. Pretending
 * it is not there would be a different and worse answer.
 */
export default function MemberOnlyNotice({ title, what }: { title: string; what: string }) {
  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-xl mx-auto px-4 sm:px-6 pt-10 pb-24">
        <BackToHome />

        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mt-8 mb-2">
          For members
        </p>
        <h1 className="inline-block border-b border-gold-400 pb-3 font-serif text-3xl sm:text-4xl text-stone-800 tracking-wide">
          {title}
        </h1>

        <p className="text-sm text-stone-500 leading-relaxed mt-7">{what}</p>

        <p className="text-sm text-stone-500 leading-relaxed mt-4">
          It is available to Windsor Glow members. An account is free, takes a minute, and also
          gives you member pricing on every product.
        </p>

        <p className="text-xs text-stone-400 leading-relaxed mt-4">
          We keep this behind an account rather than on the open website because working out a
          concentration is laboratory guidance. Everything we supply is for laboratory research use
          only, and nothing on this page is advice about any person.
        </p>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-9">
          <Link
            href="/account/login"
            className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-7 py-3.5 text-center hover:bg-gold-800 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/account/register"
            className="border border-gold-300 text-gold-700 text-[10px] tracking-[0.18em] uppercase px-7 py-3.5 text-center hover:bg-gold-50 transition-colors"
          >
            Create a free account
          </Link>
        </div>

        <p className="text-xs text-stone-400 mt-8">
          Looking for something else?{' '}
          <Link href="/shop" className="text-gold-700 hover:text-gold-800 underline">
            Browse the shop
          </Link>
          {' '}or{' '}
          <Link href="/contact" className="text-gold-700 hover:text-gold-800 underline">
            ask us a question
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
