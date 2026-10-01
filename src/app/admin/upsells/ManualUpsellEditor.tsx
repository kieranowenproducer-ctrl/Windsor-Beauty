'use client';

import type { Product } from '@/data/products';
import { MAX_MANUAL_UPSELLS, startingPrice, type ManualOverride } from './upsellTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  editorTriggerSlug: string | null;
  setEditorTriggerSlug: (value: string | null) => void;
  editorTriggerProduct: Product | null | undefined;
  editorPickerSearch: string;
  setEditorPickerSearch: (value: string) => void;
  triggerPickerResults: Product[];
  sortedCatalogueForPicker: Product[];
  selectTriggerProduct: (slug: string) => void;
  editorHeading: string;
  setEditorHeading: (value: string) => void;
  editorBasketHeading: string;
  setEditorBasketHeading: (value: string) => void;
  editorAddSearch: string;
  setEditorAddSearch: (value: string) => void;
  addPickerResults: Product[];
  addToSelected: (slug: string) => void;
  editorSelected: string[];
  // Shape as built by the page's selectedDetails memo: never undefined, and it
  // carries the display verdict alongside the product.
  selectedDetails: {
    slug: string;
    product: Product | null;
    name: string;
    willDisplay: boolean;
    reason: string | null;
  }[];
  removeFromSelected: (slug: string) => void;
  moveSelected: (index: number, direction: -1 | 1) => void;
  previewHeading: string;
  previewBasketHeading: string;
  handleEditorSave: () => void;
  editorSaving: boolean;
  handleEditorClear: (slugOverride?: string) => void;
  editorClearing: boolean;
  editorHasOverride: boolean;
  editorLoading: boolean;
  editorMessage: string;
  editorError: string;
  manualOverrides: ManualOverride[];
  productLabel: (slug: string) => string;
}

