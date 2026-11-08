// The "add a product" panel on /admin/products: its form state, its row
// helpers and the save. Lifted out of page.tsx on 2026-08-12 to shrink it. The
// handler bodies were moved character for character, so behaviour is unchanged.
//
// It takes setOverrides rather than a callback so the save can keep the exact
// line it always had: a new product is added to the catalogue overrides map.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction, type FormEvent } from 'react';
import { roundMoney } from '@/lib/money';
import type { Product, ProductVariant } from '@/data/products';
import { EMPTY_VARIANT_DRAFT, type VariantDraft } from '@/components/admin/VariantEditor';
import { shippingDraftToPayload, type ShippingDraft } from '@/components/admin/ShippingFields';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import { readAddProductDraft, writeAddProductDraft, clearAddProductDraft } from './productAddDraft';
import {
  slugify,
  SESSION_EXPIRED_MESSAGE,
  EMPTY_ADD_FORM,
  parseKeywordsInput,
  type AddProductForm,
} from './productDrafts';

interface UseAddProductArgs {
  /** The merged catalogue, used only to refuse a slug that already exists. */
  products: Product[];
  /** Photo uploads still in flight; saving is blocked while any are. */
  uploadingCount: number;
  setOverrides: Dispatch<SetStateAction<Record<string, Product>>>;
}

