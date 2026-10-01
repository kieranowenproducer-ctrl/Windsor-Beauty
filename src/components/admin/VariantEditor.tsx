'use client';

import ImageUploadField from './ImageUploadField';
import ShippingFields, { EMPTY_SHIPPING_DRAFT, type ShippingDraft } from './ShippingFields';

export interface VariantDraft {
  dosage: string;
  price: string;
  enabled: boolean;
  image: string;
  shipping: ShippingDraft;
}

export const EMPTY_VARIANT_DRAFT: VariantDraft = {
  dosage: '',
  price: '',
  enabled: true,
  image: '',
  shipping: EMPTY_SHIPPING_DRAFT,
};

interface Props {
  variants: VariantDraft[];
  onChange: (index: number, field: keyof VariantDraft, value: string | boolean | ShippingDraft) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Forwarded to each variant's ImageUploadField — see its own prop doc. */
  onUploadingChange?: (uploading: boolean) => void;
}

export default function VariantEditor({ variants, onChange, onAdd, onRemove, onUploadingChange }: Props) {
  return (
    <div>
      <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-2">Size Options &amp; Pricing</label>
      <div className="space-y-2">
        {variants.map((variant, i) => (
          <div key={i} className="border border-stone-100 p-2 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={variant.dosage}
                onChange={e => onChange(i, 'dosage', e.target.value)}
                placeholder="e.g. 30ml"
                className="flex-1 min-w-[100px] border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
              />
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">&pound;</span>
                <input
                  value={variant.price}
                  onChange={e => onChange(i, 'price', e.target.value)}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  className="w-28 border border-stone-200 pl-5 pr-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(i, 'enabled', !variant.enabled)}
                className={`text-[9px] tracking-wider uppercase px-2.5 py-1.5 border transition-colors ${
                  variant.enabled
                    ? 'border-gold-300 text-gold-700 hover:border-gold-500 hover:bg-gold-50'
                    : 'border-stone-200 text-stone-400 hover:border-stone-300'
                }`}
              >
                {variant.enabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={variants.length <= 1}
                className="p-2 -m-2 text-[9px] tracking-wider uppercase text-stone-300 hover:text-red-400 transition-colors disabled:opacity-30"
              >
                Remove
              </button>
            </div>
            <ImageUploadField
              value={variant.image || undefined}
              onChange={url => onChange(i, 'image', url ?? '')}
              label={`Photo for ${variant.dosage || 'this size'} (optional)`}
              fallbackHint="Leave blank to use the product-level photo. Upload here to show a different image when this size is selected."
              onUploadingChange={onUploadingChange}
            />
            <ShippingFields
              draft={variant.shipping}
              onChange={shipping => onChange(i, 'shipping', shipping)}
              label={`Shipping override for ${variant.dosage || 'this size'} (optional — falls back to product/global defaults)`}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-2 text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
      >
        + Add size option
      </button>
    </div>
  );
}
