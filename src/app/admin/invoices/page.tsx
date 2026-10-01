'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';

interface InvoiceListRow {
  id: number;
  invoice_number: string;
  status: 'draft' | 'sent' | 'viewed' | 'payment_pending' | 'paid' | 'cancelled';
  customer_name: string;
  company_name: string | null;
  email: string;
  total: string;
  order_number: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  payment_method_used: 'fena' | 'paypal' | null;
  due_date: string | null;
  created_at: string;
  sent_at: string | null;
  edit_log: { at: string; summary: string }[];
}

// True when this invoice was edited after the last time it was sent/resent —
// the customer's already-delivered email still has the old payment link/
// amount until someone clicks Resend Invoice on the edit page.
function editedSinceLastSent(row: InvoiceListRow): boolean {
  if (!row.sent_at || row.edit_log.length === 0) return false;
  const lastEdit = row.edit_log[row.edit_log.length - 1];
  return new Date(lastEdit.at).getTime() > new Date(row.sent_at).getTime();
}

// A payment link can only be re-sent for an invoice that has already been sent and
// is still awaiting payment. A draft has never been sent (use Send Invoice on the
// invoice itself), and /send rejects paid and cancelled invoices.
function canResendLink(row: InvoiceListRow): boolean {
  return row.status === 'sent' || row.status === 'viewed' || row.status === 'payment_pending';
}

