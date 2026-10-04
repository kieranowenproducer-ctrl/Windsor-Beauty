'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PRODUCTS,
  mergeProducts,
  ALL_CATEGORIES,
  sortVariantsByStrength,
  type Product,
  type ProductVariant,
  type CertificateTestRow,
  type CertificateInfoRow,
  type Category,
  type AvailabilityStatus,
  type SpecRowKey,
} from '@/data/products';
import { EMPTY_VARIANT_DRAFT, type VariantDraft } from '@/components/admin/VariantEditor';
import { roundMoney } from '@/lib/money';
import { genericNameFor } from '@/lib/genericNames';
import { EMPTY_SHIPPING_DRAFT, shippingToDraft, shippingDraftToPayload, type ShippingDraft } from '@/components/admin/ShippingFields';
import { htmlToMarkdownLite } from '@/lib/markdownLite';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StockReportModal from '@/components/admin/StockReportModal';
import { evaluateCertificate, type CertificateStatus } from '@/lib/certificateAudit';
import {
  applyFormatStandards,
  detectFormat,
  setStandardSummaryRow,
  setStandardTestRow,
  type CertificateFormat,
  type StandardSummaryRow,
  type StandardTestRow,
} from '@/lib/certificateStandards';
import AddProductFormPanel from './AddProductFormPanel';
import ProductFilterBar from './ProductFilterBar';
import CertificateAuditPanel from './CertificateAuditPanel';
import ProductCardList from './ProductCardList';
import ProductTable from './ProductTable';
import RetiredProductsPanel from './RetiredProductsPanel';
import EditProductDrawer from './EditProductDrawer';
import {
  exportProductHandlesCsv, sortProducts,
  HIDDEN_CHOICE, type ProductSortOption, type ProductVisibilityChoice,
} from './productListUtils';
import { useAddProduct } from './useAddProduct';
import { useOverflowLock } from '@/components/viewportOwner';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import {
  SESSION_EXPIRED_MESSAGE,
  EMPTY_CERTIFICATE_DRAFT,
  certificateToDraft,
  certificateDraftToPayload,
  certificatePayloadHasContent,
  EMPTY_STORAGE_INSTRUCTIONS_DRAFT,
  storageInstructionsToDraft,
  storageInstructionsDraftToPayload,
  parseKeywordsInput,
  type CertificateDraft,
  type ProductInfoDraft,
} from './productDrafts';

export default function AdminProductsPage() {
  return (
    <Suspense fallback={null}>
      <AdminProductsPageContent />
    </Suspense>
  );
}

