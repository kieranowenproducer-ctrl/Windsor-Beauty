'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import type { SecurityReviewCase, SecurityReviewStatus } from '@/lib/db/securityReviews';

const STATUS_LABELS: Record<SecurityReviewStatus, string> = {
  pending: 'Pending',
  legitimate_shared_network: 'Legitimate / shared network',
  confirmed_duplicate: 'Confirmed duplicate',
  dismissed: 'Dismissed',
};

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
}

export default function SecurityReviewsPage() {
  const [cases, setCases] = useState<SecurityReviewCase[]>([]);
  const [filter, setFilter] = useState<'all' | SecurityReviewStatus>('pending');
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  function load() {
    fetch('/api/admin/security-reviews')
      .then(async response => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Could not load security reviews.');
        setCases(Array.isArray(data.cases) ? data.cases : []);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load security reviews.'));
  }

  useEffect(load, []);
  const visible = useMemo(() => filter === 'all' ? cases : cases.filter(row => row.status === filter), [cases, filter]);

  async function decide(row: SecurityReviewCase, status: SecurityReviewStatus) {
    setBusy(row.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/security-reviews/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: notes[row.id] ?? '' }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not save that decision.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that decision.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-700">Security / Account Review / Discount Abuse</p>
            <h1 className="mt-2 font-serif text-3xl text-stone-900">Customer security reviews</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
              Evidence for a person to review. These cases never stop registration, ordering or a valid discount code. An internet address is supporting information only.
            </p>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {(['pending', 'all', 'legitimate_shared_network', 'confirmed_duplicate', 'dismissed'] as const).map(value => (
              <button key={value} type="button" onClick={() => setFilter(value)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold ${filter === value ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'}`}>
                {value === 'all' ? 'All' : STATUS_LABELS[value]}
              </button>
            ))}
          </div>

          {error && <div role="alert" className="mb-4 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
          {!visible.length && <div className="border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">No cases in this view.</div>}

          <div className="space-y-4">
            {visible.map(row => {
              const ipOnly = row.evidence.length > 0 && row.evidence.every(item => item.ipOnly);
              return <section key={row.id} className="border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Case {row.id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.evidence_band === 'priority' ? 'bg-orange-100 text-orange-900' : 'bg-gold-50 text-gold-800'}`}>{row.evidence_band}</span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">{STATUS_LABELS[row.status]}</span>
                    </div>
                    <h2 className="mt-2 font-serif text-xl text-stone-900">{row.subject_name || row.subject_email || `Customer ${row.subject_customer_id}`}</h2>
                    {row.subject_email && <p className="text-sm text-stone-600">{row.subject_email}</p>}
                  </div>
                  <div className="text-right text-xs leading-5 text-stone-500">
                    <div>{formatDate(row.created_at)}</div>
                    <div>{row.source_event.replace('_', ' ')} · seen {row.occurrence_count || 1} time{row.occurrence_count === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <div className={`mt-4 border p-3 text-sm ${ipOnly ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-gold-200 bg-gold-50 text-stone-800'}`}>
                  <strong>{ipOnly ? 'Shared IP only - no matching identity information.' : row.summary}</strong>
                  <div className="mt-1">Associated customer records: {row.matched_customer_ids.join(', ') || 'none'}</div>
                  {row.order_number && <div>Order: {row.order_number}</div>}
                  {row.discount_code && <div>Discount code: {row.discount_code}</div>}
                </div>

                <div className="mt-3 space-y-1 text-xs text-stone-600">
                  {row.evidence.map((item, index) => <div key={`${item.matchedCustomerId}-${index}`}>
                    Customer {item.matchedCustomerId}: {item.ipOnly ? 'shared IP only' : item.kinds.join(', ')}{item.observedAt ? ` · ${formatDate(item.observedAt)}` : ''}
                  </div>)}
                </div>

                {row.status === 'pending' ? <div className="mt-5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600" htmlFor={`note-${row.id}`}>Decision note</label>
                  <textarea id={`note-${row.id}`} value={notes[row.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))}
                    className="mt-2 min-h-20 w-full border border-stone-300 px-3 py-2 text-sm" placeholder="What did you check, and why is this the right decision?" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busy === row.id} onClick={() => decide(row, 'legitimate_shared_network')} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Legitimate / shared network</button>
                    <button disabled={busy === row.id} onClick={() => decide(row, 'confirmed_duplicate')} className="bg-orange-700 px-3 py-2 text-xs font-semibold text-white">Confirmed duplicate</button>
                    <button disabled={busy === row.id} onClick={() => decide(row, 'dismissed')} className="bg-stone-700 px-3 py-2 text-xs font-semibold text-white">Dismiss</button>
                  </div>
                </div> : <div className="mt-4 text-sm text-stone-600">
                  <strong>Decision:</strong> {row.decision_note || 'No note recorded'} · {row.reviewed_by || 'Admin'} · {formatDate(row.resolved_at)}
                </div>}
              </section>;
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
