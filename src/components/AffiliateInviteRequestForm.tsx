'use client';

import { useState } from 'react';

export default function AffiliateInviteRequestForm({ requestKey, preview }: { requestKey: string; preview: boolean }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function requestInvitation(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/affiliate-request${preview ? '?preview=1' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: requestKey, email }),
      });
      const result = await response.json().catch(() => null);
      setMessage(response.ok ? result?.message || 'Please check your inbox.' : result?.error || 'Please try again later.');
      if (response.ok) setEmail('');
    } catch { setMessage('Please try again later.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={requestInvitation} className="mt-9 border border-gold-200 bg-gold-50/60 p-6 sm:p-8">
    <label htmlFor="affiliate-request-email" className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-800">Your email address</label>
    <input id="affiliate-request-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={busy}
      className="mt-3 min-h-12 w-full border border-gold-200 bg-white px-4 text-sm text-stone-800 outline-none focus:border-gold-700 focus:ring-1 focus:ring-gold-700" />
    <button type="submit" disabled={busy} className="mt-4 min-h-12 w-full bg-gold-700 px-5 text-xs font-semibold text-white hover:bg-gold-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">{busy ? 'Requesting invitation' : 'Email me my private invitation'}</button>
    <p className="mt-3 text-xs leading-5 text-stone-600">By pressing this button, you ask Windsor Glow to send one invitation email. This does not add you to marketing emails.</p>
    {message && <p role="status" className="mt-4 text-xs leading-6 text-stone-700">{message}</p>}
  </form>;
}
