'use client';

// TEMPORARY feature — "Certificate Filler". A guided checklist that lists EVERY
// product + dosage in the live catalogue and lets an admin complete each
// Certificate of Analysis with autosave. It enumerates the merged catalogue at
// runtime (PRODUCTS + custom_products overrides) so no product can be missed,
// holds a full lossless certificate draft per row (never discards existing
// test rows / analytical results / uploaded pages), pre-fills only BLANK
// objective fields from published reference data, and tracks a manual
// completion status per certificate.
//
// To remove the whole feature: delete this folder, src/data/certReference.ts,
// the `fillerStatus` field on ProductCertificate (src/data/products.ts), and the
// sidebar link (search "Certificate Filler").

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import {
  PRODUCTS, mergeProducts, certificateForDosage, cardImage,
  DEFAULT_CERTIFICATE_CAUTION,
  type Product,
  type CertificateFillerStatus,
} from '@/data/products';
import { referenceFor, suggestCertNumber } from '@/data/certReference';
import { PRODUCT_IMAGE_SLUGS } from '@/data/productImageSlugs';
import CertificateEditor from './CertificateEditor';
import {
  type Draft, type RowMeta, type StatusKey, STATUS_META,
  certToDraft, draftToCert, certHasContent,
  TEST_KEYS, VS_KEYS, rowResult, vsValue, setTestRow, setVsRow,
  otherTestRows, otherVsRows, isSpecialKind, requiredMissing, autoStatus,
} from './shared';

