'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '@/data/products';

// Searchable multi-product picker used inside the "Manage Products" expander.
// Shared by the admin Reviews page and the admin controls that sit on the
// storefront review cards, so the two cannot drift apart.
export default function ProductPicker({
  products,
  selected,
  busy,
  onAdd,
  onRemove,
}: {
  products: Product[];
  selected: string[];
  busy: boolean;
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );
  const filtered = useMemo(
    () => sorted.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [sorted, search]
  );

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedSet = new Set(selected);

  return (
    <div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map(slug => {
            const name = products.find(p => p.slug === slug)?.name ?? slug;
            return (
              <span key={slug} className="inline-flex items-center gap-1.5 bg-white border border-stone-200 px-2.5 py-1 text-[10px] text-stone-600">
                {name}
                <button
                  type="button"
                  onClick={() => onRemove(slug)}
                  disabled={busy}
                  aria-label={`Remove ${name}`}
                  className="text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      {selected.length === 0 && (
        <p className="text-[10px] text-stone-500 mb-3">Not mapped to any product yet.</p>
      )}

      <div ref={dropRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          disabled={busy}
          className="flex items-center gap-2 border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2.5 sm:py-1.5 text-[11px] text-stone-500 bg-white hover:border-stone-300 transition-colors disabled:opacity-50 w-full sm:w-auto sm:min-w-[200px]"
        >
          <svg className="w-3 h-3 text-stone-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" strokeWidth="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m21 21-4.35-4.35"/></svg>
          Add product…
          <svg className="w-3 h-3 text-stone-500 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m6 9 6 6 6-6"/></svg>
        </button>

        {open && (
          <>
            {/* Phone backdrop. On a phone the old below-the-button dropdown
                fell off the bottom of the screen behind Safari's toolbar
                (task b826813d), so under sm the picker is a bottom sheet
                instead: fixed to the bottom, fully on screen, dimmed page
                behind, closed by the backdrop or Done. */}
            <div className="fixed inset-0 z-40 bg-stone-900/40 sm:hidden" onClick={() => setOpen(false)} />
            <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70dvh] flex-col bg-white border-t border-stone-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:left-0 sm:mt-1 sm:w-72 sm:max-h-none sm:border sm:shadow-lg">
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100 sm:hidden">
                <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500">Add Product</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-[10px] tracking-[0.18em] uppercase text-gold-700 font-semibold px-2 py-1"
                >
                  Done
                </button>
              </div>
              <div className="p-2 border-b border-stone-100">
                {/* text-base on phones on purpose: iPhones auto-zoom into any
                    input below 16px, which was half the "keep pushing it up"
                    fight in the video. */}
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search products…"
                  className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-base sm:px-2 sm:py-1.5 sm:text-[11px] text-stone-600 placeholder-stone-500"
                />
              </div>
              <div className="flex-1 overflow-y-auto sm:flex-none sm:max-h-52">
                {filtered.length === 0 && (
                  <p className="px-3 py-2.5 text-[10px] text-stone-500">No products match.</p>
                )}
                {filtered.map(p => {
                  const isSelected = selectedSet.has(p.slug);
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => {
                        if (!isSelected) { onAdd(p.slug); setOpen(false); setSearch(''); }
                      }}
                      disabled={isSelected || busy}
                      className={`w-full text-left px-3 py-3 text-sm sm:py-2 sm:text-[11px] flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'text-stone-500 cursor-default'
                          : 'text-stone-600 hover:bg-gold-50 hover:text-stone-800'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-gold-700 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586l-3.293-3.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z" clipRule="evenodd"/></svg>
                      )}
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
