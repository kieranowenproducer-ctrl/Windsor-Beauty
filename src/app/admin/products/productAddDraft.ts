import type { AddProductForm } from './productDrafts';

export interface AddSnapshot { form: AddProductForm; slugTouched: boolean }
export interface StoredAddDraft extends AddSnapshot { version: 1; savedAt: string; storageOwner?: string }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const prefix = 'wb-new-product-draft-v1:';
const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const texts = (v: unknown, keys: string[]) => object(v) && keys.every(key => typeof v[key] === 'string');
const shipping = (v: unknown) => texts(v, ['weightGrams','lengthMm','widthMm','heightMm','packageFormat','defaultService','customsDescription','customsCode','originCountryCode','customsCategory']) && typeof (v as Record<string, unknown>).internationalEligible === 'boolean';
function valid(v: unknown): v is StoredAddDraft {
  if (!object(v) || v.version !== 1 || typeof v.savedAt !== 'string' || !Number.isFinite(Date.parse(v.savedAt)) || typeof v.slugTouched !== 'boolean' || !object(v.form)) return false;
  const f = v.form;
  return texts(f, ['name','slug','purity','badge','brand','keywordsInput','availability','shortDescription','fullDescription'])
    && ['available','coming_soon','out_of_stock'].includes(String(f.availability))
    && typeof f.isPlaceholder === 'boolean' && typeof f.newIn === 'boolean' && (f.image === undefined || typeof f.image === 'string')
    && Array.isArray(f.categories) && f.categories.every(c => typeof c === 'string') && shipping(f.shipping)
    && Array.isArray(f.variants) && f.variants.length > 0 && f.variants.every(v => texts(v,['dosage','price','image']) && typeof v.enabled === 'boolean' && shipping(v.shipping));
}
export function readAddProductDraft(storage: Store, owner: string): StoredAddDraft | null {
  try {
    const own = JSON.parse(storage.getItem(prefix + owner) ?? 'null');
    if (valid(own)) return { ...own, storageOwner: owner };
    const found: StoredAddDraft[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      try { const value = JSON.parse(storage.getItem(key) ?? 'null'); if (valid(value)) found.push({ ...value, storageOwner: key.slice(prefix.length) }); } catch { /* Ignore broken browser copies. */ }
    }
    return found.sort((a,b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
  } catch { return null; }
}
export function writeAddProductDraft(storage: Store, owner: string, snapshot: AddSnapshot): boolean {
  try { storage.setItem(prefix + owner, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...snapshot })); return true; } catch { return false; }
}
export function clearAddProductDraft(storage: Store, owner: string, snapshot: string): boolean {
  try {
    const value = JSON.parse(storage.getItem(prefix + owner) ?? 'null');
    if (!valid(value) || JSON.stringify({ form: value.form, slugTouched: value.slugTouched }) !== snapshot) return false;
    storage.removeItem(prefix + owner); return true;
  } catch { return false; }
}
