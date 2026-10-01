'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { PRODUCTS, activeVariants } from '@/data/products';

interface BatchRow {
  id: number;
  code: string;
  product_name: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

// Product suggestions for the batch "Product" field. A native <datalist> gives a
// dropdown of every catalogue product AND still lets you type anything freely —
// exactly "a pull-down bar OR type it in manually". Deduped "Name Dosage" labels.
const PRODUCT_OPTIONS = Array.from(
  new Set(PRODUCTS.flatMap((p) => activeVariants(p).map((v) => `${p.name} ${v.dosage}`.trim())))
).sort((a, b) => a.localeCompare(b));

export default function AdminBatchesPage() {
  const [batches, setBatches] = useState<BatchRow[] | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [productName, setProductName] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  // Inline row editing.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editProduct, setEditProduct] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/admin/batches');
      const data = await res.json();
      if (res.ok) {
        setBatches(data.batches);
        setSuggestions(data.suggestions ?? []);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load batches.');
      }
    } catch {
      setLoadError('Failed to load batches.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), productName: productName.trim() || null, note: note.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`Saved batch ${data.batch?.code ?? code.trim()}.`);
        setCode('');
        setProductName('');
        setNote('');
        load();
      } else {
        setMessage(data.error || 'Failed to add batch.');
      }
    } catch {
      setMessage('Failed to add batch.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: BatchRow) {
    try {
      await fetch('/api/admin/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, active: !row.active }),
      });
      load();
    } catch {
      /* leave state as-is; a reload will resync */
    }
  }

  function startEdit(row: BatchRow) {
    setEditingId(row.id);
    setEditCode(row.code);
    setEditProduct(row.product_name ?? '');
    setEditNote(row.note ?? '');
    setEditError('');
  }
  function cancelEdit() {
    setEditingId(null);
    setEditError('');
  }
  async function saveEdit(id: number) {
    if (!editCode.trim()) {
      setEditError('Batch code is required.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch('/api/admin/batches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, code: editCode.trim(), productName: editProduct.trim() || null, note: editNote.trim() || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setEditingId(null);
        load();
      } else {
        setEditError(data.error || 'Failed to save changes.');
      }
    } catch {
      setEditError('Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  const activeCount = batches?.filter((b) => b.active).length ?? 0;

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Batches</h1>
          <p className="text-xs text-stone-400 mb-8 leading-relaxed">
            Define the batch identifying codes you use. Once a code is here, you can allocate it to each
            product on an invoice, so every customer can be shown which verified batch their product came from.
          </p>

          {/* Shared product suggestions for the add-form and inline-edit inputs. */}
          <datalist id="wg-batch-products">
            {PRODUCT_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
          </datalist>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              <p className="mb-1">{loadError}</p>
              <p className="text-amber-700">
                If this is the first time, open Verification Codes and run the one-time database setup, then come back.
              </p>
            </div>
          )}

          {/* Add a batch code */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-4">Add a Batch Code</h2>
            <form onSubmit={addBatch} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] tracking-[0.1em] uppercase text-stone-400">Batch code</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. BR-2025-04"
                  className="border border-stone-200 px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] tracking-[0.1em] uppercase text-stone-400">Product (optional)</span>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  list="wg-batch-products"
                  placeholder="Pick a product or type your own"
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] tracking-[0.1em] uppercase text-stone-400">Note (optional)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. 99.2% purity"
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <div className="sm:col-span-3 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || !code.trim()}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Add Batch'}
                </button>
                {message && <p className="text-xs text-stone-600">{message}</p>}
              </div>
            </form>

            {suggestions.length > 0 && (
              <div className="mt-5 pt-4 border-t border-stone-100">
                <p className="text-[9px] tracking-[0.1em] uppercase text-stone-400 mb-2">
                  From your verification codes — click to fill in
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCode(s)}
                      className="text-[11px] font-mono px-2.5 py-1 border border-stone-200 text-stone-600 hover:border-gold-400 hover:text-gold-700 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Batch list */}
          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-800">
                  Your Batches {batches ? `(${batches.length})` : ''}
                </h2>
                {batches && (
                  <p className="text-[10px] text-stone-400 mt-0.5">{activeCount} active</p>
                )}
              </div>
              <button onClick={load} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 border-b border-stone-100">
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Product</th>
                    <th className="px-6 py-3">Note</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batches && batches.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-stone-400">
                        No batches yet. Add your first batch code above.
                      </td>
                    </tr>
                  )}
                  {batches?.map((row) => {
                    const isEditing = editingId === row.id;
                    const statusBadge = (
                      <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${
                        row.active ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'
                      }`}>
                        {row.active ? 'Active' : 'Retired'}
                      </span>
                    );
                    if (isEditing) {
                      return (
                        <tr key={row.id} className="border-b border-stone-50 bg-stone-50/60 align-top">
                          <td className="px-6 py-3">
                            <input value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="Batch code"
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-gold-400" />
                          </td>
                          <td className="px-6 py-3">
                            <input value={editProduct} onChange={(e) => setEditProduct(e.target.value)} list="wg-batch-products" placeholder="Product (optional)"
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gold-400" />
                          </td>
                          <td className="px-6 py-3">
                            <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note (optional)"
                              className="w-full border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gold-400" />
                          </td>
                          <td className="px-6 py-3">{statusBadge}</td>
                          <td className="px-6 py-3 text-right whitespace-nowrap">
                            <button onClick={() => saveEdit(row.id)} disabled={editSaving}
                              className="text-[10px] tracking-[0.12em] uppercase text-gold-700 hover:text-gold-700 transition-colors disabled:opacity-50">
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={cancelEdit}
                              className="ml-3 text-[10px] tracking-[0.12em] uppercase text-stone-400 hover:text-stone-600 transition-colors">
                              Cancel
                            </button>
                            {editError && <p className="text-[10px] text-red-600 mt-1 normal-case tracking-normal">{editError}</p>}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={row.id} className="border-b border-stone-50">
                        <td className="px-6 py-3 font-mono text-stone-700">{row.code}</td>
                        <td className="px-6 py-3 text-stone-600">{row.product_name || '—'}</td>
                        <td className="px-6 py-3 text-stone-500">{row.note || '—'}</td>
                        <td className="px-6 py-3">{statusBadge}</td>
                        <td className="px-6 py-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => startEdit(row)}
                            className="text-[10px] tracking-[0.12em] uppercase text-stone-400 hover:text-gold-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(row)}
                            className="ml-3 text-[10px] tracking-[0.12em] uppercase text-stone-400 hover:text-gold-700 transition-colors"
                          >
                            {row.active ? 'Retire' : 'Reactivate'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
