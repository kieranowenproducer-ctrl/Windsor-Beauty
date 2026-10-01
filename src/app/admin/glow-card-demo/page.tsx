'use client';

import { useState } from 'react';

interface Login { design: string; email: string; password: string; customerId: number }

export default function GlowCardDemoSetupPage() {
  const [logins, setLogins] = useState<Login[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function create() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/glow-card-demo/setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) setMessage(result?.error || 'Demo logins could not be created.');
      else if (Array.isArray(result?.created)) setLogins(result.created);
      else setMessage('The staff page received an unexpected response.');
    } catch { setMessage('Demo logins could not be created. Please check the customer list.'); }
    finally { setBusy(false); }
  }

  return <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
    <p className="text-[10px] uppercase tracking-[0.24em] text-gold-700">Windsor Glow staff</p>
    <h1 className="font-serif text-4xl text-stone-900 mt-3">Glow Card demo</h1>
    <p className="text-sm text-stone-700 mt-5 max-w-2xl">Create the approved private customer login for the gilded passport design. This account has example details, no marketing consent and no real orders. Stamps and claimed codes stay in the demo and cannot pay for live orders.</p>
    {!logins.length && <button type="button" disabled={busy} onClick={create} className="mt-7 bg-gold-700 text-white px-5 py-3 text-sm hover:bg-gold-800 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">{busy ? 'Creating demo login...' : 'Create the approved demo login'}</button>}
    {message && <p role="alert" className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 mt-6">{message}</p>}
    {logins.length > 0 && <div className="border border-gold-300 bg-gold-50 p-5 mt-7">
      <h2 className="font-serif text-2xl text-stone-900">Demo logins created</h2>
      <p className="text-xs text-stone-700 mt-2">Save these passwords now. This page will not show them again after you leave.</p>
      <div className="space-y-4 mt-5">{logins.map(login => <div key={login.design} className="border border-gold-200 bg-white p-4">
        <p className="text-sm font-semibold text-gold-900 capitalize">{login.design}</p>
        <p className="text-sm text-stone-700 mt-2">Email: <span className="font-mono break-all">{login.email}</span></p>
        <p className="text-sm text-stone-700 mt-1">Password: <span className="font-mono break-all">{login.password}</span></p>
      </div>)}</div>
    </div>}
  </main>;
}
