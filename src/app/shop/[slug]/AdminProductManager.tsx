'use client';

import Link from 'next/link';
import { sortVariantsByStrength, type Product } from '@/data/products';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  isStaff: boolean;
  product: Product;
  variantStockMap: Record<string, Record<string, number>>;
  editingDosage: string | null;
  setEditingDosage: (value: string | null) => void;
  stockDraft: string;
  setStockDraft: (value: string) => void;
  savingDosage: string | null;
  stockError: string | null;
  setStockError: (value: string | null) => void;
  saveStock: (slug: string, dosage: string) => void;
  editingPriceDosage: string | null;
  setEditingPriceDosage: (value: string | null) => void;
  priceDraft: string;
  setPriceDraft: (value: string) => void;
  savePrice: (current: Product, dosage: string) => void;
  addingDosage: boolean;
  setAddingDosage: (value: boolean) => void;
  newDosage: string;
  setNewDosage: (value: string) => void;
  newPrice: string;
  setNewPrice: (value: string) => void;
  newStock: string;
  setNewStock: (value: string) => void;
  addDosage: (current: Product) => void;
  removeDosage: (current: Product, dosage: string) => void;
  toggleDosageEnabled: (current: Product, dosage: string) => void;
  variantSaving: boolean;
  variantError: string | null;
  setVariantError: (value: string | null) => void;
}

