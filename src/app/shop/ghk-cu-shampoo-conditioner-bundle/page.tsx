import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import HairCareBundleCard from '@/components/HairCareBundleCard';
import { loadShopServerData } from '@/lib/shopServerData';
import { HAIR_BUNDLE_NAME, HAIR_BUNDLE_SLUG } from '@/lib/hairCareBundle';
import { SITE_URL } from '@/app/robots';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${HAIR_BUNDLE_NAME} | Windsor Beauty`, description: 'One 350ml GHK-Cu shampoo and one 350ml conditioner. Save when you buy both together.', alternates: { canonical: `${SITE_URL}/shop/${HAIR_BUNDLE_SLUG}` } };
export default async function BundlePage() {
  const data = await loadShopServerData();
  const bundle = data.hairBundle;
  if (!bundle) notFound();
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: HAIR_BUNDLE_NAME, image: bundle.image, description: 'One 350ml shampoo and one 350ml conditioner.', offers: { '@type': 'Offer', url: `${SITE_URL}/shop/${HAIR_BUNDLE_SLUG}`, priceCurrency: 'GBP', price: bundle.price.toFixed(2), availability: bundle.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } };
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6"><Link href="/shop" className="mb-6 inline-block text-sm text-gold-700 underline underline-offset-2">Back to shop</Link><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} /><HairCareBundleCard bundle={bundle} detail /><div className="mt-6 flex flex-wrap gap-5">{bundle.products.map(p => <Link key={p.slug} href={`/shop/${p.slug}`} className="text-sm text-gold-700 underline underline-offset-2">Buy {p.name.toLowerCase()} separately</Link>)}</div></main>;
}
