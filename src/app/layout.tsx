import type { Metadata } from 'next';
import { Children } from 'react';
import { cookies } from 'next/headers';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import CartDrawer from '@/components/CartDrawer';
import DiscountPopup from '@/components/DiscountPopup';
import AdminViewToggle from '@/components/AdminViewToggle';
import VisitBeacon from '@/components/analytics/VisitBeacon';
import AnnouncementBar from '@/components/AnnouncementBar';
import PromoBanner from '@/components/PromoBanner';
import StickyHeaderStack from '@/components/StickyHeaderStack';
import SiteChrome from '@/components/SiteChrome';
import { CartProvider } from '@/contexts/CartContext';
import { PRODUCTS } from '@/data/products';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/auth';

// Worked out here, on the server, and handed to the basket drawer as a short
// list of slugs. The drawer used to import the whole catalogue itself, which
// put every product into the client bundle of every page on the site just to
// decide whether to show the needle disclaimer. See CartDrawer.tsx.
const PEN_SLUGS = PRODUCTS.filter((p) => p.categories.includes('Pens')).map((p) => p.slug);

export const metadata: Metadata = {
  title: 'Windsor Beauty | Premium Research Compounds',
  description:
    'Windsor Beauty supplies high-purity research peptides and compounds for scientific and laboratory use only. 99% purity, lab tested, certificate of analysis with every order.',
  // Short label shown under the icon when added to an iPhone home screen —
  // without this, iOS falls back to the full <title> above and truncates it.
  appleWebApp: {
    title: 'Windsor Beauty',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pageChildren = Children.toArray(children);
  const termsContent = isDbConfigured() ? await getSiteContent('terms').catch(() => null) : null;
  const termsOverride = termsContent?.body?.trim()
    ? { title: termsContent.title, body: termsContent.body, format: termsContent.format }
    : null;

  // Don't pitch membership to someone who already has a customer session —
  // presence of the (httpOnly) cookie is enough for this UX nicety, no DB lookup needed.
  const isLoggedInCustomer = Boolean((await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value);

  // data-scroll-behavior="smooth" is not decoration — it restores Next 14's behaviour.
  //
  // globals.css sets `html { scroll-behavior: smooth }` so in-page anchor links glide
  // rather than jump. Next 14 quietly suspended that during a page change, so clicking a
  // link landed at the top of the new page instantly. Next 16 stopped suspending it,
  // which made the browser scroll the whole way up instead — visible on any long page,
  // and slower to use.
  //
  // This attribute asks Next to suspend it during navigation again. Anchor links keep
  // gliding; page changes go back to landing at the top instantly.
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen flex flex-col">
        <CartProvider>
          <SiteChrome
            termsOverride={termsOverride}
            headerStack={
              <StickyHeaderStack
                key="site-header-stack"
                promoBar={<PromoBanner key="promo-banner" />}
                header={<Header key="site-header" />}
                announcementBar={<AnnouncementBar key="announcement-bar" />}
              />
            }
            cartDrawer={<CartDrawer key="cart-drawer" penSlugs={PEN_SLUGS} />}
            discountPopup={isLoggedInCustomer ? null : <DiscountPopup key="discount-popup" />}
            footer={<Footer key="site-footer" />}
          >
            {pageChildren}
          </SiteChrome>
          <AdminViewToggle />
          <VisitBeacon />
        </CartProvider>
      </body>
    </html>
  );
}
