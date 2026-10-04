import { loadShopServerData } from '@/lib/shopServerData';
import Link from 'next/link';
import BackToHome from '@/components/BackToHome';
import PromotionCodeCopy from '@/components/PromotionCodeCopy';
import PromotionImageCarousel from '@/components/PromotionImageCarousel';
import ProductCarousel from '@/components/ProductCarousel';
import { PRODUCTS, mergeProducts, type Product } from '@/data/products';
import {
  findDiscountCodeByCode,
  getActivePercentagePromotion,
  getActivePromotion,
  getHiddenProductSlugs,
  getProductStockMap,
  getProductVariantStockMap,
  getReviewStatsForProducts,
  isDbConfigured,
  listCustomProducts,
} from '@/lib/db';
import { discountAmountLabel, discountCodeInfoFromRow, discountScopeLabel } from '@/lib/discountCodes';
import { effectiveSalePercent, siteSaleConfigFromPromotion } from '@/lib/siteSale';

export const dynamic = 'force-dynamic';

export default async function PromotionPage() {
  const promo = isDbConfigured() ? await getActivePromotion().catch(() => null) : null;
  const discountInfo = promo?.discount_code
    ? await findDiscountCodeByCode(promo.discount_code)
        .then(row => (row ? discountCodeInfoFromRow(row) : null))
        .catch(() => null)
    : null;

  // The active automatic percentage-off promotion (Promotions -> Percentage
  // Discount, not Discount Codes — moved here because it's not a
  // customer-entered code) drives the linked-product carousel below,
  // independent of whichever promotion wins the hero banner slot above
  // (getActivePromotion's most-recent-active rule). At most one percentage
  // promotion can be active at a time, so this is unambiguously "the"
  // current automatic offer — toggling it on/off in the admin panel is
  // reflected here automatically with no extra wiring.
  const percentagePromo = isDbConfigured() ? await getActivePercentagePromotion().catch(() => null) : null;
  const saleConfig = siteSaleConfigFromPromotion(percentagePromo);

  const accessShop = await loadShopServerData();
  const hiddenSlugs = isDbConfigured() ? await getHiddenProductSlugs().catch(() => [] as string[]) : [];
  const stockMap = accessShop.stock;
  // See the homepage: the stamp on a photograph needs per-size numbers, not a total.
  const variantStockMap = accessShop.variantStock;
  const reviewStats = accessShop.reviewStats;
  const overrides = accessShop.overrides;
  const hidden = new Set(hiddenSlugs);
  const catalogue = mergeProducts(PRODUCTS, overrides).filter(p => !hidden.has(p.slug));
  const discountedProducts = catalogue.filter(p => effectiveSalePercent(saleConfig, p) > 0);
  const offerEyebrow = saleConfig.scopeType === 'all' ? 'Site-Wide Sale' : 'On Sale Now';
  // Prefers the percentage promotion's own admin-set title (e.g. "10% Off
  // Selected Serums") so the carousel heading reflects exactly what the
  // admin typed, falling back to a generic computed label if left blank.
  const offerTitle = percentagePromo?.title?.trim()
    || `${saleConfig.percent}% Off ${saleConfig.scopeType === 'all' ? 'Everything' : 'These Products'}`;

  return (
    <>
      <BackToHome />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-8">

      <div className="text-center mb-12">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Current Offer</p>
        {promo && promo.image_urls.length > 0 && (
          <PromotionImageCarousel
            images={promo.image_urls}
            alt={promo.title}
            discountPercent={saleConfig.enabled ? saleConfig.percent : 0}
          />
        )}
        <h1 className="font-serif text-4xl sm:text-5xl text-stone-800 tracking-wide mb-4">
          {promo ? promo.title : 'No Active Promotion'}
        </h1>
        {promo ? (
          <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
            {promo.description}
          </p>
        ) : (
          <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto">
            There is nothing running right now, but check back soon or browse the shop for our full range.
          </p>
        )}
      </div>

      {promo && promo.discount_code && (
        <div className="mb-12">
          <p className="text-[9px] tracking-[0.25em] uppercase text-stone-500 text-center mb-3">
            Your Discount Code
          </p>
          <PromotionCodeCopy code={promo.discount_code} />
          {discountInfo && (
            <p className="text-xs text-gold-700 text-center font-semibold tracking-wide mt-3">
              {discountAmountLabel(discountInfo)}
              {discountInfo.scopeType !== 'all' && ` ${discountScopeLabel(discountInfo)}`}
            </p>
          )}
          <p className="text-xs text-stone-500 leading-relaxed text-center mt-4 max-w-md mx-auto">
            Enter this code at checkout to apply your discount. Offers cannot be combined and may be withdrawn
            or changed at any time.
          </p>
        </div>
      )}
      </div>

      {discountedProducts.length > 0 && (
        <ProductCarousel
          eyebrow={offerEyebrow}
          title={offerTitle}
          products={discountedProducts}
          stockMap={stockMap}
          variantStockMap={variantStockMap}
          reviewStats={reviewStats}
          saleConfig={saleConfig}
          autoScroll
        />
      )}

      <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-20">
      <div className="border border-gold-100 bg-gold-50/40 p-8 sm:p-10 text-center">
        <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3">Ready When You Are</p>
        <h3 className="font-serif text-2xl text-stone-800 mb-3">Browse the Full Range</h3>
        <p className="text-sm text-stone-500 leading-relaxed max-w-md mx-auto mb-7">
          Explore our skincare range, then apply your code at checkout if you have one.
        </p>
        <Link
          href={promo?.button_link || '/shop'}
          className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-9 py-4 hover:bg-gold-800 transition-colors"
        >
          {promo?.button_text || 'Shop Skincare'}
        </Link>
      </div>
      </div>
    </>
  );
}
