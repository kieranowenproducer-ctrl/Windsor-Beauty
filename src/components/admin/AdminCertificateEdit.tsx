'use client';

// Admin-only "Edit" entry point on the shop's certificate modal. Opens the
// same on-certificate editor the Certificate Filler uses, for the dosage the
// customer view is showing, and auto-saves through the same admin catalogue
// endpoint. The button only renders for staff (the page passes it down based
// on the wb_ui_session=staff cookie); real security stays on the API, which
// rejects non-admin sessions.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PRODUCTS, mergeProducts, certificateForDosage, cardImage,
  type Product,
} from '@/data/products';
import { referenceFor } from '@/data/certReference';
import { PRODUCT_IMAGE_SLUGS } from '@/data/productImageSlugs';
import CertificateEditor from '@/app/admin/certificate-filler/CertificateEditor';
import {
  type Draft, type RowMeta, certToDraft, draftToCert, certHasContent, isSpecialKind,
} from '@/app/admin/certificate-filler/shared';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function AdminCertificateEdit({
  slug, dosage, fixCount = 0, onSaved,
}: {
  slug: string;
  dosage: string;
  /**
   * How many problems this certificate has. Above zero the control becomes the red
   * "Fix these N" button, so pressing it opens the certificate itself with the problems
   * marked on the boxes that fix them — rather than sending someone to the back office
   * to hunt for the same fields on a different screen (task f5c8da12).
   */
  fixCount?: number;
  /** Called after the editor closes having saved, so the list behind it can catch up. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<RowMeta | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [otherIds, setOtherIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const draftRef = useRef<Draft | null>(null); draftRef.current = draft;
  const metaRef = useRef<RowMeta | null>(null); metaRef.current = meta;
  const baseRef = useRef<Product | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedAnything = useRef(false);
  const savingNow = useRef(false);

  // Load the merged catalogue (live overrides win) and build the editor state
  // for this product + dosage — the same construction the filler uses.
  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/products/catalogue');
      const data = await res.json();
      const merged = mergeProducts(PRODUCTS, data.overrides || {});
      const product = merged.find((p) => p.slug === slug);
      if (!product) { setError('Product not found in the catalogue.'); return; }
      const variantIndex = Math.max(0, product.variants.findIndex((v) => v.dosage === dosage));
      const origDosage = product.variants[variantIndex]?.dosage ?? dosage;
      const ref = referenceFor(product.slug);
      const resolved = certificateForDosage(product, origDosage);
      const m: RowMeta = {
        key: `${product.slug}#${variantIndex}`, slug: product.slug, product, variantIndex,
        origDosage, variantEnabled: product.variants[variantIndex]?.enabled !== false,
        single: product.variants.length === 1,
        ref, special: resolved?.mode === 'external' || isSpecialKind(ref?.kind),
        imageUrl: resolved?.image || cardImage(product) || (PRODUCT_IMAGE_SLUGS.has(product.slug) ? `/images/products/${product.slug}.jpg` : undefined),
      };
      baseRef.current = product;
      setMeta(m);
      setDraft(certToDraft(resolved, origDosage));
      // duplicate detection: every OTHER certificate number in the catalogue
      const ids = new Set<string>();
      for (const p of merged) {
        p.variants.forEach((v, i) => {
          if (p.slug === product.slug && i === variantIndex) return;
          const c = certificateForDosage(p, v.dosage);
          const id = c?.certificateId?.trim().toUpperCase();
          if (id) ids.add(id);
        });
      }
      setOtherIds(ids);
    } catch {
      setError('Could not load the certificate for editing.');
    }
  }, [slug, dosage]);

  async function doSave() {
    const d = draftRef.current, m = metaRef.current, base = baseRef.current;
    if (!d || !m || !base || savingNow.current) { if (savingNow.current) queueSave(400); return; }
    savingNow.current = true;
    setSaveState('saving');
    try {
      const updated: Product = JSON.parse(JSON.stringify(base));
      const variant = updated.variants[m.variantIndex];
      if (!variant) { setSaveState('error'); return; }
      variant.dosage = d.dosage.trim() || variant.dosage;
      const cert = draftToCert({ ...d, dosage: variant.dosage });
      const finalCert = certHasContent(cert) || cert.fillerStatus ? cert : undefined;
      if (m.single) updated.certificate = finalCert; else variant.certificate = finalCert;
      const res = await fetch(`/api/admin/products/catalogue/${encodeURIComponent(m.slug)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: updated }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        baseRef.current = data.product;
        savedAnything.current = true;
        setSaveState('saved');
        setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1800);
      } else setSaveState('error');
    } catch { setSaveState('error'); }
    finally { savingNow.current = false; }
  }
  function queueSave(delay = 900) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void doSave(), delay);
  }
  const onEdit = useCallback((patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => {
    setDraft((cur) => {
      if (!cur) return cur;
      const p = typeof patch === 'function' ? patch(cur) : patch;
      return { ...cur, ...p };
    });
    queueSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately stable. This setter is handed to every field on the form, and giving it a changing identity would re-render the whole certificate editor on each keystroke.
  }, []);

  // Flush pending edits on close, then refresh so the certificate behind
  // shows exactly what was saved.
  const close = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); void doSave(); }
    setOpen(false);
    if (savedAnything.current) {
      router.refresh();
      // The Certificates screen holds its catalogue in its own state, fetched once on load, so a
      // server refresh alone leaves it showing the problems that were just fixed.
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doSave is read through a ref-backed timer and is deliberately not a dependency: rebuilding close() mid-edit would drop the pending save this function exists to flush.
  }, [router, onSaved]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const duplicate = !!draft && draft.certificateId.trim() !== '' && otherIds.has(draft.certificateId.trim().toUpperCase());

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={fixCount > 0
          ? 'bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-700 transition-colors font-semibold'
          : 'text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-700 transition-colors font-semibold border border-stone-200 hover:border-stone-300 px-2 py-1 rounded-sm'}
        title={fixCount > 0
          ? 'Open this certificate with the problems marked on it, and type the missing values straight onto it'
          : 'Edit this certificate in place (admin only)'}
      >
        {fixCount > 0 ? (fixCount === 1 ? 'Fix it' : `Fix these ${fixCount}`) : 'Edit'}
      </button>
      {open && (
        error ? (
          <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={close} />
            <div className="relative bg-white p-6 max-w-sm text-sm text-stone-600 shadow-2xl">
              {error}
              <button onClick={close} className="block mt-4 text-xs text-gold-700 underline">Close</button>
            </div>
          </div>
        ) : meta && draft ? (
          <div className="relative z-[320]">
            <CertificateEditor
              meta={meta} draft={draft} saveState={saveState}
              duplicate={duplicate} onEdit={onEdit} onClose={close}
            />
          </div>
        ) : (
          <div className="fixed inset-0 z-[320] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" />
            <p className="relative bg-white px-6 py-4 text-sm text-stone-500 shadow-2xl">Loading certificate…</p>
          </div>
        )
      )}
    </>
  );
}
