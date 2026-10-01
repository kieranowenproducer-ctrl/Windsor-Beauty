'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ALL_CATEGORIES } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { useConfirm } from '@/components/admin/ConfirmProvider';

interface CategoryRow {
  category: string;
  enabled: boolean;
  sortOrder: number;
  productCount: number;
}

export default function AdminCategoriesPage() {
  const confirm = useConfirm();
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [reordering, setReordering] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [newCategory, setNewCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameError, setRenameError] = useState('');

  function load() {
    fetch('/api/admin/categories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.categories)) setCategories(data.categories);
        else setLoadError('Failed to load categories.');
      })
      .catch(() => setLoadError('Failed to load categories.'));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleCategory(row: CategoryRow) {
    setToggling(row.category);
    setActionError('');
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: row.category, enabled: !row.enabled }),
      });
      if (res.ok) {
        setCategories(prev => prev?.map(c => c.category === row.category ? { ...c, enabled: !row.enabled } : c) ?? prev);
      } else {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || 'Failed to update category.');
      }
    } finally {
      setToggling(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;

    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.error || 'Failed to create category.');
        return;
      }
      setNewCategory('');
      load();
    } catch {
      setCreateError('Failed to create category.');
    } finally {
      setCreating(false);
    }
  }

  function startEdit(row: CategoryRow) {
    setEditingCategory(row.category);
    setEditValue(row.category);
    setRenameError('');
  }

  function cancelEdit() {
    setEditingCategory(null);
    setEditValue('');
    setRenameError('');
  }

  async function handleRename(row: CategoryRow) {
    const newName = editValue.trim();
    if (!newName || newName === row.category) {
      cancelEdit();
      return;
    }

    setRenaming(row.category);
    setRenameError('');
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: row.category, newName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRenameError(data?.error || 'Failed to rename category.');
        return;
      }
      setCategories(prev => prev?.map(c => c.category === row.category ? { ...c, category: newName } : c) ?? prev);
      setEditingCategory(null);
      setEditValue('');
    } catch {
      setRenameError('Failed to rename category.');
    } finally {
      setRenaming(null);
    }
  }

  async function handleDelete(row: CategoryRow) {
    if (row.productCount > 0) return;
    if (!(await confirm({
      title: `Delete the "${row.category}" category?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete it',
      cancelLabel: 'Keep it',
      tone: 'danger',
    }))) return;

    setDeleting(row.category);
    setActionError('');
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: row.category }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || 'Failed to delete category.');
        return;
      }
      setCategories(prev => prev?.filter(c => c.category !== row.category) ?? prev);
    } finally {
      setDeleting(null);
    }
  }

  async function move(index: number, direction: -1 | 1) {
    if (!categories) return;
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;

    const reordered = [...categories];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setCategories(reordered);
    setReordering(reordered[target].category);
    setActionError('');

    try {
      const res = await fetch('/api/admin/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: reordered.map(c => c.category) }),
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


  const rows = categories ?? ALL_CATEGORIES.map((category, index) => ({ category, enabled: true, sortOrder: index, productCount: 0 }));

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-2xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Categories</h1>
          <p className="text-xs text-stone-400 mb-8">
            Create, rename, reorder, enable/disable, and delete catalogue categories. Disabled categories are
            hidden from the shop&apos;s navigation and filters but stay assigned to their products. A
            category can only be deleted once no products use it.
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

          {/* Add category */}
          <form onSubmit={handleCreate} className="bg-white border border-stone-200 p-6 mb-6">
            <h2 className="text-sm font-semibold text-stone-800 mb-3">Add category</h2>
            <div className="flex gap-3 items-start">
              <div className="flex-1">
                <input
                  type="text"
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  placeholder="e.g. Limited Edition"
                  maxLength={60}
                  className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-gold-400"
                />
                {createError && <p className="text-[10px] text-red-500 mt-1.5">{createError}</p>}
              </div>
              <button
                type="submit"
                disabled={creating || !newCategory.trim()}
                className="text-[10px] tracking-[0.15em] uppercase px-5 py-2.5 bg-gold-700 text-white hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {creating ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>

          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100">
              <h2 className="text-sm font-semibold text-stone-800">All categories</h2>
            </div>
            <div className="divide-y divide-stone-50">
              {rows.map((row, index) => (
                <div key={row.category} className="px-6 py-4 flex items-center justify-between gap-4">
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
                      disabled={index === rows.length - 1 || reordering !== null}
                      className="text-stone-300 hover:text-gold-700 disabled:opacity-30 disabled:hover:text-stone-300 transition-colors text-xs px-1"
                      title={index === rows.length - 1 ? 'This one is already at the bottom.' : 'Move down'}
                        aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingCategory === row.category ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); handleRename(row); }
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            maxLength={60}
                            autoFocus
                            className="flex-1 min-w-0 border border-stone-200 px-2.5 py-1.5 text-sm focus:outline-none focus:border-gold-400"
                          />
                          <button
                            onClick={() => handleRename(row)}
                            disabled={renaming === row.category || !editValue.trim()}
                            className="text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 bg-gold-700 text-white hover:bg-gold-800 transition-colors disabled:opacity-50 shrink-0"
                          >
                            {renaming === row.category ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={renaming === row.category}
                            className="text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 border border-stone-200 text-stone-400 hover:border-stone-300 transition-colors disabled:opacity-50 shrink-0"
                          >
                            Cancel
                          </button>
                        </div>
                        {renameError && <p className="text-[10px] text-red-500 mt-1.5">{renameError}</p>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <p className="text-sm text-stone-700 font-medium truncate">{row.category}</p>
                        <button
                          onClick={() => startEdit(row)}
                          className="flex items-center gap-1 text-[9px] tracking-[0.15em] uppercase text-white bg-stone-700 hover:bg-stone-800 active:bg-stone-900 px-2.5 py-1 transition-colors shrink-0"
                        >
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {row.productCount} product{row.productCount !== 1 ? 's' : ''} ·{' '}
                      {row.enabled ? 'Visible in shop navigation and filters' : 'Hidden from shop navigation and filters'}
                      {/* The reason Delete is greyed out, written on the screen. It used to be
                          in a hover tooltip only, which a touch screen never shows at all. */}
                      {row.productCount > 0 && ' · Delete is off until no products use this category'}
                    </p>
                  </div>

                  {/* A button says what pressing it DOES, never what the thing currently is.
                      This one used to read "Enabled" when the category was on, so the way to
                      hide a category was to press a button labelled "Enabled" — the state is
                      already spelled out in the line above, in words. */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleCategory(row)}
                      disabled={toggling === row.category}
                      className={`text-[10px] tracking-[0.15em] uppercase px-4 py-2 border transition-colors disabled:opacity-50 ${
                        row.enabled
                          ? 'border-gold-300 text-gold-700 hover:border-gold-500 hover:bg-gold-50'
                          : 'border-stone-200 text-stone-400 hover:border-stone-300'
                      }`}
                    >
                      {toggling === row.category ? 'Saving…' : row.enabled ? 'Hide from shop' : 'Show in shop'}
                    </button>
                    <button
                      onClick={() => handleDelete(row)}
                      disabled={row.productCount > 0 || deleting === row.category}
                      title={row.productCount > 0 ? 'Remove this category from all products before deleting it.' : 'Delete category'}
                      className="text-[10px] tracking-[0.15em] uppercase px-4 py-2 border border-stone-200 text-stone-400 hover:border-red-300 hover:text-red-400 transition-colors disabled:opacity-30 disabled:hover:border-stone-200 disabled:hover:text-stone-400"
                    >
                      {deleting === row.category ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
