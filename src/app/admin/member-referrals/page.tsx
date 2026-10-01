'use client';

import { useEffect, useState } from 'react';

interface Referral {
  id: number;
  referrer_id: number;
  status: string;
  review_reason: string | null;
  review_note: string | null;
  review_decision: string | null;
  reviewed_at: string | null;
  referrer_email: string;
  referrer_frozen_at: string | null;
  referrer_frozen_reason: string | null;
  buyer_id: number;
  buyer_email: string;
  buyer_frozen_at: string | null;
  buyer_frozen_reason: string | null;
  referrer_postcode: string | null;
  buyer_postcode: string | null;
  referrer_phone: string | null;
  buyer_phone: string | null;
  order_number: string | null;
  order_status: string | null;
  subtotal: string | null;
}

interface SafetyAccount {
  id: number;
  email: string;
  frozenAt: string | null;
  frozenReason: string | null;
}

interface StageReport {
  customer_id: number;
  milestone: number;
  status: 'clear' | 'review';
  summary: string;
  referral_ids: number[];
  checked_at: string;
  email: string;
  glow_card_frozen_at: string | null;
  glow_card_frozen_reason: string | null;
  code: string | null;
  code_active: boolean | null;
  times_redeemed: number | null;
}

export default function MemberReferralsAdminPage() {
  const [rows, setRows] = useState<Referral[]>([]);
  const [reports, setReports] = useState<StageReport[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [safetyNotes, setSafetyNotes] = useState<Record<number, string>>({});

  async function load() {
    const response = await fetch('/api/admin/member-referrals', { cache: 'no-store' });
    const result = await response.json().catch(() => null);
    if (!response.ok) { setError(result?.error || 'Referral records could not be loaded.'); return; }
    setRows(result.referrals || []);
    setReports(result.reports || []);
    setError('');
  }

  useEffect(() => { void load(); }, []);

  async function decide(id: number, decision: 'approve' | 'reject') {
    const note = (notes[id] || '').trim();
    if (note.length < 5) { setError('Add a short reason before deciding.'); return; }
    setBusy(id);
    try {
      const response = await fetch('/api/admin/member-referrals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, note }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) setError(result?.error || 'The decision could not be saved.');
      else {
        setNotes(previous => { const next = { ...previous }; delete next[id]; return next; });
        await load();
      }
    } catch { setError('The decision could not be saved. Please try again.'); }
    finally { setBusy(null); }
  }

  async function changeAccess(account: SafetyAccount) {
    const note = (safetyNotes[account.id] || '').trim();
    if (note.length < 5) { setError('Add a short reason before changing Beauty Card access.'); return; }
    setBusy(-account.id);
    try {
      const response = await fetch('/api/admin/member-referrals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: account.id,
          decision: account.frozenAt ? 'restore' : 'freeze',
          note,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) setError(result?.error || 'Beauty Card access could not be changed.');
      else {
        setSafetyNotes(previous => { const next = { ...previous }; delete next[account.id]; return next; });
        await load();
      }
    } catch { setError('Beauty Card access could not be changed. Please try again.'); }
    finally { setBusy(null); }
  }

  const review = rows.filter(row => row.status === 'review');
  const safetyAccountMap = new Map<number, SafetyAccount>();
  for (const row of rows) {
    if (row.status === 'review' || row.referrer_frozen_at) {
      safetyAccountMap.set(row.referrer_id, {
        id: row.referrer_id,
        email: row.referrer_email,
        frozenAt: row.referrer_frozen_at,
        frozenReason: row.referrer_frozen_reason,
      });
    }
    if (row.status === 'review' || row.buyer_frozen_at) {
      safetyAccountMap.set(row.buyer_id, {
        id: row.buyer_id,
        email: row.buyer_email,
        frozenAt: row.buyer_frozen_at,
        frozenReason: row.buyer_frozen_reason,
      });
    }
  }
  for (const report of reports) {
    safetyAccountMap.set(report.customer_id, {
      id: report.customer_id,
      email: report.email,
      frozenAt: report.glow_card_frozen_at,
      frozenReason: report.glow_card_frozen_reason,
    });
  }
  const safetyAccounts = Array.from(safetyAccountMap.values());
  return <main className="max-w-6xl mx-auto px-4 py-10">
    <p className="text-xs uppercase tracking-[0.2em] text-gold-700">Member rewards</p>
    <h1 className="font-serif text-3xl text-stone-800 mt-2 mb-3">Referral checks</h1>
    <p className="text-sm text-stone-600 mb-6 max-w-3xl">
      Matching details may belong to a real shared household. Check the order and customer records before approving or rejecting a referral.
    </p>
    {error && <p role="alert" className="bg-amber-50 border border-amber-300 text-amber-900 p-3 mb-5 text-sm">{error}</p>}
    <section className="border border-gold-200 bg-gold-50/40 p-5 mb-8">
      <h2 className="font-serif text-xl text-stone-800">Final five-stamp reports</h2>
      <p className="text-sm text-stone-600 mt-2 max-w-3xl">
        Every reward stage creates a report after all five invitations are checked again. A clear report releases the code straight away. A warning pauses it for a staff decision.
      </p>
      {reports.length === 0 && <p className="text-sm text-stone-600 mt-4">No five-stamp report has been created yet.</p>}
      <div className="space-y-3 mt-4">{reports.map(report => <div key={`${report.customer_id}-${report.milestone}`} className="border border-gold-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><p className="text-sm font-semibold text-stone-800 break-all">{report.email}</p><p className="text-xs text-stone-600 mt-1">Stage ending at {report.milestone} stamps · {report.referral_ids.length} supporting invitations checked</p></div>
          <span className={report.status === 'clear' ? 'text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1' : 'text-xs font-semibold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-1'}>
            {report.status === 'clear' ? 'Automatic checks passed' : 'Staff decision needed'}
          </span>
        </div>
        <p className="text-xs text-stone-700 mt-3">{report.summary}</p>
        <p className="text-xs text-stone-600 mt-2">Reward code: {report.code || 'Not issued'}{report.code ? report.times_redeemed ? ' · Used' : report.code_active ? ' · Ready to use' : ' · Stopped' : ''}</p>
      </div>)}</div>
    </section>
    <section className="border border-stone-200 bg-stone-50 p-5 mb-8">
      <h2 className="font-serif text-xl text-stone-800">Account safety controls</h2>
      <p className="text-sm text-stone-600 mt-2 max-w-3xl">
        Freeze a Beauty Card while suspicious activity is checked. Its referral link, reward claims and unused reward codes stop working, but the member's account and orders remain available.
      </p>
      {safetyAccounts.length === 0 && <p className="text-sm text-stone-600 mt-4">No reviewed or frozen accounts need an access decision.</p>}
      <div className="grid lg:grid-cols-2 gap-3 mt-4">{safetyAccounts.map(account => <div key={account.id} className="border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800 break-all">{account.email}</p>
          <span className={account.frozenAt ? 'text-xs font-semibold text-red-800 bg-red-50 border border-red-200 px-2 py-1' : 'text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-1'}>
            {account.frozenAt ? 'Beauty Card frozen' : 'Beauty Card active'}
          </span>
        </div>
        {account.frozenReason && <p className="text-xs text-stone-600 mt-2">Current reason: {account.frozenReason}</p>}
        <label htmlFor={`safety-note-${account.id}`} className="block text-xs font-semibold text-stone-800 mt-4 mb-2">
          Reason for {account.frozenAt ? 'restoring' : 'freezing'} access
        </label>
        <textarea id={`safety-note-${account.id}`} maxLength={500} rows={2} value={safetyNotes[account.id] || ''}
          onChange={event => setSafetyNotes(previous => ({ ...previous, [account.id]: event.target.value }))}
          placeholder="What did you find?" className="w-full border border-stone-300 px-3 py-2.5 text-sm text-stone-800" />
        <button disabled={busy === -account.id || (safetyNotes[account.id] || '').trim().length < 5}
          onClick={() => changeAccess(account)}
          className={account.frozenAt
            ? 'mt-3 bg-gold-700 text-white text-xs px-4 py-2.5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-gold-700'
            : 'mt-3 border border-red-300 text-red-800 bg-white text-xs px-4 py-2.5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-700'}>
          {account.frozenAt ? 'Restore Beauty Card' : 'Freeze Beauty Card'}
        </button>
      </div>)}</div>
    </section>
    <h2 className="text-sm font-semibold text-stone-800 mb-3">Waiting for review ({review.length})</h2>
    {review.length === 0 && <p className="text-sm text-stone-600 mb-6">No referrals need a decision.</p>}
    <div className="space-y-3 mb-10">{review.map(row => <section key={row.id} className="border border-gold-200 bg-white p-5">
      <p className="text-sm font-semibold text-stone-800">{row.review_reason}</p>
      <div className="grid sm:grid-cols-2 gap-3 text-xs text-stone-600 mt-3">
        <div><strong>Existing member:</strong> {row.referrer_email}<br />{row.referrer_postcode || 'No postcode'} · {row.referrer_phone || 'No phone'}</div>
        <div><strong>New member:</strong> {row.buyer_email}<br />{row.buyer_postcode || 'No postcode'} · {row.buyer_phone || 'No phone'}</div>
      </div>
      <p className="text-xs text-stone-600 mt-3">First order: {row.order_number || 'None'} · {row.order_status || 'Waiting'} · {row.subtotal ? `£${Number(row.subtotal).toFixed(2)}` : 'No order total'}</p>
      <label htmlFor={`referral-note-${row.id}`} className="block text-xs font-semibold text-stone-800 mt-4 mb-2">Reason for your decision</label>
      <textarea id={`referral-note-${row.id}`} maxLength={500} rows={2} value={notes[row.id] || ''}
        onChange={event => setNotes(previous => ({ ...previous, [row.id]: event.target.value }))}
        placeholder="What did you check?" className="w-full border border-stone-300 px-3 py-2.5 text-sm text-stone-800" />
      <div className="flex flex-wrap gap-3 mt-3">
        <button disabled={busy === row.id || (notes[row.id] || '').trim().length < 5} onClick={() => decide(row.id, 'approve')} className="bg-gold-700 text-white text-xs px-4 py-2.5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-gold-700">Approve after checking</button>
        <button disabled={busy === row.id || (notes[row.id] || '').trim().length < 5} onClick={() => decide(row.id, 'reject')} className="border border-stone-400 text-stone-800 text-xs px-4 py-2.5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-stone-800">Reject</button>
      </div>
    </section>)}</div>
    <h2 className="text-sm font-semibold text-stone-800 mb-3">Recent referrals</h2>
    <div className="space-y-2">{rows.slice(0, 50).map(row => <div key={row.id} className="border border-stone-200 bg-white px-4 py-3 text-xs text-stone-700 flex flex-wrap justify-between gap-2">
      <span>{row.referrer_email} invited {row.buyer_email}{row.review_note && <span className="block text-stone-600 mt-1">Staff {row.review_decision === 'approve' ? 'approved' : 'rejected'} after review: {row.review_note}</span>}</span><span>{row.status.replace('_', ' ')}</span>
    </div>)}</div>
  </main>;
}
