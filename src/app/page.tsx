import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import NewInCarousel from '@/components/NewInCarousel';
import ProductCarousel from '@/components/ProductCarousel';
import HomeReviewsCarousel from '@/components/HomeReviewsCarousel';
import VideoTestimonials from '@/components/VideoTestimonials';
import { SocialIcon } from '@/components/SocialIcons';
import { PRODUCTS, mergeProducts, type Product } from '@/data/products';
import {
  getActivePercentagePromotion,
  getApprovedReviewSummary,
  getHiddenProductSlugs,
  getProductStockMap,
  getProductVariantStockMap,
  getReviewStatsForProducts,
  getSiteContent,
  isDbConfigured,
  listApprovedReviews,
  listCustomProducts,
} from '@/lib/db';
import { parseTrustBadges } from '@/lib/trustBadges';
import { siteSaleConfigFromPromotion } from '@/lib/siteSale';
import { DEFAULT_FOOTER_CONTENT } from '@/lib/footerContent';
import { SOCIAL_LINKS, SOCIAL_PROFILE_URLS } from '@/lib/socialLinks';
import { SITE_URL } from './robots';

// Must stay dynamic — featured products depend on live admin visibility/stock toggles
export const dynamic = 'force-dynamic';

/**
 * The front door, as a search engine and a messaging app see it.
 *
 * MEASURED ON 10 AUGUST 2026: every product page had been given a canonical, structured data and
 * a share image, and the homepage had none of the three. It is the most linked page on the site
 * and the one most often pasted with tracking parameters on the end, so it needed the canonical
 * more than any product page did: without one, /?fbclid=... and /?utm_source=... are each a
 * separate page competing with the real front door.
 *
 * This page was already a server component and simply never exported metadata of its own, so it
 * inherited the layout's. The title and description below are deliberately the layout's own
 * words, unchanged: the fault was three missing tags, not the wording.
 */
const DESCRIPTION = 'Windsor Glow supplies high-purity research peptides and compounds for '
  + 'scientific and laboratory use only. 99% purity, lab tested, certificate of analysis with '
  + 'every order.';

export const metadata: Metadata = {
  title: 'Windsor Glow | Premium Research Compounds',
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: 'Windsor Glow | Premium Research Compounds',
    description: DESCRIPTION,
    type: 'website',
    url: `${SITE_URL}/`,
    siteName: 'Windsor Glow',
    images: [{ url: `${SITE_URL}/images/og-windsor-glow.jpg`, width: 1200, height: 630 }],
  },
};

/**
 * What kind of business this is, in the one form a search engine reads as a statement of fact.
 *
 * EVERY FIELD IS SOMETHING THE SITE ALREADY SAYS. The name, the address of the site, the logo
 * that is already on the page, and the three contact emails already printed in the footer.
 *
 * THERE IS DELIBERATELY NO POSTAL ADDRESS, TELEPHONE NUMBER OR COMPANY REGISTRATION NUMBER.
 * Structured data is read as a factual claim about a real business, and none of those three
 * appear anywhere on this site, so putting them here would mean inventing them. They would
 * strengthen the block if they were real, and only Kieran can supply them. check-seo.mjs fails if
 * any of the three ever appears here.
 */
function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Windsor Glow',
    url: SITE_URL,
    logo: `${SITE_URL}/images/logo.png`,
    image: `${SITE_URL}/images/og-windsor-glow.jpg`,
    description: DESCRIPTION,
    email: DEFAULT_FOOTER_CONTENT.emails[0].address,
    // The TikTok, Instagram and Facebook accounts the hero links to, added 24 August 2026. sameAs
    // is how a search engine learns which social profiles belong to this business, not a namesake.
    sameAs: [...SOCIAL_PROFILE_URLS],
    contactPoint: DEFAULT_FOOTER_CONTENT.emails.map((entry) => ({
      '@type': 'ContactPoint',
      email: entry.address,
      contactType: entry.label,
      availableLanguage: 'English',
    })),
  };
}

const QUICK_LINKS = [
  { label: 'Shop Peptides', href: '/shop', gold: true },
  { label: 'Reviews', href: '/reviews', gold: true },
];

