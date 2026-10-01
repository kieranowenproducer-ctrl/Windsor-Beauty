import ProductCarousel from '@/components/ProductCarousel';
import type { Product } from '@/data/products';
import type { SiteSaleConfig } from '@/lib/siteSale';

interface Props {
  products: Product[];
  stockMap: Record<string, number>;
  /** Per-dosage stock, so a card only reads as sold out when every strength is. */
  variantStockMap?: Record<string, Record<string, number>>;
  reviewStats?: Record<string, { average: number; count: number }>;
  saleConfig?: SiteSaleConfig;
}

// Showcase for admin-flagged "New In" products. Renders nothing when there's
// nothing new — keeps the homepage layout unchanged until the admin flags a
// product.
export default function NewInCarousel({ products, stockMap, variantStockMap, reviewStats, saleConfig }: Props) {
  return (
    <ProductCarousel eyebrow="Just Landed" title="New In" products={products} stockMap={stockMap} variantStockMap={variantStockMap} reviewStats={reviewStats} saleConfig={saleConfig} />
  );
}
