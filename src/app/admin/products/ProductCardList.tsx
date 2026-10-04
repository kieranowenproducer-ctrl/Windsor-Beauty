'use client';
import MembersOnlyCheckbox from './MembersOnlyCheckbox';

import type { ReactNode } from 'react';
import { PRODUCTS, type Product } from '@/data/products';
import { evaluateCertificate, dosagesMissingCertificate } from '@/lib/certificateAudit';
import { VISIBILITY_CHOICES, visibilityChoiceFor, type ProductVisibilityChoice } from './productListUtils';
import { CertificateBadge } from './CertificateBadge';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  filtered: Product[];
  hiddenSlugs: Set<string>;
  membersOnlySlugs: Set<string>;
  membersOnlyLoaded: boolean;
  membersOnlySaving: string | null;
  toggleMembersOnly: (product: Product, checked: boolean) => void;
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
  products: Product[];
}

export default function ProductCardList({
  filtered, hiddenSlugs, stock, soldCounts, membersOnlySlugs, membersOnlyLoaded, membersOnlySaving, toggleMembersOnly,
  togglingSlug, deletingSlug, availabilitySavingSlug, availabilitySavedSlug,
  renderPriceCell, renderStockEditor,
  toggleVisibility, startEdit, deleteProduct, updateVisibilityChoice, editCertificateFor,
  products,
}: Props) {
  return (
    <>
          {/* Mobile / tablet card layout — avoids forcing horizontal scroll
              below the table's 1020px min-width on phones and tablets. The
              table below remains the desktop view (lg: and up) with every
              column visible at once; this card list carries the same data
              and actions, just stacked. */}
          <div className="lg:hidden space-y-3">
            {filtered.map(product => (
              <div key={product.id} className={`border border-l-[3px] p-4 transition-colors ${hiddenSlugs.has(product.slug) ? 'bg-red-50 border-red-200 border-l-red-400' : 'bg-white border-stone-200 border-l-green-500'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-stone-700">{product.name}</div>
                    {product.badge && (
                      <span className="text-[7px] tracking-wider bg-gold-100 text-gold-700 px-1.5 py-0.5 uppercase">{product.badge}</span>
                    )}
                    <div className="text-[10px] text-stone-500 mt-0.5">{product.categories.join(', ')}{product.purity ? <> &middot; {product.purity}</> : null}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-stone-700">
                      {renderPriceCell(product)}
                    </div>
                    <div className="text-[9px] text-stone-500">{soldCounts[product.slug] !== undefined ? `${soldCounts[product.slug].toLocaleString()} sold` : '0 sold'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${stock[product.slug] !== undefined && stock[product.slug] <= 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-600'}`}>
                    {stock[product.slug] !== undefined && stock[product.slug] <= 0 ? 'Out of Stock' : 'In Stock'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${hiddenSlugs.has(product.slug) ? 'bg-red-400' : 'bg-green-500'}`} />
                    <span className={`text-[8px] tracking-wider uppercase font-medium ${hiddenSlugs.has(product.slug) ? 'text-red-500' : 'text-green-600'}`}>
                      {hiddenSlugs.has(product.slug) ? 'Hidden' : 'Live'}
                    </span>
                  </div>
                <MembersOnlyCheckbox product={product} checked={membersOnlySlugs.has(product.slug)} disabled={!membersOnlyLoaded || membersOnlySaving !== null} onChange={toggleMembersOnly} />
                  {(() => {
                    const { status, issue } = evaluateCertificate(product);
                    // Per-size coverage: the exact sizes with no live certificate.
                    const missingDosages = product.variants.length >= 2 ? dosagesMissingCertificate(product) : [];
                    return (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => editCertificateFor(product)} title={issue ?? "Edit this product's certificate"} className="block">
                          <CertificateBadge status={status} issue={issue} />
                        </button>
                        {missingDosages.length > 0 && (
                          <button
                            onClick={() => editCertificateFor(product)}
                            title={`Other sizes of this product show a certificate, but these do not: ${missingDosages.join(', ')}. Open the certificate section and pick that size to add one.`}
                            className="inline-flex items-center gap-1 text-[8px] tracking-wider uppercase px-1.5 py-0.5 bg-red-50 text-red-600 border border-red-200"
                          >
                            Certificate missing: {missingDosages.join(', ')}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="mb-3">
                  <p className="text-[8px] tracking-widest uppercase text-stone-300 mb-1.5">Stock by Size</p>
                  {renderStockEditor(product)}
                </div>

                <div className="flex items-center gap-1.5 mb-3">
                  <select
                    aria-label={`Availability for ${product.name}`}
                    value={visibilityChoiceFor(product.availability, hiddenSlugs.has(product.slug))}
                    onChange={e => updateVisibilityChoice(product, e.target.value as ProductVisibilityChoice)}
                    disabled={availabilitySavingSlug === product.slug}
                    className="border border-stone-200 px-1.5 py-1 text-[10px] focus:border-gold-400 outline-none bg-white disabled:opacity-50"
                  >
                    {VISIBILITY_CHOICES.map(choice => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </select>
                  {availabilitySavedSlug === product.slug && (
                    <span className="text-[9px] tracking-wider uppercase text-green-600">Saved</span>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
                  {/* Says what it does. It was "Disable"/"Enable", which is why
                      hiding a product was hard to find (task 6941e1ba). */}
                  <button
                    onClick={() => toggleVisibility(product)}
                    disabled={togglingSlug === product.slug}
                    title={hiddenSlugs.has(product.slug)
                      ? 'Put this product back on the shop.'
                      : 'Take this product off the shop and every customer page. Nothing is deleted.'}
                    className={`p-2 -m-2 text-[9px] tracking-wider uppercase transition-colors disabled:opacity-40 ${
                      hiddenSlugs.has(product.slug) ? 'text-green-600 hover:text-green-700' : 'text-stone-500 hover:text-red-400'
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
                  {/* Same honesty fix as the desktop table: for a built-in product this
                      undoes your edits, it does not remove anything. */}
                  <button
                    onClick={() => deleteProduct(product)}
                    disabled={deletingSlug === product.slug}
                    title={
                      PRODUCTS.some(p => p.slug === product.slug)
                        ? 'Undoes your edits and puts the original built-in product back. It does not remove the product.'
                        : 'Permanently deletes this product.'
                    }
                    className="p-2 -m-2 text-[9px] tracking-wider uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-40 ml-auto"
                  >
                    {deletingSlug === product.slug
                      ? 'Working…'
                      : PRODUCTS.some(p => p.slug === product.slug)
                        ? 'Undo Edits'
                        : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="bg-white border border-stone-200 text-center text-xs text-stone-500 py-10">
                {products.length === 0 ? 'No products in catalogue.' : 'No products match your search.'}
              </div>
            )}
          </div>
    </>
  );
}
