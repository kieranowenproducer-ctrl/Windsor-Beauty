'use client';

import { useRef, useState } from 'react';
import { MERGE_LABELS, type CustomerMergePreview } from '@/lib/customerMerge';

export default function MergeAccountCard({ customerId }: { customerId: number }) {
  const [other, setOther] = useState('');
  const [preview, setPreview] = useState<CustomerMergePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const requestId = useRef<string | null>(null);
  const generation = useRef(0);
  const base = `/api/admin/customers/${customerId}/merge`;
  async function load() {
    const current = ++generation.current;
    setBusy(true); setError(''); setPreview(null); setConfirmed(false); requestId.current = null;
    try {
      const response = await fetch(`${base}?other=${encodeURIComponent(other.trim())}`, { cache: 'no-store' });
      const data = await response.json();
      if (current !== generation.current) return;
      if (!response.ok) throw new Error(data.error || 'The preview could not be loaded.');
      setPreview(data.preview); requestId.current = crypto.randomUUID();
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'The preview could not be loaded.'); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function merge() {
    if (!preview || !confirmed || busy || !requestId.current) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        removeId: preview.remove.id, token: preview.token, requestId: requestId.current, confirm: true,
      }) });
      const data = await response.json();
      if (!response.ok) {
        if ([400, 401, 403, 409].includes(response.status)) { setPreview(null); setConfirmed(false); requestId.current = null; }
        throw new Error(data.error || 'Check the account history before retrying.');
      }
      setDone(true); setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'The response was lost. Retry here to check the same request.'); }
    finally { setBusy(false); }
  }
  return <section className="border border-stone-200 bg-white p-5 mt-6" aria-labelledby="customer-merge-title">
    <h2 id="customer-merge-title" className="text-sm font-medium text-stone-800">Merge a duplicate account</h2>
    <p className="mt-2 text-xs text-stone-600">Keep this account and move the other account&apos;s linked history here. This account&apos;s profile, login, consent and benefits stay the same. No emails are sent.</p>
    {done ? <p role="status" className="mt-3 text-sm text-green-800">Merged. <button type="button" className="underline min-h-11" onClick={() => window.location.reload()}>Reload this account to see the updated history</button>.</p> : <>
      <label htmlFor="merge-other" className="block mt-4 text-xs text-stone-700">Other account&apos;s email or customer ID</label>
      <div className="flex flex-wrap gap-2 mt-1">
        <input id="merge-other" value={other} disabled={busy} maxLength={254} autoComplete="off" className="min-h-11 min-w-0 flex-1 border border-stone-300 px-3 text-sm" onChange={event => {
          generation.current++; setOther(event.target.value); setPreview(null); setConfirmed(false); requestId.current = null;
        }} />
        <button type="button" disabled={busy || !other.trim()} onClick={load} className="min-h-11 border border-stone-400 px-4 text-xs text-stone-800 disabled:opacity-50">{busy ? 'Working...' : 'Preview merge'}</button>
      </div>
      {preview && <div className="mt-4 space-y-3 text-xs text-stone-700">
        <p><strong>Keep:</strong> {preview.keep.name} ({preview.keep.email})</p>
        <p><strong>Remove login:</strong> {preview.remove.name} ({preview.remove.email})</p>
        <ul className="list-disc pl-5 space-y-1">{preview.moves.map(item => <li key={item.table}>{MERGE_LABELS[item.table] || item.table}: {item.count}</li>)}</ul>
        {preview.moves.length === 0 && <p>No linked history to move.</p>}
        <p>The removed account will be deleted and its sign-in, verification and password-reset links revoked. Historical email addresses, invoice details and payment records are not rewritten. This cannot be undone here.</p>
        {preview.blockers.length > 0 ? <div role="status"><p className="font-medium">These records need review first:</p><ul className="list-disc pl-5 space-y-1">{preview.blockers.map((reason, i) => <li key={i}>{reason}</li>)}</ul></div> : <>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /><span>I have checked that these accounts belong to the same person and want to keep the account shown above.</span></label>
          <button type="button" disabled={!confirmed || busy} onClick={merge} className="min-h-11 border border-red-700 px-4 text-red-800 disabled:opacity-50">Merge into this account</button>
        </>}
      </div>}
    </>}
    {error && <p role="alert" className="mt-3 text-xs text-red-800">{error}</p>}
  </section>;
}
