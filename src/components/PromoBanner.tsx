import Link from 'next/link';
import { getActivePromotion, isDbConfigured } from '@/lib/db';

// Slim global banner — sits above the header on every page (see layout.tsx).
// Only renders when an admin-created promotion is currently active. The whole
// bar links to the Special Offers page, so it carries one set of link
// semantics rather than nesting a second link inside it.
export default async function PromoBanner() {
  const promo = isDbConfigured() ? await getActivePromotion().catch(() => null) : null;
  if (!promo) return null;

  return (
    <Link
      href="/promotion"
      className="group block bg-gold-700 text-white hover:bg-gold-800 transition-colors cursor-pointer"
    >
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-center">
        <span className="text-xs sm:text-sm font-semibold tracking-wide animate-flash">{promo.title}</span>
        {promo.description && (
          <>
            <span className="hidden sm:inline text-white/40" aria-hidden="true">&bull;</span>
            <span className="text-[11px] sm:text-xs tracking-wide text-white/90 leading-snug">
              {promo.description}
            </span>
          </>
        )}
        <span className="text-[10px] tracking-[0.18em] uppercase font-semibold bg-white text-gold-700 px-3.5 py-1.5 group-hover:bg-stone-900 group-hover:text-white transition-colors shrink-0">
          {promo.button_text || 'Special Offers'}
        </span>
      </div>
    </Link>
  );
}