export default function ManualUpsellEditor({
  editorTriggerSlug, setEditorTriggerSlug, editorTriggerProduct, editorPickerSearch, setEditorPickerSearch, triggerPickerResults, sortedCatalogueForPicker, selectTriggerProduct, editorHeading, setEditorHeading, editorBasketHeading, setEditorBasketHeading, editorAddSearch, setEditorAddSearch, addPickerResults, addToSelected, editorSelected, selectedDetails, removeFromSelected, moveSelected, previewHeading, previewBasketHeading, handleEditorSave, editorSaving, handleEditorClear, editorClearing, editorHasOverride, editorLoading, editorMessage, editorError, manualOverrides, productLabel,
}: Props) {
  return (
    <>
          {/* ─── Manual Product Upsell Editor ─────────────────────────── */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">Manual Product Upsell Editor</h2>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Pick a product, choose exactly which other products should be recommended for it, and set the
              heading shown above them - e.g. &ldquo;Goes really well with&rdquo; or &ldquo;Complete the
              stack&rdquo;. Saving here takes over completely for that product; CSV rules for it are ignored
              until you clear the override below.
            </p>

            {/* Step 1 — pick the product: a dropdown to browse, or search to type-filter */}
            <div className="mb-5">
              <label className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">Select a product</label>
              <div className="flex flex-col sm:flex-row gap-3 mb-2">
                <select
                  value={editorTriggerSlug ?? ''}
                  onChange={e => { if (e.target.value) selectTriggerProduct(e.target.value); }}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors w-full sm:w-72 bg-white"
                >
                  <option value="">Browse all products…</option>
                  {sortedCatalogueForPicker.map(p => (
                    <option key={p.slug} value={p.slug}>{p.name} ({p.slug})</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={editorTriggerSlug ? `${editorTriggerProduct?.name ?? editorTriggerSlug}` : editorPickerSearch}
                  onChange={e => { setEditorTriggerSlug(null); setEditorPickerSearch(e.target.value); }}
                  onFocus={() => { if (editorTriggerSlug) { setEditorTriggerSlug(null); setEditorPickerSearch(''); } }}
                  placeholder="…or search by name or handle"
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors w-full sm:w-96"
                />
              </div>
              {!editorTriggerSlug && triggerPickerResults.length > 0 && (
                <div className="mt-1 border border-stone-200 bg-white w-full sm:w-96 max-h-56 overflow-y-auto">
                  {triggerPickerResults.map(p => (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => selectTriggerProduct(p.slug)}
                      className="block w-full text-left px-3 py-2 text-xs text-stone-600 hover:bg-gold-50 transition-colors border-b border-stone-50 last:border-b-0"
                    >
                      {p.name} <span className="text-stone-300">({p.slug})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {editorLoading && <p className="text-xs text-stone-500">Loading…</p>}

            {editorTriggerSlug && !editorLoading && (
              <div className="border-t border-stone-100 pt-5">
                <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                  <p className="text-xs text-stone-600">
                    Editing upsells for <span className="font-semibold text-stone-800">{editorTriggerProduct?.name ?? editorTriggerSlug}</span>
                  </p>
                  {editorHasOverride ? (
                    <span className="px-2 py-1 text-[9px] tracking-wider uppercase bg-gold-100 text-gold-700">Manual override active</span>
                  ) : (
                    <span className="px-2 py-1 text-[9px] tracking-wider uppercase bg-stone-100 text-stone-500">Using CSV-driven rules (no override yet)</span>
                  )}
                </div>

                <div className="mb-5 grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                      Heading on this product&apos;s page
                    </label>
                    <input
                      type="text"
                      value={editorHeading}
                      onChange={e => setEditorHeading(e.target.value)}
                      placeholder="Frequently bought with"
                      maxLength={80}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors w-full"
                    />
                    <p className="text-[10px] text-stone-500 mt-1">Shown at the bottom of this product&apos;s page while browsing the shop. Leave blank for &ldquo;Frequently bought with&rdquo;.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                      Heading in the basket popup
                    </label>
                    <input
                      type="text"
                      value={editorBasketHeading}
                      onChange={e => setEditorBasketHeading(e.target.value)}
                      placeholder="Frequently bought with"
                      maxLength={80}
                      className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors w-full"
                    />
                    <p className="text-[10px] text-stone-500 mt-1">Shown when this product is the one just added to the basket. Leave blank for &ldquo;Frequently bought with&rdquo;.</p>
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">
                    Search products to add as upsells ({editorSelected.length}/{MAX_MANUAL_UPSELLS})
                  </label>
                  <input
                    type="text"
                    value={editorAddSearch}
                    onChange={e => setEditorAddSearch(e.target.value)}
                    placeholder="Search by product name or handle…"
                    disabled={editorSelected.length >= MAX_MANUAL_UPSELLS}
                    className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors w-full sm:w-96 disabled:opacity-50"
                  />
                  {editorSelected.length >= MAX_MANUAL_UPSELLS && (
                    <p className="text-[10px] text-amber-600 mt-1">Maximum of {MAX_MANUAL_UPSELLS} reached - remove one below to add another.</p>
                  )}
                  {addPickerResults.length > 0 && (
                    <div className="mt-1 border border-stone-200 bg-white w-full sm:w-96 max-h-56 overflow-y-auto">
                      {addPickerResults.map(p => (
                        <button
                          key={p.slug}
                          type="button"
                          onClick={() => addToSelected(p.slug)}
                          className="block w-full text-left px-3 py-2 text-xs text-stone-600 hover:bg-gold-50 transition-colors border-b border-stone-50 last:border-b-0"
                        >
                          + {p.name} <span className="text-stone-300">({p.slug})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-1.5">Selected upsell products</p>
                  {selectedDetails.length === 0 ? (
                    <p className="text-xs text-stone-500 italic">None selected - this product will show no upsells once saved.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {selectedDetails.map((d, i) => (
                        <li key={d.slug} className="flex items-center justify-between gap-3 border border-stone-100 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] text-stone-300 tabular-nums">{i + 1}.</span>
                            <span className="text-xs text-stone-700 truncate">{d.name}</span>
                            {!d.willDisplay && (
                              <span className="shrink-0 px-1.5 py-0.5 text-[8px] tracking-wider uppercase bg-red-50 text-red-500">{d.reason}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" onClick={() => moveSelected(i, -1)} disabled={i === 0} className="text-stone-300 hover:text-gold-700 disabled:opacity-30 transition-colors" aria-label="Move up">&uarr;</button>
                            <button type="button" onClick={() => moveSelected(i, 1)} disabled={i === selectedDetails.length - 1} className="text-stone-300 hover:text-gold-700 disabled:opacity-30 transition-colors" aria-label="Move down">&darr;</button>
                            <button type="button" onClick={() => removeFromSelected(d.slug)} className="text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors">Remove</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Live preview — mirrors the storefront UpsellCarousel's card styling so this is a realistic preview, not just a list. Same product list both contexts share, only the heading text differs. */}
                <div className="mb-6 grid sm:grid-cols-2 gap-5">
                  {[
                    { label: 'Preview - product page', heading: previewHeading },
                    { label: 'Preview - basket popup', heading: previewBasketHeading },
                  ].map(({ label, heading }) => (
                    <div key={label}>
                      <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-2">{label}</p>
                      <div className="border border-stone-100 bg-stone-50 p-5">
                        <p className="font-serif text-lg text-stone-800 tracking-wide mb-3">{heading}</p>
                        {selectedDetails.filter(d => d.willDisplay).length === 0 ? (
                          <p className="text-xs text-stone-500 italic">Nothing will display - add at least one available product above.</p>
                        ) : (
                          <div className="flex gap-3 overflow-x-auto pb-1">
                            {selectedDetails.filter(d => d.willDisplay && d.product).map(d => (
                              <div key={d.slug} className="shrink-0 w-28 border border-gold-100 bg-white p-2">
                                <div className="w-full aspect-square bg-gradient-to-br from-stone-50 to-gold-50 border border-gold-100 mb-1.5" />
                                <p className="text-[9px] font-semibold text-stone-700 leading-snug line-clamp-2">{d.name}</p>
                                <p className="text-[10px] text-gold-700 font-semibold">&pound;{startingPrice(d.product!).toFixed(2)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {editorMessage && <p className="text-xs text-green-700 mb-3">{editorMessage}</p>}
                {editorError && <p className="text-xs text-red-600 mb-3">{editorError}</p>}

                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    type="button"
                    onClick={handleEditorSave}
                    disabled={editorSaving}
                    className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {editorSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                  {editorHasOverride && (
                    <button
                      type="button"
                      onClick={() => handleEditorClear()}
                      disabled={editorClearing}
                      className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      {editorClearing ? 'Clearing…' : 'Clear Override (revert to CSV)'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Overview of every product with an active manual override */}
            {manualOverrides.length > 0 && (
              <div className="border-t border-stone-100 mt-6 pt-5">
                <p className="text-[10px] tracking-[0.15em] uppercase text-stone-500 mb-2">
                  Manually Configured Products ({manualOverrides.length})
                </p>
                <ul className="space-y-1.5">
                  {manualOverrides.map(o => (
                    <li key={o.trigger_handle} className="flex items-center justify-between gap-3 text-xs text-stone-500 py-1">
                      <span>
                        <span className="font-medium text-stone-700">{productLabel(o.trigger_handle)}</span>
                        {' '}&middot; {o.upsell_handles.length} upsell{o.upsell_handles.length !== 1 ? 's' : ''}
                        {o.heading && <span className="text-stone-500"> &middot; page: &ldquo;{o.heading}&rdquo;</span>}
                        {o.basket_heading && <span className="text-stone-500"> &middot; basket: &ldquo;{o.basket_heading}&rdquo;</span>}
                      </span>
                      <span className="flex items-center gap-3 shrink-0">
                        <button type="button" onClick={() => selectTriggerProduct(o.trigger_handle)} className="text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors">Edit</button>
                        <button type="button" onClick={() => handleEditorClear(o.trigger_handle)} className="text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors">Clear</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
    </>
  );
}