export function useAddProduct({ products, uploadingCount, setOverrides }: UseAddProductArgs) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddProductForm>(EMPTY_ADD_FORM);
  const [addSlugTouched, setAddSlugTouched] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [addDraftNotice, setAddDraftNotice] = useState('');
  const [addDraftStorageFailed, setAddDraftStorageFailed] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const owner = useRef('');
  const pending = useRef(false);
  const confirm = useConfirm();
  const snapshot = { form: addForm, slugTouched: addSlugTouched };
  const latest = useRef(snapshot); latest.current = snapshot;
  const dirty = JSON.stringify(snapshot) !== JSON.stringify({ form: EMPTY_ADD_FORM, slugTouched: false });

  useEffect(() => {
    owner.current = crypto.randomUUID();
    try {
      const saved = readAddProductDraft(localStorage, owner.current);
      if (saved) {
        setAddForm(saved.form); setAddSlugTouched(saved.slugTouched); setShowAddForm(true);
        setAddDraftNotice('Your new-product draft was restored from this browser. Nothing is published until you press Create Product.');
      }
    } catch { /* Editing is still available when browser storage is blocked. */ }
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady || !dirty) return;
    try { setAddDraftStorageFailed(!writeAddProductDraft(localStorage, owner.current, latest.current)); }
    catch { setAddDraftStorageFailed(true); }
  }, [draftReady, dirty, addForm, addSlugTouched]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function updateAddName(name: string) {
    setAddForm(prev => ({
      ...prev,
      name,
      slug: addSlugTouched ? prev.slug : slugify(name),
    }));
  }

  function updateVariant(index: number, field: keyof VariantDraft, value: string | boolean | ShippingDraft) {
    setAddForm(prev => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    }));
  }

  function addVariantRow() {
    setAddForm(prev => ({ ...prev, variants: [...prev.variants, { ...EMPTY_VARIANT_DRAFT }] }));
  }

  function removeVariantRow(index: number) {
    setAddForm(prev => ({
      ...prev,
      variants: prev.variants.length > 1 ? prev.variants.filter((_, i) => i !== index) : prev.variants,
    }));
  }

  async function resetAddForm() {
    if (pending.current) return;
    if (dirty) {
      let kept = false;
      try { kept = writeAddProductDraft(localStorage, owner.current, latest.current); } catch { /* Confirm possible loss. */ }
      if (!kept && !await confirm({ title: 'Close without keeping this draft?', body: 'Browser storage is unavailable. Keep the form open and copy your changes, or close without keeping them.', confirmLabel: 'Close anyway', cancelLabel: 'Keep editing', tone: 'danger' })) return;
    }
    setShowAddForm(false);
    setAddError('');
  }

  async function discardAddDraft() {
    if (pending.current || !await confirm({ title: 'Discard this new-product draft?', body: 'This removes the draft from this window. It does not change any saved product.', confirmLabel: 'Discard draft', cancelLabel: 'Keep draft', tone: 'danger' })) return;
    try {
      clearAddProductDraft(localStorage, owner.current, JSON.stringify(latest.current));
    } catch { /* The unavailable browser copy cannot be changed. */ }
    setAddForm(EMPTY_ADD_FORM); setAddSlugTouched(false);
    setAddDraftNotice(''); setAddError(''); setAddDraftStorageFailed(false); setShowAddForm(false);
  }

  async function submitAddProduct(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    setAddError('');
    if (uploadingCount > 0) {
      setAddError('Please wait for the photo upload to finish before saving.');
      return;
    }

    const name = addForm.name.trim();
    const slug = slugify(addForm.slug);
    const shortDescription = addForm.shortDescription.trim();
    const fullDescription = addForm.fullDescription;
    const purity = addForm.purity.trim();
    const badge = addForm.badge.trim();

    // Only name + slug (auto-derived from name) and at least one priced
    // variant (checked below) are genuinely required — every other field is
    // optional and simply omitted from the live product page when blank.
    if (!name || !slug) {
      setAddError('Enter a product name before saving.');
      return;
    }
    if (products.some(p => p.slug === slug)) {
      setAddError(`A product with the slug "${slug}" already exists. Choose a different one.`);
      return;
    }

    const variants: ProductVariant[] = [];
    for (const draft of addForm.variants) {
      const dosage = draft.dosage.trim();
      const price = Number(draft.price);
      if (!dosage || !Number.isFinite(price) || price < 0) {
        setAddError('Each size option needs a label and a price of zero or more.');
        return;
      }
      variants.push({ dosage, price: roundMoney(price), enabled: draft.enabled, image: draft.image.trim() || undefined, shipping: shippingDraftToPayload(draft.shipping) });
    }

    const product = {
      name,
      slug,
      categories: addForm.categories,
      shortDescription,
      fullDescription,
      fullDescriptionFormat: 'markdown' as const,
      purity,
      variants,
      badge: badge || undefined,
      isPlaceholder: addForm.isPlaceholder || undefined,
      newIn: addForm.newIn || undefined,
      image: addForm.image,
      shipping: shippingDraftToPayload(addForm.shipping),
      brand: addForm.brand.trim() || undefined,
      keywords: parseKeywordsInput(addForm.keywordsInput),
      availability: addForm.availability === 'available' ? undefined : addForm.availability,
    };

    const submitted = JSON.stringify(latest.current);
    pending.current = true;
    setAddSaving(true);
    try {
      const res = await fetch('/api/admin/products/catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
      if (!res.ok) throw new Error(data?.error || 'Could not create product.');
      setOverrides(prev => ({ ...prev, [data.product.slug]: data.product as Product }));
      try {
        clearAddProductDraft(localStorage, owner.current, submitted);
      } catch { /* A newer copy stays available. */ }
      if (JSON.stringify(latest.current) === submitted) {
        setShowAddForm(false); setAddForm(EMPTY_ADD_FORM); setAddSlugTouched(false); setAddDraftNotice(''); setAddDraftStorageFailed(false);
      } else {
        setAddDraftNotice('The product was created. Newer typing is kept in this draft; copy it into the saved product editor before creating another product.');
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not create product.');
    } finally {
      setAddSaving(false);
      pending.current = false;
    }
  }

  return {
    showAddForm,
    setShowAddForm,
    addForm,
    setAddForm,
    setAddSlugTouched,
    addSaving,
    addError,
    addDraftNotice,
    addDraftStorageFailed,
    discardAddDraft,
    updateAddName,
    updateVariant,
    addVariantRow,
    removeVariantRow,
    resetAddForm,
    submitAddProduct,
  };
}
