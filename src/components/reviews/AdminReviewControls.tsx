'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';
import { isStaffView } from '@/lib/staffView';
import ProductPicker from './ProductPicker';
import type { ReviewCardData } from './ReviewCard';

// Moderation controls attached to a review where it is actually read: the
// website's own Reviews page and the Customer Reviews block on a product page.
// Same actions, same endpoints and same wording as the admin panel's Reviews
// page, so an admin who spots a problem can fix it on the spot instead of
// going back to the panel to hunt for the review (task 39cb87cc).
//
// Two things this is NOT:
//   - It is not a new way in. Every button calls the existing /api/admin/...
//     endpoints, which the middleware gates on the httpOnly admin session
//     cookie. The `wg_ui_session=staff` cookie read here only decides whether
//     the buttons are DRAWN; it grants nothing on the server.
//   - It is not visible to customers, and not visible to an admin who is using
//     "preview as customer", which is what isStaffView() already means
//     everywhere else on the storefront.

// The product list is only needed when someone opens "Manage Products", and the
// same list serves every card on the page, so it is fetched once and shared
// rather than once per review.
let cataloguePromise: Promise<Product[]> | null = null;
function loadProducts(): Promise<Product[]> {
  if (!cataloguePromise) {
    cataloguePromise = fetch('/api/admin/products/catalogue')
      .then(res => res.json())
      .then(data =>
        data?.overrides && typeof data.overrides === 'object'
          ? mergeProducts(PRODUCTS, data.overrides)
          : PRODUCTS
      )
      .catch(() => PRODUCTS);
  }
  return cataloguePromise;
}

function toLocalDatetimeValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Panel = 'none' | 'edit' | 'reply' | 'products';

