'use client';
import type { Product } from '@/data/products';
interface Props { product: Product; checked: boolean; disabled: boolean; onChange: (product: Product, checked: boolean) => void }
export default function MembersOnlyCheckbox({ product, checked, disabled, onChange }: Props) {
  return <label className="flex items-center gap-2 text-xs text-stone-700 py-1 cursor-pointer">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(product, event.target.checked)}
      aria-label={`Members only for ${product.name}`} className="h-4 w-4 accent-gold-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-600 disabled:opacity-50" />
    <span>Members only</span>
  </label>;
}
