'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { reviewProductMatches, type ReviewFilterProduct } from '@/lib/reviewProductSearch';

export default function ProductReviewFilter({
  products,
  value,
  onChange,
}: {
  products: ReviewFilterProduct[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedName = value === 'all'
    ? 'All products'
    : products.find(product => product.slug === value)?.name ?? 'All products';

  const matches = useMemo(() => {
    if (!query.trim()) return products;
    return products.filter(product => reviewProductMatches(product, query));
  }, [products, query]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  function choose(slug: string) {
    onChange(slug);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={containerRef}>
      <label htmlFor="review-product-filter" className="mb-2 block text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-600">
        Product
      </label>
      <div className="relative">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <circle cx="11" cy="11" r="7" strokeWidth="1.75" />
          <path d="m16.25 16.25 4 4" strokeLinecap="round" strokeWidth="1.75" />
        </svg>
        <input
          id="review-product-filter"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="review-product-options"
          autoComplete="off"
          value={open ? query : selectedName}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onClick={() => setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
              event.currentTarget.blur();
            }
          }}
          placeholder="Search product or category…"
          className="min-h-11 w-full border border-gold-200 bg-white py-2 pl-10 pr-9 text-base text-stone-700 outline-none transition-colors placeholder:text-stone-500 focus:border-gold-600 focus:ring-2 focus:ring-gold-200 sm:text-sm"
        />
        <svg
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" />
        </svg>
      </div>

      {open && (
        <div
          id="review-product-options"
          role="listbox"
          aria-label="Products"
          className="mt-1 max-h-64 overflow-y-auto border border-gold-200 bg-white shadow-[0_8px_24px_rgba(68,55,30,0.10)]"
        >
          {!query.trim() && (
            <button
              type="button"
              role="option"
              aria-selected={value === 'all'}
              onClick={() => choose('all')}
              className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-gold-100 px-3 text-left text-sm transition-colors ${
                value === 'all' ? 'bg-gold-50 font-semibold text-gold-800' : 'text-stone-700 hover:bg-gold-50'
              }`}
            >
              <span>All products</span>
              {value === 'all' && <span aria-hidden="true" className="text-gold-700">✓</span>}
            </button>
          )}

          {matches.map(product => (
            <button
              key={product.slug}
              type="button"
              role="option"
              aria-selected={value === product.slug}
              onClick={() => choose(product.slug)}
              className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-gold-100 px-3 py-2 text-left text-sm last:border-0 transition-colors ${
                value === product.slug ? 'bg-gold-50 font-semibold text-gold-800' : 'text-stone-700 hover:bg-gold-50'
              }`}
            >
              <span>
                <span className="block">{product.name}</span>
                {product.categories.length > 0 && (
                  <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
                    {product.categories.join(' · ')}
                  </span>
                )}
              </span>
              {value === product.slug && <span aria-hidden="true" className="shrink-0 text-gold-700">✓</span>}
            </button>
          ))}

          {matches.length === 0 && (
            <p className="px-3 py-4 text-sm text-stone-500">No products or categories match that search.</p>
          )}
        </div>
      )}
    </div>
  );
}