export default function AdminProductManager({
  isStaff, product, variantStockMap, editingDosage, setEditingDosage, stockDraft, setStockDraft, savingDosage, stockError, setStockError, saveStock, editingPriceDosage, setEditingPriceDosage, priceDraft, setPriceDraft, savePrice, addingDosage, setAddingDosage, newDosage, setNewDosage, newPrice, setNewPrice, newStock, setNewStock, addDosage, removeDosage, toggleDosageEnabled, variantSaving, variantError, setVariantError,
}: Props) {
  return (
    <>
          {/* Admin-only product manager (staff cookie only; never shown to
              customers). Dosages, prices, stock and availability are all
              editable here so the dashboard is not needed for everyday
              changes (task a5b6aa85). */}
          {isStaff && (() => {
            const slugStock = variantStockMap[product.slug] ?? {};
            const adminVariants = sortVariantsByStrength(product.variants);
            const anyTracked = adminVariants.some(v => typeof slugStock[v.dosage] === 'number');
            const total = adminVariants.reduce((n, v) => n + (typeof slugStock[v.dosage] === 'number' ? slugStock[v.dosage] : 0), 0);
            return (
              <div className="mb-5 rounded-lg border border-gold-300 bg-gold-50/60 px-4 py-3">
                <p className="mb-2 flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-gold-700">
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-gold-700 px-1.5 py-0.5 text-white">Admin</span> Dosages, prices and stock
                  </span>
                  <Link
                    href={`/admin/products?edit=${encodeURIComponent(product.slug)}`}
                    className="rounded border border-gold-300 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-gold-700 hover:bg-gold-100"
                  >
                    Full editor
                  </Link>
                </p>
                <ul className="space-y-1 text-sm">
                  {adminVariants.map(v => {
                    const s = slugStock[v.dosage];
                    const tracked = typeof s === 'number';
                    const isEditing = editingDosage === v.dosage;
                    const isSaving = savingDosage === v.dosage;
                    const isPriceEditing = editingPriceDosage === v.dosage;
                    const isDisabled = v.enabled === false;
                    return (
                      <li key={v.dosage} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 min-h-[2rem] border-b border-gold-100 pb-1.5 last:border-b-0 last:pb-0">
                        <span className="flex items-center gap-2">
                          <span className={isDisabled ? 'text-stone-500 line-through' : 'text-stone-600'}>{v.dosage}</span>
                          {isDisabled && (
                            <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-stone-500">Hidden</span>
                          )}
                          {isPriceEditing ? (
                            <span className="flex items-center gap-1.5">
                              <span className="text-stone-500">&pound;</span>
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                inputMode="decimal"
                                autoFocus
                                value={priceDraft}
                                disabled={variantSaving}
                                onChange={e => setPriceDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') savePrice(product, v.dosage);
                                  if (e.key === 'Escape') { setEditingPriceDosage(null); setVariantError(null); }
                                }}
                                className="w-20 rounded border border-gold-400 bg-white px-2 py-0.5 text-right tabular-nums text-stone-800 focus:outline-none focus:ring-2 focus:ring-gold-500"
                                aria-label={`Price for ${v.dosage}`}
                              />
                              <button
                                type="button"
                                onClick={() => savePrice(product, v.dosage)}
                                disabled={variantSaving}
                                className="rounded bg-gold-700 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-gold-700 disabled:opacity-50"
                              >
                                {variantSaving ? 'Saving' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingPriceDosage(null); setVariantError(null); }}
                                disabled={variantSaving}
                                className="rounded px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { setEditingPriceDosage(v.dosage); setPriceDraft(String(v.price)); setEditingDosage(null); setVariantError(null); }}
                              className="rounded border border-transparent px-1 py-0.5 font-semibold tabular-nums text-stone-800 hover:border-gold-300 hover:bg-gold-100"
                              title="Change price"
                            >
                              &pound;{v.price.toFixed(2)}
                            </button>
                          )}
                        </span>
                        {isEditing ? (
                          <span className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              autoFocus
                              value={stockDraft}
                              disabled={isSaving}
                              onChange={e => setStockDraft(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveStock(product.slug, v.dosage);
                                if (e.key === 'Escape') { setEditingDosage(null); setStockError(null); }
                              }}
                              className="w-20 rounded border border-gold-400 bg-white px-2 py-1 text-right tabular-nums text-stone-800 focus:outline-none focus:ring-2 focus:ring-gold-500"
                              aria-label={`Stock for ${v.dosage}`}
                            />
                            <button
                              type="button"
                              onClick={() => saveStock(product.slug, v.dosage)}
                              disabled={isSaving}
                              className="rounded bg-gold-700 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-gold-700 disabled:opacity-50"
                            >
                              {isSaving ? 'Saving' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingDosage(null); setStockError(null); }}
                              disabled={isSaving}
                              className="rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3">
                            {tracked ? (
                              <span className={`font-semibold tabular-nums ${s <= 0 ? 'text-gold-700' : 'text-stone-800'}`}>
                                {s} in stock{s <= 0 ? ' · out of stock' : ''}
                              </span>
                            ) : (
                              <span className="text-stone-500">Not tracked</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingDosage(v.dosage);
                                setStockDraft(tracked ? String(s) : '');
                                setStockError(null);
                                setEditingPriceDosage(null);
                                setVariantError(null);
                              }}
                              className="rounded border border-gold-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-700 hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500"
                            >
                              Stock
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleDosageEnabled(product, v.dosage)}
                              disabled={variantSaving}
                              className="rounded border border-gold-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-700 hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
                              title={isDisabled ? 'Show this dosage to customers' : 'Hide this dosage from customers'}
                            >
                              {isDisabled ? 'Show' : 'Hide'}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeDosage(product, v.dosage)}
                              disabled={variantSaving}
                              className="rounded border border-stone-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-50"
                              title="Remove this dosage from the product"
                            >
                              Remove
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Add a new dosage without leaving the shop */}
                {addingDosage ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-gold-200 pt-3">
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold-700">
                      Dosage
                      <input
                        type="text"
                        autoFocus
                        value={newDosage}
                        disabled={variantSaving}
                        onChange={e => setNewDosage(e.target.value)}
                        placeholder="e.g. 10mg"
                        className="w-24 rounded border border-gold-400 bg-white px-2 py-1 text-sm normal-case tracking-normal text-stone-800 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold-700">
                      Price &pound;
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={newPrice}
                        disabled={variantSaving}
                        onChange={e => setNewPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-24 rounded border border-gold-400 bg-white px-2 py-1 text-right text-sm tabular-nums tracking-normal text-stone-800 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-wider text-gold-700">
                      Stock (optional)
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={newStock}
                        disabled={variantSaving}
                        onChange={e => setNewStock(e.target.value)}
                        placeholder="0"
                        className="w-24 rounded border border-gold-400 bg-white px-2 py-1 text-right text-sm tabular-nums tracking-normal text-stone-800 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
                      />
                    </label>
                    <span className="flex items-center gap-2 pb-0.5">
                      <button
                        type="button"
                        onClick={() => addDosage(product)}
                        disabled={variantSaving}
                        className="rounded bg-gold-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white hover:bg-gold-700 disabled:opacity-50"
                      >
                        {variantSaving ? 'Saving' : 'Add dosage'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAddingDosage(false); setVariantError(null); }}
                        disabled={variantSaving}
                        className="rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-700 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setAddingDosage(true); setVariantError(null); setEditingPriceDosage(null); setEditingDosage(null); }}
                    className="mt-3 rounded border border-dashed border-gold-400 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gold-700 hover:bg-gold-100 focus:outline-none focus:ring-2 focus:ring-gold-500"
                  >
                    + Add dosage
                  </button>
                )}

                {(stockError || variantError) && (
                  <p className="mt-2 text-xs font-medium text-gold-700">{stockError || variantError}</p>
                )}
                {anyTracked && (
                  <p className="mt-2 border-t border-gold-200 pt-2 text-xs text-stone-500">
                    Total: <span className="font-semibold text-stone-700 tabular-nums">{total}</span> across all dosages
                  </p>
                )}
                <p className="mt-1 text-[10px] text-stone-500">Only visible to you as an admin. Prices, stock and dosages save straight to the live shop.</p>
              </div>
            );
          })()}
    </>
  );
}
