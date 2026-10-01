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
import { CUSTOMER_SESSION_COOKIE } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Windsor Beauty | Premium Skincare',
  description:
    'Windsor Beauty is a premium UK skincare shop. Serums, moisturisers, cleansers and SPF for a simple daily routine.',
  // Short label shown under the icon when added to an iPhone home screen —
  // without this, iOS falls back to the full <title> above and truncates it.
  appleWebApp: {
    title: 'Windsor Beauty',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const pageChildren = Children.toArray(children);

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
            headerStack={
              <StickyHeaderStack
                key="site-header-stack"
                promoBar={<PromoBanner key="promo-banner" />}
                header={<Header key="site-header" />}
                announcementBar={<AnnouncementBar key="announcement-bar" />}
              />
            }
            cartDrawer={<CartDrawer key="cart-drawer" />}
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
