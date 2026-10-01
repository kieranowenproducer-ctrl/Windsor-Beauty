'use client';

import type { ReactNode } from 'react';
import { PRODUCTS, type Product } from '@/data/products';
import { evaluateCertificate } from '@/lib/certificateAudit';
import { VISIBILITY_CHOICES, visibilityChoiceFor, type ProductVisibilityChoice } from './productListUtils';
import { CertificateBadge } from './CertificateBadge';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  filtered: Product[];
  hiddenSlugs: Set<string>;
  stock: Record<string, number>;
  soldCounts: Record<string, number>;
  togglingSlug: string | null;
  deletingSlug: string | null;
  availabilitySavingSlug: string | null;
  availabilitySavedSlug: string | null;
  renderPriceCell: (product: Product) => ReactNode;
  renderStockEditor: (product: Product) => ReactNode;
  toggleVisibility: (product: Product) => void;
  startEdit: (product: Product) => void;
  deleteProduct: (product: Product) => void;
  updateVisibilityChoice: (product: Product, choice: ProductVisibilityChoice) => void;
  editCertificateFor: (product: Product) => void;
  editingId: string | null;
  visibilitySavedSlug: string | null;
}

export default function ProductTable({
  filtered, hiddenSlugs, stock, soldCounts,
  togglingSlug, deletingSlug, availabilitySavingSlug, availabilitySavedSlug,
  renderPriceCell, renderStockEditor,
  toggleVisibility, startEdit, deleteProduct, updateVisibilityChoice, editCertificateFor,
  editingId, visibilitySavedSlug,
}: Props) {
  return (
    <>
          {/* Own scroll box + sticky header (task 6e41a11d, hardened in 81f143ba):
              the column headers stay visible while scrolling the 75-row catalogue.
              dvh (not vh) + a tighter offset keep the box inside the REAL visible
              viewport even when zoomed or on small screens — previously the box
              could grow taller than the window, the page scrolled instead of the
              box, and the "sticky" header scrolled away (Kieran's video). */}
          <div className="hidden lg:block bg-white border border-stone-200 max-h-[calc(100dvh-11rem)] overflow-auto overscroll-contain">
            <table className="w-full min-w-[1020px]">
              <thead className="sticky top-0 z-20">
                <tr className="border-b border-stone-200 bg-stone-50 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Product</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Categories</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Purity badge</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">From</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Sold</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Stock</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Status</th>
                  <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Certificate</th>
                  <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(product => (
                    <tr key={product.id} className={`border-b border-stone-50 transition-colors ${editingId === product.id ? 'bg-gold-50/30' : hiddenSlugs.has(product.slug) ? 'bg-red-50/80 hover:bg-red-50' : 'hover:bg-stone-50/50'}`}>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-stone-700">{product.name}</div>
                        {product.badge && (
                          <span className="text-[7px] tracking-wider bg-gold-100 text-gold-700 px-1.5 py-0.5 uppercase">{product.badge}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-500">{product.categories.join(', ')}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">{product.purity}</td>
                      <td className="px-4 py-3 text-xs text-stone-600 font-medium">
                        {renderPriceCell(product)}
                      </td>
                      <td className="px-4 py-3 text-xs text-stone-600">
                        {soldCounts[product.slug] !== undefined ? soldCounts[product.slug].toLocaleString() : <span className="text-stone-300">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {/* One row per size — every variant of a product
                            carries its own stock number, so selling out one
                            size (e.g. 30ml) never affects the others. */}
                        {renderStockEditor(product)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${stock[product.slug] !== undefined && stock[product.slug] <= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                            {stock[product.slug] !== undefined && stock[product.slug] <= 0 ? 'Out of Stock' : 'In Stock'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${hiddenSlugs.has(product.slug) ? 'bg-stone-300' : 'bg-green-500'}`} />
                            <span className={`text-[8px] tracking-wider uppercase font-medium ${hiddenSlugs.has(product.slug) ? 'text-stone-500' : 'text-green-600'}`}>
                              {hiddenSlugs.has(product.slug) ? 'Hidden' : 'Live'}
                            </span>
                            {visibilitySavedSlug === product.slug && (
                              <span className="text-[8px] tracking-wider uppercase text-green-600">Updated</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <select
                              aria-label={`Availability for ${product.name}`}
                              value={visibilityChoiceFor(product.availability, hiddenSlugs.has(product.slug))}
                              onChange={e => updateVisibilityChoice(product, e.target.value as ProductVisibilityChoice)}
                              disabled={availabilitySavingSlug === product.slug}
                              className="border border-stone-200 px-1.5 py-0.5 text-[9px] focus:border-gold-400 outline-none bg-white disabled:opacity-50"
                            >
                              {VISIBILITY_CHOICES.map(choice => (
                                <option key={choice.value} value={choice.value}>{choice.label}</option>
                              ))}
                            </select>
                            {availabilitySavedSlug === product.slug && (
                              <span className="text-[8px] tracking-wider uppercase text-green-600">Saved</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const { status, issue } = evaluateCertificate(product);
                          return (
                            <button
                              onClick={() => editCertificateFor(product)}
                              title={issue ?? 'Edit this product\'s certificate'}
                              className="block"
                            >
                              <CertificateBadge status={status} issue={issue} />
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Says what it does. It was "Disable"/"Enable", which is
                              why hiding a product was hard to find (task 6941e1ba). */}
                          <button
                            onClick={() => toggleVisibility(product)}
                            disabled={togglingSlug === product.slug}
                            title={hiddenSlugs.has(product.slug)
                              ? 'Put this product back on the shop.'
                              : 'Take this product off the shop and every customer page. Nothing is deleted.'}
                            className={`p-2 -m-2 text-[9px] tracking-wider uppercase transition-colors disabled:opacity-40 ${
                              hiddenSlugs.has(product.slug)
                                ? 'text-green-600 hover:text-green-700'
                                : 'text-stone-500 hover:text-red-400'
                            }`}
                          >
                            {togglingSlug === product.slug ? 'Saving…' : hiddenSlugs.has(product.slug) ? 'Unhide' : 'Hide'}
                          </button>
                          <button
                            onClick={() => startEdit(product)}
                            className="p-2 -m-2 text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
                          >
                            Edit
                          </button>
                          {/* Most of the catalogue is built in, and for those this button does
                              NOT delete anything: it throws away your edits and puts the
                              original product back. It said "Delete" on every row and only
                              admitted the difference in the confirm box, after the press. */}
                          <button
                            onClick={() => deleteProduct(product)}
                            disabled={deletingSlug === product.slug}
                            title={
                              PRODUCTS.some(p => p.slug === product.slug)
                                ? 'Undoes your edits and puts the original built-in product back. It does not remove the product.'
                                : 'Permanently deletes this product.'
                            }
                            className="p-2 -m-2 text-[9px] tracking-wider uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-40"
                          >
                            {deletingSlug === product.slug
                              ? 'Working…'
                              : PRODUCTS.some(p => p.slug === product.slug)
                                ? 'Undo Edits'
                                : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>
              ))}
              </tbody>
            </table>
          </div>
    </>
  );
}
