import type { Product } from '@/data/products';
import type { VariantDraft } from '@/components/admin/VariantEditor';
import type { ShippingDraft } from '@/components/admin/ShippingFields';
import type { CertificateFormat } from '@/lib/certificateStandards';
import type { CertificateDraft, ProductInfoDraft } from './productDrafts';

export interface EditorSnapshot {
  editForm: Partial<Product>; editVariants: VariantDraft[]; editShipping: ShippingDraft;
  editKeywordsInput: string; certDrafts: Record<string, CertificateDraft>; certFormat: CertificateFormat;
  editStorageInstructions: ProductInfoDraft; editHidden: boolean;
}
export interface StoredProductDraft {
  version: 1; slug: string; savedAt: string; baseProduct: Product; snapshot: EditorSnapshot;
  storageOwner?: string;
}
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const prefix = (slug: string) => `wb-product-draft-v1:${encodeURIComponent(slug)}:`;
const key = (slug: string, owner: string) => prefix(slug) + owner;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const textFields = (value: unknown, fields: string[]) => object(value) && fields.every(field => typeof value[field] === 'string');
function certificate(value: unknown): boolean {
  return object(value) && typeof value.enabled === 'boolean' && ['template', 'external'].includes(String(value.mode))
    && textFields(value, ['certificateId', 'productName', 'casNumber', 'pubchemCid', 'molecularFormula', 'molecularWeight', 'storage', 'caution'])
    && Array.isArray(value.externalImages) && value.externalImages.every(image => typeof image === 'string')
    && Array.isArray(value.testRows) && value.testRows.every(row => textFields(row, ['test', 'specification', 'result']))
    && Array.isArray(value.verificationSummary) && value.verificationSummary.every(row => textFields(row, ['label', 'value']))
    && Array.isArray(value.analyticalResults) && value.analyticalResults.every(row => textFields(row, ['label', 'value']));
}

function valid(value: unknown, slug: string): value is StoredProductDraft {
  if (!object(value) || value.version !== 1 || value.slug !== slug || typeof value.savedAt !== 'string'
    || !Number.isFinite(Date.parse(value.savedAt)) || !object(value.baseProduct) || value.baseProduct.slug !== slug || !object(value.snapshot)) return false;
  const s = value.snapshot;
  return object(s.editForm) && s.editForm.slug === slug && Array.isArray(s.editVariants) && s.editVariants.length > 0
    && s.editVariants.every(v => object(v) && typeof v.dosage === 'string' && typeof v.price === 'string' && typeof v.enabled === 'boolean' && typeof v.image === 'string' && object(v.shipping))
    && object(s.editShipping) && typeof s.editKeywordsInput === 'string' && object(s.certDrafts) && certificate(s.certDrafts['']) && Object.values(s.certDrafts).every(certificate)
    && (s.certFormat === 'vial' || s.certFormat === 'pen') && textFields(s.editStorageInstructions, ['mode', 'content']) && typeof s.editHidden === 'boolean';
}

export function readProductDraft(storage: StorageLike, slug: string, owner: string): StoredProductDraft | null {
  try {
    const own = JSON.parse(storage.getItem(key(slug, owner)) ?? 'null');
    if (valid(own, slug)) return { ...own, storageOwner: owner };
    const drafts: StoredProductDraft[] = [];
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (!name?.startsWith(prefix(slug))) continue;
      try { const draft = JSON.parse(storage.getItem(name) ?? 'null'); if (valid(draft, slug)) drafts.push({ ...draft, storageOwner: name.slice(prefix(slug).length) }); } catch { /* A malformed copy never breaks editing. */ }
    }
    return drafts.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0] ?? null;
  } catch { return null; }
}

export function writeProductDraft(storage: StorageLike, owner: string, baseProduct: Product, snapshot: EditorSnapshot): boolean {
  try {
    storage.setItem(key(baseProduct.slug, owner), JSON.stringify({ version: 1, slug: baseProduct.slug, savedAt: new Date().toISOString(), baseProduct, snapshot } satisfies StoredProductDraft));
    return true;
  } catch { return false; }
}

// Remove only this tab's copy, and only the exact snapshot acknowledged by the server.
export function clearSavedProductDraft(storage: StorageLike, slug: string, owner: string, savedSnapshot: string): boolean {
  try {
    const current = JSON.parse(storage.getItem(key(slug, owner)) ?? 'null');
    if (!valid(current, slug) || JSON.stringify(current.snapshot) !== savedSnapshot) return false;
    storage.removeItem(key(slug, owner)); return true;
  } catch { return false; }
}

export function sameProductVersion(left: Product, right: Product): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])])) : value;
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}
