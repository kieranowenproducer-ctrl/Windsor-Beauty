'use client';

import { useEffect, useMemo, useState } from 'react';
import { PACKAGE_FORMATS, type Category, type ProductShipping } from '@/data/products';
import { CATEGORY_SHIPPING_DEFAULTS, VARIANT_SHIPPING_OVERRIDES } from '@/data/shippingDefaults';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface Row {
  slug: string;
  productName: string;
  dosage: string;
  categories: Category[];
  format: 'pen' | 'vial';
  shipping?: ProductShipping;
  productShipping?: ProductShipping;
}

// The two-way format split came with the copied codebase. It is no longer shown on this
// page (the filter stays on 'all'); the labels are kept neutral in case it is ever reached.
const FORMAT_LABELS: Record<Row['format'], string> = { pen: 'Item', vial: 'Item' };

// Editable fields exposed for bulk weight/dimension management. Other
// shipping/customs fields remain editable per-variant on the Products page.
type BulkField = 'weightGrams' | 'lengthMm' | 'widthMm' | 'heightMm' | 'packageFormat';

function rowKey(row: Pick<Row, 'slug' | 'dosage'>) {
  return `${row.slug}::${row.dosage}`;
}

export default function AdminBulkWeightsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [edits, setEdits] = useState<Record<string, Partial<Record<BulkField, string>>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // One draft row, same shape as a single product's editable fields — every
  // non-blank field here is written to every target row on Apply, in one click.
  const [bulkDraft, setBulkDraft] = useState<Partial<Record<BulkField, string>>>({});
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'all' | Row['format']>('all');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  // Shipping settings (free threshold only — other settings handled by dispatch page)
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('');
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [settingsSaveMsg, setSettingsSaveMsg] = useState('');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/admin/products/bulk-shipping')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.rows)) {
          setRows(data.rows);
        } else {
          setLoadError(data.error || 'Failed to load products.');
        }
      })
      .catch(() => setLoadError('Failed to load products.'));

    fetch('/api/admin/shipping-settings')
      .then(r => r.json())
      .then(data => {
        if (data.settings) {
          setFreeShippingThreshold(
            data.settings.freeShippingThreshold > 0
              ? String(data.settings.freeShippingThreshold)
              : ''
          );
          setSettingsLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  function currentValue(row: Row, field: BulkField): string {
    const edited = edits[rowKey(row)]?.[field];
    if (edited !== undefined) return edited;
    const value = row.shipping?.[field];
    return value !== undefined ? String(value) : '';
  }

  function setValue(row: Row, field: BulkField, value: string) {
    const key = rowKey(row);
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  }

  function toggleSelected(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectKeys(keys: string[]) {
    setSelected(prev => {
      const allSelected = keys.every(k => prev.has(k));
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  // Filtering narrows which rows "Apply to All", "Apply Category Defaults"
  // and the header "select all" checkbox act on — lets you e.g. switch to
  // one category then bulk-apply a weight to just those variants.
  const filteredRows = useMemo(() => {
    if (!rows) return [];
    const term = search.trim().toLowerCase();
    return rows.filter(r => {
      if (formatFilter !== 'all' && r.format !== formatFilter) return false;
      if (!term) return true;
      return r.productName.toLowerCase().includes(term) || r.categories.some(c => c.toLowerCase().includes(term));
    });
  }, [rows, search, formatFilter]);

  const groupedRows = useMemo(() => {
    const groups: { slug: string; productName: string; categories: Category[]; format: Row['format']; variants: Row[] }[] = [];
    const bySlug = new Map<string, (typeof groups)[number]>();
    for (const row of filteredRows) {
      let group = bySlug.get(row.slug);
      if (!group) {
        group = { slug: row.slug, productName: row.productName, categories: row.categories, format: row.format, variants: [] };
        bySlug.set(row.slug, group);
        groups.push(group);
      }
      group.variants.push(row);
    }
    return groups;
  }, [filteredRows]);

  function setBulkDraftField(field: BulkField, value: string) {
    setBulkDraft(prev => ({ ...prev, [field]: value }));
  }

  const bulkDraftFields = (Object.entries(bulkDraft) as [BulkField, string | undefined][])
    .filter(([, value]) => value !== undefined && value.trim() !== '');
  const hasBulkDraftValues = bulkDraftFields.length > 0;

  // Colour-codes the "New Values" box and its scope chip to match the
  // current filter. With the Format filter hidden this is always the
  // neutral "all variants" style.
  const scopeBoxClasses =
    formatFilter === 'pen' ? 'bg-gold-50/30 border-gold-200' : formatFilter === 'vial' ? 'bg-stone-100/50 border-stone-200' : 'border-stone-200';
  const scopeChipClasses =
    formatFilter === 'pen'
      ? 'bg-gold-50 border-gold-300 text-gold-700'
      : formatFilter === 'vial'
      ? 'bg-stone-100 border-stone-300 text-stone-600'
      : 'bg-amber-50 border-amber-300 text-amber-700';
  const scopeText =
    formatFilter !== 'all'
      ? `${filteredRows.length} ${FORMAT_LABELS[formatFilter]}${filteredRows.length === 1 ? '' : 's'} only`
      : `all ${filteredRows.length} variants`;
  const scopeTitle =
    formatFilter !== 'all'
      ? `Values entered below are written only to the ${filteredRows.length} ${FORMAT_LABELS[formatFilter].toLowerCase()} variant${filteredRows.length === 1 ? '' : 's'} shown below when you click an Apply button — other products are left untouched. Switch the Format dropdown above to do the other format next.`
      : `Values entered below are written to every one of the ${filteredRows.length} variants currently shown when you click an Apply button. Use the search box above first if you only want to change some of them.`;

  // Applies every non-blank field in bulkDraft (weight, length, width, height,
  // package format) to every target row in one click — matches the same
  // fields shown per-variant below, so there's no need to repeat this once
  // per field.
  function applyBulkDraft(target: 'selected' | 'all') {
    if (!rows || !hasBulkDraftValues) return;
    const targets = target === 'all' ? filteredRows : rows.filter(r => selected.has(rowKey(r)));
    setEdits(prev => {
      const next = { ...prev };
      for (const row of targets) {
        const key = rowKey(row);
        const patch = { ...next[key] };
        for (const [field, value] of bulkDraftFields) patch[field] = value;
        next[key] = patch;
      }
      return next;
    });
  }

  function discardChanges() {
    setEdits({});
    setConfirmingDiscard(false);
  }

  // Fills in category-level Royal Mail weight/format defaults, but only for
  // rows that have no weight set at all (own variant data or product-level
  // fallback): never overwrites an existing manual value. Respects the
  // current search filter, same as "Apply to All".
  function applyCategoryDefaults() {
    if (!rows) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const row of filteredRows) {
        if (currentValue(row, 'weightGrams') !== '' || row.productShipping?.weightGrams !== undefined) continue;

        const category = row.categories.find(c => CATEGORY_SHIPPING_DEFAULTS[c]);
        if (!category) continue;

        const defaults = CATEGORY_SHIPPING_DEFAULTS[category];
        const override = VARIANT_SHIPPING_OVERRIDES[row.slug]?.[row.dosage];
        next[rowKey(row)] = {
          ...next[rowKey(row)],
          weightGrams: String(override?.weightGrams ?? defaults.weightGrams),
          packageFormat: defaults.packageFormat,
        };
      }
      return next;
    });
  }

  const dirtyCount = Object.keys(edits).length;

  const updatesPayload = useMemo(() => {
    if (!rows) return [];
    return Object.entries(edits).map(([key, fields]) => {
      const row = rows.find(r => rowKey(r) === key)!;
      const shipping: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(fields)) {
        if (value === undefined) continue;
        shipping[field] = value;
      }
      return { slug: row.slug, dosage: row.dosage, shipping };
    });
  }, [edits, rows]);

  async function handleSettingsSave() {
    setSettingsSaveStatus('loading');
    setSettingsSaveMsg('');
    const threshold = freeShippingThreshold.trim() ? Number(freeShippingThreshold) : 0;
    if (freeShippingThreshold.trim() && (!Number.isFinite(threshold) || threshold < 0)) {
      setSettingsSaveStatus('error');
      setSettingsSaveMsg('Threshold must be a positive number.');
      return;
    }
    try {
      // Fetch current settings first so we don't overwrite other fields
      const current = await fetch('/api/admin/shipping-settings').then(r => r.json());
      const s = current.settings ?? {};
      const res = await fetch('/api/admin/shipping-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultItemWeightGrams: s.defaultItemWeightGrams ?? 100,
          packagingWeightGrams: s.packagingWeightGrams ?? 50,
          safetyMarginGrams: s.safetyMarginGrams ?? 20,
          defaultPackageFormat: s.defaultPackageFormat ?? 'Large Letter',
          defaultService: s.defaultService ?? 'rm24',
          internationalEnabled: s.internationalEnabled ?? false,
          defaultOriginCountry: s.defaultOriginCountry ?? 'GB',
          ukStandardRate: s.ukStandardRate ?? 4.99,
          internationalRate: s.internationalRate ?? 9.99,
          freeShippingThreshold: threshold,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.settings) {
        setSettingsSaveStatus('done');
        setSettingsSaveMsg('Shipping settings saved.');
        setFreeShippingThreshold(
          data.settings.freeShippingThreshold > 0 ? String(data.settings.freeShippingThreshold) : ''
        );
      } else {
        setSettingsSaveStatus('error');
        setSettingsSaveMsg(data?.error || 'Failed to save settings.');
      }
    } catch {
      setSettingsSaveStatus('error');
      setSettingsSaveMsg('Failed to save settings.');
    }
  }

  async function handleSave() {
    if (updatesPayload.length === 0) return;
    setSaveStatus('loading');
    setSaveMessage('');
    try {
      const res = await fetch('/api/admin/products/bulk-shipping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: updatesPayload }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setSaveStatus('done');
        setSaveMessage(`Updated shipping data for ${data.updated?.length ?? 0} product(s).`);
        setEdits({});
        // Re-fetch to reflect saved values.
        const refreshed = await fetch('/api/admin/products/bulk-shipping').then(r => r.json()).catch(() => null);
        if (refreshed?.rows) setRows(refreshed.rows);
      } else {
        setSaveStatus('error');
        setSaveMessage(data?.errors?.join(' ') || data?.error || 'Failed to save changes.');
      }
    } catch {
      setSaveStatus('error');
      setSaveMessage('Failed to save changes.');
    }
  }


  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Bulk Shipping Weights</h1>
          <p className="text-xs text-stone-400 mb-6">
            Set parcel weight, dimensions and package format across multiple size variants at once. Only the
            fields you change here are updated — other shipping and customs data set on the Products page is
            preserved. Leave a field blank to keep its current value.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">{loadError}</div>
          )}

          {/* Bulk organisation tools — everything in this bordered box configures
              shipping settings or scopes/runs a bulk edit; it's deliberately set
              apart from the actual per-product list below. */}
          <div className="border-2 border-stone-300 p-4 mb-6">
            <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400 font-semibold mb-4">Bulk Organisation</p>

          {/* Free shipping threshold card */}
          <div className="bg-white border border-stone-200 p-4 mb-6">
            <h2 className="text-[9px] tracking-[0.18em] uppercase text-stone-400 font-semibold mb-3">Free Shipping Threshold</h2>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">
                  Minimum order value for free UK shipping (£)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-stone-400">£</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={freeShippingThreshold}
                    onChange={e => setFreeShippingThreshold(e.target.value)}
                    placeholder={settingsLoaded ? '0 = disabled' : 'Loading…'}
                    disabled={!settingsLoaded}
                    className="w-32 border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none disabled:bg-stone-50 disabled:text-stone-400"
                  />
                </div>
                <p className="text-[8px] text-stone-300 mt-1">Leave blank or set to 0 to disable free shipping.</p>
              </div>
              <button
                type="button"
                onClick={handleSettingsSave}
                disabled={settingsSaveStatus === 'loading' || !settingsLoaded}
                className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {settingsSaveStatus === 'loading' ? 'Saving…' : 'Save'}
              </button>
              {settingsSaveMsg && (
                <p className={`text-xs ${settingsSaveStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {settingsSaveMsg}
                </p>
              )}
            </div>
          </div>

          {/* Sticky toolbar: search + bulk apply bar stay visible while scrolling a long product list */}
          <div className="sticky top-0 z-10 bg-stone-50 pt-0 pb-4 -mx-1 px-1">
            <div className="bg-white border border-stone-200 p-4 mb-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">
                    Search products or categories
                  </label>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="e.g. hydra veil, serums…"
                    className="w-full max-w-sm border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                  />
                </div>
                {/* The old two-way Format filter is not shown: this shop has one kind of
                    product. The filter state stays on 'all', so every row is listed. */}
                {(search.trim() || formatFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setFormatFilter('all'); }}
                    className="text-[9px] tracking-wider uppercase text-stone-400 hover:text-gold-700 transition-colors pb-2"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[9px] text-stone-300 ml-auto whitespace-nowrap pb-2">
                  Showing {filteredRows.length} of {rows?.length ?? 0} variants
                </span>
              </div>
            </div>

            <div className="bg-white border border-stone-200 p-4">
              {/* Header row: label + scope chip (hover it for the full explanation) + Clear */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] tracking-widest uppercase text-stone-400">New Values</span>
                  <span
                    className={`text-[9px] tracking-wider uppercase px-2 py-0.5 border cursor-help ${scopeChipClasses}`}
                    title={scopeTitle}
                  >
                    Applies to {scopeText}
                  </span>
                </div>
                {hasBulkDraftValues && (
                  <button
                    type="button"
                    onClick={() => setBulkDraft({})}
                    className="text-[9px] tracking-wider uppercase text-stone-400 hover:text-gold-700 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Same five fields as each variant row below — fill in only the
                  ones you want to change, leave the rest blank. Tinted to match
                  the active Format scope above. */}
              <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 items-end p-3 mb-4 border ${scopeBoxClasses}`}>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Weight (g)</label>
                  <input
                    type="number" min={0} max={30000}
                    value={bulkDraft.weightGrams ?? ''}
                    onChange={e => setBulkDraftField('weightGrams', e.target.value)}
                    placeholder="e.g. 75"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Length (mm)</label>
                  <input
                    type="number" min={0}
                    value={bulkDraft.lengthMm ?? ''}
                    onChange={e => setBulkDraftField('lengthMm', e.target.value)}
                    placeholder="e.g. 220"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Width (mm)</label>
                  <input
                    type="number" min={0}
                    value={bulkDraft.widthMm ?? ''}
                    onChange={e => setBulkDraftField('widthMm', e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Height (mm)</label>
                  <input
                    type="number" min={0}
                    value={bulkDraft.heightMm ?? ''}
                    onChange={e => setBulkDraftField('heightMm', e.target.value)}
                    placeholder="e.g. 35"
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Package Format</label>
                  <select
                    value={bulkDraft.packageFormat ?? ''}
                    onChange={e => setBulkDraftField('packageFormat', e.target.value)}
                    className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                  >
                    <option value="">— Leave unset —</option>
                    {PACKAGE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              </div>

              {/* Left cluster = compose/apply the edit. Right cluster = commit it. */}
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-wrap items-end gap-2 sm:pr-3 sm:border-r border-stone-200">
                  <button
                    type="button"
                    onClick={() => applyBulkDraft('selected')}
                    disabled={!hasBulkDraftValues || selected.size === 0}
                    className="border border-gold-300 text-gold-700 text-[9px] tracking-wider uppercase px-3 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                  >
                    Apply to Selected ({selected.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBulkDraft('all')}
                    disabled={!hasBulkDraftValues || !filteredRows.length}
                    title={
                      formatFilter !== 'all'
                        ? `Applies only to the ${FORMAT_LABELS[formatFilter].toLowerCase()} variants shown below.`
                        : search.trim()
                        ? 'Applies only to the variants matching your search.'
                        : 'Applies to every variant.'
                    }
                    className="border border-gold-300 text-gold-700 text-[9px] tracking-wider uppercase px-3 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                  >
                    {formatFilter !== 'all' ? `Apply to All ${FORMAT_LABELS[formatFilter]}s (${filteredRows.length})` : `Apply to All Visible (${filteredRows.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={applyCategoryDefaults}
                    disabled={!filteredRows.length}
                    title="Fills weight and package format for visible rows with no weight set, using category-level Royal Mail defaults."
                    className="border border-stone-300 text-stone-500 text-[9px] tracking-wider uppercase px-3 py-2 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
                  >
                    Apply Category Defaults
                  </button>
                </div>
                <div className="flex-1" />
                <div className="flex items-end gap-2">
                  {confirmingDiscard ? (
                    <div className="flex items-center gap-2 border border-red-200 bg-red-50 px-3 py-2">
                      <span className="text-[9px] text-red-700">Discard all {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}?</span>
                      <button
                        type="button"
                        onClick={discardChanges}
                        className="text-[9px] tracking-wider uppercase text-red-700 font-semibold hover:text-red-900 transition-colors"
                      >
                        Yes, Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDiscard(false)}
                        className="text-[9px] tracking-wider uppercase text-stone-400 hover:text-stone-600 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDiscard(true)}
                      disabled={dirtyCount === 0}
                      className="border border-stone-300 text-stone-500 text-[9px] tracking-wider uppercase px-3 py-2 hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-40"
                    >
                      Undo All Changes ({dirtyCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={dirtyCount === 0 || saveStatus === 'loading'}
                    className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {saveStatus === 'loading' ? 'Saving…' : `Save Changes (${dirtyCount})`}
                  </button>
                </div>
              </div>
            </div>

            {saveMessage && (
              <p className={`text-xs mt-3 ${saveStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>{saveMessage}</p>
            )}
          </div>
          </div>

          {/* Product groups — each variant's fields wrap onto multiple lines on
              narrower windows instead of forcing the page to scroll sideways. */}
          {!rows && !loadError && (
            <div className="bg-white border border-stone-200 px-4 py-8 text-center text-xs text-stone-400">Loading…</div>
          )}
          {rows && groupedRows.length === 0 && (
            <div className="bg-white border border-stone-200 px-4 py-8 text-center text-xs text-stone-400">
              {search.trim() ? <>No products match &ldquo;{search}&rdquo;.</> : 'No products match this filter.'}
            </div>
          )}

          <div className="space-y-3">
            {groupedRows.map(group => {
              const groupKeys = group.variants.map(rowKey);
              const groupAllSelected = groupKeys.every(k => selected.has(k));
              return (
                <div key={group.slug} className="bg-white border border-stone-200">
                  <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 border-b border-stone-100">
                    <input
                      type="checkbox"
                      checked={groupAllSelected}
                      onChange={() => toggleSelectKeys(groupKeys)}
                      className="accent-gold-500"
                      title="Select all variants of this product"
                    />
                    <div>
                      <p className="text-xs font-medium text-stone-700 flex items-center gap-2">
                        {group.productName}

                      </p>
                      <p className="text-[9px] text-stone-400">
                        {group.categories.join(', ')} · {group.variants.length} size{group.variants.length === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {group.variants.map(row => {
                      const key = rowKey(row);
                      const isDirty = !!edits[key];
                      return (
                        <div
                          key={key}
                          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 items-end px-4 py-3 ${isDirty ? 'bg-gold-50/40' : ''}`}
                        >
                          <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                            <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelected(key)} className="accent-gold-500" />
                            <span className="text-xs text-stone-500 whitespace-nowrap">{row.dosage}</span>
                          </div>
                          <div>
                            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Weight (g)</label>
                            <input
                              type="number" min={0} max={30000}
                              value={currentValue(row, 'weightGrams')}
                              onChange={e => setValue(row, 'weightGrams', e.target.value)}
                              placeholder={row.productShipping?.weightGrams !== undefined ? String(row.productShipping.weightGrams) : '—'}
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Length (mm)</label>
                            <input
                              type="number" min={0}
                              value={currentValue(row, 'lengthMm')}
                              onChange={e => setValue(row, 'lengthMm', e.target.value)}
                              placeholder={row.productShipping?.lengthMm !== undefined ? String(row.productShipping.lengthMm) : '—'}
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Width (mm)</label>
                            <input
                              type="number" min={0}
                              value={currentValue(row, 'widthMm')}
                              onChange={e => setValue(row, 'widthMm', e.target.value)}
                              placeholder={row.productShipping?.widthMm !== undefined ? String(row.productShipping.widthMm) : '—'}
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Height (mm)</label>
                            <input
                              type="number" min={0}
                              value={currentValue(row, 'heightMm')}
                              onChange={e => setValue(row, 'heightMm', e.target.value)}
                              placeholder={row.productShipping?.heightMm !== undefined ? String(row.productShipping.heightMm) : '—'}
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[8px] tracking-widest uppercase text-stone-400 mb-1">Package Format</label>
                            <select
                              value={currentValue(row, 'packageFormat')}
                              onChange={e => setValue(row, 'packageFormat', e.target.value)}
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:border-gold-400 outline-none bg-white"
                            >
                              <option value="">{row.productShipping?.packageFormat ?? '— default —'}</option>
                              {PACKAGE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[9px] text-stone-300 mt-4">
            Blank fields fall back to this product&rsquo;s own shipping defaults (shown as placeholder text), then
            to the global shipping settings on the Dispatch page.
          </p>
        </div>
      </main>
    </div>
  );
}
