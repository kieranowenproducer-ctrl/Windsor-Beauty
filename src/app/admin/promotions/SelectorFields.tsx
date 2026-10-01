'use client';

import { sortVariantsByStrength, type Product } from '@/data/products';
import { EMPTY_SELECTOR, SELECT_CLASS, type SelectorFormState } from './promotionRuleForms';

// Moved out of page.tsx unchanged.

// Reusable product/category picker — used for BOGO buy/get and bundle/spend
// selectors. Mirrors the product-picker pattern in admin/verification-codes.
export default function SelectorFields({
  label,
  value,
  onChange,
  products,
  categories,
}: {
  label: string;
  value: SelectorFormState;
  onChange: (next: SelectorFormState) => void;
  products: Product[];
  categories: string[];
}) {
  const selectedProduct = products.find((p) => p.slug === value.slug);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        <select
          value={value.scope}
          onChange={(e) => onChange({ ...EMPTY_SELECTOR, scope: e.target.value as 'product' | 'category' })}
          className={SELECT_CLASS}
        >
          <option value="product">Product</option>
          <option value="category">Category</option>
        </select>
        {value.scope === 'product' ? (
          <>
            <select
              value={value.slug}
              onChange={(e) => onChange({ ...value, slug: e.target.value, dosage: '' })}
              className={`flex-1 min-w-[160px] ${SELECT_CLASS}`}
            >
              <option value="">Select a product…</option>
              {products.map((product) => (
                <option key={product.slug} value={product.slug}>{product.name}</option>
              ))}
            </select>
            <select
              value={value.dosage}
              onChange={(e) => onChange({ ...value, dosage: e.target.value })}
              className={SELECT_CLASS}
            >
              <option value="">Any variant</option>
              {selectedProduct && sortVariantsByStrength(selectedProduct.variants).map((variant) => (
                <option key={variant.dosage} value={variant.dosage}>{variant.dosage}</option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={value.category}
            onChange={(e) => onChange({ ...value, category: e.target.value })}
            className={`flex-1 min-w-[160px] ${SELECT_CLASS}`}
          >
            <option value="">Select a category…</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
