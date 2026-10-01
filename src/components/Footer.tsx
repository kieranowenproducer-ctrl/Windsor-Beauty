import Link from 'next/link';
import Image from 'next/image';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { parseFooterContent } from '@/lib/footerContent';
import { categoryUrl } from '@/lib/categoryUrls';
import { liveCategories } from '@/lib/shopServerData';

export default async function Footer() {
  const year = new Date().getFullYear();
  /* Read alongside the footer copy rather than after it, so the category column costs one round
   * trip of latency on a page render and not three. This is on every page of the site. */
  const [footerRow, categories] = await Promise.all([
    isDbConfigured() ? getSiteContent('footer-content').catch(() => null) : Promise.resolve(null),
    liveCategories().catch(() => []),
  ]);
  const footer = parseFooterContent(footerRow);

  return (
    <footer className="bg-white border-t border-gold-100 mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-8">

        {/* Five columns rather than four since 11 August 2026: the brand block still spans two,
            and "Shop by category" sits beside Navigation and Legal in the same styling. That one
            column is the whole visible change the category pages make to the site. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10 mb-12">

          {/* Brand column with real logo */}
          <div className="sm:col-span-2">
            <div className="mb-4">
              <Image
                src="/images/logo-transparent.png"
                alt="Windsor Glow"
                width={144}
                height={90}
                className="w-36 h-auto object-contain"
              />
            </div>
            <p className="text-xs text-stone-500 leading-relaxed max-w-xs mb-5">
              {footer.description}
            </p>
            <ul className="space-y-1.5">
              {footer.emails.map(email => (
                <li key={email.address}>
                  <a href={`mailto:${email.address}`} className="text-xs text-stone-500 hover:text-gold-800 transition-colors">
                    {email.address}
                  </a>
                  <span className="text-[10px] text-stone-500"> · {email.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Navigation column */}
          <div>
            <h2 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-4">
              Navigation
            </h2>
            <ul className="space-y-2.5">
              {footer.navLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-stone-500 hover:text-gold-800 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Shop by category column. The names are exactly the ones the shop's own dropdown
              shows, and only categories with at least one live product in them appear, from the
              same liveCategories() the sitemap reads so the two cannot name different sets.
              Nothing is written here about what a category is for. */}
          {categories.length > 0 && (
            <div>
              <h2 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-4">
                Shop by category
              </h2>
              <ul className="space-y-2.5">
                {categories.map(({ name }) => (
                  <li key={name}>
                    <Link href={categoryUrl(name)} className="text-xs text-stone-500 hover:text-gold-800 transition-colors">
                      {name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legal column */}
          <div>
            <h2 className="text-[9px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-4">
              Legal
            </h2>
            <ul className="space-y-2.5">
              {footer.legalLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-stone-500 hover:text-gold-800 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Research disclaimer */}
        <div className="border-t border-gold-100 pt-8 mb-6">
          <p className="text-[10px] text-stone-500 leading-relaxed max-w-3xl">
            <span className="font-semibold text-stone-500">For Research Use Only.</span>{' '}
            {footer.disclaimer}
          </p>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gold-50 pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-[10px] text-stone-500">
            &copy; {year} {footer.copyrightSuffix}
          </p>
          <p className="text-[10px] text-stone-500">
            {footer.bottomRightText}
          </p>
        </div>
      </div>
    </footer>
  );
}
