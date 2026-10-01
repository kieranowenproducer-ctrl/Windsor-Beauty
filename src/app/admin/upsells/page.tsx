'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { PRODUCTS, mergeProducts, effectiveAvailability, type Product } from '@/data/products';

import UpsellMasterSwitch from './UpsellMasterSwitch';
import ManualUpsellEditor from './ManualUpsellEditor';
import CsvImportPanel from './CsvImportPanel';
import ImportedRulesSummary from './ImportedRulesSummary';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import {
  MAX_MANUAL_UPSELLS,
  type UpsellRule,
  type ManualOverride,
  type UpsellSettings,
  type PreviewResult,
  type ImportResult,
  type EffectiveRecommendation,
} from './upsellTypes';

export default function AdminUpsellsPage() {
  const confirm = useConfirm();
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set());
  const [stock, setStock] = useState<Record<string, number>>({});
  const [rules, setRules] = useState<UpsellRule[] | null>(null);
  const [manualOverrides, setManualOverrides] = useState<ManualOverride[]>([]);
  const [settings, setSettings] = useState<UpsellSettings>({ enabled: true, lastImport: null });
  const [loadError, setLoadError] = useState('');
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [fileName, setFileName] = useState('');
  const [csvText, setCsvText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Manual Product Upsell Editor state ──────────────────────────────────
  const [editorTriggerSlug, setEditorTriggerSlug] = useState<string | null>(null);
  const [editorPickerSearch, setEditorPickerSearch] = useState('');
  const [editorAddSearch, setEditorAddSearch] = useState('');
  const [editorHeading, setEditorHeading] = useState('');
  const [editorBasketHeading, setEditorBasketHeading] = useState('');
  const [editorSelected, setEditorSelected] = useState<string[]>([]);
  const [editorHasOverride, setEditorHasOverride] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorClearing, setEditorClearing] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [editorError, setEditorError] = useState('');

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const productMap = useMemo(() => new Map(catalogue.map(p => [p.slug, p])), [catalogue]);
  const manualOverrideMap = useMemo(() => new Map(manualOverrides.map(o => [o.trigger_handle, o])), [manualOverrides]);

  async function loadData() {
    try {
      const res = await fetch('/api/admin/upsells');
      const data = await res.json();
      if (res.ok) {
        setRules(data.rules ?? []);
        setManualOverrides(Array.isArray(data.manualOverrides) ? data.manualOverrides : []);
        const loadedSettings: UpsellSettings = data.settings ?? { enabled: true, lastImport: null };
        setSettings(loadedSettings);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load upsell rules.');
      }
    } catch {
      setLoadError('Failed to load upsell rules.');
    }
  }

  useEffect(() => {
    loadData();
    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});
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
      })
      .catch(() => {});
  }, []);

  async function toggleEnabled() {
    setTogglingEnabled(true);
    try {
      const res = await fetch('/api/admin/upsells/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !settings.enabled }),
      });
      const data = await res.json();
      if (res.ok) setSettings(data.settings);
    } catch {
      // Leave the toggle as-is on failure — next load will reflect the true state.
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportResult({ error: 'Please choose a .csv file.' });
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    setImportResult(null);
    setPreview(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  // Step 1 — validate the file (catalogue cross-check included) without
  // writing anything. The admin reviews this before anything is saved.
  async function handlePreview() {
    if (!csvText.trim()) return;
    setPreviewing(true);
    setPreview(null);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/upsells/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, mode, dryRun: true }),
      });
      const data = await res.json();
      setPreview(data);
    } catch {
      setPreview({ error: 'Could not validate this file. Please try again.' });
    } finally {
      setPreviewing(false);
    }
  }

  // Step 2 — only reachable once a preview with at least one valid row has
  // been shown. Re-sends the same file/mode; the route re-validates from
  // scratch rather than trusting anything cached from the preview step.
  async function handleImport() {
    if (!csvText.trim() || !preview?.preview || !preview.validRows) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/admin/upsells/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: csvText, mode }),
      });
      const data = await res.json();
      setImportResult(data);
      if (res.ok) {
        setFileName('');
        setCsvText('');
        setPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadData();
      }
    } catch {
      setImportResult({ error: 'Import failed. Existing upsell rules have not been changed.' });
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!(await confirm({
      title: 'Delete this upsell rule?',
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/upsells/${id}`, { method: 'DELETE' });
      if (res.ok) setRules(prev => (prev ? prev.filter(r => r.id !== id) : prev));
    } catch {
      // Leave the row in place on failure — admin can retry.
    } finally {
      setDeletingId(null);
    }
  }

  function productLabel(slug: string): string {
    const product = productMap.get(slug);
    return product ? `${product.name} (${slug})` : `${slug} — unknown product`;
  }

  const filteredGroups = useMemo(() => {
    if (!rules) return [];
    const term = search.trim().toLowerCase();
    const matches = (slug: string) => {
      if (!term) return true;
      const product = productMap.get(slug);
      return slug.toLowerCase().includes(term) || (product?.name.toLowerCase().includes(term) ?? false);
    };

    const groups = new Map<string, UpsellRule[]>();
    for (const rule of rules) {
      if (!matches(rule.trigger_handle) && !matches(rule.upsell_handle)) continue;
      const list = groups.get(rule.trigger_handle) ?? [];
      list.push(rule);
      groups.set(rule.trigger_handle, list);
    }
    return Array.from(groups.entries())
      .map(([trigger, list]) => ({ trigger, rules: list.sort((a, b) => a.priority - b.priority) }))
      .sort((a, b) => productLabel(a.trigger).localeCompare(productLabel(b.trigger)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- productLabel is a plain lookup over productMap, which IS listed. Adding the function itself would only defeat the memo, because it is redefined on every render.
  }, [rules, search, productMap]);

  const totalProducts = useMemo(() => {
    if (!rules) return 0;
    const set = new Set<string>();
    rules.forEach(r => { set.add(r.trigger_handle); set.add(r.upsell_handle); });
    return set.size;
  }, [rules]);

  // ── Manual editor logic ──────────────────────────────────────────────────

  async function selectTriggerProduct(slug: string) {
    setEditorTriggerSlug(slug);
    setEditorPickerSearch('');
    setEditorAddSearch('');
    setEditorMessage('');
    setEditorError('');
    setEditorLoading(true);
    try {
      const res = await fetch(`/api/admin/upsells/manual/${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) {
        setEditorError(data.error || 'Could not load this product.');
        setEditorHasOverride(false);
        setEditorHeading('');
        setEditorBasketHeading('');
        setEditorSelected([]);
        return;
      }
      if (data.override) {
        setEditorHasOverride(true);
        setEditorHeading(data.override.heading ?? '');
        setEditorBasketHeading(data.override.basket_heading ?? '');
        setEditorSelected(Array.isArray(data.override.upsell_handles) ? data.override.upsell_handles : []);
      } else {
        setEditorHasOverride(false);
        setEditorHeading('');
        setEditorBasketHeading('');
        const recs: EffectiveRecommendation[] = Array.isArray(data.effective?.recommendations) ? data.effective.recommendations : [];
        setEditorSelected(recs.map(r => r.slug));
      }
    } catch {
      setEditorError('Could not load this product.');
    } finally {
      setEditorLoading(false);
    }
  }

  function addToSelected(slug: string) {
    setEditorSelected(prev => (prev.includes(slug) || prev.length >= MAX_MANUAL_UPSELLS ? prev : [...prev, slug]));
    setEditorAddSearch('');
  }

  function removeFromSelected(slug: string) {
    setEditorSelected(prev => prev.filter(s => s !== slug));
  }

  function moveSelected(index: number, direction: -1 | 1) {
    setEditorSelected(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleEditorSave() {
    if (!editorTriggerSlug) return;
    setEditorSaving(true);
    setEditorMessage('');
    setEditorError('');
    try {
      const res = await fetch(`/api/admin/upsells/manual/${encodeURIComponent(editorTriggerSlug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ heading: editorHeading, basketHeading: editorBasketHeading, upsellHandles: editorSelected }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditorHasOverride(true);
        if (Array.isArray(data.override?.upsell_handles)) setEditorSelected(data.override.upsell_handles);
        const notes: string[] = [];
        if (data.truncatedMessage) notes.push(data.truncatedMessage);
        if (Array.isArray(data.invalidHandles) && data.invalidHandles.length > 0) {
          notes.push(`Skipped ${data.invalidHandles.length} handle(s) that don't match any product: ${data.invalidHandles.join(', ')}.`);
        }
        setEditorMessage(notes.length > 0 ? notes.join(' ') : 'Saved — this product now uses these manually-chosen upsells.');
        loadData();
      } else {
        setEditorError(data.error || 'Could not save.');
      }
    } catch {
      setEditorError('Could not save. Please try again.');
    } finally {
      setEditorSaving(false);
    }
  }

  async function handleEditorClear(slugOverride?: string) {
    const slug = slugOverride ?? editorTriggerSlug;
    if (!slug) return;
    if (!(await confirm({
      title: 'Clear the manual override for this product?',
      body: 'It goes back to the rules from the CSV, or shows nothing if there are none.',
      confirmLabel: 'Yes, clear it',
      cancelLabel: 'Keep it',
    }))) return;
    setEditorClearing(true);
    try {
      const res = await fetch(`/api/admin/upsells/manual/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (res.ok) {
        if (slug === editorTriggerSlug) {
          setEditorHasOverride(false);
          setEditorMessage('Manual override cleared — this product now uses CSV-driven rules again.');
          selectTriggerProduct(slug);
        }
        loadData();
      }
    } catch {
      setEditorError('Could not clear override.');
    } finally {
      setEditorClearing(false);
    }
  }

  const triggerPickerResults = useMemo(() => {
    const term = editorPickerSearch.trim().toLowerCase();
    if (!term) return [];
    return catalogue
      .filter(p => p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term))
      .slice(0, 8);
  }, [editorPickerSearch, catalogue]);

  // Full alphabetical list for the dropdown — a second way to land on a
  // product (browse instead of type), independent of the search box above.
  const sortedCatalogueForPicker = useMemo(
    () => [...catalogue].sort((a, b) => a.name.localeCompare(b.name)),
    [catalogue]
  );

  const addPickerResults = useMemo(() => {
    if (!editorTriggerSlug) return [];
    const excluded = new Set([editorTriggerSlug, ...editorSelected]);
    const term = editorAddSearch.trim().toLowerCase();
    let pool = catalogue.filter(p => !excluded.has(p.slug));
    if (term) pool = pool.filter(p => p.name.toLowerCase().includes(term) || p.slug.toLowerCase().includes(term));
    return pool.slice(0, 8);
  }, [editorAddSearch, catalogue, editorTriggerSlug, editorSelected]);

  // Resolves each selected slug to real display data and flags anything that
  // would actually be excluded at serve time (hidden/out-of-stock/unknown) —
  // so the admin sees, while editing, exactly what a customer will and won't
  // see, not just a list of handles.
  const selectedDetails = useMemo(() => {
    return editorSelected.map(slug => {
      const product = productMap.get(slug);
      if (!product) return { slug, product: null, name: slug, willDisplay: false, reason: 'Unknown product — no longer in the catalogue' };
      if (hiddenSlugs.has(slug)) return { slug, product, name: product.name, willDisplay: false, reason: 'Hidden from the site' };
      const availability = effectiveAvailability(product, stock[slug]);
      if (availability !== 'available') {
        return { slug, product, name: product.name, willDisplay: false, reason: availability === 'out_of_stock' ? 'Out of stock' : 'Coming soon' };
      }
      return { slug, product, name: product.name, willDisplay: true, reason: null };
    });
  }, [editorSelected, productMap, hiddenSlugs, stock]);

  const editorTriggerProduct = editorTriggerSlug ? productMap.get(editorTriggerSlug) : null;
  const previewHeading = editorHeading.trim() || 'Frequently bought with';
  const previewBasketHeading = editorBasketHeading.trim() || 'Frequently bought with';

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Upsell System</h1>
          <p className="text-xs text-stone-400 mb-8 leading-relaxed">
            Two ways to manage upsells: bulk CSV import for setting up many relationships at once, and a manual
            per-product editor for precise day-to-day control. When both exist for the same product, the manual
            choice always wins — CSV import never overwrites a product you&apos;ve manually curated here.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}

          <UpsellMasterSwitch
            settings={settings}
            toggleEnabled={toggleEnabled}
            togglingEnabled={togglingEnabled}
          />

          <ManualUpsellEditor
            editorTriggerSlug={editorTriggerSlug}
            setEditorTriggerSlug={setEditorTriggerSlug}
            editorTriggerProduct={editorTriggerProduct}
            editorPickerSearch={editorPickerSearch}
            setEditorPickerSearch={setEditorPickerSearch}
            triggerPickerResults={triggerPickerResults}
            sortedCatalogueForPicker={sortedCatalogueForPicker}
            selectTriggerProduct={selectTriggerProduct}
            editorHeading={editorHeading}
            setEditorHeading={setEditorHeading}
            editorBasketHeading={editorBasketHeading}
            setEditorBasketHeading={setEditorBasketHeading}
            editorAddSearch={editorAddSearch}
            setEditorAddSearch={setEditorAddSearch}
            addPickerResults={addPickerResults}
            addToSelected={addToSelected}
            editorSelected={editorSelected}
            selectedDetails={selectedDetails}
            removeFromSelected={removeFromSelected}
            moveSelected={moveSelected}
            previewHeading={previewHeading}
            previewBasketHeading={previewBasketHeading}
            handleEditorSave={handleEditorSave}
            editorSaving={editorSaving}
            handleEditorClear={handleEditorClear}
            editorClearing={editorClearing}
            editorHasOverride={editorHasOverride}
            editorLoading={editorLoading}
            editorMessage={editorMessage}
            editorError={editorError}
            manualOverrides={manualOverrides}
            productLabel={productLabel}
          />

          <CsvImportPanel
            mode={mode}
            setMode={setMode}
            fileName={fileName}
            csvText={csvText}
            dragActive={dragActive}
            setDragActive={setDragActive}
            onDrop={onDrop}
            readFile={readFile}
            fileInputRef={fileInputRef}
            handlePreview={handlePreview}
            previewing={previewing}
            preview={preview}
            setPreview={setPreview}
            handleImport={handleImport}
            importing={importing}
            importResult={importResult}
            manualOverrideMap={manualOverrideMap}
          />

          <ImportedRulesSummary
            rules={rules}
            settings={settings}
            search={search}
            setSearch={setSearch}
            filteredGroups={filteredGroups}
            totalProducts={totalProducts}
            productLabel={productLabel}
            manualOverrideMap={manualOverrideMap}
            selectTriggerProduct={selectTriggerProduct}
            handleDelete={handleDelete}
            deletingId={deletingId}
          />
        </div>
      </main>
    </div>
  );
}
