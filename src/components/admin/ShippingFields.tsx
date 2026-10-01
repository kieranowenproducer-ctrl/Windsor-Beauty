'use client';

import { PACKAGE_FORMATS, SHIPPING_SERVICES, CUSTOMS_CATEGORIES, type ProductShipping } from '@/data/products';

// Form state for a shipping/customs block (used at both product and variant
// level). Number fields are kept as strings so inputs can be empty; converted
// to ProductShipping (or undefined if nothing is filled in) on save via
// shippingDraftToPayload.
export interface ShippingDraft {
  weightGrams: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  packageFormat: string;
  defaultService: string;
  customsDescription: string;
  customsCode: string;
  originCountryCode: string;
  customsCategory: string;
  internationalEligible: boolean;
}

export const EMPTY_SHIPPING_DRAFT: ShippingDraft = {
  weightGrams: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  packageFormat: '',
  defaultService: '',
  customsDescription: '',
  customsCode: '',
  originCountryCode: '',
  customsCategory: '',
  internationalEligible: true,
};

export function shippingToDraft(shipping?: ProductShipping): ShippingDraft {
  return {
    weightGrams: shipping?.weightGrams !== undefined ? String(shipping.weightGrams) : '',
    lengthMm: shipping?.lengthMm !== undefined ? String(shipping.lengthMm) : '',
    widthMm: shipping?.widthMm !== undefined ? String(shipping.widthMm) : '',
    heightMm: shipping?.heightMm !== undefined ? String(shipping.heightMm) : '',
    packageFormat: shipping?.packageFormat ?? '',
    defaultService: shipping?.defaultService ?? '',
    customsDescription: shipping?.customsDescription ?? '',
    customsCode: shipping?.customsCode ?? '',
    originCountryCode: shipping?.originCountryCode ?? '',
    customsCategory: shipping?.customsCategory ?? '',
    internationalEligible: shipping?.internationalEligible !== false,
  };
}

export function shippingDraftToPayload(draft: ShippingDraft): ProductShipping | undefined {
  const shipping: Record<string, unknown> = {};
  if (draft.weightGrams.trim()) shipping.weightGrams = Number(draft.weightGrams);
  if (draft.lengthMm.trim()) shipping.lengthMm = Number(draft.lengthMm);
  if (draft.widthMm.trim()) shipping.widthMm = Number(draft.widthMm);
  if (draft.heightMm.trim()) shipping.heightMm = Number(draft.heightMm);
  if (draft.packageFormat) shipping.packageFormat = draft.packageFormat;
  if (draft.defaultService) shipping.defaultService = draft.defaultService;
  if (draft.customsDescription.trim()) shipping.customsDescription = draft.customsDescription.trim();
  if (draft.customsCode.trim()) shipping.customsCode = draft.customsCode.trim();
  if (draft.originCountryCode.trim()) shipping.originCountryCode = draft.originCountryCode.trim().toUpperCase();
  if (draft.customsCategory) shipping.customsCategory = draft.customsCategory;
  if (!draft.internationalEligible) shipping.internationalEligible = false;
  return Object.keys(shipping).length > 0 ? (shipping as ProductShipping) : undefined;
}

// Editable weight/dimensions/customs block shared by the product-level and
// per-variant shipping forms. All fields are optional — empty values fall
// back to the parent level (variant -> product -> global shipping settings).
export default function ShippingFields({
  draft,
  onChange,
  label = 'Shipping & Customs (optional - falls back to global defaults)',
}: {
  draft: ShippingDraft;
  onChange: (next: ShippingDraft) => void;
  label?: string;
}) {
  function set<K extends keyof ShippingDraft>(field: K, value: ShippingDraft[K]) {
    onChange({ ...draft, [field]: value });
  }

  return (
    <details className="border border-stone-200 group">
      <summary className="px-3 py-2 text-[8px] tracking-widest uppercase text-stone-500 cursor-pointer select-none group-open:text-gold-700">
        {label}
      </summary>
      <div className="p-3 pt-1 space-y-3 border-t border-stone-100">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Weight (g)</label>
            <input
              type="number" min={0} max={30000}
              value={draft.weightGrams}
              onChange={e => set('weightGrams', e.target.value)}
              placeholder="e.g. 50"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Length (mm)</label>
            <input
              type="number" min={0}
              value={draft.lengthMm}
              onChange={e => set('lengthMm', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Width (mm)</label>
            <input
              type="number" min={0}
              value={draft.widthMm}
              onChange={e => set('widthMm', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Height (mm)</label>
            <input
              type="number" min={0}
              value={draft.heightMm}
              onChange={e => set('heightMm', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Royal Mail Package Format</label>
            <select
              value={draft.packageFormat}
              onChange={e => set('packageFormat', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
            >
              <option value="">- Use global default -</option>
              {PACKAGE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Default Royal Mail Service</label>
            <select
              value={draft.defaultService}
              onChange={e => set('defaultService', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
            >
              <option value="">- Use checkout shipping option -</option>
              {SHIPPING_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Customs Description</label>
            <input
              value={draft.customsDescription}
              onChange={e => set('customsDescription', e.target.value)}
              placeholder="e.g. Skincare, face serum"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">HS / Commodity Code</label>
            <input
              value={draft.customsCode}
              onChange={e => set('customsCode', e.target.value)}
              placeholder="e.g. 3913900000"
              className="w-full border border-stone-200 px-2 py-1.5 text-xs font-mono focus:border-gold-400 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Country of Origin</label>
            <input
              value={draft.originCountryCode}
              onChange={e => set('originCountryCode', e.target.value.toUpperCase())}
              placeholder="e.g. GB"
              maxLength={3}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs font-mono uppercase focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1">Customs Category</label>
            <select
              value={draft.customsCategory}
              onChange={e => set('customsCategory', e.target.value)}
              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
            >
              <option value="">- Use global default -</option>
              {CUSTOMS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-stone-500">
          <input
            type="checkbox"
            checked={draft.internationalEligible}
            onChange={e => set('internationalEligible', e.target.checked)}
            className="accent-gold-500"
          />
          Eligible for international shipping (uncheck to block international Royal Mail labels for this product)
        </label>
      </div>
    </details>
  );
}