export default async function HomePage() {
  const hiddenSlugs = isDbConfigured() ? await getHiddenProductSlugs().catch(() => [] as string[]) : [];
  const stockMap = isDbConfigured() ? await getProductStockMap().catch(() => ({} as Record<string, number>)) : {};
  // Per-dosage numbers as well as the summed total: a card may only stamp OUT OF STOCK
  // across the photograph when every strength is gone, and the total cannot tell that
  // apart from one strength running out.
  const variantStockMap = isDbConfigured()
    ? await getProductVariantStockMap().catch(() => ({} as Record<string, Record<string, number>>))
    : {};
  const reviewStats = isDbConfigured()
    ? await getReviewStatsForProducts().catch(() => ({} as Record<string, { average: number; count: number }>))
    : {};
  const overrides = isDbConfigured() ? await listCustomProducts().catch(() => ({} as Record<string, Product>)) : {};
  // Sort the homepage's most-recent-approved set so 5-star reviews lead the
  // carousel — a stable sort, so reviews of equal rating keep their original
  // most-recent-first order from listApprovedReviews.
  const topReviews = isDbConfigured()
    ? await listApprovedReviews(10).then(rows => [...rows].sort((a, b) => b.rating - a.rating)).catch(() => [])
    : [];
  // The overall score shown above the carousel. Counted across every approved
  // review, not just the ten loaded above, so the badge stays honest as reviews
  // build up.
  const reviewSummary = isDbConfigured()
    ? await getApprovedReviewSummary().catch(() => ({ average: 0, count: 0 }))
    : { average: 0, count: 0 };
  const trustBadgesRow = isDbConfigured() ? await getSiteContent('homepage-trust-badges').catch(() => null) : null;
  const trustBadges = parseTrustBadges(trustBadgesRow);
  const activePercentagePromo = isDbConfigured() ? await getActivePercentagePromotion().catch(() => null) : null;
  const saleConfig = siteSaleConfigFromPromotion(activePercentagePromo);
  const catalogue = mergeProducts(PRODUCTS, overrides);
  const hidden = new Set(hiddenSlugs);
  const featured = catalogue.filter(p => !hidden.has(p.slug)).slice(0, 12);
  const newInProducts = catalogue.filter(p => !hidden.has(p.slug) && p.newIn === true).slice(0, 12);

  return (
    <>
      <script
        type="application/ld+json"
        // Our own object, serialised. The `<` escape closes the one hole that matters: text
        // containing "</script>" would otherwise end the block early.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationJsonLd()).replace(/</g, '\\u003c'),
        }}
      />
      {/* Hero */}
      {/* MOBILE SAFARI FIX (2026-06-18): `min-h-[92vh]` alone measures against the
          *largest* possible viewport (toolbars collapsed), which is taller than what's
          actually visible on initial load when Safari's address bar + bottom toolbar are
          both showing — pushing the vertically-centered content (and the full-width
          Reviews button) below the fold until the user scrolls and the chrome collapses.
          `svh` (small viewport height) measures against the smallest possible viewport
          instead, i.e. the worst case with chrome fully visible, so content sized against
          it is guaranteed to fit on first load with no post-scroll jump. Scoped to mobile
          only via `md:min-h-[78vh]` for the desktop value (see below for why that's no
          longer 92vh). ROLLBACK of the mobile svh fix specifically: change `min-h-[92svh]`
          back to `min-h-[92vh]`, leaving the md: value untouched.

          DESKTOP HEIGHT REDUCED 92vh -> 78vh (2026-06-19): on shorter laptop screens the
          vertically-centered content (eyebrow/logo/copy/buttons) sat low enough in the
          92vh-tall section that the bottom button row was cut off below the fold under
          the sticky promo/header/ticker stack above it. Shrinking the section pulls the
          centered content up so it fits without scrolling. ROLLBACK: change
          `md:min-h-[78vh]` back to `md:min-h-[92vh]`.

          DESKTOP HEIGHT RESTORED to 78vh (2026-06-30): the 52vh experiment squashed the
          logo into the sticky header bar. 78vh keeps the logo properly centred with
          breathing room; a "See our reviews" scroll-CTA in the hero body directs
          users down to the carousel without forcing it into the initial viewport.
          ROLLBACK: change `md:min-h-[78vh]` back to `md:min-h-[52vh]`. */}
      <section className="relative flex min-h-[92svh] md:min-h-[78vh] flex-col items-center justify-center px-4 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gold-50/40 via-white to-white pointer-events-none" />

        <div className="relative z-10 w-full">
          <div className="max-w-xl mx-auto">
            {/* Visually hidden h1 for SEO and screen readers — the logo serves as the visual heading */}
            <h1 className="sr-only">Windsor Glow</h1>

            {/* MOBILE SAFARI FIX (2026-06-18): the three mb-8 gaps below were each
                trimmed to mb-6 on mobile only (sm:mb-8 restores the original spacing
                at sm: and up) — a small amount of extra headroom alongside the svh fix
                above, without touching desktop or the overall premium feel.
                ROLLBACK: change each `mb-6 sm:mb-8` back to `mb-8`. */}
            <p className="text-[9px] tracking-[0.45em] uppercase text-gold-700 mb-6 sm:mb-8">
              Premium Research Compounds
            </p>

            <div className="flex justify-center mb-6 sm:mb-8">
              <Image
                src="/images/logo-transparent.png"
                alt="Windsor Glow"
                width={320}
                height={200}
                className="w-64 sm:w-80 h-auto object-contain"
                priority
              />
            </div>

            {/* The social accounts, centred directly under the logo.

                ADDED 24 AUGUST 2026 at Kieran's request, and MOVED HERE the same day: they began
                as a smaller "Follow us" row under the quick links, and he asked for them bigger
                and in the middle, under the logo. One round gold-outlined button per account
                (TikTok, Instagram, Facebook), each opening the profile in a new tab. They borrow
                the quick-link idiom below (hairline gold border, gold-50 on hover) so they read
                as part of the hero. The account is in each button's label for screen readers and
                in its tooltip for everyone else, so a visitor can tell the real account from a
                namesake. The accounts live in src/lib/socialLinks.ts; add one there and it
                appears here and in the structured data above. */}
            <div className="flex justify-center gap-4 sm:gap-5 mb-6 sm:mb-8">
              {SOCIAL_LINKS.map(({ id, name, account, url }) => {
                const icon = <SocialIcon id={id} className="h-5 w-5 sm:h-6 sm:w-6" />;
                const classes = 'flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full border border-gold-200 text-gold-700 transition-colors';

                if (!url) {
                  return (
                    <span
                      key={id}
                      title={`${name} account link coming soon`}
                      aria-label={`${name} account link coming soon`}
                      aria-disabled="true"
                      className={`${classes} cursor-default`}
                    >
                      {icon}
                    </span>
                  );
                }

                return (
                  <a
                    key={id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${account} on ${name}`}
                    aria-label={`Follow ${account} on ${name} (opens in a new tab)`}
                    className={`${classes} hover:border-gold-400 hover:bg-gold-50 hover:text-gold-800`}
                  >
                    {icon}
                  </a>
                );
              })}
            </div>
          </div>

          {/* The description, as one continuous line across the page on a desktop.

              CHANGED 24 AUGUST 2026: it was a three-line paragraph in a narrow column
              (max-w-sm) and Kieran asked for it spread over one line beneath the social
              buttons. It now sits outside the narrow logo column, letter-spaced a touch, and
              stays on one line from the lg breakpoint up (measured: 1024px wide holds it with
              room to spare). Below that it wraps naturally, centred, because forcing one line
              on a phone would run off the screen. */}
          <p className="text-sm text-stone-500 leading-relaxed tracking-wide max-w-5xl mx-auto mb-6 sm:mb-8 lg:whitespace-nowrap">
            High-purity peptide compounds for advanced laboratory research. Every product independently verified to 99% purity with a certificate of analysis.
          </p>

          {/* Quick links — visible immediately on every device, centred under the hero.

              REBUILT 24 SEPTEMBER 2026, because the old layout was a six-column grid and
              there are only three links left. Measured in a real browser before the change:
              on a phone, Shop and Reviews spanned the full width but Verify was left as a
              half-width button with an empty half beside it; on a 1440 desktop the whole row
              sat 260px left of the middle of the page, because three items filled three of
              six columns and the other three columns stayed empty. Every other thing in the
              hero is centred, so the row read as broken.

              A row of fixed-width buttons that wraps replaces the grid. It centres itself
              whatever the number of links, so adding or removing one cannot put the row off
              the middle of the page again. On a phone they stack and each fills the width,
              which is the biggest tap target the screen allows.

              ROLLBACK: restore the `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6` wrapper
              and the per-link `col-span`/`order` logic from git history. */}
          <div className="mx-auto flex max-w-3xl flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
            {QUICK_LINKS.map(({ label, href, gold }) => (
              <Link
                key={href}
                href={href}
                className={`text-center text-[10px] tracking-[0.18em] uppercase py-4 px-2 transition-colors sm:w-48 ${
                  gold
                    ? 'bg-gold-700 text-white hover:bg-gold-800'
                    : 'border border-gold-200 text-gold-700 hover:border-gold-400 hover:bg-gold-50'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Desktop-only scroll nudge: helps users discover the reviews carousel below
              without forcing the hero to shrink. Hidden on mobile: the Reviews quick-link
              button above already does this job on small screens. */}
          <div className="hidden md:flex justify-center mt-8">
            <a
              href="#video-testimonials"
              className="inline-flex items-center gap-2 text-sm font-bold tracking-[0.12em] uppercase underline decoration-2 underline-offset-4 text-gold-700 hover:text-gold-800 transition-colors"
            >
              See what our customers say
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m19 9-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      <VideoTestimonials className="border-b border-gold-100 bg-[#fffdf8] px-4 py-16" />

      <HomeReviewsCarousel
        reviews={topReviews}
        averageRating={reviewSummary.average}
        reviewCount={reviewSummary.count}
      />

      {/* Trust badges */}
      <section className="border-b border-gold-100 py-12 bg-gold-50/30">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {trustBadges.map(({ title, subtitle }, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className="font-serif text-base text-gold-700 font-semibold mb-1">{title}</div>
              <div className="text-[9px] tracking-[0.12em] text-stone-500 uppercase">{subtitle}</div>
            </div>
          ))}
        </div>
      </section>

      <NewInCarousel products={newInProducts} stockMap={stockMap} variantStockMap={variantStockMap} reviewStats={reviewStats} saleConfig={saleConfig} />

      {/* Featured products */}
      <ProductCarousel eyebrow="Featured" title="Research Compounds" products={featured} stockMap={stockMap} variantStockMap={variantStockMap} reviewStats={reviewStats} saleConfig={saleConfig}>
        <div className="text-center mt-10">
          <Link
            href="/shop"
            className="inline-block border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
          >
            Browse Catalogue
          </Link>
        </div>
      </ProductCarousel>

      {/* Our standards */}
      <section className="py-20 px-4 bg-gold-50/20 border-y border-gold-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">
              Our Standards
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl text-stone-800 tracking-wide">
              Why Researchers Choose Windsor Glow
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              {
                title: 'HPLC Verified',
                desc: 'Independent third-party testing on every batch, with a certificate of analysis included with every order.',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3h6M10 3v6L6.5 18h11L14 9V3M8.5 14.5h7" />
                  </svg>
                ),
              },
              {
                title: 'Pharma Grade',
                desc: 'Synthesised to pharmaceutical specifications, for consistent potency across every single batch.',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="3" y="9" width="18" height="6" rx="3" strokeWidth={1.5} />
                    <line x1="12" y1="9" x2="12" y2="15" strokeWidth={1.5} />
                  </svg>
                ),
              },
              {
                title: '48hr Dispatch',
                desc: 'Orders are processed and dispatched within 48 hours of payment confirmation, always in discreet, unmarked packaging.',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="6" y="6" width="13" height="13" rx="1.5" strokeWidth={1.5} />
                    <path strokeLinecap="round" strokeWidth={1.5} d="M6 12.5h13M12.5 6v13" />
                    <path strokeLinecap="round" strokeWidth={1.5} d="M2 9h2M1.5 12.5h2.5M2 16h2" />
                  </svg>
                ),
              },
              {
                title: 'QR Authenticated',
                desc: 'Every vial carries a unique verification code linked to its full lab report, checkable in seconds.',
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={1.5} />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={1.5} />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={1.5} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 14h3v3h-3v-3zM20 14v3M14 20h3M20.5 20.5h.01" />
                  </svg>
                ),
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-4 bg-white border border-stone-100 hover:border-gold-200 transition-colors p-6"
              >
                <div className="shrink-0 w-11 h-11 rounded-full bg-gold-50 text-gold-700 flex items-center justify-center">
                  {icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-stone-800 mb-1.5">{title}</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Safety/disclaimer section */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">
            Important Notice
          </p>
          <h2 className="font-serif text-2xl text-stone-700 tracking-wide mb-6">
            For Research Use Only
          </h2>
          <p className="text-sm text-stone-500 leading-relaxed mb-4">
            All compounds sold by Windsor Glow are strictly intended for in vitro scientific research and laboratory use by qualified professionals. They are not approved for therapeutic, diagnostic, or any other use in humans or animals.
          </p>
          <p className="text-sm text-stone-500 leading-relaxed">
            By purchasing from Windsor Glow, customers confirm they are operating within all applicable laws and regulations in their jurisdiction. Windsor Glow assumes no responsibility for misuse.
          </p>
        </div>
      </section>
    </>
  );
}
