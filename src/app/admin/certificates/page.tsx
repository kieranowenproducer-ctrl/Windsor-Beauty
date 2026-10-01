'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { PRODUCTS, mergeProducts, type Product } from '@/data/products';
import {
  evaluateCertificate,
  evaluateCertificateForDosage,
  classifyProductFormat,
  findDuplicateCertificateSlugs,
  getCertificateWarnings,
  certificateFieldIssues,
  certificateDosageOptions,
  dosageWorthOpening,
  CERTIFICATE_STATUS_WORDS,
  type CertificateStatus,
  type ProductFormat,
} from '@/lib/certificateAudit';
import { certificateForDosage } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';
import CertificateModal from '@/components/CertificateModal';

// "Live" / "Draft" / "Missing" here and "Certificate Live" / "Not Linked" /
// "No Certificate" on the Products page were the same three states under two
// sets of names, neither of which said what they meant. Both now read from
// CERTIFICATE_STATUS_WORDS.
const STATUS_CONFIG: Record<CertificateStatus, { label: string; dot: string; text: string; bg: string }> = {
  live: { label: CERTIFICATE_STATUS_WORDS.live.label, dot: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50' },
  warning: { label: CERTIFICATE_STATUS_WORDS.warning.label, dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  missing: { label: CERTIFICATE_STATUS_WORDS.missing.label, dot: 'bg-red-400', text: 'text-red-500', bg: 'bg-red-50' },
};

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCertificatesCsv(rows: ReturnType<typeof buildRows>) {
  const header = ['Product', 'Brand', 'Format', 'Dosage', 'Storage', 'Certificate Assigned', 'Live', 'Last Updated', 'Warnings'].join(',');
  const lines = rows.map(r => [
    csvField(r.product.name),
    csvField(r.product.brand ?? ''),
    csvField(r.format),
    csvField(r.product.variants.map(v => v.dosage).join('; ')),
    csvField(r.firstCert?.storage || r.product.storage || ''),
    r.status.status !== 'missing' ? 'Yes' : 'No',
    r.status.status === 'live' ? 'Yes' : 'No',
    csvField(r.updatedAt ?? ''),
    csvField(r.warnings.map(w => w.label).join('; ')),
  ].join(','));
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificates-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Product-level status that respects the per-dosage certificate model: a product
// whose certificates live on its variants (product.certificate empty) must NOT
// show as "Missing". All enabled dosages live -> live; any cert data -> warning;
// nothing anywhere -> missing.
function combinedStatus(product: Product): { status: CertificateStatus; issue?: string } {
  const enabled = product.variants.filter(v => v.enabled !== false);
  if (enabled.length === 0) return evaluateCertificate(product);
  const per = enabled.map(v => evaluateCertificateForDosage(product, v.dosage));
  if (per.every(s => s.status === 'live')) return { status: 'live' };
  if (per.every(s => s.status === 'missing')) return { status: 'missing' };
  const firstIssue = per.find(s => s.status !== 'live');
  return { status: 'warning', issue: firstIssue?.issue ?? 'Some dosages are not live yet.' };
}

// The first dosage-resolved certificate that has content — used for View/Storage
// on products whose certs live per-dosage.
function firstResolvedCert(product: Product) {
  for (const v of product.variants) {
    if (v.enabled === false) continue;
    const c = certificateForDosage(product, v.dosage);
    if (c) return c;
  }
  return product.certificate;
}

// The dosage the viewer opens on. Was "the first one that has a certificate", which is how a
// product with 21 problems on its 20mg certificate opened its clean 10mg one and marked nothing
// (task f5c8da12). Now it is the dosage with the most to fix, and every dosage can be reached
// from the picker inside the viewer.
function firstResolvedDosage(product: Product): string {
  return dosageWorthOpening(product);
}

function buildRows(catalogue: Product[], updatedAtMap: Record<string, string>) {
  const duplicateSlugs = findDuplicateCertificateSlugs(catalogue);
  return catalogue
    .map(product => ({
      product,
      format: classifyProductFormat(product),
      status: combinedStatus(product),
      firstCert: firstResolvedCert(product),
      warnings: getCertificateWarnings(product, duplicateSlugs),
      // Exactly which fields are missing/wrong, per dosage, so the fix is obvious.
      issues: certificateFieldIssues(product),
      // The subset the View button will actually mark: the ones belonging to the
      // certificate it opens. Kept separate so the count on the button matches
      // the count inside the certificate rather than including another dosage's.
      shownDosage: firstResolvedDosage(product),
      shownIssues: certificateFieldIssues(product).filter(i => i.dosage === firstResolvedDosage(product)),
      updatedAt: updatedAtMap[product.slug],
    }))
    // Alphabetical by product name — matches how the Products page reads.
    .sort((a, b) => a.product.name.localeCompare(b.product.name, 'en-GB'));
}

export default function AdminCertificatesPage() {
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [updatedAtMap, setUpdatedAtMap] = useState<Record<string, string>>({});
  const [overridesLoaded, setOverridesLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<'All' | ProductFormat>('All');
  const [brandFilter, setBrandFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | CertificateStatus>('All');
  // Default to the LIVE shop products only, so this list matches the Products
  // page exactly — no products that aren't actually for sale.
  const [visibilityFilter, setVisibilityFilter] = useState<'live' | 'hidden' | 'all'>('live');
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set());
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [viewingSlug, setViewingSlug] = useState<string | null>(null);
  // Which of the product's certificates is on screen. Null means "the one worth opening" — the
  // dosage with the most to fix. Set by the picker inside the viewer (task f5c8da12).
  const [viewingDosage, setViewingDosage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    processed: number; updated: number; unchanged: number; added: number; skipped: number; errors: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    at: string; scanned: number; withIssues: number; fieldFixes: number; warningCount: number; failed?: boolean;
  } | null>(null);

  // One fetch used everywhere fresh data is needed: first load, after a CSV
  // import, and the on-demand "Check all certificates now" button.
  async function refreshCatalogue(): Promise<{ overrides: Record<string, Product>; updatedAt: Record<string, string>; hidden: Set<string> } | null> {
    try {
      const [catRes, visRes] = await Promise.all([
        fetch('/api/admin/products/catalogue'),
        fetch('/api/admin/products/visibility'),
      ]);
      const cat = await catRes.json();
      const vis = await visRes.json().catch(() => ({}));
      const nextOverrides = cat.overrides && typeof cat.overrides === 'object' ? cat.overrides : {};
      const nextUpdatedAt = cat.updatedAt && typeof cat.updatedAt === 'object' ? cat.updatedAt : {};
      const nextHidden = new Set<string>(Array.isArray(vis.hidden) ? vis.hidden : []);
      setOverrides(nextOverrides);
      setUpdatedAtMap(nextUpdatedAt);
      setHiddenSlugs(nextHidden);
      return { overrides: nextOverrides, updatedAt: nextUpdatedAt, hidden: nextHidden };
    } catch {
      return null;
    }
  }

  // The on-demand audit: pull fresh data, re-run the same analysis the table
  // uses, and report a plain verdict.
  async function checkAllCertificates() {
    setChecking(true);
    const fresh = await refreshCatalogue();
    if (!fresh) {
      setCheckResult({ at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), scanned: 0, withIssues: 0, fieldFixes: 0, warningCount: 0, failed: true });
      setChecking(false);
      return;
    }
    const freshRows = buildRows(mergeProducts(PRODUCTS, fresh.overrides), fresh.updatedAt)
      .filter(r => !fresh.hidden.has(r.product.slug));
    const withIssues = freshRows.filter(r => r.issues.length > 0 || r.warnings.length > 0);
    setCheckResult({
      at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      scanned: freshRows.length,
      withIssues: withIssues.length,
      fieldFixes: freshRows.reduce((n, r) => n + r.issues.length, 0),
      warningCount: freshRows.reduce((n, r) => n + r.warnings.length, 0),
    });
    setChecking(false);
  }

  useEffect(() => {
    refreshCatalogue().finally(() => setOverridesLoaded(true));
     
  }, []);

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const rows = useMemo(() => buildRows(catalogue, updatedAtMap), [catalogue, updatedAtMap]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.product.brand) set.add(r.product.brand);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(r => {
      if (query && !`${r.product.name} ${r.product.brand ?? ''} ${r.product.slug}`.toLowerCase().includes(query)) return false;
      const isHidden = hiddenSlugs.has(r.product.slug);
      if (visibilityFilter === 'live' && isHidden) return false;
      if (visibilityFilter === 'hidden' && !isHidden) return false;
      if (formatFilter !== 'All' && r.format !== formatFilter) return false;
      if (brandFilter !== 'All' && r.product.brand !== brandFilter) return false;
      if (statusFilter !== 'All' && r.status.status !== statusFilter) return false;
      if (warningsOnly && r.warnings.length === 0 && r.issues.length === 0) return false;
      return true;
    });
  }, [rows, search, formatFilter, brandFilter, statusFilter, warningsOnly, visibilityFilter, hiddenSlugs]);

  const viewingRow = viewingSlug ? rows.find(r => r.product.slug === viewingSlug) : null;
  // The certificate actually on screen, and its own problems. Falls back to the row's default
  // when no dosage has been picked, so opening the viewer is unchanged.
  const shownDosage = viewingRow ? (viewingDosage ?? viewingRow.shownDosage) : '';
  const shownCert = viewingRow
    ? (certificateForDosage(viewingRow.product, shownDosage) ?? viewingRow.firstCert)
    : undefined;
  const shownIssues = viewingRow ? viewingRow.issues.filter(i => i.dosage === shownDosage) : [];
  const dosageOptions = viewingRow ? certificateDosageOptions(viewingRow.product) : [];

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      {/* overflow-clip, not overflow-y-auto: `auto` makes this a scrolling box, and a
          sticky child attaches to the nearest scrolling box rather than the page. This
          box never actually scrolls (it grows to fit the list; the document is what
          scrolls), so the pinned filter bar below would pin itself to something that
          never moves. Same reasoning as the products page and SiteChrome — measured in
          commit 307b332. The table keeps its own overflow-x-auto, so the 1100px-wide
          row still slides sideways. */}
      <main className="flex-1 overflow-clip">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div>
              <h1 className="font-serif text-2xl text-stone-800 tracking-wide">Certificates</h1>
              <p className="text-xs text-stone-400 mt-1">
                Review every product's Certificate of Analysis in one place — search, filter, and spot likely mismatches before a customer does.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Hidden file input for CSV import */}
              <input
                ref={importInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImporting(true);
                  setImportResult(null);
                  const fd = new FormData();
                  fd.append('file', file);
                  try {
                    const res = await fetch('/api/admin/certificates/csv', { method: 'POST', body: fd });
                    const data = await res.json().catch(() => null);
                    if (res.ok) {
                      setImportResult(data);
                      // Refresh catalogue after successful import
                      refreshCatalogue();
                    } else {
                      setImportResult({ processed: 0, updated: 0, unchanged: 0, added: 0, skipped: 0, errors: [data?.error ?? 'Import failed'] });
                    }
                  } catch {
                    setImportResult({ processed: 0, updated: 0, unchanged: 0, added: 0, skipped: 0, errors: ['Network error — could not reach the server'] });
                  } finally {
                    setImporting(false);
                    if (importInputRef.current) importInputRef.current.value = '';
                  }
                }}
              />
              <button
                onClick={checkAllCertificates}
                disabled={checking || !overridesLoaded}
                className="bg-stone-800 text-white text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-stone-700 transition-colors disabled:opacity-40"
              >
                {checking ? 'Checking…' : 'Check All Certificates Now'}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                disabled={importing || !overridesLoaded}
                className="border border-stone-300 text-stone-600 text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
              >
                {importing ? 'Importing…' : 'Import Certificate Data'}
              </button>
              <a
                href="/api/admin/certificates/csv"
                download
                className={`bg-stone-800 text-white text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-stone-700 transition-colors ${!overridesLoaded ? 'pointer-events-none opacity-40' : ''}`}
              >
                Export Certificate Data
              </a>
              {/* The certificates themselves, as a member sees them, rather than
                  the spreadsheet of their values that the two buttons around
                  this one produce. Task de7e8496. */}
              <Link
                href="/admin/certificates/export"
                className="border border-gold-400 text-gold-700 text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 hover:text-white hover:border-gold-500 transition-colors"
              >
                Print All Certificates
              </Link>
              <button
                onClick={() => exportCertificatesCsv(filtered)}
                disabled={!overridesLoaded}
                className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-40"
              >
                Export Audit CSV
              </button>
            </div>
          </div>

          {/* Filters — pinned, the same way the products filter bar is (task 7fdb1670).
              Scrolling 82 products used to take the search and every filter with it, so
              narrowing the list meant going back to the top each time.

              Offset by the public header stack AND the admin menu bar, both live
              measurements, so the three stack rather than overlap. `--admin-bar-height`
              is 0px above lg, where that bar is hidden, so desktop is unchanged.

              Deliberately NOT pinned: the page title and the five action buttons above.
              They are things you press on arrival, not while scanning, and on a 390px
              phone pinning them would cost most of the screen before a single row.

              The negative margins span the bar across the container's px padding so rows
              pass underneath it, and pt/-mt keep a clean edge against the page above. */}
          <div
            className="sticky z-30 -mx-4 sm:-mx-6 -mt-2 mb-6 px-4 sm:px-6 pt-2 bg-stone-50 border-b border-stone-200 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
            style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px))' }}
          >
          <div className="flex flex-wrap items-center gap-3 mb-3 bg-white border border-stone-200 p-3">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product, brand, or slug…"
              className="flex-1 min-w-[160px] border border-stone-200 px-3 py-2 text-xs text-stone-600 focus:border-gold-400 outline-none"
            />
            <select
              value={visibilityFilter}
              onChange={e => setVisibilityFilter(e.target.value as 'live' | 'hidden' | 'all')}
              className="border border-stone-200 px-2 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
            >
              <option value="live">Live products</option>
              <option value="hidden">Hidden products</option>
              <option value="all">All products</option>
            </select>
            <select
              value={formatFilter}
              onChange={e => setFormatFilter(e.target.value as 'All' | ProductFormat)}
              className="border border-stone-200 px-2 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
            >
              {['All', 'Pen', 'Vial', 'Water', 'Other'].map(f => <option key={f} value={f}>{f === 'All' ? 'All Formats' : f}</option>)}
            </select>
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="border border-stone-200 px-2 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
            >
              <option value="All">All Brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'All' | CertificateStatus)}
              className="border border-stone-200 px-2 py-2 text-xs text-stone-600 bg-white focus:border-gold-400 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="live">{CERTIFICATE_STATUS_WORDS.live.label}</option>
              <option value="warning">{CERTIFICATE_STATUS_WORDS.warning.label}</option>
              <option value="missing">{CERTIFICATE_STATUS_WORDS.missing.label}</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-stone-500 cursor-pointer">
              <input type="checkbox" checked={warningsOnly} onChange={e => setWarningsOnly(e.target.checked)} className="accent-gold-500" />
              Warnings only
            </label>
            <span className="text-[10px] text-stone-300 tracking-wider ml-auto">{filtered.length} of {rows.length} products</span>
          </div>
          </div>

          {/* What the three words in the Certificate column actually mean. */}
          <div className="mb-6 bg-white border border-stone-200 px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['live', 'warning', 'missing'] as CertificateStatus[]).map(status => (
              <div key={status} className="flex items-start gap-2">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_CONFIG[status].dot}`} />
                <span className="text-[11px] text-stone-600 leading-snug">
                  <span className="font-semibold">{CERTIFICATE_STATUS_WORDS[status].label}</span>
                  {' — '}{CERTIFICATE_STATUS_WORDS[status].meaning}
                </span>
              </div>
            ))}
          </div>

          {/* On-demand certificate check verdict */}
          {checkResult && (
            <div className={`mb-4 border px-5 py-4 ${checkResult.failed ? 'border-red-200 bg-red-50' : checkResult.withIssues > 0 ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'}`}>
              <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold mb-2">
                Certificate check · {checkResult.at}
              </p>
              {checkResult.failed ? (
                <p className="text-xs text-red-600">The check could not reach the server. Please try again.</p>
              ) : checkResult.withIssues === 0 ? (
                <p className="text-xs text-green-700">
                  All clear: {checkResult.scanned} live products checked, no certificate issues found.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-4 text-xs text-stone-700">
                  <span><span className="font-semibold">{checkResult.scanned}</span> live products checked</span>
                  <span><span className="font-semibold text-red-600">{checkResult.withIssues}</span> with issues</span>
                  <span><span className="font-semibold">{checkResult.fieldFixes}</span> field fixes needed</span>
                  <span><span className="font-semibold">{checkResult.warningCount}</span> warnings</span>
                  <button
                    onClick={() => { setWarningsOnly(true); setStatusFilter('All'); }}
                    className="text-[9px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 underline underline-offset-2"
                  >
                    Show only products with issues
                  </button>
                </div>
              )}
              <button
                onClick={() => setCheckResult(null)}
                className="mt-2 text-[9px] tracking-[0.15em] uppercase text-stone-300 hover:text-stone-500 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Import result summary */}
          {importResult && (
            <div className="mb-4 border border-stone-200 bg-white px-5 py-4">
              <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold mb-2">Import complete</p>
              <div className="flex flex-wrap gap-4 text-xs text-stone-600 mb-2">
                <span><span className="font-semibold">{importResult.processed}</span> rows processed</span>
                <span><span className="font-semibold">{importResult.updated}</span> updated</span>
                <span><span className="font-semibold">{importResult.unchanged}</span> unchanged</span>
                <span><span className="font-semibold">{importResult.added}</span> newly added</span>
                <span><span className="font-semibold">{importResult.skipped}</span> skipped</span>
              </div>
              {importResult.errors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {importResult.errors.slice(0, 10).map((e, idx) => (
                    <p key={idx} className="text-[10px] text-red-500">{e}</p>
                  ))}
                  {importResult.errors.length > 10 && (
                    <p className="text-[10px] text-red-400">+ {importResult.errors.length - 10} more</p>
                  )}
                </div>
              )}
              <button
                onClick={() => setImportResult(null)}
                className="mt-2 text-[9px] tracking-[0.15em] uppercase text-stone-300 hover:text-stone-500 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {!overridesLoaded ? (
            <div className="flex items-center justify-center py-24">
              <svg className="w-6 h-6 text-gold-400 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeOpacity="0.25" />
                <path d="M21 12a9 9 0 01-9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          ) : (
            <div className="bg-white border border-stone-200 overflow-hidden overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Product</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Brand</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Format</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Storage</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Certificate</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Last Updated</th>
                    <th className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Issues to fix</th>
                    <th className="text-right text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const config = STATUS_CONFIG[row.status.status];
                    return (
                      <tr key={row.product.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-xs font-medium text-stone-700">{row.product.name}</div>
                          <div className="text-[9px] text-stone-300">{row.product.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-stone-500">{row.product.brand ?? <span className="text-stone-300">—</span>}</td>
                        <td className="px-4 py-3 text-xs text-stone-500">{row.format}</td>
                        <td className="px-4 py-3 text-xs text-stone-500 max-w-[220px] truncate" title={row.firstCert?.storage || row.product.storage || ''}>
                          {row.firstCert?.storage || row.product.storage || <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[8px] tracking-wider uppercase px-2 py-0.5 ${config.bg} ${config.text}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
                            {config.label}
                          </span>
                          {/* The reason was only ever a hover tooltip, so nobody read it. */}
                          {row.status.status !== 'live' && (
                            <span className="block text-[9px] text-stone-500 leading-snug mt-1 max-w-[190px]">
                              {row.status.issue ?? CERTIFICATE_STATUS_WORDS[row.status.status].meaning}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[10px] text-stone-400">
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString('en-GB') : <span className="text-stone-300">—</span>}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {row.warnings.length === 0 && row.issues.length === 0 ? (
                            <span className="text-[9px] text-stone-300">None</span>
                          ) : (
                            <div className="space-y-1.5 max-w-[430px]">
                              {row.warnings.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {row.warnings.map(w => (
                                    <span
                                      key={w.label}
                                      title={w.detail}
                                      className="text-[8px] tracking-wider uppercase px-1.5 py-0.5 bg-red-50 text-red-500 border border-red-200"
                                    >
                                      {w.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* Exactly what is missing or wrong, per dosage, with a worked
                                  example for each — so it can be fixed straight away. */}
                              {Array.from(new Set(row.issues.map(i => i.dosage))).map(dosage => {
                                const forDose = row.issues.filter(i => i.dosage === dosage);
                                return (
                                  <div key={dosage} className="border-l-2 border-red-500 bg-red-50 px-2 py-1.5">
                                    <p className="text-[9px] font-bold tracking-wider uppercase text-red-600">
                                      {dosage} — {forDose.length} to fix
                                    </p>
                                    <ul className="mt-0.5 space-y-0.5">
                                      {forDose.map((i, idx) => (
                                        <li key={idx} className="text-[10px] leading-snug text-red-700">
                                          {i.kind === 'missing' ? (
                                            <>Missing <span className="font-semibold">{i.field}</span> <span className="text-red-500">— e.g. {i.example}</span></>
                                          ) : (
                                            <><span className="font-semibold">{i.field}</span>: {i.reason} <span className="text-red-500">— should be e.g. {i.example}</span></>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            {/* Sixty-one of these are greyed out at once, and nothing said why.
                                The reason is simply that there is no certificate to look at. */}
                            <button
                              onClick={() => { setViewingDosage(null); setViewingSlug(row.product.slug); }}
                              disabled={!row.firstCert}
                              title={row.firstCert ? 'Open the certificate with every problem marked on it' : 'There is no certificate on this product yet, so there is nothing to view.'}
                              className={`p-2 -m-2 text-[9px] tracking-wider uppercase transition-colors disabled:opacity-30 ${
                                row.shownIssues.length > 0 ? 'text-red-600 hover:text-red-700 font-semibold' : 'text-stone-400 hover:text-gold-700'
                              }`}
                            >
                              {!row.firstCert
                                ? 'None to view'
                                : row.shownIssues.length > 0
                                  ? `View — ${row.shownIssues.length} marked`
                                  : 'View'}
                            </button>
                            <Link
                              href={`/admin/products?edit=${encodeURIComponent(row.product.slug)}&section=certificate`}
                              className="p-2 -m-2 text-[9px] tracking-wider uppercase text-gold-700 hover:text-gold-700 transition-colors"
                            >
                              Edit
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {viewingRow && (
        <CertificateModal
          open={true}
          onClose={() => { setViewingSlug(null); setViewingDosage(null); }}
          product={viewingRow.product}
          certificate={shownCert}
          // "Fix these 2" opens the certificate on screen with its boxes typeable and every
          // problem marked on the box that clears it, instead of leaving for the back-office
          // product editor (task f5c8da12, second round). Refreshing on close is what makes the
          // row behind it show the problems as gone.
          adminEdit={{
            slug: viewingRow.product.slug,
            dosage: shownDosage,
            onSaved: () => { void refreshCatalogue(); },
          }}
          // Staff-only: marks each problem on the certificate itself. The
          // issues shown are the ones for the dosage this certificate belongs
          // to, so a multi-dosage product does not report another dosage's gaps
          // against the certificate on screen.
          review={{
            issues: shownIssues,
            otherDosages: Array.from(new Set(
              viewingRow.issues
                .filter(issue => issue.dosage !== shownDosage)
                .map(issue => issue.dosage)
            )),
            shownDosage: viewingRow.product.variants.length > 1 ? shownDosage : undefined,
            // Every dosage, with what is wrong with each, so the certificate that HAS the problem
            // can be reached. Without this the viewer showed one dosage and there was no way to
            // see any other (task f5c8da12).
            dosageOptions,
            onSelectDosage: setViewingDosage,
            editHref: `/admin/products?edit=${encodeURIComponent(viewingRow.product.slug)}&section=certificate`,
          }}
        />
      )}
    </div>
  );
}
