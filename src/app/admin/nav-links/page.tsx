'use client';

import { useEffect, useState, type FormEvent } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useConfirm } from '@/components/admin/ConfirmProvider';

interface NavLinkRow {
  id: number;
  label: string;
  href: string;
  sort_order: number;
}

export default function AdminNavLinksPage() {
  const confirm = useConfirm();
  const [links, setLinks] = useState<NavLinkRow[] | null>(null);
  const [loadError, setLoadError] = useState('');

  const [newLabel, setNewLabel] = useState('');
  const [newHref, setNewHref] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editHref, setEditHref] = useState('');
  const [saving, setSaving] = useState<number | null>(null);
  const [editError, setEditError] = useState('');

  const [deleting, setDeleting] = useState<number | null>(null);
  const [reordering, setReordering] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  function load() {
    fetch('/api/admin/nav-links')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.links)) setLinks(data.links);
        else setLoadError('Failed to load nav links.');
      })
      .catch(() => setLoadError('Failed to load nav links.'));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    const href = newHref.trim();
    if (!label || !href) return;

    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/admin/nav-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, href }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.error || 'Failed to create link.');
        return;
      }
      setNewLabel('');
      setNewHref('');
      load();
    } catch {
      setCreateError('Failed to create link.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(row: NavLinkRow) {
    setEditingId(row.id);
    setEditLabel(row.label);
    setEditHref(row.href);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel('');
    setEditHref('');
    setEditError('');
  }

  async function handleSave(row: NavLinkRow) {
    const label = editLabel.trim();
    const href = editHref.trim();
    if (!label || !href) return;

    setSaving(row.id);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/nav-links/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, href }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEditError(data?.error || 'Failed to save link.');
        return;
      }
      setLinks(prev => prev?.map(l => (l.id === row.id ? { ...l, label, href } : l)) ?? prev);
      cancelEdit();
    } catch {
      setEditError('Failed to save link.');
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(row: NavLinkRow) {
    if (!(await confirm({
      title: `Remove "${row.label}" from the admin menu?`,
      body: 'You can add it back later.',
      confirmLabel: 'Yes, remove it',
      cancelLabel: 'Keep it',
    }))) return;

    setDeleting(row.id);
    setActionError('');
    try {
      const res = await fetch(`/api/admin/nav-links/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || 'Failed to delete link.');
        return;
      }
      setLinks(prev => prev?.filter(l => l.id !== row.id) ?? prev);
    } finally {
      setDeleting(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!links) return;
    const target = index + direction;
    if (target < 0 || target >= links.length) return;

    const reordered = [...links];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setLinks(reordered);
    setReordering(reordered[target].id);
    setActionError('');

    try {
      const res = await fetch('/api/admin/nav-links/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: reordered.map(l => l.id) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || 'Failed to save order.');
        load();
      }
    } finally {
      setReordering(null);
    }
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-2xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Nav Links</h1>
          <p className="text-xs text-stone-500 mb-8">
            Add your own extra links to the admin sidebar - they appear in a &ldquo;Custom&rdquo; group below
            the built-in pages, so the standard admin navigation can never be hidden or lost by accident. Links can
            point to another page on this site (start with /) or an external site (start with https://).
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}
          {actionError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-6">
              {actionError}
            </div>
          )}

          {/* Add link */}
          <form onSubmit={handleCreate} className="bg-white border border-stone-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-stone-800 mb-3">Add link</h2>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-start">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Label, e.g. Supplier Docs"
                maxLength={60}
                className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-gold-400"
              />
              <input
                type="text"
                value={newHref}
                onChange={e => setNewHref(e.target.value)}
                placeholder="/admin/some-page or https://..."
                className="w-full border border-stone-200 px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold-400"
              />
              <button
                type="submit"
                disabled={creating || !newLabel.trim() || !newHref.trim()}
                className="text-[10px] tracking-[0.15em] uppercase px-5 py-2.5 bg-gold-700 text-white hover:bg-gold-800 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {creating ? 'Adding…' : 'Add'}
              </button>
            </div>
            {createError && <p className="text-[10px] text-red-500 mt-2">{createError}</p>}
          </form>

          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-800">Custom links</h2>
            </div>
            {links === null ? (
              <p className="px-6 py-5 text-xs text-stone-500">Loading…</p>
            ) : links.length === 0 ? (
              <p className="px-6 py-5 text-xs text-stone-500">No custom links yet - add one above.</p>
            ) : (
              <div className="divide-y divide-stone-50">
                {links.map((row, index) => (
                  <div key={row.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || reordering !== null}
                        className="text-stone-300 hover:text-gold-700 disabled:opacity-30 disabled:hover:text-stone-300 transition-colors text-xs px-1"
                        title={index === 0 ? 'This one is already at the top.' : 'Move up'}
                        aria-label="Move up"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === links.length - 1 || reordering !== null}
                        className="text-stone-300 hover:text-gold-700 disabled:opacity-30 disabled:hover:text-stone-300 transition-colors text-xs px-1"
                        title={index === links.length - 1 ? 'This one is already at the bottom.' : 'Move down'}
                        aria-label="Move down"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      {editingId === row.id ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editLabel}
                              onChange={e => setEditLabel(e.target.value)}
                              maxLength={60}
                              autoFocus
                              className="flex-1 min-w-0 border border-stone-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-gold-400"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editHref}
                              onChange={e => setEditHref(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSave(row); }
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              className="flex-1 min-w-0 border border-stone-200 px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:border-gold-400"
                            />
                            <button
                              onClick={() => handleSave(row)}
                              disabled={saving === row.id || !editLabel.trim() || !editHref.trim()}
                              className="text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 bg-gold-700 text-white hover:bg-gold-800 transition-colors disabled:opacity-50 shrink-0"
                            >
                              {saving === row.id ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving === row.id}
                              className="text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 border border-stone-200 text-stone-500 hover:border-stone-300 transition-colors disabled:opacity-50 shrink-0"
                            >
                              Cancel
                            </button>
                          </div>
                          {editError && <p className="text-[10px] text-red-500">{editError}</p>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div>
                            <p className="text-sm text-stone-700 font-medium truncate">{row.label}</p>
                            <p className="text-[10px] text-stone-500 font-mono truncate">{row.href}</p>
                          </div>
                          <button
                            onClick={() => startEdit(row)}
                            className="flex items-center gap-1 text-[9px] tracking-[0.15em] uppercase text-white bg-stone-700 hover:bg-stone-800 active:bg-stone-900 px-2.5 py-1 transition-colors shrink-0"
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDelete(row)}
                      disabled={deleting === row.id}
                      className="text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-stone-200 text-stone-500 hover:border-red-300 hover:text-red-400 transition-colors disabled:opacity-30 shrink-0"
                    >
                      {deleting === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
