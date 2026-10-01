'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { INVITATION_STATE_LABEL, INVITATION_STATE_TONE } from '@/lib/affiliateInvitationLabels';

type Overview = { profiles: Array<Record<string, string | number>>; payouts: Array<Record<string, string | number>>; referrals: Array<Record<string, string | number | boolean | null>>; invitations?: Array<Record<string, string | number | boolean | null>>; setupRequired?: boolean };

const money = (value: unknown) => `£${(Number(value) / 100).toFixed(2)}`;
// Same readable date as Raf sees on his own page. This used to print 22/03/2027 here
// and 22 Mar 2027 there, which reads as two different systems.
const date = (value: unknown) => new Date(String(value)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const CARD = 'border border-stone-200 bg-white';
const EYEBROW = 'text-[9px] font-semibold uppercase tracking-[0.3em] text-gold-700';
const TILE_LABEL = 'text-[9px] tracking-[0.18em] uppercase text-stone-500';

// Plain words for the stage a request has reached. The raw values (payment_pending,
// store_credit) were being printed at people, and staff here are not technical.
const PAYOUT_STAGE: Record<string, string> = {
  requested: 'Waiting for your decision',
  payment_pending: 'Approved, waiting to be paid',
  paid: 'Paid',
  refused: 'Refused',
  cancelled: 'Cancelled',
};
const PAYOUT_TONE: Record<string, string> = {
  requested: 'bg-gold-50 text-gold-700',
  payment_pending: 'bg-sky-50 text-sky-700',
  paid: 'bg-green-50 text-green-700',
  refused: 'bg-stone-100 text-stone-600',
  cancelled: 'bg-stone-100 text-stone-600',
};
const METHOD_LABEL: Record<string, string> = { cash: 'Cash', store_credit: 'Shop credit' };

function StaffInvitation({ affiliateCustomerId, active, preview }: { affiliateCustomerId: number; active: boolean; preview: boolean }) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestLink, setRequestLink] = useState('');

  async function getRequestLink() {
    setMessage('');
    if (!active) return setMessage('Restore the affiliate profile before opening its request page.');
    if (preview) {
      setRequestLink(`${window.location.origin}/raf-invite/${'a'.repeat(32)}?preview=1`);
      return setMessage('Example request page only. Nothing was saved or sent.');
    }
    try {
      const response = await fetch('/api/admin/affiliates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_link', customerId: affiliateCustomerId }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.link) throw new Error(result?.error || 'The request page could not be opened.');
      setRequestLink(result.link);
      setMessage('Staff can share this page if Raf cannot access his panel. The recipient requests their own email.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The request page could not be opened.'); }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setLink('');
    setMessage('');
    if (!active) return setMessage('Restore the affiliate profile before creating an invitation.');
    setBusy(true);
    try {
      if (preview) {
        setLink(`${window.location.origin}/account/register?affiliateInvite=${'a'.repeat(64)}`);
        setMessage('Example link only. Nothing was saved or sent.');
        return;
      }
      const response = await fetch('/api/admin/affiliates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_invitation', customerId: affiliateCustomerId, recipientEmail: email.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.link) throw new Error(result?.error || 'The private link could not be created.');
      setLink(result.link);
      setMessage('Private link ready. It works once for this email address and expires in seven days.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The private link could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Staff invitation fallback" className="mt-6 border-t border-stone-100 pt-5">
    <p className={EYEBROW}>Invitation fallback</p>
    <h3 className="mt-1 font-serif text-lg text-stone-800">Help Raf with invitations</h3>
    <p className="mt-1 text-xs leading-relaxed text-stone-600">Staff can retrieve Raf’s request page or create a one-person link. Neither button sends an email.</p>
    <button type="button" onClick={getRequestLink} disabled={!active} className="mt-4 min-h-11 border border-gold-700 px-4 text-xs font-semibold text-gold-800 hover:bg-gold-50 disabled:opacity-50">Get Raf’s request page</button>
    {requestLink && <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Raf request page link" readOnly value={requestLink} onFocus={event => event.target.select()} className="min-h-11 min-w-0 flex-1 border border-stone-300 bg-white px-3 text-xs text-stone-700" /><button type="button" onClick={() => navigator.clipboard.writeText(requestLink).then(() => setMessage('Request page copied.')).catch(() => setMessage('Select the link and copy it manually.'))} className="min-h-11 border border-gold-700 px-4 text-xs font-semibold text-gold-800">Copy</button></div>}
    <p className="mt-5 text-xs text-stone-600">One-person fallback link</p>
    <form onSubmit={create} className="mt-4 flex flex-wrap gap-2">
      <label htmlFor={`staff-affiliate-invite-${affiliateCustomerId}`} className="sr-only">Recipient email address</label>
      <input id={`staff-affiliate-invite-${affiliateCustomerId}`} type="email" required maxLength={254} value={email}
        onChange={event => setEmail(event.target.value)} disabled={busy || !active} placeholder="Recipient email address"
        className="min-h-11 min-w-0 flex-1 border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none focus:border-gold-600 focus:ring-1 focus:ring-gold-600" />
      <button type="submit" disabled={busy || !active}
        className="min-h-11 bg-gold-700 px-4 text-xs font-semibold text-white hover:bg-gold-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
        {busy ? 'Creating link' : 'Create private link'}
      </button>
    </form>
    {link && <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label="Staff-created private invitation link" readOnly value={link} onFocus={event => event.target.select()}
        className="min-h-11 min-w-0 flex-1 border border-stone-300 bg-white px-3 text-xs text-stone-700" />
      <button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => setMessage('Link copied.')).catch(() => setMessage('Select the link and copy it manually.'))}
        className="min-h-11 border border-gold-700 px-4 text-xs font-semibold text-gold-800 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">Copy link</button>
    </div>}
    {message && <p role="status" className="mt-2 text-xs leading-relaxed text-stone-700">{message}</p>}
  </section>;
}