function AdminProductsPageContent() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [overridesLoaded, setOverridesLoaded] = useState(false);
  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);

  // Anything that resolves to the bare default: no genericName of its own, not in
  // the code's slug map, and no category fallback. Safe but not unique — surfaced
  // as a banner rather than left to be discovered on a shipping label.
  const unnamedProducts = useMemo(
    () => products.filter(p => genericNameFor(p, p.slug).source === 'default'),
    [products]
  );

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sort, setSort] = useState<ProductSortOption>('az');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'hidden'>('live');
  const [certFilter, setCertFilter] = useState<'all' | CertificateStatus>('all');
  const [scrollToCertOnOpen, setScrollToCertOnOpen] = useState(false);
  const [certAuditOpen, setCertAuditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Lock the page behind the edit drawer while it is open. Without this, touch
  // scrolling on mobile grabs the BODY (the page scrollbar moves behind the
  // fixed drawer) while the drawer itself never scrolls — task 5bc92178.
  // Through the shared counter. This one already saved and restored the previous
  // value, which is the most careful of the hand-rolled versions, but two
  // overlays still cannot both be right about what "previous" was.
  useOverflowLock(Boolean(editingId), 'products-edit-drawer');
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [editVariants, setEditVariants] = useState<VariantDraft[]>([]);
  const [editShipping, setEditShipping] = useState<ShippingDraft>(EMPTY_SHIPPING_DRAFT);
  const [editKeywordsInput, setEditKeywordsInput] = useState('');
  // Per-size certificates (Option A). Certificate drafts are keyed by target:
  // '' = the shared/product-level certificate (the default, and what single-size
  // products use), and a size string = that size's own certificate. `certTarget`
  // is the size currently being edited. `editCertificate` / `setEditCertificate`
  // are derived views onto the active target, so the entire existing certificate
  // form (45 call sites) keeps working untouched — it just edits whichever target
  // is selected.
  const [certDrafts, setCertDrafts] = useState<Record<string, CertificateDraft>>({ '': EMPTY_CERTIFICATE_DRAFT });
  const [certTarget, setCertTarget] = useState<string>('');
  const editCertificate = certDrafts[certTarget] ?? EMPTY_CERTIFICATE_DRAFT;
  const setEditCertificate = (update: CertificateDraft | ((prev: CertificateDraft) => CertificateDraft)) => {
    setCertDrafts(prev => {
      const current = prev[certTarget] ?? EMPTY_CERTIFICATE_DRAFT;
      const next = typeof update === 'function' ? (update as (p: CertificateDraft) => CertificateDraft)(current) : update;
      return { ...prev, [certTarget]: next };
    });
  };
  // Which storage choice the certificate is on (the two names are historic). Set from
  // the product when the drawer opens, and changed by the two buttons at the top of
  // the certificate section. See src/lib/certificateStandards.ts.
  const [certFormat, setCertFormatState] = useState<CertificateFormat>('vial');
  // What the last press of those buttons actually rewrote, shown back to the admin.
  const [certFormatChanged, setCertFormatChanged] = useState<string[]>([]);
  const [editStorageInstructions, setEditStorageInstructions] = useState<ProductInfoDraft>(EMPTY_STORAGE_INSTRUCTIONS_DRAFT);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  // The Availability dropdown inside the edit form carries the same "Hidden"
  // choice as the one on the list (task 6941e1ba). It is held here rather than
  // written straight away, because every other field in that form applies on
  // Save changes and is undone by Cancel — one field that acted immediately
  // would be the surprising one.
  const [editHidden, setEditHidden] = useState(false);
  // Counts in-flight image uploads across every ImageUploadField/
  // MultiImageUploadField in the edit drawer and the add-product form (main
  // photo, certificate photo/pages, every variant photo). Saving while an
  // upload is still in flight would commit the pre-upload image — the old
  // photo then reasserts itself next time the page loads, which looks like
  // the new one "disappeared". Both submit buttons stay disabled until this
  // is back at 0.
  const [uploadingCount, setUploadingCount] = useState(0);
  function handleUploadingChange(uploading: boolean) {
    setUploadingCount(c => Math.max(0, c + (uploading ? 1 : -1)));
  }

  const [membersOnlySlugs, setMembersOnlySlugs] = useState<Set<string>>(new Set());
  const [membersOnlyLoaded, setMembersOnlyLoaded] = useState(false);
  const [membersOnlySaving, setMembersOnlySaving] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/admin/products/members-only', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Members only settings could not be loaded.');
      const data = await response.json();
      if (!Array.isArray(data.membersOnly)) throw new Error('Members only settings could not be loaded.');
      setMembersOnlySlugs(new Set<string>(data.membersOnly)); setMembersOnlyLoaded(true);
    }).catch(() => setActionError('Members only settings could not be loaded. Refresh before changing them.'));
  }, []);
  async function toggleMembersOnly(product: Product, checked: boolean) {
    setMembersOnlySaving(product.slug); setActionError('');
    try {
      const response = await fetch('/api/admin/products/members-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: product.slug, membersOnly: checked }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Members only could not be saved.');
      setMembersOnlySlugs(previous => { const next = new Set(previous); if (checked) next.add(product.slug); else next.delete(product.slug); return next; });
      setActionNotice(checked ? product.name + ' is now for members only. Hidden products stay hidden.' : product.name + ' is available to all shoppers when live.');
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Members only could not be saved.'); }
    finally { setMembersOnlySaving(null); }
  }
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set());
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);
  const [visibilitySavedSlug, setVisibilitySavedSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  const [availabilitySavingSlug, setAvailabilitySavingSlug] = useState<string | null>(null);
  const [availabilitySavedSlug, setAvailabilitySavedSlug] = useState<string | null>(null);

  const [stock, setStock] = useState<Record<string, number>>({});
  // slug -> dosage -> quantity. The per-product `stock` above is now just
  // the sum of these, kept only for sorting/CSV export/status badges.
  const [variantStock, setVariantStock] = useState<Record<string, Record<string, number>>>({});
  // Drafts/saving/saved state keyed by "slug::dosage" since each size has
  // its own input + Save button now.
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [savingStockKey, setSavingStockKey] = useState<string | null>(null);
  const [stockSavedKey, setStockSavedKey] = useState<string | null>(null);
  // Auto-save plumbing (task 81f143ba): stock edits save themselves — a short
  // debounce after typing, an immediate flush on blur, and a keepalive flush if
  // the page is closed with edits still pending. Refs mirror the draft state so
  // the timers and the pagehide handler never read stale closures.
  const stockDraftsRef = useRef<Record<string, string>>({});
  const stockAutoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => { stockDraftsRef.current = stockDrafts; }, [stockDrafts]);
  const [stockReportOpen, setStockReportOpen] = useState(false);
  const [soldCounts, setSoldCounts] = useState<Record<string, number>>({});

  const [actionError, setActionError] = useState('');
  // Hiding a product from the list makes its card leave the "Live" tab, which
  // on its own reads like the product was deleted. This says what happened and
  // where the product went.
  const [actionNotice, setActionNotice] = useState('');

  // The "add a product" panel: its own form state and the save. Lifted out of
  // this file on 2026-08-12; the handler bodies are unchanged.
  const {
    showAddForm,
    setShowAddForm,
    addForm,
    setAddForm,
    setAddSlugTouched,
    addSaving,
    addError,
    updateAddName,
    updateVariant,
    addVariantRow,
    removeVariantRow,
    resetAddForm,
    submitAddProduct,
  } = useAddProduct({ products, uploadingCount, setOverrides });

  const [allCategories, setAllCategories] = useState<string[]>([...ALL_CATEGORIES]);

  useEffect(() => {
    fetch('/api/admin/categories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.categories)) {
          setAllCategories(data.categories.map((c: { category: string }) => c.category));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin/products/visibility')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.hidden)) setHiddenSlugs(new Set<string>(data.hidden));
      })
      .catch(() => {});

    fetch('/api/admin/products/stock')
      .then(res => res.json())
      .then(data => {
        if (data.stock && typeof data.stock === 'object') setStock(data.stock);
        if (data.variantStock && typeof data.variantStock === 'object') setVariantStock(data.variantStock);
      })
      .catch(() => {});

    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {})
      .finally(() => setOverridesLoaded(true));

    fetch('/api/products/sold-counts')
      .then(res => res.json())
      .then(data => {
        if (data.soldCounts && typeof data.soldCounts === 'object') setSoldCounts(data.soldCounts);
      })
      .catch(() => {});
  }, []);

  // The one write behind every hide/unhide control on this screen: the Hide /
  // Unhide button, the availability dropdown's "Hidden" choice, and the Edit
  // Product form's copy of that dropdown. They must never disagree about what
  // hidden means, so they all come through here.
  async function applyHidden(product: Product, nextHidden: boolean): Promise<void> {
    const res = await fetch('/api/admin/products/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: product.slug, hidden: nextHidden }),
    });
    if (!res.ok) throw new Error('Request failed');
    setHiddenSlugs(prev => {
      const next = new Set(prev);
      if (nextHidden) next.add(product.slug);
      else next.delete(product.slug);
      return next;
    });
  }

  function noteVisibility(product: Product, nextHidden: boolean) {
    setActionNotice(
      nextHidden
        ? `“${product.name}” is now hidden. It has gone from the shop and every customer page. Find it again under the Hidden tab above.`
        : `“${product.name}” is back on the shop.`
    );
    setTimeout(() => setActionNotice(''), 6000);
  }

  async function toggleVisibility(product: Product) {
    const nextHidden = !hiddenSlugs.has(product.slug);
    setTogglingSlug(product.slug);
    setVisibilitySavedSlug(null);
    try {
      await applyHidden(product, nextHidden);
      noteVisibility(product, nextHidden);
      setVisibilitySavedSlug(product.slug);
      setTimeout(() => setVisibilitySavedSlug(curr => (curr === product.slug ? null : curr)), 2500);
    } catch {
      setActionError('Could not update product visibility. Please try again.');
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setTogglingSlug(null);
    }
  }

  // Deleting only ever removes the custom_products override row. For a
  // product that also exists in the static PRODUCTS array (most of the
  // catalogue), that means it reverts to the original built-in version
  // rather than disappearing — the confirm dialog makes that distinction
  // explicit so an admin doesn't think they've permanently lost a built-in
  // product's data.
  async function deleteProduct(product: Product) {
    const isStaticProduct = PRODUCTS.some(p => p.slug === product.slug);
    const confirmed = await confirm(
      isStaticProduct
        ? {
            title: `Reset "${product.name}" to its original details?`,
            body: 'This is a built-in product, so it is not removed. It goes back to the details it shipped with, and any edits you have made are undone. This cannot be undone.',
            confirmLabel: 'Yes, reset it',
            cancelLabel: 'Keep my edits',
            tone: 'danger',
          }
        : {
            title: `Permanently delete "${product.name}"?`,
            body: 'This cannot be undone.',
            confirmLabel: 'Yes, delete it',
            cancelLabel: 'Keep it',
            tone: 'danger',
          }
    );
    if (!confirmed) return;

    setDeletingSlug(product.slug);
    try {
      const res = await fetch(`/api/admin/products/catalogue/${encodeURIComponent(product.slug)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
      if (!res.ok) throw new Error(data?.error || 'Could not delete product.');

      setOverrides(prev => {
        const next = { ...prev };
        delete next[product.slug];
        return next;
      });
      if (!isStaticProduct) {
        setHiddenSlugs(prev => {
          if (!prev.has(product.slug)) return prev;
          const next = new Set(prev);
          next.delete(product.slug);
          return next;
        });
        setStock(prev => {
          if (!(product.slug in prev)) return prev;
          const next = { ...prev };
          delete next[product.slug];
          return next;
        });
      }
      if (editingId === product.id) setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete product.');
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setDeletingSlug(null);
    }
  }

  async function saveAvailability(product: Product, availability: AvailabilityStatus) {
    const res = await fetch('/api/admin/products/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: product.slug, availability }),
    });
    if (!res.ok) throw new Error('Request failed');
    setOverrides(prev => ({
      ...prev,
      [product.slug]: { ...product, availability: availability === 'available' ? undefined : availability },
    }));
  }

  /**
   * The availability dropdown on the products list, which now carries a fourth
   * choice, "Hidden (off the site)" (task 6941e1ba — hiding without opening the
   * Edit Product form).
   *
   * Picking Hidden sets the hidden flag and DOES NOT touch the availability
   * underneath, so unhiding puts the product back exactly as it was. Picking
   * any of the other three unhides it and sets that status, which is what makes
   * the one dropdown switch a product both ways.
   */
  async function updateVisibilityChoice(product: Product, choice: ProductVisibilityChoice) {
    const wasHidden = hiddenSlugs.has(product.slug);
    const nextHidden = choice === HIDDEN_CHOICE;
    if (nextHidden === wasHidden && (nextHidden || choice === (product.availability ?? 'available'))) return;

    setAvailabilitySavingSlug(product.slug);
    setAvailabilitySavedSlug(null);
    try {
      if (!nextHidden) await saveAvailability(product, choice as AvailabilityStatus);
      if (nextHidden !== wasHidden) {
        await applyHidden(product, nextHidden);
        noteVisibility(product, nextHidden);
      }
      setAvailabilitySavedSlug(product.slug);
      setTimeout(() => setAvailabilitySavedSlug(curr => (curr === product.slug ? null : curr)), 2500);
    } catch {
      setActionError('Could not update availability. Please try again.');
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setAvailabilitySavingSlug(null);
    }
  }

  function stockKey(slug: string, dosage: string) {
    return `${slug}::${dosage}`;
  }

  function stockInputValue(slug: string, dosage: string) {
    const key = stockKey(slug, dosage);
    if (stockDrafts[key] !== undefined) return stockDrafts[key];
    const value = variantStock[slug]?.[dosage];
    return value !== undefined ? String(value) : '';
  }

  // Debounced auto-save: fires ~900ms after the last keystroke on a field, so
  // "type a number and move on" just works with no Save click (Kieran's ask).
  function queueStockAutoSave(slug: string, dosage: string) {
    const key = stockKey(slug, dosage);
    if (stockAutoSaveTimers.current[key]) clearTimeout(stockAutoSaveTimers.current[key]);
    stockAutoSaveTimers.current[key] = setTimeout(() => {
      delete stockAutoSaveTimers.current[key];
      void saveStock(slug, dosage, { auto: true });
    }, 900);
  }

  // Flush every pending draft with keepalive requests if the tab is hidden or
  // closed — "if I leave the page it means I've saved it".
  useEffect(() => {
    function flushPending() {
      for (const key of Object.keys(stockDraftsRef.current)) {
        const raw = (stockDraftsRef.current[key] ?? '').trim();
        const quantity = Math.max(0, Math.round(Number(raw)));
        if (raw === '' || !Number.isFinite(quantity)) continue;
        const [slug, dosage] = key.split('::');
        try {
          void fetch('/api/admin/products/stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug, dosage, quantity }),
            keepalive: true,
          });
        } catch { /* page is going away; best effort */ }
      }
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flushPending(); };
    window.addEventListener('pagehide', flushPending);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flushPending);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  async function saveStock(slug: string, dosage: string, opts?: { auto?: boolean }) {
    const key = stockKey(slug, dosage);
    if (stockAutoSaveTimers.current[key]) { clearTimeout(stockAutoSaveTimers.current[key]); delete stockAutoSaveTimers.current[key]; }
    // Auto-save only ever writes a pending draft; no draft means nothing changed.
    if (opts?.auto && stockDraftsRef.current[key] === undefined) return;
    // Read the draft through the ref, never the render closure: a debounce
    // timer fires with the closure from the render that queued it, so state
    // there can lag behind what has actually been typed since.
    const raw = (stockDraftsRef.current[key] ?? stockInputValue(slug, dosage)).trim();
    const quantity = Math.max(0, Math.round(Number(raw)));
    if (raw === '' || !Number.isFinite(quantity)) {
      if (opts?.auto) return; // mid-edit emptiness is not an error; wait for a real value
      setActionError('Enter a valid stock number (0 or higher).');
      setTimeout(() => setActionError(''), 5000);
      return;
    }
    setSavingStockKey(key);
    setStockSavedKey(null);
    try {
      const res = await fetch('/api/admin/products/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, dosage, quantity }),
      });
      if (!res.ok) throw new Error('Request failed');
      setVariantStock(prev => ({ ...prev, [slug]: { ...prev[slug], [dosage]: quantity } }));
      setStock(prev => {
        const previousVariantQuantity = variantStock[slug]?.[dosage] ?? 0;
        const previousTotal = prev[slug] ?? 0;
        return { ...prev, [slug]: previousTotal - previousVariantQuantity + quantity };
      });
      // Clear the draft ONLY if it still holds the value we just saved. If more
      // digits were typed while this request was in flight (routine on a phone,
      // where each keystroke can beat a slow network round-trip), deleting the
      // draft would snap the input back to the older server value and silently
      // eat the new keystrokes — that was the "auto save does not work" bug
      // (task a8258834). Keep the newer draft and queue it for its own save.
      const draftNow = stockDraftsRef.current[key];
      if (draftNow !== undefined && draftNow.trim() === raw) {
        setStockDrafts(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        const nextRef = { ...stockDraftsRef.current };
        delete nextRef[key];
        stockDraftsRef.current = nextRef;
      } else if (draftNow !== undefined) {
        queueStockAutoSave(slug, dosage);
      }
      setStockSavedKey(key);
      setTimeout(() => setStockSavedKey(curr => (curr === key ? null : curr)), 2500);
    } catch {
      setActionError('Could not update stock. Please try again.');
      setTimeout(() => setActionError(''), 5000);
    } finally {
      setSavingStockKey(null);
    }
  }

  // Price cell — for a multi-size product, show the price for EVERY dosage
  // (one row per variant, size-labelled to match the stock column), so the
  // per-size unit price is visible at a glance instead of a single "from"
  // figure. Single-variant products show the one price (or TBC when it's £0).
  function renderPriceCell(product: Product) {
    const variants = product.variants;
    if (variants.length <= 1) {
      const price = variants[0]?.price ?? 0;
      return price === 0 ? <span>TBC</span> : <span>&pound;{price.toFixed(2)}</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        {variants.map(v => (
          <div key={v.dosage} className="flex items-center gap-1.5">
            <span className="text-[9px] text-stone-500 w-12 shrink-0 truncate" title={v.dosage}>{v.dosage}</span>
            <span className="text-xs text-stone-700 tabular-nums">{v.price === 0 ? 'TBC' : <>&pound;{v.price.toFixed(2)}</>}</span>
          </div>
        ))}
      </div>
    );
  }

  // Shared between the desktop table cell and the mobile/tablet card layout
  // below — one size row per variant, each with its own input/Save/Saved
  // state, so this never has to be kept in sync in two places.
  function renderStockEditor(product: Product) {
    return (
      <div className="flex flex-col gap-1.5">
        {product.variants.map(v => {
          const key = stockKey(product.slug, v.dosage);
          return (
            <div key={v.dosage} className="flex items-center gap-1.5">
              <span className="text-[9px] text-stone-500 w-12 shrink-0 truncate" title={v.dosage}>{v.dosage}</span>
              <input
                type="number"
                min={0}
                value={stockInputValue(product.slug, v.dosage)}
                onChange={e => {
                  const value = e.target.value;
                  setStockDrafts(prev => ({ ...prev, [key]: value }));
                  stockDraftsRef.current = { ...stockDraftsRef.current, [key]: value };
                  queueStockAutoSave(product.slug, v.dosage);
                }}
                onBlur={() => void saveStock(product.slug, v.dosage, { auto: true })}
                className="w-14 border border-stone-200 px-1.5 py-1 text-xs text-stone-700 focus:border-gold-400 outline-none"
              />
              {/* Auto-save (task 81f143ba): no Save button — the field saves itself.
                  The label shows exactly where each edit stands. */}
              {savingStockKey === key ? (
                <span className="text-[9px] tracking-wider uppercase text-stone-500">Saving…</span>
              ) : stockSavedKey === key ? (
                <span className="text-[9px] tracking-wider uppercase text-green-600">Saved</span>
              ) : stockDrafts[key] !== undefined ? (
                <span className="text-[9px] tracking-wider uppercase text-gold-700">Auto-saving…</span>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    const searched = products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.categories.some(c => c.toLowerCase().includes(term))
    );
    const byCategory = categoryFilter === 'All'
      ? searched
      : searched.filter(p => p.categories.includes(categoryFilter as Category));
    const byStatus = statusFilter === 'live'
      ? byCategory.filter(p => !hiddenSlugs.has(p.slug))
      : statusFilter === 'hidden'
      ? byCategory.filter(p => hiddenSlugs.has(p.slug))
      : byCategory;
    const byCert = certFilter === 'all'
      ? byStatus
      : byStatus.filter(p => evaluateCertificate(p).status === certFilter);
    return sortProducts(byCert, sort, stock);
  }, [products, search, categoryFilter, sort, stock, statusFilter, hiddenSlugs, certFilter]);

  const statusCounts = useMemo(() => {
    const term = search.toLowerCase();
    const searched = products.filter(p =>
      p.name.toLowerCase().includes(term) ||
      p.categories.some(c => c.toLowerCase().includes(term))
    );
    const base = categoryFilter === 'All'
      ? searched
      : searched.filter(p => p.categories.includes(categoryFilter as Category));
    return {
      all: base.length,
      live: base.filter(p => !hiddenSlugs.has(p.slug)).length,
      hidden: base.filter(p => hiddenSlugs.has(p.slug)).length,
    };
  }, [products, search, categoryFilter, hiddenSlugs]);

  const certCounts = useMemo(() => {
    const counts = { all: products.length, live: 0, warning: 0, missing: 0 };
    for (const p of products) counts[evaluateCertificate(p).status]++;
    return counts;
  }, [products]);

  // Catalogue-wide (not filtered by search/category) — the audit report is
  // meant to surface gaps across everything, not just the current view.
  const certAudit = useMemo(() => {
    const missing: { name: string; id: string; categories: string }[] = [];
    const issues: { name: string; id: string; issue: string }[] = [];
    for (const p of products) {
      const { status, issue } = evaluateCertificate(p);
      if (status === 'missing') missing.push({ name: p.name, id: p.id, categories: p.categories.join(', ') });
      else if (status === 'warning') issues.push({ name: p.name, id: p.id, issue: issue ?? 'Certificate not fully live.' });
    }
    return { missing, issues };
  }, [products]);

  const editingProduct = editingId !== null ? (products.find(p => p.id === editingId) ?? null) : null;
  // Whether the live certificate preview is beside the edit fields. Opens by itself when the
  // editor was opened to work on a certificate; closed for an ordinary product edit.
  const [certPreviewOpen, setCertPreviewOpen] = useState(false);

  useEffect(() => {
    if (editingId && scrollToCertOnOpen) {
      document.getElementById('certificate-edit-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setScrollToCertOnOpen(false);
    }
  }, [editingId, scrollToCertOnOpen]);

  function editCertificateFor(p: Product) {
    startEdit(p);
    setScrollToCertOnOpen(true);
    // Arriving here to work on a certificate means wanting to see the certificate (task
    // f5c8da12). Opening the fields with no sight of what they produce is exactly the complaint.
    setCertPreviewOpen(true);
  }

  // Lets other admin pages (the Certificates review page) deep-link straight
  // into editing a specific product via /admin/products?edit=<slug>, instead
  // of making the admin search for it again. Only ever runs once, after the
  // catalogue has actually loaded — otherwise the matching product wouldn't
  // exist yet to find.
  useEffect(() => {
    if (deepLinkHandled || !overridesLoaded) return;
    setDeepLinkHandled(true);
    const slug = searchParams.get('edit');
    if (!slug) return;
    const product = products.find(p => p.slug === slug);
    if (!product) return;
    if (searchParams.get('section') === 'certificate') editCertificateFor(product);
    else startEdit(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this opens the editor once, when a deep link arrives and the data it needs has loaded. editCertificateFor is redefined every render, so including it would reopen the editor continuously and throw away what the user was typing.
  }, [deepLinkHandled, overridesLoaded, products, searchParams]);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditHidden(hiddenSlugs.has(p.slug));
    // One-time, display-only HTML-to-lite-markdown conversion for legacy
    // 'html' descriptions (saved by the old Tiptap editor) — plain 'text' or
    // already-'markdown' descriptions are valid lite-markdown as typed, no
    // conversion needed. The product itself isn't touched until saved again,
    // at which point it's always written as 'markdown'.
    const fullDescription = p.fullDescriptionFormat === 'html' ? htmlToMarkdownLite(p.fullDescription ?? '') : (p.fullDescription ?? '');
    setEditForm({ ...p, availability: p.availability ?? 'available', newIn: p.newIn ?? false, fullDescription, fullDescriptionFormat: 'markdown' });
    setEditVariants(sortVariantsByStrength(p.variants).map(v => ({ dosage: v.dosage, price: String(v.price), enabled: v.enabled !== false, image: v.image || '', shipping: shippingToDraft(v.shipping) })));
    setEditShipping(shippingToDraft(p.shipping));
    setEditKeywordsInput((p.keywords ?? []).join(', '));
    // Load the shared certificate under '' and each size's own certificate under
    // its size key. Editing starts on the shared certificate.
    const shared = certificateToDraft(p.certificate);
    const format = detectFormat(p.categories, shared.storage || p.storage);
    // A product whose certificate has never been started opens with the
    // standard rows and this format's wording already in place, so the same
    // four rows are not typed out by hand on every new product. Nothing is
    // saved from that until a real value is typed into one of them (see
    // certificateDraftToPayload).
    if (shared.testRows.length === 0) {
      const seeded = applyFormatStandards({ storage: shared.storage, testRows: shared.testRows }, format);
      shared.storage = seeded.storage;
      shared.testRows = seeded.testRows;
    }
    const drafts: Record<string, CertificateDraft> = { '': shared };
    for (const v of p.variants) {
      if (v.certificate) drafts[v.dosage] = certificateToDraft(v.certificate);
    }
    setCertDrafts(drafts);
    setCertTarget('');
    setCertFormatState(format);
    setCertFormatChanged([]);
    setEditStorageInstructions(storageInstructionsToDraft(p.storageInstructions));
    setEditError('');
  }

  function toggleHiddenSpec(key: SpecRowKey) {
    setEditForm(prev => {
      const current = prev.hiddenSpecs ?? [];
      const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
      return { ...prev, hiddenSpecs: next.length > 0 ? next : undefined };
    });
  }

  // ── the standard certificate rows ──────────────────────────────────────────
  // Batch / Lot and Certificate Date are shown on every certificate in the
  // editor under fixed names, so they never have to be typed. Writing to one
  // creates the row if the certificate does not have it yet, and edits the
  // existing row (whatever it happens to be called) if it does.
  function setStandardTest(row: StandardTestRow, field: 'specification' | 'result', value: string) {
    setEditCertificate(prev => ({ ...prev, testRows: setStandardTestRow(prev.testRows, row, field, value) }));
  }

  function setStandardSummary(row: StandardSummaryRow, value: string) {
    setEditCertificate(prev => ({ ...prev, verificationSummary: setStandardSummaryRow(prev.verificationSummary, row, value) }));
  }

  // Pressing one of the two storage buttons records the choice. Nothing typed
  // by hand is changed (see applyFormatStandards). Anything it did rewrite is
  // reported back so it is visible before anything is saved.
  function setCertFormat(format: CertificateFormat) {
    const applied = applyFormatStandards({ storage: editCertificate.storage, testRows: editCertificate.testRows }, format);
    setCertFormatState(format);
    setCertFormatChanged(applied.changed);
    setEditCertificate(prev => ({ ...prev, storage: applied.storage, testRows: applied.testRows }));
  }

  function updateEditCertificateRow(index: number, field: keyof CertificateTestRow, value: string) {
    setEditCertificate(prev => ({
      ...prev,
      testRows: prev.testRows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  }

  function addEditCertificateRow() {
    setEditCertificate(prev => ({ ...prev, testRows: [...prev.testRows, { test: '', specification: '', result: '' }] }));
  }

  function removeEditCertificateRow(index: number) {
    setEditCertificate(prev => ({ ...prev, testRows: prev.testRows.filter((_, i) => i !== index) }));
  }

  function updateEditInfoRow(section: 'verificationSummary' | 'analyticalResults', index: number, field: keyof CertificateInfoRow, value: string) {
    setEditCertificate(prev => ({
      ...prev,
      [section]: prev[section].map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    }));
  }

  function addEditInfoRow(section: 'verificationSummary' | 'analyticalResults') {
    setEditCertificate(prev => ({ ...prev, [section]: [...prev[section], { label: '', value: '' }] }));
  }

  function removeEditInfoRow(section: 'verificationSummary' | 'analyticalResults', index: number) {
    setEditCertificate(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== index) }));
  }

  function updateEditVariant(index: number, field: keyof VariantDraft, value: string | boolean | ShippingDraft) {
    setEditVariants(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  function addEditVariantRow() {
    setEditVariants(prev => [...prev, { ...EMPTY_VARIANT_DRAFT }]);
  }

  function removeEditVariantRow(index: number) {
    setEditVariants(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function saveEdit() {
    if (!editingId) return;
    const original = products.find(p => p.id === editingId);
    if (!original) return;
    if (uploadingCount > 0) {
      setEditError('Please wait for the photo upload to finish before saving.');
      return;
    }

    if (editCertificate.enabled && editCertificate.mode === 'template' && !editCertificate.certificateId.trim()) {
      setEditError('Enter a Certificate ID before enabling the certificate.');
      return;
    }
    if (editCertificate.enabled && editCertificate.mode === 'external' && editCertificate.externalImages.length === 0) {
      setEditError('Upload at least one certificate page before enabling the external certificate.');
      return;
    }

    const variants: ProductVariant[] = [];
    for (const draft of editVariants) {
      const dosage = draft.dosage.trim();
      const price = Number(draft.price);
      if (!dosage || !Number.isFinite(price) || price < 0) {
        setEditError('Each size option needs a label and a price of zero or more.');
        return;
      }
      // Attach this size's own certificate if one was entered for it (Option A);
      // otherwise leave it off so it falls back to the shared product-level cert.
      const perDosageCert = certDrafts[dosage] ? certificateDraftToPayload(certDrafts[dosage]) : undefined;
      const variantCertificate = perDosageCert && certificatePayloadHasContent(perDosageCert) ? perDosageCert : undefined;
      variants.push({ dosage, price: roundMoney(price), enabled: draft.enabled, image: draft.image.trim() || undefined, shipping: shippingDraftToPayload(draft.shipping), certificate: variantCertificate });
    }

    const merged: Product = {
      ...original,
      ...editForm,
      variants,
      shipping: shippingDraftToPayload(editShipping),
      keywords: parseKeywordsInput(editKeywordsInput),
      availability: editForm.availability === 'available' ? undefined : editForm.availability,
      // The product-level (shared) certificate always comes from the '' target,
      // regardless of which size's certificate is currently open in the editor.
      certificate: certificateDraftToPayload(certDrafts[''] ?? EMPTY_CERTIFICATE_DRAFT),
      storageInstructions: storageInstructionsDraftToPayload(editStorageInstructions),
    };
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/products/catalogue/${encodeURIComponent(merged.slug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: merged }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
      if (!res.ok) throw new Error(data?.error || 'Could not save changes.');
      setOverrides(prev => ({ ...prev, [data.product.slug]: data.product as Product }));
      // Hiding lives outside the product record, so it is a second write. It
      // runs only when the choice actually changed, and after the product
      // saved — a product that failed to save should not quietly change what
      // customers can see.
      if (editHidden !== hiddenSlugs.has(merged.slug)) {
        await applyHidden(merged, editHidden);
        noteVisibility(merged, editHidden);
      }
      setEditingId(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSavingEdit(false);
    }
  }



  return (
    // `overflow-clip` for the reason spelled out in SiteChrome: `hidden` clips AND creates a
    // scroll container, and a scroll container that never scrolls is where a sticky element goes
    // to die. `main` keeps no overflow at all now — it had `overflow-y-auto` since this page was
    // written and never once scrolled, measured at 13,695px tall inside an 844px viewport with
    // scrollHeight - clientHeight = 0. The document is what scrolls, and always was.
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Products</h1>
              <p className="text-xs text-stone-500">{products.length} products in catalogue</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportProductHandlesCsv(products, hiddenSlugs, stock)}
                title="A reference list of every live product's handle/slug - for building your own custom upsell CSV by hand."
                className="border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:border-gold-300 hover:text-gold-700 transition-colors"
              >
                Export Product Handles CSV
              </button>
              <button
                onClick={() => setStockReportOpen(true)}
                className="border border-gold-300 text-gold-700 text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
              >
                Check All Stock
              </button>
              <button
                onClick={() => (showAddForm ? resetAddForm() : setShowAddForm(true))}
                className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors"
              >
                {showAddForm ? 'Close Form' : '+ Add Product'}
              </button>
            </div>
          </div>

          {/* Products with no unique outbound name. They are SAFE — the real name can
              never reach Royal Mail or Fena — but they all ship as the same generic
              default, so the packer cannot tell them apart on the manifest. Normally
              impossible (a name is assigned on save); this catches a product created
              before that existed, or one saved while the reserve pool was exhausted.
              Fail loud: silence is how "every product is unique" stops being true. */}
          {unnamedProducts.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-4">
              <p className="font-semibold mb-1">
                {unnamedProducts.length} product{unnamedProducts.length === 1 ? '' : 's'} ship without a unique shipping description
              </p>
              <p className="text-amber-700 leading-snug">
                {unnamedProducts.map(p => p.name).join(', ')} - {unnamedProducts.length === 1 ? 'it' : 'they'} will
                reach Royal Mail and Fena as &ldquo;Cosmetic Item&rdquo;. Nothing leaks, but you cannot tell
                {unnamedProducts.length === 1 ? ' it' : ' them'} apart on the paperwork. Open{' '}
                {unnamedProducts.length === 1 ? 'it' : 'each'} and set a <strong>Shipping description</strong>, or
                re-save to have one assigned automatically.
              </p>
            </div>
          )}

          {/* Inline action error — replaces alert() for visibility/stock/availability failures */}
          {actionError && (
            <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-4">
              <span>{actionError}</span>
              <button onClick={() => setActionError('')} className="shrink-0 text-red-400 hover:text-red-600 transition-colors" aria-label="Dismiss error">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Says where a product went when hiding it makes its card leave the
              Live tab, so that never reads as "I have just deleted it". */}
          {actionNotice && (
            <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 text-green-800 text-xs px-4 py-3 mb-4">
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice('')} className="shrink-0 text-green-500 hover:text-green-700 transition-colors" aria-label="Dismiss message">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <AddProductFormPanel
            showAddForm={showAddForm}
            addForm={addForm}
            setAddForm={setAddForm}
            setAddSlugTouched={setAddSlugTouched}
            allCategories={allCategories}
            updateAddName={updateAddName}
            updateVariant={updateVariant}
            addVariantRow={addVariantRow}
            removeVariantRow={removeVariantRow}
            handleUploadingChange={handleUploadingChange}
            uploadingCount={uploadingCount}
            addError={addError}
            addSaving={addSaving}
            submitAddProduct={submitAddProduct}
            resetAddForm={resetAddForm}
          />

          <ProductFilterBar
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            statusCounts={statusCounts}
            certFilter={certFilter}
            setCertFilter={setCertFilter}
            certCounts={certCounts}
            certAuditOpen={certAuditOpen}
            setCertAuditOpen={setCertAuditOpen}
            search={search}
            setSearch={setSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            allCategories={allCategories}
            sort={sort}
            setSort={setSort}
            filtered={filtered}
            products={products}
          />

          <CertificateAuditPanel certAuditOpen={certAuditOpen} certAudit={certAudit} />


          {/* Table — waits for catalogue overrides to load so a just-edited
              product doesn't briefly show its stale static size/price
              before the real saved value appears. */}
          {!overridesLoaded ? (
            <div className="flex items-center justify-center py-24">
              <svg className="w-6 h-6 text-gold-400 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
          <>
          <ProductCardList
            filtered={filtered}
            hiddenSlugs={hiddenSlugs}
            membersOnlySlugs={membersOnlySlugs}
            membersOnlyLoaded={membersOnlyLoaded}
            membersOnlySaving={membersOnlySaving}
            toggleMembersOnly={toggleMembersOnly}
            stock={stock}
            soldCounts={soldCounts}
            togglingSlug={togglingSlug}
            deletingSlug={deletingSlug}
            availabilitySavingSlug={availabilitySavingSlug}
            availabilitySavedSlug={availabilitySavedSlug}
            renderPriceCell={renderPriceCell}
            renderStockEditor={renderStockEditor}
            toggleVisibility={toggleVisibility}
            startEdit={startEdit}
            deleteProduct={deleteProduct}
            updateVisibilityChoice={updateVisibilityChoice}
            editCertificateFor={editCertificateFor}
            products={products}
          />

          <ProductTable
            filtered={filtered}
            hiddenSlugs={hiddenSlugs}
            membersOnlySlugs={membersOnlySlugs}
            membersOnlyLoaded={membersOnlyLoaded}
            membersOnlySaving={membersOnlySaving}
            toggleMembersOnly={toggleMembersOnly}
            stock={stock}
            soldCounts={soldCounts}
            togglingSlug={togglingSlug}
            deletingSlug={deletingSlug}
            availabilitySavingSlug={availabilitySavingSlug}
            availabilitySavedSlug={availabilitySavedSlug}
            renderPriceCell={renderPriceCell}
            renderStockEditor={renderStockEditor}
            toggleVisibility={toggleVisibility}
            startEdit={startEdit}
            deleteProduct={deleteProduct}
            updateVisibilityChoice={updateVisibilityChoice}
            editCertificateFor={editCertificateFor}
            editingId={editingId}
            visibilitySavedSlug={visibilitySavedSlug}
          />

          {/* Products Kieran has stopped stocking (task 3378ea2d revision):
              off the shop, off the low-stock warning, revivable two ways. */}
          <RetiredProductsPanel />
          </>
          )}


          <EditProductDrawer
            editingId={editingId}
            editingProduct={editingProduct}
            setEditingId={setEditingId}
            certPreviewOpen={certPreviewOpen}
            setCertPreviewOpen={setCertPreviewOpen}
            editForm={editForm}
            setEditForm={setEditForm}
            editHidden={editHidden}
            setEditHidden={setEditHidden}
            editVariants={editVariants}
            updateEditVariant={updateEditVariant}
            addEditVariantRow={addEditVariantRow}
            removeEditVariantRow={removeEditVariantRow}
            editShipping={editShipping}
            setEditShipping={setEditShipping}
            editKeywordsInput={editKeywordsInput}
            setEditKeywordsInput={setEditKeywordsInput}
            certDrafts={certDrafts}
            certTarget={certTarget}
            setCertTarget={setCertTarget}
            editCertificate={editCertificate}
            setEditCertificate={setEditCertificate}
            updateEditCertificateRow={updateEditCertificateRow}
            addEditCertificateRow={addEditCertificateRow}
            removeEditCertificateRow={removeEditCertificateRow}
            certFormat={certFormat}
            setCertFormat={setCertFormat}
            certFormatChanged={certFormatChanged}
            setStandardTest={setStandardTest}
            setStandardSummary={setStandardSummary}
            updateEditInfoRow={updateEditInfoRow}
            addEditInfoRow={addEditInfoRow}
            removeEditInfoRow={removeEditInfoRow}
            editStorageInstructions={editStorageInstructions}
            setEditStorageInstructions={setEditStorageInstructions}
            toggleHiddenSpec={toggleHiddenSpec}
            allCategories={allCategories}
            handleUploadingChange={handleUploadingChange}
            uploadingCount={uploadingCount}
            savingEdit={savingEdit}
            saveEdit={saveEdit}
            editError={editError}
            setEditError={setEditError}
          />

          {/* This note used to say "There is no separate Delete" while a Delete button sat on
              every row three lines above it. Both cannot be true, and the reader is left to
              guess which. It now says what each of the two buttons really does. */}
          <p className="text-[9px] text-stone-300 mt-4">
            Note: every change made here - Live/Hidden status, stock numbers, edited details and newly created products -
            is saved to the database and takes effect on the live site immediately. To take a product off the shop use
            &ldquo;Disable&rdquo;, which can always be switched back on without losing anything. &ldquo;Undo Edits&rdquo; on a
            built-in product throws away your changes and puts the original back; it does not remove the product.
            &ldquo;Delete&rdquo; only appears on products you created yourself, and that one really does remove it.
          </p>
        </div>
      </main>

      <StockReportModal open={stockReportOpen} onClose={() => setStockReportOpen(false)} />
    </div>
  );
}
