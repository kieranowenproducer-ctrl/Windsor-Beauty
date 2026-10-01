import Link from 'next/link';

interface PolicyLayoutProps {
  title: string;
  intro?: string;
  children: React.ReactNode;
}

const LAST_UPDATED = '6 June 2026';

export default function PolicyLayout({ title, intro, children }: PolicyLayoutProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center mb-14">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Beauty</p>
        <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">{title}</h1>
        {intro && (
          <p className="text-sm text-stone-500 leading-relaxed max-w-xl mx-auto mb-3">{intro}</p>
        )}
        <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500">Last updated: {LAST_UPDATED}</p>
      </div>

      <div className="space-y-9">
        {children}
      </div>

      <div className="mt-16 border-t border-gold-100 pt-10 text-center">
        <p className="text-xs text-stone-500 leading-relaxed max-w-md mx-auto mb-4">
          If anything on this page is unclear, or you would like to discuss it further, our team is happy to help.
        </p>
        <Link
          href="/contact"
          className="inline-block text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800 border-b border-gold-200 hover:border-gold-400 pb-1 transition-colors"
        >
          Get in Touch
        </Link>
      </div>
    </div>
  );
}

export function PolicySection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-stone-700 tracking-wide mb-2.5">{heading}</h2>
      <div className="text-sm text-stone-500 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