// ─────────────────────────────────────────────────────────────── the page ──
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function CertificateFillerPage() {
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [save, setSave] = useState<Record<string, SaveState>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<'all' | 'todo' | 'ready' | 'review' | 'complete' | 'special'>('all');
  const [query, setQuery] = useState('');
  const [certKey, setCertKey] = useState<string | null>(null);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inflight = useRef<Set<string>>(new Set());
  const draftsRef = useRef(drafts); draftsRef.current = drafts;

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const catalogueRef = useRef(catalogue); catalogueRef.current = catalogue;

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then((r) => r.json())
      .then((d) => { setOverrides(d.overrides || {}); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  // Build one row per product × variant (every product, every dosage), and a
  // draft per row seeded from the LIVE certificate. Pre-fill only blank objective
  // fields, never overwriting real data. Runs once (initedRef) so a save never
  // resets a colleague's edits.
  const rows = useMemo<RowMeta[]>(() => {
    const out: RowMeta[] = [];
    for (const product of catalogue) {
      const ref = referenceFor(product.slug);
      product.variants.forEach((v, variantIndex) => {
        const resolved = certificateForDosage(product, v.dosage);
        const external = resolved?.mode === 'external';
        out.push({
          key: `${product.slug}#${variantIndex}`,
          slug: product.slug, product, variantIndex,
          origDosage: v.dosage, variantEnabled: v.enabled !== false,
          single: product.variants.length === 1,
          ref, special: external || isSpecialKind(ref?.kind),
          imageUrl: resolved?.image || cardImage(product) || (PRODUCT_IMAGE_SLUGS.has(product.slug) ? `/images/products/${product.slug}.jpg` : undefined),
        });
      });
    }
    return out;
  }, [catalogue]);
  const rowsRef = useRef(rows); rowsRef.current = rows;

  const initedRef = useRef(false);
  useEffect(() => {
    if (!loaded || initedRef.current) return;
    initedRef.current = true;
    const next: Record<string, Draft> = {};
    for (const m of rows) {
      const resolved = certificateForDosage(m.product, m.origDosage);
      const d = certToDraft(resolved, m.origDosage);
      const fresh = !certHasContent(draftToCert(d));
      if (fresh && m.ref && !isSpecialKind(m.ref.kind)) {
        // seed objective fields (only the confirmed ones) + a suggested number + the standard rows
        if (!d.certificateId) d.certificateId = suggestCertNumber(undefined, m.slug, m.origDosage);
        if (!d.productName) d.productName = m.product.name;
        if (!d.casNumber && m.ref.cas) d.casNumber = m.ref.cas;
        if (!d.molecularFormula && m.ref.formula) d.molecularFormula = m.ref.formula;
        if (!d.molecularWeight && m.ref.mw) d.molecularWeight = m.ref.mw;
        if (!d.pubchemCid && m.ref.cid) d.pubchemCid = m.ref.cid;
        if (!d.storage && m.ref.storage) d.storage = m.ref.storage;
        d.testRows = [
          { test: 'Appearance', specification: 'White to off-white lyophilised powder', result: '' },
          { test: 'Purity (HPLC)', specification: '≥ 98%', result: '' },
          { test: 'Content', specification: `${m.origDosage} (label claim)`, result: '' },
        ];
        d.verificationSummary = [
          { label: 'Batch / Lot', value: '' },
          { label: 'Test Date', value: '' },
        ];
      }
      next[m.key] = d;
    }
    setDrafts(next);
  }, [loaded, rows]);

  // Live duplicate detection across every (product,dose) certificate number.
  const dupNumbers = useMemo(() => {
    const byId = new Map<string, string[]>();
    for (const [key, d] of Object.entries(drafts)) {
      const id = d.certificateId.trim().toUpperCase();
      if (!id) continue;
      byId.set(id, [...(byId.get(id) || []), key]);
    }
    const dup = new Set<string>();
    for (const [id, keys] of Array.from(byId.entries())) if (keys.length > 1) dup.add(id);
    return dup;
  }, [drafts]);
  const isDuplicate = (d: Draft) => d.certificateId.trim() !== '' && dupNumbers.has(d.certificateId.trim().toUpperCase());

  // ── autosave (debounced, serialized per product so doses never clobber) ──
  function queueSave(key: string, delay = 900) {
    if (timers.current[key]) clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => void doSave(key), delay);
  }
  async function doSave(key: string) {
    delete timers.current[key];
    const slug = key.slice(0, key.lastIndexOf('#'));
    if (inflight.current.has(slug)) { queueSave(key, 400); return; } // another dose of this product is saving
    const d = draftsRef.current[key];
    const meta = rowsRef.current.find((m) => m.key === key);
    const base = catalogueRef.current.find((p) => p.slug === slug);
    if (!d || !meta || !base) return;
    inflight.current.add(slug);
    setSave((s) => ({ ...s, [key]: 'saving' }));
    try {
      const updated: Product = JSON.parse(JSON.stringify(base));
      const variant = updated.variants[meta.variantIndex];
      if (!variant) { setSave((s) => ({ ...s, [key]: 'error' })); return; }
      variant.dosage = d.dosage.trim() || variant.dosage; // never empty (parser rejects)
      const cert = draftToCert({ ...d, dosage: variant.dosage });
      const finalCert = certHasContent(cert) || cert.fillerStatus ? cert : undefined;
      if (meta.single) updated.certificate = finalCert; else variant.certificate = finalCert;
      const res = await fetch(`/api/admin/products/catalogue/${encodeURIComponent(slug)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product: updated }),
      });
      const data = await res.json();
      if (res.ok && data?.success) {
        setOverrides((prev) => ({ ...prev, [slug]: data.product }));
        setSave((s) => ({ ...s, [key]: 'saved' }));
        setTimeout(() => setSave((s) => (s[key] === 'saved' ? { ...s, [key]: 'idle' } : s)), 1800);
      } else setSave((s) => ({ ...s, [key]: 'error' }));
    } catch { setSave((s) => ({ ...s, [key]: 'error' })); }
    finally { inflight.current.delete(slug); }
  }
  function edit(key: string, patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) {
    setDrafts((all) => {
      const cur = all[key]; if (!cur) return all;
      const p = typeof patch === 'function' ? patch(cur) : patch;
      return { ...all, [key]: { ...cur, ...p } };
    });
    queueSave(key);
  }
  useEffect(() => {
    const flush = () => { for (const k of Object.keys(timers.current)) void doSave(k); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once listener. Adding doSave would tear down and re-register the pagehide handler on every keystroke, and the whole point of it is to still be attached when the tab closes.
  }, []);

  // ── summary + filtering ──
  const statuses = useMemo(() => rows.map((m) => ({ m, key: m.key, status: drafts[m.key] ? autoStatus(drafts[m.key], m) : 'not_started' as StatusKey })), [rows, drafts]);
  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { not_started: 0, in_progress: 0, ready: 0, needs_review: 0, blocked: 0, complete: 0 };
    for (const s of statuses) c[s.status]++;
    return c;
  }, [statuses]);
  const total = rows.length;
  const pct = total ? Math.round((counts.complete / total) * 100) : 0;

  const visibleKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    return new Set(statuses.filter(({ m, status }) => {
      if (q && !(`${m.product.name} ${m.origDosage} ${m.slug} ${drafts[m.key]?.certificateId ?? ''}`.toLowerCase().includes(q))) return false;
      if (filter === 'todo') return status === 'not_started' || status === 'in_progress';
      if (filter === 'ready') return status === 'ready';
      if (filter === 'review') return status === 'needs_review' || status === 'blocked';
      if (filter === 'complete') return status === 'complete';
      if (filter === 'special') return m.special;
      return true;
    }).map((s) => s.key));
  }, [statuses, filter, query, drafts]);

  // group visible rows by product
  const grouped = useMemo(() => {
    const m = new Map<string, RowMeta[]>();
    for (const meta of rows) {
      if (!visibleKeys.has(meta.key)) continue;
      if (!m.has(meta.slug)) m.set(meta.slug, []);
      m.get(meta.slug)!.push(meta);
    }
    return Array.from(m.entries());
  }, [rows, visibleKeys]);

  const inputCls = 'w-full border border-stone-300 bg-white text-[13px] text-stone-800 px-2.5 py-2 rounded-sm outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-200 transition-colors';
  const labelCls = 'block text-[11px] font-medium text-stone-600 mb-1';
  const helpCls = 'block text-[10.5px] text-stone-400 mt-0.5 leading-snug';

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col lg:flex-row">
      <AdminSidebar />
      <main className="flex-1 min-w-0 px-4 sm:px-8 py-8 max-w-6xl">
        {/* header */}
        <div className="mb-5">
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold-700 mb-1">Temporary tool</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Certificate Filler</h1>
          <p className="text-sm text-stone-500 mt-2 max-w-3xl leading-relaxed">
            Every product and every dosage in the shop is listed below. Open a card to complete its Certificate of
            Analysis. Type the measured values from that batch&apos;s real lab report into the highlighted boxes — every
            change saves on its own. When a certificate is finished and checked, press <b>Mark complete</b>. A certificate
            only appears to customers once you tick <b>Show on site</b>, which unlocks after it is complete.
          </p>
        </div>

        {!loaded ? (
          <p className="text-sm text-stone-400 py-16 text-center">Loading every product…</p>
        ) : (
          <>
            {/* progress summary */}
            <div className="bg-white border border-stone-200 rounded-md p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-stone-700"><b className="text-lg text-stone-900">{counts.complete}</b> of {total} certificates complete</div>
                <div className="text-sm font-semibold text-green-700">{pct}%</div>
              </div>
              <div className="h-2 bg-stone-100 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {(['complete', 'ready', 'in_progress', 'not_started', 'needs_review', 'blocked'] as StatusKey[]).map((k) => (
                  <span key={k} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${STATUS_META[k].cls}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_META[k].dot}`} />{STATUS_META[k].label}: <b>{counts[k]}</b>
                  </span>
                ))}
              </div>
            </div>

            {/* filters + search */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              {([['all', 'All'], ['todo', 'To do'], ['ready', 'Ready to check'], ['review', 'Needs review'], ['complete', 'Complete'], ['special', 'Blends / water / pens']] as const).map(([f, lab]) => (
                <button key={f} onClick={() => setFilter(f)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === f ? 'bg-gold-700 border-gold-500 text-white' : 'bg-white border-stone-200 text-stone-600 hover:border-gold-300'}`}>{lab}</button>
              ))}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, dosage or number…" className="ml-auto text-xs border border-stone-200 rounded-full px-3 py-1.5 w-60 outline-none focus:border-gold-400" />
            </div>

            {grouped.length === 0 ? (
              <p className="text-sm text-stone-400 py-12 text-center">No certificates match this filter.</p>
            ) : (
              <div className="space-y-5">
                {grouped.map(([slug, metas]) => (
                  <section key={slug} className="border border-stone-200 bg-white rounded-md overflow-hidden">
                    <header className="px-5 py-3 border-b border-stone-100 bg-stone-50/70 flex items-center gap-3">
                      <ProductThumb src={metas[0].imageUrl} name={metas[0].product.name} />
                      <div>
                        <h2 className="font-serif text-lg text-stone-800 leading-tight">{metas[0].product.name}</h2>
                        {metas[0].product.brand && <span className="text-[11px] text-stone-400">Brand: {metas[0].product.brand}</span>}
                      </div>
                    </header>
                    <div className="divide-y divide-stone-100">
                      {metas.map((m) => {
                        const d = drafts[m.key]; if (!d) return null;
                        return (
                          <RowEditor
                            key={m.key} meta={m} draft={d} saveState={save[m.key] || 'idle'}
                            isOpen={!!open[m.key]} onToggle={() => setOpen((o) => ({ ...o, [m.key]: !o[m.key] }))}
                            duplicate={isDuplicate(d)} onEdit={(patch) => edit(m.key, patch)}
                            onOpenCertificate={() => setCertKey(m.key)}
                            inputCls={inputCls} labelCls={labelCls} helpCls={helpCls}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div className="mt-8 text-[11px] text-stone-400 border-t border-stone-200 pt-4 leading-relaxed max-w-3xl">
              <b className="text-stone-500">What the colours mean:</b> boxes tinted <span className="text-amber-700">amber</span> still need
              information. <span className="text-sky-700">Blue “published — confirm”</span> fields are pre-filled reference chemistry — check them
              against your real certificate before printing. Nothing you type here changes a product until you tick <b>Show on site</b>.
              Never invent a purity, batch number or test date — leave a box blank if you don&apos;t have the real value yet.
            </div>
          </>
        )}
        {certKey && drafts[certKey] && (() => {
          const meta = rows.find((m) => m.key === certKey);
          if (!meta) return null;
          return (
            <CertificateEditor
              meta={meta} draft={drafts[certKey]}
              saveState={save[certKey] || 'idle'}
              duplicate={isDuplicate(drafts[certKey])}
              onEdit={(patch) => edit(certKey, patch)}
              onClose={() => setCertKey(null)}
            />
          );
        })()}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── row editor ──
function RowEditor({ meta, draft: d, saveState, isOpen, onToggle, duplicate, onEdit, onOpenCertificate, inputCls, labelCls, helpCls }: {
  meta: RowMeta; draft: Draft; saveState: SaveState; isOpen: boolean; onToggle: () => void; duplicate: boolean;
  onEdit: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;
  onOpenCertificate: () => void;
  inputCls: string; labelCls: string; helpCls: string;
}) {
  const status = autoStatus(d, meta);
  const miss = requiredMissing(d, meta);
  const sm = STATUS_META[status];
  const external = d.mode === 'external';
  const canComplete = miss.length === 0 && !duplicate;
  const canShow = status === 'complete' && !duplicate;

  const setTest = (k: keyof typeof TEST_KEYS, field: 'result' | 'specification', v: string) => onEdit((cur) => ({ testRows: setTestRow(cur.testRows, k, field, v) }));
  const setVs = (k: keyof typeof VS_KEYS, v: string) => onEdit((cur) => ({ verificationSummary: setVsRow(cur.verificationSummary, k, v) }));
  const setStatus = (s?: CertificateFillerStatus) => onEdit({ fillerStatus: s });

  const amber = (filled: boolean) => (!filled ? 'bg-amber-50/60 border-amber-200' : '');
  const refVerify = meta.ref?.verify;

  return (
    <div className={`px-5 py-3 ${status === 'complete' ? 'bg-green-50/40' : ''}`}>
      {/* summary bar (always visible) */}
      <div className="flex flex-wrap items-center gap-2.5 cursor-pointer" onClick={onToggle}>
        <span className="text-stone-400 text-xs w-4">{isOpen ? '▾' : '▸'}</span>
        <span className="text-[11px] tracking-[0.12em] uppercase text-stone-600 bg-stone-100 px-2 py-1 rounded">{d.dosage}{!meta.variantEnabled && <span className="text-stone-400"> · off</span>}</span>
        <span className="text-xs font-mono text-stone-500">{d.certificateId || '(no number)'}</span>
        <span className={`inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] uppercase px-2 py-1 rounded-full ${sm.cls}`}><span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}</span>
        {status !== 'complete' && miss.length > 0 && <span className="text-[11px] text-amber-700">{miss.length} field{miss.length !== 1 ? 's' : ''} left</span>}
        {duplicate && <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-rose-100 text-rose-700">Duplicate number</span>}
        {meta.special && <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-stone-100 text-stone-500">{external ? 'Uploaded cert' : meta.ref?.kind}</span>}
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenCertificate(); }}
            className="text-[11px] px-2.5 py-1 rounded border border-gold-300 text-gold-700 hover:bg-gold-50 transition-colors whitespace-nowrap"
            title="Open the certificate and type straight onto it"
          >
            Edit on certificate
          </button>
          <span className="text-[11px] min-w-[64px] text-right">
            {saveState === 'saving' ? <span className="text-stone-400">Saving…</span> : saveState === 'saved' ? <span className="text-green-600">Saved ✓</span> : saveState === 'error' ? <span className="text-red-500">Save failed</span> : ''}
          </span>
        </span>
      </div>

      {isOpen && (
        <div className="mt-4 space-y-4" onClick={(e) => e.stopPropagation()}>
          {meta.ref?.note && <p className="text-[12px] text-sky-800 bg-sky-50 border border-sky-100 rounded px-3 py-2">{meta.ref.note}</p>}
          {duplicate && (
            <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 flex items-center gap-2 flex-wrap">
              This certificate number is used on another dosage. Each product + dosage needs its own unique number.
              <button className="underline font-medium" onClick={() => onEdit({ certificateId: suggestCertNumber(d.certificateId, meta.slug, d.dosage) })}>Make it unique</button>
            </p>
          )}

          {external ? (
            <div className="text-[13px] text-stone-600 bg-stone-50 border border-stone-200 rounded p-3">
              This product uses an <b>uploaded supplier certificate</b> ({d.externalImages.length} page{d.externalImages.length !== 1 ? 's' : ''}). There are no fields to type.
              Confirm the pages are correct, then mark it complete. Manage the uploaded pages on the <a className="text-gold-700 underline" href={`/admin/products?edit=${meta.slug}&section=certificate`}>Products page</a>.
            </div>
          ) : (
            <>
              {/* IDENTITY */}
              <FieldGroup title="Identity" tone="stone">
                <Field label="Certificate number" help="Your own reference for this exact product + dosage. Must be unique." error={duplicate ? 'Duplicate — give this dosage its own number.' : ''} {...{ labelCls, helpCls }}>
                  <input className={`${inputCls} ${duplicate ? 'border-rose-300 bg-rose-50' : amber(!!d.certificateId.trim())}`} value={d.certificateId} placeholder="e.g. WG-BPC157-10MG" onChange={(e) => onEdit({ certificateId: e.target.value })} />
                </Field>
                <Field label="Product name (as printed)" help="Shown at the top of the certificate." {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.productName} placeholder={meta.product.name} onChange={(e) => onEdit({ productName: e.target.value })} />
                </Field>
                <Field label="Dosage / strength" help="Changing this renames the product variation across the shop — only fix a genuine error." {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.dosage} placeholder={meta.origDosage} onChange={(e) => onEdit({ dosage: e.target.value })} />
                </Field>
              </FieldGroup>

              {/* LAB REPORT — batch-specific */}
              <FieldGroup title="From your lab report (this batch)" tone="amber" subtitle="Type the real measured values from this batch's Certificate of Analysis. Leave blank if you don't have it yet.">
                {!meta.special && <>
                  <Field label="Purity (HPLC) result" help="The measured purity for this batch, e.g. 99.2%." {...{ labelCls, helpCls }}>
                    <input className={`${inputCls} ${amber(!!rowResult(d.testRows, TEST_KEYS.purity.re).trim())}`} value={rowResult(d.testRows, TEST_KEYS.purity.re)} placeholder="e.g. 99.2%" onChange={(e) => setTest('purity', 'result', e.target.value)} />
                  </Field>
                  <Field label="Content result" help={`Measured content/assay for ${d.dosage}, e.g. 10.15mg.`} {...{ labelCls, helpCls }}>
                    <input className={`${inputCls} ${amber(!!rowResult(d.testRows, TEST_KEYS.content.re).trim())}`} value={rowResult(d.testRows, TEST_KEYS.content.re)} placeholder="e.g. 10.15mg" onChange={(e) => setTest('content', 'result', e.target.value)} />
                  </Field>
                  <Field label="Appearance result" help="Choose or type what the lab observed." {...{ labelCls, helpCls }}>
                    <ConformInput value={rowResult(d.testRows, TEST_KEYS.appearance.re)} onChange={(v) => setTest('appearance', 'result', v)} cls={`${inputCls} ${amber(!!rowResult(d.testRows, TEST_KEYS.appearance.re).trim())}`} />
                  </Field>
                </>}
                <Field label="Batch / Lot number" help="The batch or lot number from the lab records." {...{ labelCls, helpCls }}>
                  <input className={`${inputCls} ${amber(!!vsValue(d.verificationSummary, VS_KEYS.batch.re).trim())}`} value={vsValue(d.verificationSummary, VS_KEYS.batch.re)} placeholder="e.g. WG240115" onChange={(e) => setVs('batch', e.target.value)} />
                </Field>
                <Field label="Test date" help="The date the sample was tested." {...{ labelCls, helpCls }}>
                  <input className={`${inputCls} ${amber(!!vsValue(d.verificationSummary, VS_KEYS.testDate.re).trim())}`} value={vsValue(d.verificationSummary, VS_KEYS.testDate.re)} placeholder="e.g. 15/01/2026" onChange={(e) => setVs('testDate', e.target.value)} />
                </Field>
                <Field label="Manufacture date (optional)" help="When the batch was made, if known." {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={vsValue(d.verificationSummary, VS_KEYS.manufactureDate.re)} placeholder="e.g. 10/01/2026" onChange={(e) => setVs('manufactureDate', e.target.value)} />
                </Field>
                <Field label="Retest / expiry date (optional)" help="Retest-by or expiry date, if on the report." {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={vsValue(d.verificationSummary, VS_KEYS.retestDate.re)} placeholder="e.g. 10/01/2028" onChange={(e) => setVs('retestDate', e.target.value)} />
                </Field>
                <Field label="Laboratory (optional)" help="The testing lab's name, if you want it on the certificate." {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={vsValue(d.verificationSummary, VS_KEYS.laboratory.re)} placeholder="e.g. Janoshik Analytical" onChange={(e) => setVs('laboratory', e.target.value)} />
                </Field>
              </FieldGroup>

              {/* REFERENCE — published chemistry */}
              <FieldGroup title="Published reference data — confirm" tone="sky" subtitle="Pre-filled from public chemistry as a starting point. Check each value against your certificate; it is the same for every batch.">
                <Field label="CAS number" help={refVerify?.cas || 'e.g. 137525-51-0'} {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.casNumber} placeholder={refVerify?.cas ? 'Confirm from your COA…' : 'e.g. 137525-51-0'} onChange={(e) => onEdit({ casNumber: e.target.value })} />
                </Field>
                <Field label="Molecular formula" help={refVerify?.formula || 'e.g. C62H98N16O22'} {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.molecularFormula} placeholder={refVerify?.formula ? 'Confirm from your COA…' : 'e.g. C62H98N16O22'} onChange={(e) => onEdit({ molecularFormula: e.target.value })} />
                </Field>
                <Field label="Molecular weight" help={refVerify?.mw || 'e.g. 1419.55 g/mol'} {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.molecularWeight} placeholder={refVerify?.mw ? 'Confirm from your COA…' : 'e.g. 1419.55 g/mol'} onChange={(e) => onEdit({ molecularWeight: e.target.value })} />
                </Field>
                <Field label="PubChem CID" help={refVerify?.cid || 'e.g. 9941957'} {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.pubchemCid} placeholder={refVerify?.cid ? 'Confirm or leave blank…' : 'e.g. 9941957'} onChange={(e) => onEdit({ pubchemCid: e.target.value })} />
                </Field>
                <Field label="Storage" help="How the product should be stored." wide {...{ labelCls, helpCls }}>
                  <input className={inputCls} value={d.storage} placeholder="e.g. Store lyophilised powder at -20°C…" onChange={(e) => onEdit({ storage: e.target.value })} />
                </Field>
              </FieldGroup>

              {/* OTHER existing rows preserved */}
              <OtherRows draft={d} onEdit={onEdit} inputCls={inputCls} />

              <details className="text-[12px]">
                <summary className="cursor-pointer text-stone-400 select-none">Caution / disclaimer text</summary>
                <textarea className={`${inputCls} mt-2 h-20`} value={d.caution} placeholder={DEFAULT_CERTIFICATE_CAUTION} onChange={(e) => onEdit({ caution: e.target.value })} />
              </details>
            </>
          )}

          {/* ACTIONS */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-100">
            {status === 'complete' ? (
              <button onClick={() => setStatus(undefined)} className="text-xs px-3 py-1.5 rounded border border-stone-200 text-stone-600 hover:border-stone-300">Reopen / mark incomplete</button>
            ) : (
              <button onClick={() => canComplete && setStatus('complete')} disabled={!canComplete} title={canComplete ? 'Mark this certificate as checked and finished' : duplicate ? 'Fix the duplicate number first' : `Still need: ${miss.join(', ')}`} className={`text-xs px-3 py-1.5 rounded ${canComplete ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-stone-100 text-stone-400 cursor-not-allowed'}`}>Mark complete</button>
            )}
            <button onClick={() => setStatus(d.fillerStatus === 'needs_review' ? undefined : 'needs_review')} className={`text-xs px-3 py-1.5 rounded border ${d.fillerStatus === 'needs_review' ? 'bg-violet-100 border-violet-200 text-violet-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>Needs review</button>
            <button onClick={() => setStatus(d.fillerStatus === 'blocked' ? undefined : 'blocked')} className={`text-xs px-3 py-1.5 rounded border ${d.fillerStatus === 'blocked' ? 'bg-rose-100 border-rose-200 text-rose-700' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>Blocked / on hold</button>
            <label className={`ml-auto flex items-center gap-2 text-[12px] ${canShow ? 'text-stone-700 cursor-pointer' : 'text-stone-300 cursor-not-allowed'}`} title={canShow ? 'Show this certificate on the live product page' : 'Mark the certificate complete first'}>
              <input type="checkbox" checked={d.enabled} disabled={!canShow && !d.enabled} onChange={(e) => onEdit({ enabled: e.target.checked })} />
              Show on site
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// ── small presentational helpers ──
function ProductThumb({ src, name }: { src?: string; name: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className="w-9 h-9 rounded bg-stone-200/70 border border-stone-200 flex items-center justify-center text-stone-500 text-sm font-semibold shrink-0" title="No product photo on file">
        {name.trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a 36px admin thumbnail from an arbitrary product URL. next/image would need every host allow-listed and optimises nothing at this size, and the onError fallback below is the behaviour that actually matters here.
  return <img src={src} alt="" className="w-9 h-9 rounded object-cover bg-stone-100 border border-stone-200 shrink-0" onError={() => setErr(true)} />;
}
function FieldGroup({ title, subtitle, tone, children }: { title: string; subtitle?: string; tone: 'stone' | 'amber' | 'sky'; children: ReactNode }) {
  const bar = tone === 'amber' ? 'border-amber-300' : tone === 'sky' ? 'border-sky-300' : 'border-stone-300';
  const txt = tone === 'amber' ? 'text-amber-800' : tone === 'sky' ? 'text-sky-800' : 'text-stone-600';
  return (
    <div className={`border-l-2 ${bar} pl-3`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${txt} mb-0.5`}>{title}</p>
      {subtitle && <p className="text-[11px] text-stone-400 mb-2 leading-snug">{subtitle}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}
function Field({ label, help, error, wide, labelCls, helpCls, children }: { label: string; help?: string; error?: string; wide?: boolean; labelCls: string; helpCls: string; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-3' : ''}>
      <label className={labelCls}>{label}</label>
      {children}
      {error ? <span className="block text-[10.5px] text-rose-600 mt-0.5">{error}</span> : help ? <span className={helpCls}>{help}</span> : null}
    </div>
  );
}
const CONFORM_OPTIONS = ['', 'Conforms', 'White to off-white lyophilised powder', 'Off-white powder', 'Clear colourless solution', 'Pass', 'Does not conform', 'Fail', 'Not tested'];
function ConformInput({ value, onChange, cls }: { value: string; onChange: (v: string) => void; cls: string }) {
  const known = CONFORM_OPTIONS.includes(value);
  return (
    <div className="flex gap-1.5">
      <select className={`${cls} max-w-[130px]`} value={known ? value : '__custom'} onChange={(e) => { if (e.target.value !== '__custom') onChange(e.target.value); }}>
        {CONFORM_OPTIONS.map((o) => <option key={o} value={o}>{o || '— choose —'}</option>)}
        {!known && <option value="__custom">Custom…</option>}
      </select>
      <input className={cls} value={value} placeholder="or type it" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function OtherRows({ draft: d, onEdit, inputCls }: { draft: Draft; onEdit: (patch: (d: Draft) => Partial<Draft>) => void; inputCls: string }) {
  const others = otherTestRows(d.testRows);
  const otherVs = [...otherVsRows(d.verificationSummary)];
  if (others.length === 0 && otherVs.length === 0 && d.analyticalResults.length === 0) return null;
  return (
    <details className="text-[12px]">
      <summary className="cursor-pointer text-stone-500 select-none font-medium">Other rows already on this certificate ({others.length + otherVs.length + d.analyticalResults.length})</summary>
      <div className="mt-2 space-y-2">
        {others.map(({ r, i }) => (
          <div key={`t${i}`} className="grid grid-cols-3 gap-2">
            <input className={inputCls} value={r.test} placeholder="Test" onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].test = e.target.value; return { testRows: t }; })} />
            <input className={inputCls} value={r.specification} placeholder="Specification" onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].specification = e.target.value; return { testRows: t }; })} />
            <input className={inputCls} value={r.result} placeholder="Result" onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].result = e.target.value; return { testRows: t }; })} />
          </div>
        ))}
        {otherVs.map(({ r, i }) => (
          <div key={`v${i}`} className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={r.label} placeholder="Label" onChange={(e) => onEdit((cur) => { const t = cur.verificationSummary.map((x) => ({ ...x })); t[i].label = e.target.value; return { verificationSummary: t }; })} />
            <input className={inputCls} value={r.value} placeholder="Value" onChange={(e) => onEdit((cur) => { const t = cur.verificationSummary.map((x) => ({ ...x })); t[i].value = e.target.value; return { verificationSummary: t }; })} />
          </div>
        ))}
        {d.analyticalResults.map((r, i) => (
          <div key={`a${i}`} className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={r.label} placeholder="Analytical label" onChange={(e) => onEdit((cur) => { const t = cur.analyticalResults.map((x) => ({ ...x })); t[i].label = e.target.value; return { analyticalResults: t }; })} />
            <input className={inputCls} value={r.value} placeholder="Value" onChange={(e) => onEdit((cur) => { const t = cur.analyticalResults.map((x) => ({ ...x })); t[i].value = e.target.value; return { analyticalResults: t }; })} />
          </div>
        ))}
      </div>
    </details>
  );
}