const STATUS_TONE: Record<InvoiceListRow['status'], string> = {
  draft: 'bg-stone-100 text-stone-500',
  sent: 'bg-blue-50 text-blue-700',
  viewed: 'bg-indigo-50 text-indigo-700',
  payment_pending: 'bg-amber-50 text-amber-700',
  paid: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-400',
};

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdminInvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceListRow[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [setupStatus, setSetupStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [setupMessage, setSetupMessage] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  // Sorting and a date range (Kieran, 2026-09-24: "alphabetical order on name or a time line, ie
  // between x and y"). All three are done by the database, not in the browser, so they apply to
  // every invoice there is and not just the 300 already on screen.
  const [sort, setSort] = useState('newest');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [creating, setCreating] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  /* Copying an invoice for a repeat order (task 9b732fb3). The copy is a fresh DRAFT with its own
     new invoice number; the original is not touched. Kieran asked for this from the list because
     that is where he starts: reaching it meant opening the invoice first and finding a small grey
     link, which on a phone is four steps to do a thing that should be one. */
  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  async function handleDuplicateOne(id: number) {
    setDuplicatingId(id);
    setLoadError('');
    try {
      const res = await fetch(`/api/admin/invoices/${id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.invoice?.id) {
        // Said out loud. A copy that quietly fails looks exactly like a dead button.
        setLoadError(data?.error ?? 'Could not copy that invoice. Please try again.');
        return;
      }
      router.push(`/admin/invoices/${data.invoice.id}/edit`);
    } catch {
      setLoadError('Could not reach the server, so nothing was copied.');
    } finally {
      setDuplicatingId(null);
    }
  }
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [resendConfirmId, setResendConfirmId] = useState<number | null>(null);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendMessage, setResendMessage] = useState('');

  // Re-sends the customer their payment link. POSTs the same /send the invoice page
  // uses: it reuses the existing order (never creates a second one), mints a fresh
  // Fena link for the current total, and re-emails the full invoice. This is the
  // thing to reach for when a customer loses their email — not Duplicate, which
  // would create a brand-new invoice with a new number.
  async function handleResendLink(id: number) {
    setResendingId(id);
    setResendMessage('');
    try {
      const res = await fetch(`/api/admin/invoices/${id}/send`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResendMessage(
          data.emailSent
            ? 'Payment link emailed to the customer again.'
            : 'The link was regenerated but the email did not send. Open the invoice to check.'
        );
        setResendConfirmId(null);
        loadInvoices();
      } else {
        setResendMessage(data.error || 'Could not resend the payment link.');
      }
    } catch {
      setResendMessage('Could not resend the payment link.');
    } finally {
      setResendingId(null);
    }
  }

  async function loadInvoices() {
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      if (sort !== 'newest') params.set('sort', sort);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/admin/invoices?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices);
        setLoadError('');
      } else {
        setLoadError(data.error || 'Failed to load invoices.');
      }
    } catch {
      setLoadError('Failed to load invoices.');
    }
  }

  useEffect(() => {
    loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when a filter that has no Search button changes. loadInvoices is redefined on every render, so listing it would refetch continuously.
  }, [status, sort, from, to]);

  /**
   * Search as you type. Kieran, 2026-09-25: "this doesn't work on invoice". It did work, but only
   * once you pressed Enter or found the small Search button, so typing a product name and watching
   * nothing happen looked exactly like a broken box. Orders has always filtered as you type, and
   * these two screens should not behave differently.
   *
   * The wait is because every keystroke here is a real database query, unlike Orders which already
   * holds every order in the page. 350ms is long enough that typing a word is one query, short
   * enough that it feels immediate. Enter and the Search button still work and skip the wait.
   */
  useEffect(() => {
    const timer = setTimeout(() => { loadInvoices(); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q only. loadInvoices is redefined on every render, so listing it would refetch continuously.
  }, [q]);

  async function runSetup() {
    setSetupStatus('loading');
    try {
      const res = await fetch('/api/admin/db/setup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSetupStatus('done');
        setSetupMessage(data.message || 'Database is ready.');
        loadInvoices();
      } else {
        setSetupStatus('error');
        setSetupMessage(data.error || 'Setup failed.');
      }
    } catch {
      setSetupStatus('error');
      setSetupMessage('Setup failed.');
    }
  }

  async function createDraft() {
    setCreating(true);
    try {
      const res = await fetch('/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const data = await res.json();
      if (res.ok) {
        router.push(`/admin/invoices/${data.invoice.id}/edit`);
      } else {
        setLoadError(data.error || 'Failed to create draft.');
      }
    } finally {
      setCreating(false);
    }
  }

  function statusLabel(value: InvoiceListRow['status']) {
    return value.replace(/_/g, ' ');
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!invoices) return;
    setSelectedIds((prev) => {
      const allSelected = invoices.length > 0 && invoices.every((inv) => prev.has(inv.id));
      const next = new Set(prev);
      invoices.forEach((inv) => (allSelected ? next.delete(inv.id) : next.add(inv.id)));
      return next;
    });
  }

  // Deleting an invoice also deletes its linked order (see deleteInvoice() in
  // db.ts) — so this removes it from Orders/Dispatch too, not just this list.
  async function handleDeleteOne(id: number) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setInvoices((prev) => prev?.filter((inv) => inv.id !== id) ?? prev);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setDeleteConfirmId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setLoadError(data.error || 'Failed to delete invoice.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    try {
      const results = await Promise.all(
        Array.from(selectedIds).map((id) =>
          fetch(`/api/admin/invoices/${id}`, { method: 'DELETE' })
            .then((res) => ({ id, ok: res.ok }))
            .catch(() => ({ id, ok: false }))
        )
      );
      const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));
      const failedCount = results.length - deletedIds.size;

      setInvoices((prev) => prev?.filter((inv) => !deletedIds.has(inv.id)) ?? prev);
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);

      if (failedCount > 0) {
        setLoadError(`Deleted ${deletedIds.size} invoice${deletedIds.size === 1 ? '' : 's'}, but ${failedCount} could not be deleted.`);
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h1 className="text-lg font-semibold text-stone-800 mb-1">Invoices</h1>
              <p className="text-xs text-stone-500">
                Manual invoices for wholesale customers, special orders, and backup payment collection.
              </p>
            </div>
            <button
              onClick={createDraft}
              disabled={creating}
              className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50 shrink-0"
            >
              {creating ? 'Creating…' : 'New Invoice'}
            </button>
          </div>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mt-6 mb-6">
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

          {/* Bulk selection toolbar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 mt-6 border border-red-200 bg-red-50 px-4 py-2.5">
              <p className="text-[10px] tracking-[0.15em] uppercase text-red-500">
                {selectedIds.size} invoice{selectedIds.size === 1 ? '' : 's'} selected
              </p>
              {bulkDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-500">
                    Delete permanently? Linked orders will also be removed from Orders &amp; Dispatch. This cannot be undone.
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="bg-red-500 text-white text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {bulkDeleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    onClick={() => setBulkDeleteConfirm(false)}
                    disabled={bulkDeleting}
                    className="border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="border border-red-300 text-red-500 text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-100 transition-colors"
                  >
                    Delete Selected
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white border border-stone-200 mt-6">
            <div style={{ top: 'calc(var(--site-header-stack-height, 0px) + var(--admin-bar-height, 0px))' }} className="sticky z-20 bg-white px-6 py-4 border-b border-stone-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-sm font-semibold text-stone-800">
                    All Invoices {invoices ? `(${invoices.length.toLocaleString()})` : ''}
                  </h2>
                  {resendMessage && <p className="text-xs text-stone-600">{resendMessage}</p>}
                </div>
                {/* Wraps on a phone (task 1fb77058). A fixed 224px search box next
                    to the status dropdown and the Search button came to 434px on a
                    390px screen: the dropdown sat 68px over the edge and Search
                    137px over, both unreachable because this page clips. */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadInvoices()}
                    placeholder="Search as you type, eg Amber serum"
                    aria-label="Search invoices"
                    className="flex-1 min-w-[180px] sm:flex-none sm:w-56 border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors"
                  />
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    aria-label="Filter by status"
                    className="border border-stone-200 px-3 py-2 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white"
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="viewed">Viewed</option>
                    <option value="payment_pending">Payment Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  {/* The list already updates as you type. This is here for anyone who expects a
                      button to press, and for a retry if a search failed. */}
                  <button onClick={loadInvoices} className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-800 transition-colors px-2">
                    Search
                  </button>
                </div>
              </div>

              {/* Put them in an order, or show one stretch of dates. These re-run on their own:
                  there is no Search button to press, because a dropdown you have to confirm
                  feels broken. */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                <label className="flex items-center gap-1.5">
                  <span className="tracking-[0.12em] uppercase text-[9px] text-stone-500">Order by</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name_az">Name A to Z</option>
                    <option value="name_za">Name Z to A</option>
                    <option value="total_high">Biggest total first</option>
                    <option value="total_low">Smallest total first</option>
                    <option value="due_soon">Due soonest first</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="tracking-[0.12em] uppercase text-[9px] text-stone-500">Between</span>
                  <input
                    type="date"
                    value={from}
                    max={to || undefined}
                    onChange={(e) => setFrom(e.target.value)}
                    aria-label="Show invoices created on or after this day"
                    className="border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white"
                  />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="tracking-[0.12em] uppercase text-[9px] text-stone-500">And</span>
                  <input
                    type="date"
                    value={to}
                    min={from || undefined}
                    onChange={(e) => setTo(e.target.value)}
                    aria-label="Show invoices created on or before this day"
                    className="border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:border-gold-400 transition-colors bg-white"
                  />
                </label>
                {(q || from || to || sort !== 'newest' || status !== 'all') && (
                  <button
                    onClick={() => { setQ(''); setFrom(''); setTo(''); setSort('newest'); setStatus('all'); }}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors px-2 py-1"
                  >
                    Clear
                  </button>
                )}
              </div>

              <p className="text-[11px] text-stone-500">
                Searches as you type, and takes more than one word. Every word has to be on the
                invoice somewhere, so
                <span className="text-stone-700 font-medium"> Amber serum</span> finds Amber&rsquo;s serum invoice and
                <span className="text-stone-700 font-medium"> serum or cleanser</span> finds either.
                Product names and short names both count.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-500 border-b border-stone-100">
                    <th className="px-6 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={!!invoices && invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id))}
                        onChange={toggleSelectAll}
                        className="accent-gold-500"
                        aria-label="Select all invoices"
                      />
                    </th>
                    <th className="px-6 py-3">Invoice</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Total</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Paid Via</th>
                    <th className="px-6 py-3">Due</th>
                    <th className="px-6 py-3">Created</th>
                    <th className="px-6 py-3">Tracking</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices && invoices.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-6 py-8 text-center text-stone-500">
                        No invoices yet. Create one using the button above.
                      </td>
                    </tr>
                  )}
                  {invoices?.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => router.push(`/admin/invoices/${row.id}/edit`)}
                      className="border-b border-stone-50 cursor-pointer transition-colors hover:bg-stone-50/50"
                    >
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="accent-gold-500"
                          aria-label={`Select invoice ${row.invoice_number}`}
                        />
                      </td>
                      <td className="px-6 py-3 font-mono text-stone-700">{row.invoice_number}</td>
                      <td className="px-6 py-3 text-stone-600">
                        {row.customer_name}
                        {row.company_name && <span className="text-stone-500"> · {row.company_name}</span>}
                        <br /><span className="text-stone-500">{row.email}</span>
                      </td>
                      <td className="px-6 py-3 text-gold-700 font-semibold">£{Number(row.total).toFixed(2)}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-block px-2 py-0.5 text-[10px] tracking-[0.1em] uppercase ${STATUS_TONE[row.status]}`}>
                          {statusLabel(row.status)}
                        </span>
                        {editedSinceLastSent(row) && (
                          <span
                            className="block mt-1 text-[9px] tracking-[0.1em] uppercase text-red-600 font-semibold"
                            title="Edited after last sent - the customer's email still has the old amount until you click Resend Payment Link"
                          >
                            Needs Resend
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-stone-500 capitalize">{row.payment_method_used ?? '-'}</td>
                      <td className="px-6 py-3 text-stone-500">{formatDate(row.due_date)}</td>
                      <td className="px-6 py-3 text-stone-500">{formatDate(row.created_at)}</td>
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        {row.tracking_number ? (
                          row.tracking_url ? (
                            <a
                              href={row.tracking_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-[11px] text-gold-700 hover:text-gold-700 underline decoration-dotted"
                              title="Track this parcel on Royal Mail"
                            >
                              {row.tracking_number}
                            </a>
                          ) : (
                            <span className="font-mono text-[11px] text-stone-600">{row.tracking_number}</span>
                          )
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-3 justify-end">
                          {canResendLink(row) && (
                            resendConfirmId === row.id ? (
                              <span className="flex items-center gap-2 whitespace-nowrap">
                                <span className="text-[10px] text-stone-500">Email the link again?</span>
                                <button
                                  onClick={() => handleResendLink(row.id)}
                                  disabled={resendingId === row.id}
                                  className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors disabled:opacity-50"
                                >
                                  {resendingId === row.id ? 'Sending…' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setResendConfirmId(null)}
                                  className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setResendConfirmId(row.id)}
                                title="Email this customer their payment link again, with all the invoice details"
                                className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase whitespace-nowrap text-stone-500 hover:text-gold-700 transition-colors"
                              >
                                Resend Payment Link
                              </button>
                            )
                          )}
                          {row.order_number && (
                            <Link
                              href={`/admin/orders?search=${encodeURIComponent(row.order_number)}`}
                              className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-gold-700 transition-colors"
                            >
                              Order
                            </Link>
                          )}
                          <Link
                            href={`/admin/invoices/${row.id}/edit`}
                            className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
                          >
                            Open
                          </Link>
                          <button
                            onClick={() => handleDuplicateOne(row.id)}
                            disabled={duplicatingId === row.id}
                            title="Make a new draft with the same details and a new invoice number. This one is not changed."
                            className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase whitespace-nowrap text-stone-500 hover:text-gold-700 transition-colors disabled:opacity-50"
                          >
                            {duplicatingId === row.id ? 'Copying…' : 'Duplicate'}
                          </button>
                          {deleteConfirmId === row.id ? (
                            <span className="flex items-center gap-2">
                              <span className="text-[10px] text-red-500">Delete?</span>
                              <button
                                onClick={() => handleDeleteOne(row.id)}
                                disabled={deletingId === row.id}
                                className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
                              >
                                {deletingId === row.id ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(row.id)}
                              className="p-2 -m-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-red-500 transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
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