export default function AdminReviewControls({
  review,
  onChanged,
}: {
  review: ReviewCardData;
  /** Re-reads the review list, so what is on screen is true after a change. */
  onChanged?: () => void;
}) {
  // Read on the client only. The cookie does not exist during the server
  // render, so deciding this in the first render would mismatch on hydration.
  const [staff, setStaff] = useState(false);
  useEffect(() => setStaff(isStaffView()), []);

  const [panel, setPanel] = useState<Panel>('none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [editDraft, setEditDraft] = useState({
    customer_name: '',
    rating: 5,
    title: '',
    body: '',
    created_at: '',
  });

  const [replyText, setReplyText] = useState('');
  const [confirmDeleteReply, setConfirmDeleteReply] = useState(false);

  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [links, setLinks] = useState<string[] | null>(null);

  if (!staff) return null;

  function flash(message: string) {
    setDone(message);
    setTimeout(() => setDone(''), 2500);
  }

  // Every action funnels through here so a failed call always says so on the
  // card rather than looking like it worked.
  async function run(label: string, fn: () => Promise<Response>) {
    setBusy(true);
    setError('');
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Could not ${label}.`);
        return null;
      }
      return data as Record<string, unknown>;
    } catch {
      setError(`Could not ${label}. Check your connection and try again.`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: 'hidden' | 'rejected') {
    const ok = await run(status === 'hidden' ? 'hide this review' : 'reject this review', () =>
      fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
    );
    if (ok) onChanged?.();
  }

  async function remove() {
    setConfirmDelete(false);
    const ok = await run('delete this review', () =>
      fetch(`/api/admin/reviews/${review.id}`, { method: 'DELETE' })
    );
    if (ok) onChanged?.();
  }

  function startEdit() {
    setEditDraft({
      customer_name: review.customer_name,
      rating: review.rating,
      title: review.title ?? '',
      body: review.body,
      created_at: toLocalDatetimeValue(review.created_at),
    });
    setError('');
    setPanel('edit');
  }

  async function saveEdit() {
    if (!editDraft.customer_name.trim()) { setError('Reviewer name is required.'); return; }
    if (!editDraft.body.trim()) { setError('Review text is required.'); return; }
    const ok = await run('save this review', () =>
      fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: editDraft.customer_name,
          rating: editDraft.rating,
          title: editDraft.title,
          body: editDraft.body,
          created_at: new Date(editDraft.created_at).toISOString(),
        }),
      })
    );
    if (ok) { setPanel('none'); flash('Saved.'); onChanged?.(); }
  }

  function startReply() {
    setReplyText(review.admin_reply ?? '');
    setError('');
    setConfirmDeleteReply(false);
    setPanel('reply');
  }

  async function saveReply() {
    if (!replyText.trim()) { setError('Reply cannot be empty.'); return; }
    const ok = await run('save this reply', () =>
      fetch(`/api/admin/reviews/${review.id}/reply`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply: replyText.trim() }),
      })
    );
    if (ok) { setPanel('none'); flash('Reply saved.'); onChanged?.(); }
  }

  async function deleteReply() {
    setConfirmDeleteReply(false);
    const ok = await run('delete this reply', () =>
      fetch(`/api/admin/reviews/${review.id}/reply`, { method: 'DELETE' })
    );
    if (ok) { setPanel('none'); flash('Reply deleted.'); onChanged?.(); }
  }

  async function openProducts() {
    setError('');
    setPanel('products');
    if (links !== null) return;
    setProducts(await loadProducts());
    const data = await run('load the product list', () =>
      fetch(`/api/admin/reviews/${review.id}/products`)
    );
    setLinks(Array.isArray(data?.links) ? (data!.links as string[]) : []);
  }

  async function changeLink(slug: string, add: boolean) {
    const data = await run(add ? 'add that product' : 'remove that product', () =>
      fetch(`/api/admin/reviews/${review.id}/products`, {
        method: add ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
    );
    if (data) {
      setLinks(Array.isArray(data.links) ? (data.links as string[]) : []);
      onChanged?.();
    }
  }

  const action = 'text-[10px] tracking-[0.15em] uppercase transition-colors disabled:opacity-50';

  return (
    <div className="mt-5 border-t border-dashed border-gold-300 pt-3">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold">
          Admin controls
        </span>
        <span className="text-[10px] text-stone-500">Only you can see this, customers cannot.</span>
      </div>

      <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
        <button onClick={startEdit} disabled={busy} className={`${action} text-stone-500 hover:text-gold-700`}>
          Edit
        </button>
        <button onClick={startReply} disabled={busy} className={`${action} text-gold-700 hover:text-gold-800`}>
          {review.admin_reply ? 'Edit Reply' : 'Reply'}
        </button>
        <button onClick={() => setStatus('hidden')} disabled={busy} className={`${action} text-stone-500 hover:text-stone-600`}>
          Hide
        </button>
        <button onClick={() => setStatus('rejected')} disabled={busy} className={`${action} text-red-500 hover:text-red-600`}>
          Reject
        </button>
        <button onClick={openProducts} disabled={busy} className={`${action} text-stone-500 hover:text-gold-700`}>
          Manage Products
        </button>
        {confirmDelete ? (
          <span className="flex items-center gap-2 ml-auto">
            <span className="text-[10px] text-red-500">Permanently delete this review?</span>
            <button onClick={remove} disabled={busy} className={`${action} text-red-500 hover:text-red-600 shrink-0`}>
              {busy ? 'Deleting…' : 'Confirm Delete'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className={`${action} text-stone-500 hover:text-stone-600 shrink-0`}>
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            className={`${action} text-stone-500 hover:text-red-500 ml-auto`}
          >
            Delete Permanently
          </button>
        )}
      </div>

      <p className="text-[10px] text-stone-500 mt-2">
        Hiding or rejecting takes this review off the website straight away. You can put it back
        from the{' '}
        <Link href="/admin/reviews" className="text-gold-700 underline hover:text-gold-800">
          Reviews page in the admin panel
        </Link>
        , which is also where reviews waiting to be approved appear.
      </p>

      {error && <p className="text-[10px] text-red-500 mt-2">{error}</p>}
      {done && <p className="text-[10px] text-green-600 mt-2">{done}</p>}

      {/* Edit the review itself */}
      {panel === 'edit' && (
        <div className="mt-3 border border-gold-100 bg-gold-50/30 p-4 sm:p-5">
          <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-3">Edit Review</p>
          <div className="space-y-3">
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Reviewer Name</label>
              <input
                type="text"
                value={editDraft.customer_name}
                onChange={e => setEditDraft(d => ({ ...d, customer_name: e.target.value }))}
                className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-base sm:text-xs text-stone-700 bg-white"
              />
            </div>
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Star Rating</label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEditDraft(d => ({ ...d, rating: n }))}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    className={`text-xl transition-colors ${n <= editDraft.rating ? 'text-gold-700' : 'text-stone-200'} hover:text-gold-800`}
                  >
                    ★
                  </button>
                ))}
                <span className="text-[10px] text-stone-500 ml-2">{editDraft.rating}/5</span>
              </div>
            </div>
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">
                Title <span className="normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={editDraft.title}
                onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-base sm:text-xs text-stone-700 bg-white"
              />
            </div>
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Review Text</label>
              <textarea
                value={editDraft.body}
                onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))}
                rows={5}
                className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-base sm:text-xs text-stone-700 bg-white leading-relaxed"
              />
            </div>
            <div>
              <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Display Date</label>
              <input
                type="datetime-local"
                value={editDraft.created_at}
                onChange={e => setEditDraft(d => ({ ...d, created_at: e.target.value }))}
                className="border border-stone-200 focus:border-gold-400 outline-none px-2.5 py-2 text-base sm:text-xs text-stone-700 bg-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={saveEdit}
              disabled={busy}
              className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
            <button onClick={() => setPanel('none')} disabled={busy} className={`${action} text-stone-500 hover:text-stone-600`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reply as Windsor Glow */}
      {panel === 'reply' && (
        <div className="mt-3 border-l-2 border-gold-200 bg-gold-50/40 px-4 py-3 sm:px-5 sm:py-4">
          <p className="text-[9px] tracking-[0.18em] uppercase text-gold-700 font-semibold mb-2">Reply as Windsor Glow</p>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            rows={3}
            placeholder="Thank you so much for your kind review, you're always welcome here."
            className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2 text-base sm:text-xs text-stone-700 placeholder-stone-500 bg-white leading-relaxed"
          />
          <div className="flex items-center gap-3 mt-2.5 flex-wrap">
            <button
              onClick={saveReply}
              disabled={busy}
              className="text-[10px] tracking-[0.15em] uppercase bg-gold-700 text-white px-4 py-2 hover:bg-gold-800 transition-colors disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save Reply'}
            </button>
            <button onClick={() => setPanel('none')} disabled={busy} className={`${action} text-stone-500 hover:text-stone-600`}>
              Cancel
            </button>
            {review.admin_reply && (
              confirmDeleteReply ? (
                <span className="flex items-center gap-2 ml-auto">
                  <span className="text-[10px] text-red-500">Delete reply?</span>
                  <button onClick={deleteReply} disabled={busy} className={`${action} text-red-500 hover:text-red-600`}>
                    {busy ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button onClick={() => setConfirmDeleteReply(false)} className={`${action} text-stone-500 hover:text-stone-600`}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmDeleteReply(true)}
                  disabled={busy}
                  className={`${action} text-red-500 hover:text-red-600 ml-auto`}
                >
                  Delete Reply
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Which products this review shows on */}
      {panel === 'products' && (
        <div className="mt-3 border-l-2 border-stone-200 bg-stone-50 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 font-semibold">Show This Review On</p>
            <button onClick={() => setPanel('none')} className={`${action} text-stone-500 hover:text-stone-600`}>
              Close
            </button>
          </div>
          <p className="text-[10px] text-stone-500 mb-3">
            This review always stays on the main Reviews page. Map it to products to also show it
            on those product pages.
          </p>
          {links === null ? (
            <p className="text-[10px] text-stone-500 mb-2">Loading…</p>
          ) : (
            <ProductPicker
              products={products}
              selected={links}
              busy={busy}
              onAdd={slug => changeLink(slug, true)}
              onRemove={slug => changeLink(slug, false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
