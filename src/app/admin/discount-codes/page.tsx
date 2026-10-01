'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ALL_CATEGORIES, PRODUCTS, mergeProducts, type Product } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface DiscountCodeRow {
  id: number;
  code: string;
  percentage: number | null;
  discount_type: string;
  fixed_amount: string | null;
  scope_type: string;
  scope_categories: unknown;
  scope_product_slugs: unknown;
  active: boolean;
  expires_at: string | null;
  usage_limit: number | null;
  times_redeemed: number;
  min_order_value: string | null;
  created_at: string;
}

const SELECT_CLASS = 'border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white';
const INPUT_CLASS = 'border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors';

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export default function AdminDiscountCodesPage() {
  const [codes, setCodes] = useState<DiscountCodeRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [setupMessage, setSetupMessage] = useState('');

  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [percentage, setPercentage] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [scopeType, setScopeType] = useState<'all' | 'category' | 'product'>('all');
  const [scopeCategories, setScopeCategories] = useState<string[]>([]);
  const [scopeProductSlugs, setScopeProductSlugs] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState('');
  const [usageLimit, setUsageLimit] = useState('');
  const [minOrderValue, setMinOrderValue] = useState('');
  const [active, setActive] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [createStatus, setCreateStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [createMessage, setCreateMessage] = useState('');

  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const [allCategories, setAllCategories] = useState<string[]>([...ALL_CATEGORIES]);

  const [toggleId, setToggleId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [expandedUsageId, setExpandedUsageId] = useState<number | null>(null);
  const [usageData, setUsageData] = useState<Record<number, { order_number: string; customer_name: string; email: string; total: string; created_at: string }[]>>({});
  const [loadingUsageId, setLoadingUsageId] = useState<number | null>(null);

  async function loadCodes() {
    try {
      const res = await fetch('/api/admin/discount-codes');
      const data = await res.json();
      if (res.ok) {
        setCodes(data.codes);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load discount codes.');
      }
    } catch {
      setLoadError('Failed to load discount codes.');
    }
  }

  useEffect(() => {
    loadCodes();
  }, []);

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});
    fetch('/api/admin/categories')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.categories)) setAllCategories(data.categories.map((c: { category: string }) => c.category));
      })
      .catch(() => {});
  }, []);

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

  function toDateInput(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  function startEdit(row: DiscountCodeRow) {
    setEditingId(row.id);
    setCode(row.code);
    setDiscountType(row.discount_type === 'fixed' ? 'fixed' : 'percentage');
    setPercentage(row.percentage !== null ? String(row.percentage) : '');
    setFixedAmount(row.fixed_amount !== null ? String(Number(row.fixed_amount)) : '');
    setScopeType(row.scope_type === 'category' || row.scope_type === 'product' ? row.scope_type : 'all');
    setScopeCategories(toStringArray(row.scope_categories));
    setScopeProductSlugs(toStringArray(row.scope_product_slugs));
    setExpiresAt(toDateInput(row.expires_at));
    setUsageLimit(row.usage_limit !== null ? String(row.usage_limit) : '');
    setMinOrderValue(row.min_order_value !== null ? String(Number(row.min_order_value)) : '');
    setActive(row.active);
    setCreateStatus('idle');
    setCreateMessage('');
  }

  function cancelEdit() {
    setEditingId(null);
    setCode('');
    setDiscountType('percentage');
    setPercentage('');
    setFixedAmount('');
    setScopeType('all');
    setScopeCategories([]);
    setScopeProductSlugs([]);
    setExpiresAt('');
    setUsageLimit('');
    setMinOrderValue('');
    setActive(true);
    setCreateStatus('idle');
    setCreateMessage('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    if (discountType === 'percentage' && !percentage.trim()) return;
    if (discountType === 'fixed' && !fixedAmount.trim()) return;
    if (scopeType === 'category' && scopeCategories.length === 0) return;
    if (scopeType === 'product' && scopeProductSlugs.length === 0) return;
    setCreateStatus('loading');
    setCreateMessage('');
    try {
      const res = await fetch(editingId ? `/api/admin/discount-codes/${editingId}` : '/api/admin/discount-codes', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          discountType,
          percentage: discountType === 'percentage' ? Number(percentage) : null,
          fixedAmount: discountType === 'fixed' ? Number(fixedAmount) : null,
          scopeType,
          scopeCategories,
          scopeProductSlugs,
          expiresAt: expiresAt || null,
          usageLimit: usageLimit ? Number(usageLimit) : null,
          minOrderValue: minOrderValue ? Number(minOrderValue) : null,
          active,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateStatus('done');
        setCreateMessage(editingId ? `Code "${data.code.code}" updated.` : `Code "${data.code.code}" created.`);
        cancelEdit();
        loadCodes();
      } else {
        setCreateStatus('error');
        setCreateMessage(data.error || 'Failed to save code.');
      }
    } catch {
      setCreateStatus('error');
      setCreateMessage('Failed to save code.');
    }
  }

  async function toggleUsageLog(row: DiscountCodeRow) {
    if (expandedUsageId === row.id) {
      setExpandedUsageId(null);
      return;
    }
    setExpandedUsageId(row.id);
    if (usageData[row.id]) return;
    setLoadingUsageId(row.id);
    try {
      const res = await fetch(`/api/admin/discount-codes/${row.id}/usage`);
      const data = await res.json();
      if (res.ok) setUsageData(prev => ({ ...prev, [row.id]: data.usage ?? [] }));
    } finally {
      setLoadingUsageId(null);
    }
  }

  async function toggleActive(row: DiscountCodeRow) {
    setToggleId(row.id);
    try {
      const res = await fetch(`/api/admin/discount-codes/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !row.active }),
      });
      if (res.ok) {
        setCodes((prev) => prev?.map((c) => (c.id === row.id ? { ...c, active: !row.active } : c)) ?? prev);
      }
    } finally {
      setToggleId(null);
    }
  }

  async function handleDelete(row: DiscountCodeRow) {
    setDeleteConfirm(null);
    setDeleteId(row.id);
    try {
      const res = await fetch(`/api/admin/discount-codes/${row.id}`, { method: 'DELETE' });
      if (res.ok) {
        setCodes((prev) => prev?.filter((c) => c.id !== row.id) ?? prev);
        if (editingId === row.id) cancelEdit();
      }
    } finally {
      setDeleteId(null);
    }
  }


  function formatExpiry(value: string | null) {
    if (!value) return 'No expiry';
    return new Date(value).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatMinOrder(value: string | null) {
    if (value === null) return 'No minimum';
    return `£${Number(value).toFixed(2)}`;
  }

  function formatOff(row: DiscountCodeRow) {
    if (row.discount_type === 'fixed') return `£${Number(row.fixed_amount ?? 0).toFixed(2)}`;
    return `${row.percentage ?? 0}%`;
  }

  function formatScope(row: DiscountCodeRow) {
    if (row.scope_type === 'category') {
      const cats = toStringArray(row.scope_categories);
      return cats.length > 0 ? cats.join(', ') : 'Categories';
    }
    if (row.scope_type === 'product') {
      const slugs = toStringArray(row.scope_product_slugs);
      return `${slugs.length} product${slugs.length === 1 ? '' : 's'}`;
    }
    return 'All products';
  }

  function statusFor(row: DiscountCodeRow): { label: string; tone: string } {
    if (!row.active) return { label: 'inactive', tone: 'bg-stone-100 text-stone-500' };
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return { label: 'expired', tone: 'bg-stone-100 text-stone-500' };
    }
    if (row.usage_limit !== null && row.times_redeemed >= row.usage_limit) {
      return { label: 'limit reached', tone: 'bg-stone-100 text-stone-500' };
    }
    return { label: 'active', tone: 'bg-green-50 text-green-700' };
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      {/* Sidebar */}
      <AdminSidebar />

      {/* Main */}
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Discount Codes</h1>
          <p className="text-xs text-stone-500 mb-8">
            Create and manage promo codes that customers can apply at checkout.
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

          {/* Create / edit form */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">
              {editingId ? 'Edit Code' : 'Create a New Code'}
            </h2>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              Codes are matched without regard to case. Discounts apply to the order subtotal (or the eligible
              portion of it, for category- or product-scoped codes) before shipping. Leave the optional fields
              blank for no expiry, no redemption cap, or no minimum order.
            </p>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Code</span>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="SUMMER20"
                  required
                  className="border border-stone-200 px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Discount Type</span>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
                  className={SELECT_CLASS}
                >
                  <option value="percentage">Percentage off</option>
                  <option value="fixed">Fixed amount off</option>
                </select>
              </label>
              {discountType === 'percentage' ? (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Percentage Off</span>
                  <input
                    type="number"
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    placeholder="20"
                    min={1}
                    max={100}
                    step={1}
                    required
                    className={INPUT_CLASS}
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Fixed Amount Off (£)</span>
                  <input
                    type="number"
                    value={fixedAmount}
                    onChange={(e) => setFixedAmount(e.target.value)}
                    placeholder="10.00"
                    min={0.01}
                    step={0.01}
                    required
                    className={INPUT_CLASS}
                  />
                </label>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Applies To</span>
                <select
                  value={scopeType}
                  onChange={(e) => setScopeType(e.target.value as 'all' | 'category' | 'product')}
                  className={SELECT_CLASS}
                >
                  <option value="all">All products</option>
                  <option value="category">Specific categories</option>
                  <option value="product">Specific products</option>
                </select>
              </label>
              {scopeType === 'category' && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Categories</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 border border-stone-200 p-3 max-h-40 overflow-y-auto">
                    {allCategories.map((category) => (
                      <label key={category} className="flex items-center gap-1.5 text-xs text-stone-600">
                        <input
                          type="checkbox"
                          checked={scopeCategories.includes(category)}
                          onChange={(e) => setScopeCategories((prev) =>
                            e.target.checked ? [...prev, category] : prev.filter((c) => c !== category)
                          )}
                          className="accent-gold-500"
                        />
                        {category}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {scopeType === 'product' && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Products</span>
                  <div className="flex flex-col gap-1.5 border border-stone-200 p-3 max-h-48 overflow-y-auto">
                    {products.map((product) => (
                      <label key={product.slug} className="flex items-center gap-1.5 text-xs text-stone-600">
                        <input
                          type="checkbox"
                          checked={scopeProductSlugs.includes(product.slug)}
                          onChange={(e) => setScopeProductSlugs((prev) =>
                            e.target.checked ? [...prev, product.slug] : prev.filter((s) => s !== product.slug)
                          )}
                          className="accent-gold-500"
                        />
                        {product.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Expiry Date (optional)</span>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Usage Limit (optional)</span>
                <input
                  type="number"
                  value={usageLimit}
                  onChange={(e) => setUsageLimit(e.target.value)}
                  placeholder="e.g. 100"
                  min={1}
                  step={1}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Minimum Order Value (£, optional)</span>
                <input
                  type="number"
                  value={minOrderValue}
                  onChange={(e) => setMinOrderValue(e.target.value)}
                  placeholder="e.g. 50.00"
                  min={0}
                  step={0.01}
                  className="border border-stone-200 px-3 py-2.5 text-xs focus:outline-none focus:border-gold-400 transition-colors sm:max-w-xs"
                />
              </label>
              {editingId && (
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="accent-gold-500"
                  />
                  <span className="text-[10px] tracking-[0.15em] uppercase text-stone-500">Active</span>
                </label>
              )}
              <div className="sm:col-span-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={createStatus === 'loading'}
                  className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {createStatus === 'loading' ? 'Saving…' : editingId ? 'Update Code' : 'Create Code'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                  >
                    Cancel
                  </button>
                )}
                {createMessage && (
                  <p className={`text-xs ${createStatus === 'error' ? 'text-red-600' : 'text-stone-600'}`}>{createMessage}</p>
                )}
              </div>
            </form>
          </div>

          {/* Code table */}
          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-800">
                All Codes {codes ? `(${codes.length.toLocaleString()})` : ''}
              </h2>
              <button onClick={loadCodes} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                Refresh
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-500 border-b border-stone-100">
                    <th className="px-6 py-3">Code</th>
                    <th className="px-6 py-3">Off</th>
                    <th className="px-6 py-3">Applies To</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Expires</th>
                    <th className="px-6 py-3">Redemptions</th>
                    <th className="px-6 py-3">Min. Order</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {codes && codes.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-stone-500">
                        No discount codes yet. Create one using the form above.
                      </td>
                    </tr>
                  )}
                  {codes?.map((row) => {
                    const status = statusFor(row);
                    const isOpen = expandedUsageId === row.id;
                    const usage = usageData[row.id] ?? [];
                    return (
                      // Fragment, not <>, and the key belongs on IT: this map returns two
                      // sibling rows per code, so React keys the fragment. With a bare <> the
                      // key sat on the inner <tr> where React never sees it, and every render
                      // logged "each child in a list should have a unique key" — which also
                      // means rows were being matched by position rather than by code.
                      <Fragment key={row.id}>
                        <tr className="border-b border-stone-50">
                          <td className="px-6 py-3 font-mono text-stone-700">{row.code}</td>
                          <td className="px-6 py-3 text-stone-600">{formatOff(row)}</td>
                          <td className="px-6 py-3 text-stone-500 max-w-xs">{formatScope(row)}</td>
                          <td className="px-6 py-3">
                            <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${status.tone}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-stone-500">{formatExpiry(row.expires_at)}</td>
                          <td className="px-6 py-3 text-stone-500">
                            {row.times_redeemed.toLocaleString()}
                            {row.usage_limit !== null ? ` / ${row.usage_limit.toLocaleString()}` : ''}
                          </td>
                          <td className="px-6 py-3 text-stone-500">{formatMinOrder(row.min_order_value)}</td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center gap-3 justify-end">
                              <button
                                onClick={() => toggleUsageLog(row)}
                                className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                              >
                                {loadingUsageId === row.id ? 'Loading…' : isOpen ? 'Hide' : 'Usage'}
                              </button>
                              <button
                                onClick={() => toggleActive(row)}
                                disabled={toggleId === row.id}
                                className={`p-2 -m-2 text-[10px] tracking-[0.15em] uppercase transition-colors disabled:opacity-50 ${
                                  row.active ? 'text-stone-500 hover:text-red-400' : 'text-gold-700 hover:text-gold-700'
                                }`}
                              >
                                {toggleId === row.id ? 'Saving…' : row.active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button
                                onClick={() => startEdit(row)}
                                className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                              >
                                Edit
                              </button>
                              {deleteConfirm === row.id ? (
                                <span className="flex items-center gap-2">
                                  <span className="text-[10px] text-red-500">Delete permanently?</span>
                                  <button
                                    onClick={() => handleDelete(row)}
                                    disabled={deleteId === row.id}
                                    className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                                  >
                                    {deleteId === row.id ? 'Deleting…' : 'Confirm'}
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(row.id)}
                                  className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-stone-50/60">
                            <td colSpan={8} className="px-6 py-3">
                              {usage.length === 0 ? (
                                <p className="text-[10px] text-stone-500">No orders have used this code yet.</p>
                              ) : (
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-500">
                                      <th className="pr-6 pb-1.5">Order</th>
                                      <th className="pr-6 pb-1.5">Customer</th>
                                      <th className="pr-6 pb-1.5">Total</th>
                                      <th className="pb-1.5">Date</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {usage.map(u => (
                                      <tr key={u.order_number} className="border-t border-stone-100">
                                        <td className="font-mono text-stone-600 pr-6 py-1">{u.order_number}</td>
                                        <td className="text-stone-500 pr-6 py-1">{u.customer_name}<br /><span className="text-stone-500">{u.email}</span></td>
                                        <td className="text-gold-700 font-semibold pr-6 py-1">£{Number(u.total).toFixed(2)}</td>
                                        <td className="text-stone-500 py-1">{new Date(u.created_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Automatic Sale Discounts moved to Promotions -> Percentage Discount (it
              was never a customer-entered code, so it didn't belong in this section). */}
          <div className="mt-12 border border-gold-100 bg-gold-50/40 px-5 py-4">
            <p className="text-xs text-stone-600 leading-relaxed">
              Looking for automatic, no-code discounts (e.g. &ldquo;10% off all serums&rdquo;)? That feature has
              moved to{' '}
              <Link href="/admin/promotions" className="text-gold-700 hover:text-gold-700 underline">
                Promotions
              </Link>
              {' '}as a &ldquo;Percentage discount&rdquo; promotion type, since it&rsquo;s an automatic visible
              offer rather than a code customers type in.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
