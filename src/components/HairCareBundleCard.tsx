'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useCart } from '@/contexts/CartContext';
import { HAIR_BUNDLE_NAME, HAIR_BUNDLE_SLUG, bundleCartItems, bundlesAvailableForCart, type HairCareBundle } from '@/lib/hairCareBundle';

export default function HairCareBundleCard({ bundle, detail = false }: { bundle: HairCareBundle; detail?: boolean }) {
  const { items, addItem, openDrawer } = useCart();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = bundlesAvailableForCart(bundle, items) > 0;
  async function addBundle() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/products/hair-bundle', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.bundle) throw new Error('This bundle is currently unavailable. Please refresh the page.');
      const current = data.bundle as HairCareBundle;
      if (current.price !== bundle.price) throw new Error('The bundle price has changed. Please refresh the page.');
      if (bundlesAvailableForCart(current, items) < 1) throw new Error('There are no more bundles available to add.');
      for (const item of bundleCartItems(current)) addItem(item);
      openDrawer();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add the bundle. Please try again.'); }
    finally { setBusy(false); }
  }
  return (
    <article className={`flex h-full overflow-hidden rounded-2xl border border-stone-100 bg-white ${detail ? 'flex-col md:flex-row' : 'flex-col'}`}>
      <Link href={`/shop/${HAIR_BUNDLE_SLUG}`} className={`relative block aspect-square ${detail ? 'w-full md:w-1/2' : 'w-full'}`} aria-label={HAIR_BUNDLE_NAME}>
        <Image src={bundle.image} alt="GHK-Cu shampoo on the left and conditioner on the right, both 350ml" fill className="object-cover" sizes={detail ? '(max-width: 768px) 100vw, 50vw' : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw'} />
      </Link>
      <div className={`flex flex-1 flex-col ${detail ? 'justify-center p-6 sm:p-10' : 'p-5'}`}>
        {detail ? <h1 className="mb-3 font-serif text-3xl text-stone-800">{HAIR_BUNDLE_NAME}</h1> : <h2 className="mb-2 font-serif text-lg text-stone-800"><Link href={`/shop/${HAIR_BUNDLE_SLUG}`}>{HAIR_BUNDLE_NAME}</Link></h2>}
        <p className="mb-4 text-sm leading-relaxed text-stone-600">One 350ml shampoo and one 350ml conditioner.</p>
        <div className="mt-auto">
          <p className="mb-2 flex flex-wrap items-baseline gap-3"><span className="text-xl font-semibold text-gold-700">£{bundle.price.toFixed(2)}</span><span className="text-sm text-stone-500 line-through">£{bundle.separatePrice.toFixed(2)}</span></p>
          <p className="mb-4 text-sm font-semibold text-gold-700">Save £{bundle.saving.toFixed(2)} when you buy both together.</p>
          {detail && <p className="mb-4 text-xs leading-relaxed text-stone-600">The saving is applied automatically in your basket. Delivery is calculated at checkout.</p>}
          <button type="button" onClick={addBundle} disabled={busy || !available} className="w-full rounded-lg bg-gold-700 px-4 py-3 text-xs font-semibold text-white hover:bg-gold-800 disabled:bg-stone-200 disabled:text-stone-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">{busy ? 'Adding bundle...' : available ? 'Add bundle to basket' : bundle.stock > 0 ? 'All available bottles are in your basket' : 'Out of stock'}</button>
          {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
          {!detail && <Link href={`/shop/${HAIR_BUNDLE_SLUG}`} className="mt-3 block text-center text-xs font-semibold text-gold-700 underline underline-offset-2">View bundle</Link>}
        </div>
      </div>
    </article>
  );
}
