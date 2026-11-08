'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { ActivityLine, CompareAccountButton, SharedConnectionLine, type CompareTarget } from '@/components/admin/AccountComparison';
import type { SecurityEvidence, SecurityReviewCase, SecurityReviewStatus } from '@/lib/db/securityReviews';

// What each kind of match means, in the words a person would use.
const KIND_WORDS: Record<SecurityEvidence['kinds'][number], string> = {
  email: 'email address',
  phone: 'phone number',
  name: 'name',
  address: 'home address',
  ip: 'internet connection',
};

const STATUS_LABELS: Record<SecurityReviewStatus, string> = {
  pending: 'Pending',
  legitimate_shared_network: 'Legitimate / shared network',
  confirmed_duplicate: 'Confirmed duplicate',
  dismissed: 'Dismissed',
};

function firstWord(label: string): string {
  return label.includes('@') ? label : label.split(' ')[0];
}

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
        body: JSON.stringify({ status, note: notes[row.id] ?? '', expectedStatus: row.status, expectedUpdatedAt: row.updated_at }),
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

  // Undo (Samuel, 30 September 2026): a decision made by mistake goes back to Pending, with the
  // three choices showing again. The old decision stays in the case's history on the server.
  async function undo(row: SecurityReviewCase) {
    const was = STATUS_LABELS[row.status].toLowerCase();
    if (!window.confirm(`Undo "${was}" on case ${row.id} and put it back to Pending?`)) return;
    setBusy(row.id);
    setError('');
    try {
      const response = await fetch(`/api/admin/security-reviews/${row.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending', note: '', expectedStatus: row.status, expectedUpdatedAt: row.updated_at }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Could not undo that decision.');
      setFilter('pending');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not undo that decision.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      <AdminSidebar />
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/admin/dashboard"
            className="mb-3 inline-flex min-h-11 touch-manipulation items-center py-2 text-[10px] tracking-[0.18em] uppercase text-stone-600 transition-colors hover:text-gold-700"
          >
            &larr; Back to dashboard
          </Link>
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
              const subjectExists = Boolean(row.subject_customer_id && (row.subject_name || row.subject_email));
              const subjectLabel = row.subject_name || row.subject_email || '';
              const subjectWho = firstWord(subjectLabel);
              // True when every connection behind this case's internet matches is one of Apple's.
              const allShared = Object.values(row.shared_connections ?? {}).flat();
              const allRelay = allShared.length > 0 && allShared.every(c => c.applePrivateRelay);
              const accounts = new Map((row.matched_accounts ?? []).map(a => [a.id, a]));
              const targets: CompareTarget[] = row.evidence
                .filter(item => accounts.has(item.matchedCustomerId))
                .map(item => {
                  const a = accounts.get(item.matchedCustomerId)!;
                  return { id: a.id, label: a.name || a.email };
                });
              return <section key={row.id} className="border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-stone-500">Case {row.id}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.evidence_band === 'priority' ? 'bg-orange-100 text-orange-900' : 'bg-gold-50 text-gold-800'}`}>{row.evidence_band}</span>
                      <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-700">{STATUS_LABELS[row.status]}</span>
                    </div>
                    {subjectExists ? <>
                      <h2 className="mt-2 font-serif text-xl text-stone-900">
                        <Link href={`/admin/customers/${row.subject_customer_id}`} className="hover:text-gold-700">{subjectLabel}</Link>
                      </h2>
                      {row.subject_email && row.subject_email !== subjectLabel && <p className="text-sm text-stone-600">{row.subject_email}</p>}
                      {row.subject_customer_id && <ActivityLine who={subjectWho} activity={row.activity?.[row.subject_customer_id]} />}
                    </> : <>
                      <h2 className="mt-2 font-serif text-xl text-stone-900">Account since removed</h2>
                      <p className="max-w-xl text-sm text-stone-600">The account this case was raised about has been deleted or merged into another, so there is nothing left to compare. The accounts it matched are listed below.</p>
                    </>}
                  </div>
                  <div className="text-right text-xs leading-5 text-stone-500">
                    <div>{formatDate(row.created_at)}</div>
                    <div>{row.source_event.replace('_', ' ')} · seen {row.occurrence_count || 1} time{row.occurrence_count === 1 ? '' : 's'}</div>
                  </div>
                </div>

                <div className={`mt-4 border p-3 text-sm ${ipOnly ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-gold-200 bg-gold-50 text-stone-800'}`}>
                  <strong>{ipOnly
                    ? allRelay
                      ? 'Same Apple iPhone Private Relay address only, which thousands of strangers share. No name, email, phone or address matches.'
                      : 'Same internet connection only. No name, email, phone or address matches.'
                    : row.summary}</strong>
                  {row.order_number && <div className="mt-1">Order: <Link href={`/admin/orders?search=${encodeURIComponent(row.order_number)}`} className="underline">{row.order_number}</Link></div>}
                  {row.discount_code && <div>Discount code: {row.discount_code}</div>}
                </div>

                <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-stone-600">
                  {row.evidence.length === 1 ? 'The account it matched' : `The ${row.evidence.length} accounts it matched`}
                </h3>
                <ul className="mt-2 divide-y divide-stone-100 border-y border-stone-100">
                  {row.evidence.map((item, index) => {
                    const other = accounts.get(item.matchedCustomerId);
                    const shared = row.shared_connections?.[item.matchedCustomerId] ?? [];
                    const relayOnly = shared.length > 0 && shared.every(c => c.applePrivateRelay);
                    const otherWho = other ? firstWord(other.name || other.email) : `Customer ${item.matchedCustomerId}`;
                    return <li key={`${item.matchedCustomerId}-${index}`} className="py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 text-sm text-stone-800">
                          {other ? <>
                            <Link href={`/admin/customers/${other.id}`} className="font-semibold text-stone-900 hover:text-gold-700">{other.name || other.email}</Link>
                            {other.name && <span className="ml-1.5 text-xs text-stone-600">{other.email}</span>}
                          </> : <span className="font-semibold text-stone-700">Customer {item.matchedCustomerId} (account since removed)</span>}
                          <div className="mt-0.5 text-xs text-stone-600">
                            Matches on: {item.kinds.map(kind => kind === 'ip' && relayOnly ? 'Apple iPhone Private Relay address' : KIND_WORDS[kind] ?? kind).join(' and ')}
                          </div>
                        </div>
                        {other && subjectExists && row.subject_customer_id && (
                          <CompareAccountButton subjectId={row.subject_customer_id} subjectLabel={subjectLabel} target={{ id: other.id, label: other.name || other.email }} others={targets} />
                        )}
                      </div>
                      {other && <ActivityLine who={otherWho} activity={row.activity?.[other.id]} />}
                      {shared.map(c => (
                        <SharedConnectionLine
                          key={c.ip}
                          ip={c.ip}
                          applePrivateRelay={c.applePrivateRelay}
                          subjectWho={subjectWho}
                          subjectLastSeen={c.subjectLastSeen}
                          otherWho={otherWho}
                          otherLastSeen={c.otherLastSeen}
                        />
                      ))}
                    </li>;
                  })}
                </ul>

                {row.status === 'pending' ? <div className="mt-5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-600" htmlFor={`note-${row.id}`}>Decision note</label>
                  <textarea id={`note-${row.id}`} value={notes[row.id] ?? ''} onChange={event => setNotes(current => ({ ...current, [row.id]: event.target.value }))}
                    className="mt-2 min-h-20 w-full border border-stone-300 px-3 py-2 text-sm" placeholder="What did you check, and why is this the right decision?" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button disabled={busy !== null} onClick={() => decide(row, 'legitimate_shared_network')} className="bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Legitimate / shared network</button>
                    <button disabled={busy !== null} onClick={() => decide(row, 'confirmed_duplicate')} className="bg-orange-700 px-3 py-2 text-xs font-semibold text-white">Confirmed duplicate</button>
                    <button disabled={busy !== null} onClick={() => decide(row, 'dismissed')} className="bg-stone-700 px-3 py-2 text-xs font-semibold text-white">Dismiss</button>
                  </div>
                </div> : <div className="mt-4 text-sm text-stone-600">
                  <strong>Decision:</strong> {row.decision_note || 'No note recorded'} · {row.reviewed_by || 'Admin'} · {formatDate(row.resolved_at)}
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => undo(row)}
                      className="min-h-10 border border-stone-400 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:border-stone-900 disabled:opacity-50"
                    >
                      {busy !== null ? 'Undoing...' : 'Undo this decision'}
                    </button>
                    <p className="mt-1 text-xs text-stone-500">Made a mistake? This puts the case back to Pending so it can be decided again.</p>
                  </div>
                </div>}
              </section>;
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
