'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface CodeRow {
  id: number;
  code: string;
  product_name: string | null;
  batch_ref: string | null;
  purity: string | null;
  status: 'unused' | 'used';
  used_at: string | null;
  used_by_email: string | null;
  used_by_order_number: string | null;
  created_at: string;
}

export default function AdminVerificationCodesPage() {
  const [codes, setCodes] = useState<CodeRow[] | null>(null);
  const [counts, setCounts] = useState<{ total: number; unused: number; used: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [setupMessage, setSetupMessage] = useState('');
  const [csv, setCsv] = useState('');
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  async function loadCodes(searchQuery = '') {
    try {
      const url = searchQuery
        ? `/api/admin/verification-codes?search=${encodeURIComponent(searchQuery)}`
        : '/api/admin/verification-codes';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setCodes(data.codes);
        setCounts(data.counts ?? null);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load codes.');
      }
    } catch {
      setLoadError('Failed to load codes.');
    }
  }

  useEffect(() => {
    loadCodes();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    await loadCodes(search.trim());
    setSearching(false);
  }

  function clearSearch() {
    setSearch('');
    loadCodes('');
  }

  async function runSetup() {
    setSetupStatus('loading');
    try {
      const res = await fetch('/api/admin/db/setup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSetupStatus('done');
        setSetupMessage(data.message || 'Database is ready.');
        loadCodes();
      } else {
        setSetupStatus('error');
        setSetupMessage(data.error || 'Setup failed.');
      }
    } catch {
      setSetupStatus('error');
      setSetupMessage('Setup failed.');
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csv.trim()) return;
    setImportStatus('loading');
    try {
      const res = await fetch('/api/admin/verification-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportStatus('done');
        setImportMessage(`Imported ${data.inserted} new code(s). Skipped ${data.skipped} duplicate/existing code(s).`);
        setCsv('');
        loadCodes();
      } else {
        setImportStatus('error');
        setImportMessage(data.error || 'Import failed.');
      }
    } catch {
      setImportStatus('error');
      setImportMessage('Import failed.');
    }
  }


  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Verification Codes</h1>
          <p className="text-xs text-stone-400 mb-8">
            Manage one-time-use product verification codes for the public Verify Product checker.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              <p className="mb-2">{loadError}</p>
              <p className="mb-3">
                If this is the first time you are setting this up, run the one-time database setup below to create
                the required tables, then try again.
              </p>
              <button
                onClick={runSetup}
                disabled={setupStatus === 'loading'}
                className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {setupStatus === 'loading' ? 'Setting up…' : 'Run Database Setup'}
              </button>
              {setupMessage && (
                <p className={`mt-2 ${setupStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>{setupMessage}</p>
              )}
            </div>
          )}

          {/* Bulk import */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">Bulk Import Codes</h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Paste one code per line. Optionally add product name, batch reference and purity separated by commas:
              <br />
              <code className="bg-stone-100 px-1.5 py-0.5 text-[11px]">WG-2025-1042A, Retatrutide 10mg, BR-2025-04, 99.2%</code>
              <br />
              A bare code on its own line (e.g. <code className="bg-stone-100 px-1.5 py-0.5 text-[11px]">WG-2025-1042A</code>) is also accepted.
              Duplicate codes are skipped automatically.
            </p>
            <form onSubmit={handleImport} className="flex flex-col gap-3">
              <textarea
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                rows={6}
                placeholder={'WG-2025-1042A, Retatrutide 10mg, BR-2025-04, 99.2%\nWG-2025-1043B, Semaglutide 5mg, BR-2025-05, 98.9%'}
                className="border border-stone-200 px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-gold-400 transition-colors"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={importStatus === 'loading'}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {importStatus === 'loading' ? 'Importing…' : 'Import Codes'}
                </button>
                {importMessage && (
                  <p className={`text-xs ${importStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>{importMessage}</p>
                )}
              </div>
            </form>
          </div>

          {/* Code search. Pinned at PAGE level, not inside the card: the card holds
              only this one row, so pinning within it did nothing — measured at
              -1799px after a 2600px scroll, because a sticky element can never
              outlive its own container and this container is 70px tall. The list
              it searches is the separate card below, 23,000px of it. */}
          <AdminStickyControls inset="p-8">
          <div className="bg-white border border-stone-200 mb-2">
            <div className="px-6 py-4">
              <form onSubmit={handleSearch} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by code, e.g. I2L3VE"
                  className="flex-1 border border-stone-200 px-3 py-2 text-xs font-mono focus:outline-none focus:border-gold-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.15em] uppercase px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {searching ? 'Searching…' : 'Search'}
                </button>
                {search && (
                  <button type="button" onClick={clearSearch} className="text-[10px] tracking-[0.12em] uppercase text-stone-400 hover:text-stone-600 px-2">
                    Clear
                  </button>
                )}
              </form>
            </div>
          </div>
          </AdminStickyControls>

          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-800">
                  {search ? `Results for "${search}"` : `All Codes ${counts ? `(${counts.total.toLocaleString()})` : ''}`}
                </h2>
                {counts && !search && (
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {counts.unused.toLocaleString()} unused · {counts.used.toLocaleString()} used
                    {codes && codes.length < counts.total ? ` · showing the most recent ${codes.length.toLocaleString()}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => loadCodes(search)} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 border-b border-stone-100">
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Used By</th>
                    <th className="px-6 py-3">Used At</th>
                  </tr>
                </thead>
                <tbody>
                  {codes && codes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-stone-400">
                        No verification codes yet. Import some using the form above.
                      </td>
                    </tr>
                  )}
                  {codes?.map((row) => (
                    <tr key={row.id} className="border-b border-stone-50">
                      <td className="px-6 py-3 font-mono text-stone-700">{row.code}</td>
                      <td className="px-6 py-3 text-stone-600">{row.product_name || '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${
                          row.status === 'used' ? 'bg-stone-100 text-stone-500' : 'bg-green-50 text-green-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-stone-500">
                        {row.used_by_email || row.used_by_order_number || '—'}
                      </td>
                      <td className="px-6 py-3 text-stone-400">
                        {row.used_at ? new Date(row.used_at).toLocaleString('en-GB') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
