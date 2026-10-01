'use client';

import { useEffect, useState } from 'react';
import { sortVariantsByStrength, type Product } from '@/data/products';
import { INPUT_CLASS, SELECT_CLASS, liveNumber, settleNumber, stockWord, type InvoiceLineItem, type TrialPick } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

// A number box you can actually clear and retype. What counts as a valid value lives in
// invoiceEditTypes (liveNumber / settleNumber) so it can be tested; this only holds the draft
// text while the box has focus, so what you typed is never overwritten mid-keystroke.
// The plain line under a chosen product: how many of THIS dosage, how many altogether, and a
// warning in amber when the line is for more than is left.
function StockNote({ dosage, dose, total, quantity }: {
  dosage?: string;
  dose: number | null;
  total: number | null;
  quantity: number;
}) {
  const short = dose !== null && quantity > dose;
  return (
    <p className={`text-[10px] mt-1.5 ${short ? 'text-amber-700 font-semibold' : 'text-stone-500'}`}>
      {dosage ? `${dosage}: ${stockWord(dose)}` : stockWord(dose)}
      {total !== null ? ` · ${total} in stock across all sizes` : ''}
      {short ? ` · this line is for ${quantity}, which is more than is left` : ''}
    </p>
  );
}

function NumberField({ value, onCommit, min, step, disabled, className }: {
  value: number;
  onCommit: (n: number) => void;
  min: number;
  step: number;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  // While it is not being typed in, the box follows the invoice (a product change rewrites the
  // price, for instance). While it IS being typed in, what you typed wins.
  useEffect(() => { if (!editing) setDraft(String(value)); }, [value, editing]);

  return (
    <input
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      disabled={disabled}
      className={className}
      value={editing ? draft : String(value)}
      onFocus={(e) => { setEditing(true); setDraft(e.target.value); }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = liveNumber(e.target.value, min);
        if (n !== null) onCommit(n);
      }}
      onBlur={(e) => {
        setEditing(false);
        onCommit(settleNumber(e.target.value, min));
      }}
    />
  );
}

interface Props {
  lineItems: InvoiceLineItem[];
  updateLineItem: (index: number, patch: Partial<InvoiceLineItem>) => void;
  setLineItemProduct: (index: number, slug: string, dosage: string) => void;
  setLineItemTrial: (index: number, trialId: number, dosage: string) => void;
  addLineItem: () => void;
  removeLineItem: (index: number) => void;
  products: Product[];
  liveProductsSorted: Product[];
  trialProducts: TrialPick[];
  batchPool: string[];
  financialsDisabled: boolean;
  /** Per dosage: variantStock[slug][dosage]. A slug or size with no entry is untracked, which
   *  is not the same as none left, so it is never shown as a zero. */
  variantStock: Record<string, Record<string, number>>;
  /** Per product, the total across its sizes. Same untracked rule. */
  productStock: Record<string, number>;
}