const previewOverview: Overview = {
  profiles: [{ customer_id: 83, display_name: 'Raf', referral_code: 'RAF', status: 'active', first_name: 'Raf', last_name: 'Christian', email: 'raf@example.com', code_duration_days: 183, balance_pence: 1954, referral_count: 12, order_count: 8 }],
  payouts: [{ id: 12, affiliate_customer_id: 83, display_name: 'Raf', email: 'raf@example.com', amount_pence: 1900, method: 'cash', status: 'requested', requested_at: new Date().toISOString() }],
  referrals: [{ id: 1, affiliate_customer_id: 83, status: 'active', first_name: 'Alex', last_name: 'Morgan', email: 'alex@example.com', code: 'RAF5-A12B3C4D', code_active: true, expires_at: '2027-03-22T12:00:00.000Z', order_count: 3, earned_pence: 823, created_at: '2026-09-18T12:00:00.000Z' }],
};

export function AdminAffiliates({ forcePreview = false }: { forcePreview?: boolean }) {
  const [data, setData] = useState<Overview | null>(forcePreview ? previewOverview : null);
  const [message, setMessage] = useState('');
  const [duration, setDuration] = useState('183');
  const [customDays, setCustomDays] = useState('365');
  const preview = forcePreview || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1');

  function load() {
    if (preview) { setData(previewOverview); return; }
    fetch('/api/admin/affiliates', { cache: 'no-store' }).then(r => r.json()).then(setData);
  }
  useEffect(load, [preview]);

  async function act(payload: Record<string, unknown>) {
    if (preview) {
      setData(current => {
        if (!current) return current;
        if (payload.action === 'set_status') return { ...current, profiles: current.profiles.map(p => Number(p.customer_id) === Number(payload.customerId) ? { ...p, status: String(payload.status) } : p) };
        if (payload.action === 'set_duration') return { ...current, profiles: current.profiles.map(p => Number(p.customer_id) === Number(payload.customerId) ? { ...p, code_duration_days: Number(payload.durationDays) } : p) };
        if (['approve', 'refuse', 'cancel', 'mark_paid'].includes(String(payload.action))) return { ...current, payouts: current.payouts.map(p => Number(p.id) === Number(payload.id) ? { ...p, status: payload.action === 'approve' ? (p.method === 'cash' ? 'payment_pending' : 'paid') : payload.action === 'mark_paid' ? 'paid' : payload.action === 'refuse' ? 'refused' : 'cancelled' } : p) };
        return current;
      });
      setMessage('Preview updated. No real customer, code or payment was changed.');
      return;
    }
    setMessage('Saving...');
    const response = await fetch('/api/admin/affiliates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const json = await response.json().catch(() => null);
    setMessage(response.ok ? 'Saved.' : json?.error || 'The change could not be saved.');
    if (response.ok) load();
  }

  return (
    // The standard admin shell, the same one Orders, Customers and Enquiries use. This
    // page previously hung its own `min-h-screen` box off a hard `lg:ml-64` margin, which
    // left it sitting a little further right than every other admin page.
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar previewMode={preview} />

      <main className="flex-1 p-4 sm:p-8 overflow-clip">
        <div className="max-w-6xl">

          <header className="mb-7 border-b border-stone-200 pb-6">
            <p className={EYEBROW}>Customers</p>
            <h1 className="mt-1.5 font-serif text-4xl text-stone-800">Affiliate control</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-stone-600">
              Staff controls for Raf&apos;s referrals, codes and requests. Nothing leaves his balance until you approve it here.
            </p>
          </header>

          {message && <p role="status" className="mb-6 border border-gold-200 bg-gold-50 px-4 py-3 text-sm text-stone-700">{message}</p>}

          {data?.setupRequired && (
            <section className="mb-7 border border-amber-300 bg-amber-50 p-5">
              <h2 className="font-serif text-xl text-amber-900">Database setup is needed</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-amber-900">The affiliate tables have not been added yet. Do this only on the approved database before turning the feature on.</p>
            </section>
          )}

          {data && data.profiles.length === 0 && !preview && (
            <section className={`mb-7 ${CARD} p-6`}>
              <h2 className="font-serif text-xl text-stone-800">Connect Raf Christian</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-600">This creates the affiliate profile for customer 83. It does not pay money or contact customers.</p>
              <button
                onClick={() => act({ action: 'create_profile', customerId: 83, displayName: 'Raf', referralCode: 'RAF', durationDays: 183 })}
                className="mt-5 min-h-11 bg-gold-700 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gold-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
              >
                Create Raf profile
              </button>
            </section>
          )}

          <div className="grid gap-7 xl:grid-cols-[1fr_1.15fr] xl:items-start">

            <section className={CARD}>
              <div className="border-b border-stone-100 px-5 py-4">
                <h2 className="font-serif text-xl text-stone-800">Affiliate account</h2>
              </div>
              {data?.profiles.map(p => {
                const active = p.status === 'active';
                return (
                  <div key={Number(p.customer_id)} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-serif text-2xl text-stone-800">{p.display_name}</p>
                        <p className="mt-0.5 break-words text-xs text-stone-500">{p.first_name} {p.last_name} · {p.email}</p>
                      </div>
                      <p className={`shrink-0 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] ${active ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
                        {active ? 'Active' : 'Paused'}
                      </p>
                    </div>

                    {/* The state and the button that changes it used to be one pill reading
                        "Paused · restore", which does not say which of the two it is. */}
                    <p className="mt-3 text-xs leading-relaxed text-stone-600">
                      {active
                        ? 'This profile is active. His page and private invitations also depend on the separate customer-access setting.'
                        : 'His affiliate page is closed and private invitations cannot be created or used. Commission already earned is untouched.'}
                    </p>
                    <button
                      onClick={() => act({ action: 'set_status', customerId: p.customer_id, status: active ? 'paused' : 'active' })}
                      className="mt-3 min-h-11 border border-stone-300 bg-white px-4 text-xs font-medium text-stone-700 transition-colors hover:border-stone-500 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                    >
                      {active ? 'Pause his affiliate account' : 'Restore his affiliate account'}
                    </button>

                    <div className="mt-6 grid grid-cols-3 gap-2">
                      {[['Referrals', p.referral_count], ['Orders', p.order_count], ['Balance', money(p.balance_pence)]].map(([label, value]) => (
                        <div key={String(label)} className="border border-gold-100 p-3">
                          <p className={TILE_LABEL}>{label}</p>
                          <p className="mt-1 text-lg font-semibold text-stone-800">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 border-t border-stone-100 pt-5">
                      <label htmlFor="duration" className={TILE_LABEL}>New customer codes last</label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          id="duration"
                          value={duration}
                          onChange={e => setDuration(e.target.value)}
                          className="min-h-11 flex-1 border border-stone-300 bg-white px-3 text-sm text-stone-800 outline-none transition-colors focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                        >
                          <option value="183">6 months</option>
                          <option value="274">9 months</option>
                          <option value="custom">Other</option>
                        </select>
                        {duration === 'custom' && (
                          <input
                            aria-label="Custom number of days"
                            value={customDays}
                            onChange={e => setCustomDays(e.target.value)}
                            type="number"
                            min="1"
                            max="3650"
                            className="min-h-11 w-28 border border-stone-300 px-3 text-sm text-stone-800 outline-none transition-colors focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                          />
                        )}
                        <button
                          onClick={() => act({ action: 'set_duration', customerId: p.customer_id, durationDays: Number(duration === 'custom' ? customDays : duration) })}
                          className="min-h-11 bg-gold-700 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gold-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                        >
                          Save
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-stone-500">Existing codes keep their original expiry date.</p>
                    </div>
                    <StaffInvitation affiliateCustomerId={Number(p.customer_id)} active={active} preview={preview} />
                    <section className="mt-5 border-t border-stone-100 pt-4" aria-label="Raf's invitations">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className={EYEBROW}>Invitations</p>
                        <span className="flex flex-wrap gap-3 text-[11px]">
                          <a href="/api/admin/affiliates?emailPreview=1" target="_blank" rel="noopener" className="text-gold-800 underline underline-offset-2">See the email Raf sends</a>
                          <a href="/api/admin/affiliates?emailPreview=1&requested=1" target="_blank" rel="noopener" className="text-gold-800 underline underline-offset-2">See the requested version</a>
                        </span>
                      </div>
                      {(data?.invitations || []).filter(row => Number(row.affiliate_customer_id) === Number(p.customer_id)).length === 0
                        ? <p className="mt-2 text-xs text-stone-500">No invitations yet.</p>
                        : <ul className="mt-2 space-y-2 text-xs text-stone-700">
                          {(data?.invitations || []).filter(row => Number(row.affiliate_customer_id) === Number(p.customer_id)).map(row => <li key={String(row.id)} className="flex flex-wrap items-center justify-between gap-2 border border-stone-100 px-3 py-2">
                            <span className="min-w-0 break-all">{String(row.recipient_email)}<span className="ml-2 text-stone-400">{row.created_source === 'recipient' ? 'asked on the request page' : row.created_source === 'staff' ? 'made by staff' : 'sent by Raf'}, {date(row.created_at)}</span></span>
                            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold ${INVITATION_STATE_TONE[String(row.state)] || 'bg-stone-100 text-stone-700'}`}>{INVITATION_STATE_LABEL[String(row.state)] || String(row.state)}</span>
                          </li>)}
                        </ul>}
                    </section>
                  </div>
                );
              })}
            </section>

            <section className={CARD}>
              <div className="border-b border-stone-100 px-5 py-4">
                <h2 className="font-serif text-xl text-stone-800">Payment requests</h2>
                <p className="mt-1 text-xs text-stone-500">Money only moves once you approve it and record the reference.</p>
              </div>
              <div className="divide-y divide-stone-100">
                {data?.payouts.length ? data.payouts.map(p => (
                  <article key={Number(p.id)} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-lg font-semibold text-stone-800">{p.display_name} · {money(p.amount_pence)}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {METHOD_LABEL[String(p.method)] ?? String(p.method).replace('_', ' ')}
                          {p.requested_at ? ` · asked on ${date(p.requested_at)}` : ''}
                        </p>
                      </div>
                      <p className={`shrink-0 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] ${PAYOUT_TONE[String(p.status)] ?? 'bg-stone-100 text-stone-600'}`}>
                        {PAYOUT_STAGE[String(p.status)] ?? String(p.status)}
                      </p>
                    </div>

                    {p.status === 'requested' && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => act({ action: 'refuse', id: p.id, note: 'Refused by staff' })}
                          className="min-h-11 border border-stone-300 bg-white px-4 text-xs font-medium text-stone-700 transition-colors hover:border-stone-500 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                        >
                          Refuse
                        </button>
                        <button
                          onClick={() => act({ action: 'approve', id: p.id, note: 'Approved by staff' })}
                          className="min-h-11 bg-gold-700 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gold-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                        >
                          Approve
                        </button>
                      </div>
                    )}

                    {p.status === 'payment_pending' && (
                      <div className="mt-4">
                        <label htmlFor={`reference-${p.id}`} className={TILE_LABEL}>Bank or Fena reference</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <input
                            id={`reference-${p.id}`}
                            placeholder="Paste the reference here"
                            className="min-h-11 min-w-52 flex-1 border border-stone-300 px-3 text-xs text-stone-800 outline-none transition-colors focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                          />
                          <button
                            onClick={() => act({ action: 'cancel', id: p.id, note: 'Cancelled by staff before payment' })}
                            className="min-h-11 border border-stone-300 bg-white px-4 text-xs font-medium text-stone-700 transition-colors hover:border-stone-500 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => { const el = document.getElementById(`reference-${p.id}`) as HTMLInputElement; act({ action: 'mark_paid', id: p.id, paymentReference: el?.value }); }}
                            className="min-h-11 bg-stone-900 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                          >
                            Mark paid
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )) : (
                  <p className="px-5 py-10 text-center text-sm text-stone-500">Nobody has asked for a payment yet.</p>
                )}
              </div>
            </section>
          </div>

          <section className={`mt-7 min-w-0 ${CARD}`}>
            <div className="border-b border-stone-100 px-5 py-4">
              <h2 className="font-serif text-xl text-stone-800">Referred customers</h2>
              <p className="mt-1 text-xs text-stone-500">Every personal code and the commission it has earned.</p>
            </div>

            {data && data.referrals.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-stone-500">No customer has joined through a private invitation yet.</p>
            ) : (
              <>
                {/* Phone: one card per customer. The table ran off the side of the screen,
                    so the commission and the status could not be seen on a phone at all. */}
                <ul className="divide-y divide-stone-100 sm:hidden">
                  {data?.referrals.map(r => (
                    <li key={Number(r.id)} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800">{r.first_name} {r.last_name}</p>
                          <p className="break-words text-xs text-stone-500">{r.email}</p>
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-gold-700">{money(r.earned_pence)}</p>
                      </div>
                      <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-stone-700">{r.code}</p>
                      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-stone-500">
                        <div className="flex gap-1.5"><dt>Expires</dt><dd className="text-stone-700">{date(r.expires_at)}</dd></div>
                        <div className="flex gap-1.5"><dt>Orders</dt><dd className="text-stone-700">{r.order_count}</dd></div>
                        <div className="flex gap-1.5"><dt>Status</dt><dd className="text-stone-700">{r.status}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>

                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-stone-50 text-[9px] uppercase tracking-[0.18em] text-stone-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Customer</th>
                        <th className="py-3 font-semibold">Code</th>
                        <th className="py-3 font-semibold">Expires</th>
                        <th className="py-3 font-semibold">Orders</th>
                        <th className="py-3 font-semibold">Commission</th>
                        <th className="py-3 pr-5 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.referrals.map(r => (
                        <tr key={Number(r.id)} className="border-t border-stone-100">
                          <td className="px-5 py-4">
                            <span className="font-medium text-stone-800">{r.first_name} {r.last_name}</span>
                            <br />
                            <span className="text-stone-500">{r.email}</span>
                          </td>
                          <td className="font-mono uppercase text-stone-700">{r.code}</td>
                          <td className="text-stone-600">{date(r.expires_at)}</td>
                          <td className="text-stone-600">{r.order_count}</td>
                          <td className="font-semibold text-gold-700">{money(r.earned_pence)}</td>
                          <td className="pr-5 uppercase text-stone-500">{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default function AdminAffiliatesPage() {
  return <AdminAffiliates />;
}
