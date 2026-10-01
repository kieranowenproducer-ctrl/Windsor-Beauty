'use client';

import { useEffect, useMemo, useState } from 'react';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';
import AdminSidebar from '@/components/admin/AdminSidebar';
import ProductPicker from '@/components/reviews/ProductPicker';
import ReviewPhoto from '@/components/reviews/ReviewPhoto';

interface ReviewRow {
  id: number;
  customer_id: number | null;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
  status: 'pending' | 'approved' | 'hidden' | 'rejected';
  product_slug: string | null;
  image_url: string | null;
  admin_reply: string | null;
  admin_reply_created_at: string | null;
  admin_reply_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

const FILTERS: { label: string; value: string }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All', value: '' },
];

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-gold-50 text-gold-700',
  approved: 'bg-green-50 text-green-700',
  hidden: 'bg-stone-100 text-stone-500',
  rejected: 'bg-red-50 text-red-600',
};

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleteReplyConfirm, setDeleteReplyConfirm] = useState<number | null>(null);
  const [replyDraftId, setReplyDraftId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState('');

  // Edit review fields
  const [editId, setEditId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{
    customer_name: string;
    rating: number;
    title: string;
    body: string;
    created_at: string;
  } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const products = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [productLinks, setProductLinks] = useState<Record<number, string[]>>({});
  const [linksLoading, setLinksLoading] = useState<number | null>(null);
  const [linkBusy, setLinkBusy] = useState<number | null>(null);

  // Add-a-review form (task 28e2cc5b): bulk buyers resell to people with no
  // account here; admin types their reviews in and they publish immediately.
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({ customer_name: '', rating: 5, title: '', body: '' });
  const [addProducts, setAddProducts] = useState<string[]>([]);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});
  }, []);

  function productName(slug: string) {
    return products.find(p => p.slug === slug)?.name ?? slug;
  }

  async function toggleProducts(row: ReviewRow) {
    if (expandedId === row.id) { setExpandedId(null); return; }
    setExpandedId(row.id);
    if (!(row.id in productLinks)) {
      setLinksLoading(row.id);
      try {
        const res = await fetch(`/api/admin/reviews/${row.id}/products`);
        const data = await res.json();
        setProductLinks(prev => ({ ...prev, [row.id]: data.links ?? [] }));
      } catch {
        setProductLinks(prev => ({ ...prev, [row.id]: [] }));
      } finally {
        setLinksLoading(null);
      }
    }
  }

  async function addProductLink(id: number, slug: string) {
    setLinkBusy(id);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (res.ok) setProductLinks(prev => ({ ...prev, [id]: data.links ?? [] }));
    } finally {
      setLinkBusy(null);
    }
  }

  async function removeProductLink(id: number, slug: string) {
    setLinkBusy(id);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/products`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (res.ok) setProductLinks(prev => ({ ...prev, [id]: data.links ?? [] }));
    } finally {
      setLinkBusy(null);
    }
  }

  async function loadReviews() {
    setReviews(null);
    try {
      const url = filter ? `/api/admin/reviews?status=${filter}` : '/api/admin/reviews';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setReviews(data.reviews ?? []);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load reviews.');
        setReviews([]);
      }
    } catch {
      setLoadError('Failed to load reviews.');
      setReviews([]);
    }
  }

  useEffect(() => {
    loadReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when the approval filter changes. loadReviews is redefined on every render, so listing it would refetch continuously.
  }, [filter]);

  async function setStatus(id: number, status: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setReviews(prev => prev?.filter(r => r.id !== id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(row: ReviewRow) {
    setDeleteConfirm(null);
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/reviews/${row.id}`, { method: 'DELETE' });
      if (res.ok) setReviews(prev => prev?.filter(r => r.id !== row.id) ?? prev);
    } finally {
      setBusyId(null);
    }
  }

  function startReply(row: ReviewRow) {
    setReplyDraftId(row.id);
    setReplyText(row.admin_reply ?? '');
    setReplyError('');
  }

  function cancelReply() {
    setReplyDraftId(null);
    setReplyText('');
    setReplyError('');
  }

  async function saveReply(id: number) {
    if (!replyText.trim()) { setReplyError('Reply cannot be empty.'); return; }
    setReplyBusy(true);
    setReplyError('');
    try {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setReviews(prev => prev?.map(r => r.id === id ? data.review : r) ?? prev);
        cancelReply();
      } else {
        setReplyError(data.error || 'Failed to save reply.');
      }
    } catch {
      setReplyError('Failed to save reply.');
    } finally {
      setReplyBusy(false);
    }
  }

  async function deleteReply(id: number) {
    setDeleteReplyConfirm(null);
    setReplyBusy(true);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/reply`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setReviews(prev => prev?.map(r => r.id === id ? data.review : r) ?? prev);
        if (replyDraftId === id) cancelReply();
      }
    } finally {
      setReplyBusy(false);
    }
  }

  function startEdit(row: ReviewRow) {
    setEditId(row.id);
    setEditDraft({
      customer_name: row.customer_name,
      rating: row.rating,
      title: row.title ?? '',
      body: row.body,
      created_at: toLocalDatetimeValue(row.created_at),
    });
    setEditError('');
  }

  function cancelEdit() {
    setEditId(null);
    setEditDraft(null);
    setEditError('');
  }

  async function saveEdit(id: number) {
    if (!editDraft) return;
    if (!editDraft.customer_name.trim()) { setEditError('Reviewer name is required.'); return; }
    if (!editDraft.body.trim()) { setEditError('Review text is required.'); return; }
    setEditBusy(true);
    setEditError('');
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: editDraft.customer_name,
          rating: editDraft.rating,
          title: editDraft.title || null,
          body: editDraft.body,
          created_at: new Date(editDraft.created_at).toISOString(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setReviews(prev => prev?.map(r => r.id === id ? data.review : r) ?? prev);
        cancelEdit();
      } else {
        setEditError(data.error || 'Failed to save changes.');
      }
    } catch {
      setEditError('Failed to save changes.');
    } finally {
      setEditBusy(false);
    }
  }

  async function submitAdd() {
    if (!addDraft.customer_name.trim()) { setAddError('Reviewer name is required.'); return; }
    if (!addDraft.body.trim()) { setAddError('Review text is required.'); return; }
    setAddBusy(true);
    setAddError('');
    try {
      const res = await fetch('/api/admin/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: addDraft.customer_name.trim(),
          rating: addDraft.rating,
          title: addDraft.title.trim() || null,
          body: addDraft.body.trim(),
          productSlugs: addProducts,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAddOpen(false);
        setAddDraft({ customer_name: '', rating: 5, title: '', body: '' });
        setAddProducts([]);
        // It is live already, so take the admin to where it now shows. Changing
        // the filter reloads via its effect; if we are already there, reload.
        if (filter !== 'approved') setFilter('approved');
        else loadReviews();
      } else {
        setAddError(data.error || 'Failed to save the review.');
      }
    } catch {
      setAddError('Failed to save the review.');
    } finally {
      setAddBusy(false);
    }
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">Reviews</h1>
          <p className="text-xs text-stone-500 mb-6">
            Moderate customer reviews submitted from the public Reviews page. Only approved reviews are shown to customers.
            You can also add a review yourself, for bulk customers whose own buyers have no account here.
          </p>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}

          {/* Wraps on a phone (task 1fb77058). The filter buttons ran off the
              edge, taking the last one 59px past a 390px screen. */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {FILTERS.map(({ label, value }) => (
              <button
                key={value || 'all'}
                onClick={() => setFilter(value)}
                className={`text-[10px] tracking-[0.15em] uppercase px-3.5 py-2 border transition-colors ${
                  filter === value
                    ? 'border-gold-400 bg-gold-50 text-gold-700'
                    : 'border-stone-200 text-stone-500 hover:border-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-stone-800">
                Reviews {reviews ? `(${reviews.length.toLocaleString()})` : ''}
              </h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => { setAddOpen(v => !v); setAddError(''); }}
                  className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors"
                >
                  {addOpen ? 'Close' : 'Add a Review'}
                </button>
                <button onClick={loadReviews} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors">
                  Refresh
                </button>
              </div>
            </div>

            {addOpen && (
              <div className="px-6 py-5 border-b border-stone-100 bg-gold-50/30">
                <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-1">
                  Add a Review
                </p>
                <p className="text-[10px] text-stone-500 mb-4">
                  For bulk customers whose own buyers have no account here. It publishes straight away
                  and looks exactly like any approved customer review. You can hide, edit or delete it
                  afterwards like any other. As with every review, the site shows the name as first name
                  plus last initial (&ldquo;Sarah Mitchell&rdquo; shows as &ldquo;Sarah M&rdquo;).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Reviewer Name</label>
                    <input
                      type="text"
                      value={addDraft.customer_name}
                      onChange={e => setAddDraft(d => ({ ...d, customer_name: e.target.value }))}
                      placeholder="The name shown with the review"
                      className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Star Rating</label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setAddDraft(d => ({ ...d, rating: n }))}
                          aria-label={`${n} star${n === 1 ? '' : 's'}`}
                          className={`text-xl transition-colors ${n <= addDraft.rating ? 'text-gold-400' : 'text-stone-200'} hover:text-gold-300`}
                        >
                          ★
                        </button>
                      ))}
                      <span className="text-[10px] text-stone-500 ml-2">{addDraft.rating}/5</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Title <span className="normal-case tracking-normal">(optional)</span></label>
                    <input
                      type="text"
                      value={addDraft.title}
                      onChange={e => setAddDraft(d => ({ ...d, title: e.target.value }))}
                      className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Review Text</label>
                    <textarea
                      value={addDraft.body}
                      onChange={e => setAddDraft(d => ({ ...d, body: e.target.value }))}
                      rows={4}
                      placeholder="Their words, as they gave them"
                      className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Products <span className="normal-case tracking-normal">(optional - also shows it on those product pages)</span></label>
                    <ProductPicker
                      products={products}
                      selected={addProducts}
                      busy={addBusy}
                      onAdd={slug => setAddProducts(prev => prev.includes(slug) ? prev : [...prev, slug])}
                      onRemove={slug => setAddProducts(prev => prev.filter(s => s !== slug))}
                    />
                  </div>
                </div>
                {addError && <p className="text-[10px] text-red-500 mt-2">{addError}</p>}
                <div className="flex items-center gap-3 mt-4">
                  <button
                    onClick={submitAdd}
                    disabled={addBusy}
                    className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {addBusy ? 'Publishing…' : 'Publish Review'}
                  </button>
                  <button
                    onClick={() => { setAddOpen(false); setAddError(''); }}
                    disabled={addBusy}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {reviews === null && (
              <div className="px-6 py-8 text-center text-stone-500 text-xs">Loading…</div>
            )}

            {reviews && reviews.length === 0 && (
              <div className="px-6 py-8 text-center text-stone-500 text-xs">No reviews in this filter.</div>
            )}

            <div className="divide-y divide-stone-50">
              {reviews?.map((row) => (
                <div key={row.id} className="px-6 py-5">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-stone-700">{row.customer_name}</span>
                        <span className={`inline-block px-2 py-0.5 text-[9px] tracking-[0.1em] uppercase ${STATUS_TONE[row.status]}`}>
                          {row.status}
                        </span>
                        {row.admin_reply && (
                          <span className="inline-block px-2 py-0.5 text-[9px] tracking-[0.1em] uppercase bg-gold-50 text-gold-700">
                            Replied
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-gold-400 text-xs mb-1">
                        {'★'.repeat(row.rating)}
                        <span className="text-stone-200">{'★'.repeat(5 - row.rating)}</span>
                      </div>
                      <p className="text-[10px] text-stone-500 mb-1">{formatDate(row.created_at)}</p>
                      <p className="text-[10px] text-stone-500">
                        Source: {row.customer_id === null
                          ? 'Added manually (no customer account)'
                          : row.product_slug ? `Submitted on ${productName(row.product_slug)}` : 'Website reviews page'}
                      </p>
                    </div>
                  </div>

                  {/* Review content — either edit form or read view */}
                  {editId === row.id && editDraft ? (
                    <div className="mt-3 border border-gold-100 bg-gold-50/30 p-4 sm:p-5">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-3">
                        Edit Review
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Reviewer Name</label>
                          <input
                            type="text"
                            value={editDraft.customer_name}
                            onChange={e => setEditDraft(d => d && ({ ...d, customer_name: e.target.value }))}
                            className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Star Rating</label>
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <button
                                key={n}
                                type="button"
                                onClick={() => setEditDraft(d => d && ({ ...d, rating: n }))}
                                className={`text-xl transition-colors ${n <= editDraft.rating ? 'text-gold-400' : 'text-stone-200'} hover:text-gold-300`}
                              >
                                ★
                              </button>
                            ))}
                            <span className="text-[10px] text-stone-500 ml-2">{editDraft.rating}/5</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Title <span className="normal-case tracking-normal">(optional)</span></label>
                          <input
                            type="text"
                            value={editDraft.title}
                            onChange={e => setEditDraft(d => d && ({ ...d, title: e.target.value }))}
                            className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Review Text</label>
                          <textarea
                            value={editDraft.body}
                            onChange={e => setEditDraft(d => d && ({ ...d, body: e.target.value }))}
                            rows={4}
                            className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white leading-relaxed"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Display Date</label>
                          <input
                            type="datetime-local"
                            value={editDraft.created_at}
                            onChange={e => setEditDraft(d => d && ({ ...d, created_at: e.target.value }))}
                            className="border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-xs text-stone-700 bg-white"
                          />
                        </div>
                      </div>
                      {editError && <p className="text-[10px] text-red-500 mt-2">{editError}</p>}
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => saveEdit(row.id)}
                          disabled={editBusy}
                          className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
                        >
                          {editBusy ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={editBusy}
                          className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {row.title && <p className="text-sm font-medium text-stone-700 mb-1">{row.title}</p>}
                      <p className="text-xs text-stone-500 leading-relaxed mb-3 whitespace-pre-wrap">{row.body}</p>
                      {row.image_url && <ReviewPhoto src={row.image_url} variant="thumb" className="mb-3" />}
                    </>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 flex-wrap mt-1">
                    {row.status !== 'approved' && (
                      <button
                        onClick={() => setStatus(row.id, 'approved')}
                        disabled={busyId === row.id}
                        className="text-[10px] tracking-[0.15em] uppercase text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                      >
                        Approve
                      </button>
                    )}
                    {row.status !== 'hidden' && (
                      <button
                        onClick={() => setStatus(row.id, 'hidden')}
                        disabled={busyId === row.id}
                        className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors disabled:opacity-50"
                      >
                        Hide
                      </button>
                    )}
                    {row.status !== 'rejected' && (
                      <button
                        onClick={() => setStatus(row.id, 'rejected')}
                        disabled={busyId === row.id}
                        className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
                    {editId !== row.id && (
                      <button
                        onClick={() => startEdit(row)}
                        className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {replyDraftId !== row.id && (
                      <button
                        onClick={() => startReply(row)}
                        className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
                      >
                        {row.admin_reply ? 'Edit Reply' : 'Reply'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleProducts(row)}
                      className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                    >
                      {expandedId === row.id ? 'Hide Products' : 'Manage Products'}
                    </button>
                    {deleteConfirm === row.id ? (
                      <span className="flex items-center gap-2 ml-auto">
                        <span className="text-[10px] text-red-500">Permanently delete this review?</span>
                        <button
                          onClick={() => handleDelete(row)}
                          disabled={busyId === row.id}
                          className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 shrink-0"
                        >
                          {busyId === row.id ? 'Deleting…' : 'Confirm Delete'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors shrink-0"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(row.id)}
                        disabled={busyId === row.id}
                        className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors disabled:opacity-50 ml-auto"
                      >
                        Delete Permanently
                      </button>
                    )}
                  </div>

                  {/* Product mapping */}
                  {expandedId === row.id && (
                    <div className="mt-3 ml-4 border-l-2 border-stone-200 bg-stone-50 px-4 py-3 sm:px-5 sm:py-4">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 font-semibold mb-2">
                        Show This Review On
                      </p>
                      <p className="text-[10px] text-stone-500 mb-3">
                        This review always stays on the main Reviews page. Map it to products to also show it on those product pages.
                      </p>
                      {linksLoading === row.id ? (
                        <p className="text-[10px] text-stone-300 mb-2">Loading…</p>
                      ) : (
                        <ProductPicker
                          products={products}
                          selected={productLinks[row.id] ?? []}
                          busy={linkBusy === row.id}
                          onAdd={(slug) => addProductLink(row.id, slug)}
                          onRemove={(slug) => removeProductLink(row.id, slug)}
                        />
                      )}
                    </div>
                  )}

                  {/* Reply form */}
                  {replyDraftId === row.id ? (
                    <div className="mt-3 ml-4 border-l-2 border-gold-200 bg-gold-50/40 px-4 py-3 sm:px-5 sm:py-4">
                      <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-2">
                        Reply as Windsor Beauty
                      </p>
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={3}
                        placeholder="Thank you so much for your kind review, you're always welcome here."
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-xs text-stone-700 placeholder-stone-300 bg-white leading-relaxed"
                      />
                      {replyError && <p className="text-[10px] text-red-500 mt-1.5">{replyError}</p>}
                      <div className="flex items-center gap-3 mt-2.5">
                        <button
                          onClick={() => saveReply(row.id)}
                          disabled={replyBusy}
                          className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
                        >
                          {replyBusy ? 'Saving…' : 'Save Reply'}
                        </button>
                        <button
                          onClick={cancelReply}
                          disabled={replyBusy}
                          className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        {row.admin_reply && (
                          deleteReplyConfirm === row.id ? (
                            <span className="flex items-center gap-2 ml-auto">
                              <span className="text-[10px] text-red-500">Delete reply?</span>
                              <button
                                onClick={() => deleteReply(row.id)}
                                disabled={replyBusy}
                                className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                {replyBusy ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setDeleteReplyConfirm(null)}
                                className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteReplyConfirm(row.id)}
                              disabled={replyBusy}
                              className="text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 ml-auto"
                            >
                              Delete Reply
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ) : row.admin_reply ? (
                    <div className="mt-3 ml-4 border-l-2 border-gold-200 bg-gold-50/40 px-4 py-3 sm:px-5 sm:py-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-full bg-gold-700 text-white font-serif text-[10px] flex items-center justify-center shrink-0">
                          W
                        </span>
                        <span className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold">Your Reply</span>
                      </div>
                      <p className="text-xs text-stone-600 leading-relaxed whitespace-pre-wrap">{row.admin_reply}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