export default function InvoiceLineItems({
  lineItems, updateLineItem, setLineItemProduct, setLineItemTrial,
  addLineItem, removeLineItem, products, liveProductsSorted, trialProducts,
  batchPool, financialsDisabled, variantStock, productStock,
}: Props) {
  // Untracked and empty are different things, so they read differently. A slug nobody has ever set
  // a number for must never appear as "0 left" on the screen an admin prices an invoice from.
  const dosageStock = (slug?: string, dosage?: string): number | null => {
    if (!slug || !dosage) return null;
    const perDosage = variantStock[slug];
    if (!perDosage || !Object.prototype.hasOwnProperty.call(perDosage, dosage)) return null;
    return perDosage[dosage];
  };
  const totalStock = (slug?: string): number | null => {
    if (!slug) return null;
    return Object.prototype.hasOwnProperty.call(productStock, slug) ? productStock[slug] : null;
  };
  return (
    <>
        {/* Line items */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-stone-800">Line Items</h2>
            {financialsDisabled && <span className="text-[10px] tracking-[0.15em] uppercase text-amber-600">Locked - paid invoice</span>}
          </div>
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="border border-stone-100 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <select
                    value={item.type}
                    onChange={(e) => updateLineItem(index, {
                      type: e.target.value as InvoiceLineItem['type'], slug: undefined,
                      name: '', description: '', unitPrice: 0,
                    })}
                    disabled={financialsDisabled}
                    className={`${SELECT_CLASS} w-36`}
                  >
                    <option value="custom">Custom item</option>
                    <option value="product">Catalogue product</option>
                    <option value="trial">Trial product</option>
                  </select>
                  {lineItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLineItem(index)}
                      disabled={financialsDisabled}
                      className="ml-auto text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {item.type === 'product' ? (
                  <div className="mb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={item.slug ?? ''}
                      onChange={(e) => {
                        const product = products.find((p) => p.slug === e.target.value);
                        const firstVariant = product ? sortVariantsByStrength(product.variants)[0] : undefined;
                        if (product && firstVariant) setLineItemProduct(index, product.slug, firstVariant.dosage);
                      }}
                      disabled={financialsDisabled}
                      className={SELECT_CLASS}
                    >
                      <option value="">Select a product…</option>
                      {liveProductsSorted.map((product) => (
                        <option key={product.slug} value={product.slug}>
                          {product.name} - {stockWord(totalStock(product.slug))}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.description ?? ''}
                      onChange={(e) => item.slug && setLineItemProduct(index, item.slug, e.target.value)}
                      disabled={financialsDisabled || !item.slug}
                      className={SELECT_CLASS}
                    >
                      {item.slug && products.find((p) => p.slug === item.slug)?.variants.map((variant) => (
                        <option key={variant.dosage} value={variant.dosage}>
                          {variant.dosage} - £{variant.price.toFixed(2)} ({stockWord(dosageStock(item.slug, variant.dosage))})
                        </option>
                      ))}
                    </select>
                    </div>
                    {item.slug && (
                      <StockNote
                        dosage={item.description}
                        dose={dosageStock(item.slug, item.description)}
                        total={totalStock(item.slug)}
                        quantity={item.quantity}
                      />
                    )}
                  </div>
                ) : item.type === 'trial' ? (
                  <div className="mb-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={item.slug ?? ''}
                        onChange={(e) => {
                          const picked = trialProducts.find((p) => `trial:${p.id}` === e.target.value);
                          if (picked && picked.variants[0]) setLineItemTrial(index, picked.id, picked.variants[0].dosage);
                        }}
                        disabled={financialsDisabled}
                        className={SELECT_CLASS}
                      >
                        <option value="">Select a trial product…</option>
                        {trialProducts.map((p) => (
                          <option key={p.id} value={`trial:${p.id}`}>{p.name} ({p.code})</option>
                        ))}
                      </select>
                      <select
                        value={item.description ?? ''}
                        onChange={(e) => {
                          const picked = trialProducts.find((p) => `trial:${p.id}` === item.slug);
                          if (picked) setLineItemTrial(index, picked.id, e.target.value);
                        }}
                        disabled={financialsDisabled || !item.slug}
                        className={SELECT_CLASS}
                      >
                        {trialProducts.find((p) => `trial:${p.id}` === item.slug)?.variants.map((variant) => (
                          <option key={variant.dosage} value={variant.dosage}>
                            {variant.dosage} - £{variant.price.toFixed(2)} ({variant.stock} in stock)
                          </option>
                        ))}
                      </select>
                    </div>
                    {trialProducts.length === 0 && (
                      <p className="text-[10px] text-stone-500 mt-1.5">
                        No trial products yet. Add them on the Trial products page and they will be pickable here.
                      </p>
                    )}
                    <p className="text-[9px] text-stone-300 mt-1.5 tracking-wide uppercase">
                      {(() => {
                        const picked = trialProducts.find((p) => `trial:${p.id}` === item.slug);
                        return picked
                          ? `Only you see "${picked.name}". The invoice and Royal Mail show ${picked.code}.`
                          : 'Only you see the name. The invoice and Royal Mail show the product code.';
                      })()}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateLineItem(index, { name: e.target.value })}
                      placeholder="Item name"
                      disabled={financialsDisabled}
                      className={INPUT_CLASS}
                    />
                    <input
                      type="text"
                      value={item.description ?? ''}
                      onChange={(e) => updateLineItem(index, { description: e.target.value })}
                      placeholder="Description (optional)"
                      disabled={financialsDisabled}
                      className={INPUT_CLASS}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Qty</span>
                    <NumberField value={item.quantity} min={1} step={1} onCommit={(n) => updateLineItem(index, { quantity: n })} disabled={financialsDisabled} className={INPUT_CLASS} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Unit Price £</span>
                    <NumberField value={item.unitPrice} min={0} step={0.01} onCommit={(n) => updateLineItem(index, { unitPrice: n })} disabled={financialsDisabled} className={INPUT_CLASS} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Discount £</span>
                    <NumberField value={item.discount} min={0} step={0.01} onCommit={(n) => updateLineItem(index, { discount: n })} disabled={financialsDisabled} className={INPUT_CLASS} />
                  </label>
                  {item.type === 'custom' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Weight (g, optional)</span>
                      <input type="number" min={0} step={1} value={item.weightGrams ?? ''} onChange={(e) => updateLineItem(index, { weightGrams: e.target.value ? Number(e.target.value) : undefined })} disabled={financialsDisabled} className={INPUT_CLASS} />
                    </label>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Line Total</span>
                    <p className="text-xs font-semibold text-gold-700 py-2.5">£{item.lineTotal.toFixed(2)}</p>
                  </div>
                </div>

                <label className="flex flex-col gap-1 mt-2">
                  <span className="text-[9px] tracking-[0.1em] uppercase text-stone-500">Batch code(s) allocated</span>
                  <input
                    type="text"
                    list="invoice-batch-pool"
                    value={(item.batchCodes ?? []).join(', ')}
                    onChange={(e) => updateLineItem(index, {
                      batchCodes: e.target.value.split(',').map((c) => c.trim()).filter(Boolean),
                    })}
                    disabled={financialsDisabled}
                    placeholder="Pick or type a code. Separate several with commas"
                    className={`${INPUT_CLASS} font-mono`}
                  />
                  <span className="text-[9px] text-stone-500">
                    Shown on the invoice so the customer knows which verified batch their product came from.
                    {' '}Use several for a mixed line (e.g. two items from two batches).
                  </span>
                </label>
              </div>
            ))}
          </div>
          <datalist id="invoice-batch-pool">
            {batchPool.map((code) => (
              <option key={code} value={code} />
            ))}
          </datalist>
          <button
            type="button"
            onClick={addLineItem}
            disabled={financialsDisabled}
            className="mt-3 text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors disabled:opacity-50"
          >
            + Add Line Item
          </button>
        </div>
    </>
  );
}
