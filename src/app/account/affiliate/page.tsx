'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import BackToHome from '@/components/BackToHome';
import InviteSomeone, { type InvitationRow } from '@/components/affiliate/InviteSomeone';

type Dashboard = {
  profile: Record<string, string | number>;
  referrals: Array<Record<string, string | number | boolean | null>>;
  payouts: Array<Record<string, string | number>>;
  invitations?: InvitationRow[];
};

const money = (pence: number) => `£${(Number(pence) / 100).toFixed(2)}`;
const date = (value: unknown) => new Date(String(value)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// The page follows the rest of the account area: white background, the site's own
// header and footer, brand gold from the Tailwind scale. It used to carry a beige
// slab, a second "Windsor Beauty" wordmark directly under the real one, and its own
// <main> nested inside the site's <main>. All three are gone; nothing about how
// commission is worked out, requested or paid changed with them.
const CARD = 'border border-gold-100 bg-white';
const EYEBROW = 'text-[9px] tracking-[0.38em] uppercase text-gold-700';
const TILE_LABEL = 'text-[9px] tracking-[0.18em] uppercase text-stone-500';

export function AffiliateDashboard({ forcePreview = false }: { forcePreview?: boolean }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'store_credit'>('cash');
  const [message, setMessage] = useState('');
  const preview = forcePreview || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1');

  function load() {
    fetch(`/api/account/affiliate${preview ? '?preview=1' : ''}`, { cache: 'no-store' })
      .then(async response => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Affiliate dashboard unavailable.');
        setData(json);
      })
      .catch(err => setError(err.message));
  }
  useEffect(load, [preview]);

  async function requestPayout(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');
    if (preview) {
      const pounds = Number(amount);
      if (!Number.isInteger(pounds) || pounds < 1 || pounds * 100 > Number(data?.profile.withdrawable_pence || 0)) {
        setMessage('Choose a whole pound amount within the available balance.');
        return;
      }
      setData(current => current ? { ...current, payouts: [{ id: Date.now(), amount_pence: pounds * 100, method, status: 'requested', requested_at: new Date().toISOString() }, ...current.payouts] } : current);
      setAmount('');
      setMessage('Preview request created. No real money or email was sent.');
      return;
    }
    const response = await fetch('/api/account/affiliate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountPounds: Number(amount), method }) });
    const json = await response.json().catch(() => null);
    setMessage(response.ok ? 'Your request is waiting for staff approval.' : json?.error || 'The request could not be sent.');
    if (response.ok) { setAmount(''); load(); }
  }

  if (error) {
    return (
      <>
        <BackToHome />
        <div className="mx-auto max-w-4xl px-4 pb-24 sm:px-6">
          <p role="alert" className="border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-900">{error}</p>
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <BackToHome />
        <div className="mx-auto max-w-4xl px-4 pb-24 text-center sm:px-6">
          <p className={TILE_LABEL}>Loading your affiliate account</p>
        </div>
      </>
    );
  }

  const p = data.profile;
  const withdrawable = Number(p.withdrawable_pence);
  const tiles: Array<[string, string | number, boolean]> = [
    ['Current balance', money(Number(p.balance_pence)), true],
    ['People referred', p.referral_count, false],
    ['Qualifying orders', p.paid_order_count, false],
    ['Lifetime earned', money(Number(p.lifetime_earned_pence)), false],
  ];

  return (
    <>
      <BackToHome />
      <div className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">

        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`${EYEBROW} mb-1`}>Affiliate account</p>
            <h1 className="font-serif text-4xl tracking-wide text-stone-800">{String(p.display_name)}</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">
              Track the customers you refer and the commission they earn you. You earn on orders
              where they use their personal partner code, not on their 10% welcome code.
              Your own purchases, deliveries and Beauty Card stay in your normal member account.
            </p>
          </div>
          <Link
            href="/account"
            className="shrink-0 border border-stone-200 px-4 py-2.5 text-[9px] uppercase tracking-[0.18em] text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
          >
            My orders and Beauty Card
          </Link>
        </header>

        <InviteSomeone preview={preview} invitations={data.invitations ?? []} onChanged={load} />

        <div className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {tiles.map(([label, value, highlight]) => (
            <div key={label} className="border border-gold-100 p-5">
              <div className={`${TILE_LABEL} mb-2`}>{label}</div>
              <div className={`text-2xl font-semibold ${highlight ? 'text-gold-700' : 'text-stone-800'}`}>{value}</div>
            </div>
          ))}
        </div>

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">

          <div className="min-w-0">
            <h2 className="mb-1 font-serif text-2xl text-stone-800">Customers you referred</h2>
            <p className="mb-5 text-xs text-stone-500">Their codes, qualifying orders and your earnings.</p>

            {data.referrals.length === 0 ? (
              <div className={`${CARD} p-8 text-center`}>
                <p className="mb-1 text-sm text-stone-500">Nobody has joined through a private invitation yet.</p>
                <p className="text-xs text-stone-500">When they do, their code and your commission appear here.</p>
              </div>
            ) : (
              <>
                {/* Phone: one card per person. The table used to run off the side of the
                    screen here, so the expiry date, orders and earnings were simply not
                    visible on a phone. Same figures, stacked. */}
                <ul className="space-y-3 sm:hidden">
                  {data.referrals.map(row => (
                    <li key={Number(row.id)} className={`${CARD} px-4 py-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-stone-800">{String(row.first_name)} {String(row.last_name).slice(0, 1)}.</p>
                        <p className="shrink-0 text-sm font-semibold text-gold-700">{money(Number(row.earned_pence))}</p>
                      </div>
                      <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-stone-700">{String(row.code)}</p>
                      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-stone-500">
                        <div className="flex gap-1.5">
                          <dt>Expires</dt>
                          <dd className="text-stone-700">{date(row.expires_at)}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>Orders</dt>
                          <dd className="text-stone-700">{String(row.qualifying_orders)}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>

                <div className={`${CARD} hidden overflow-x-auto sm:block`}>
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-gold-50/60 text-[9px] uppercase tracking-[0.18em] text-stone-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Customer</th>
                        <th className="py-3 font-semibold">Their code</th>
                        <th className="py-3 font-semibold">Expires</th>
                        <th className="py-3 font-semibold">Orders</th>
                        <th className="py-3 pr-5 text-right font-semibold">You earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.map(row => (
                        <tr key={Number(row.id)} className="border-t border-gold-100">
                          <td className="px-5 py-4 font-medium text-stone-800">{String(row.first_name)} {String(row.last_name).slice(0, 1)}.</td>
                          <td className="font-mono text-[11px] uppercase text-stone-700">{String(row.code)}</td>
                          <td className="text-stone-600">{date(row.expires_at)}</td>
                          <td className="text-stone-600">{String(row.qualifying_orders)}</td>
                          <td className="pr-5 text-right font-semibold text-gold-700">{money(Number(row.earned_pence))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <aside className={`${CARD} min-w-0 p-6`}>
            <p className={EYEBROW}>Withdraw earnings</p>
            <h2 className="mt-2 font-serif text-2xl text-stone-800">Request up to {money(withdrawable)}</h2>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              You can request complete pounds. Any remaining pennies stay safely in your balance.
            </p>

            <form onSubmit={requestPayout} className="mt-6 space-y-5">
              <div>
                <label className={TILE_LABEL} htmlFor="amount">Amount in pounds</label>
                <input
                  id="amount"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  type="number"
                  min="1"
                  max={withdrawable / 100}
                  step="1"
                  required
                  className="mt-2 w-full border border-stone-200 bg-white px-3 py-3 text-lg text-stone-800 outline-none transition-colors focus:border-gold-400 focus:ring-1 focus:ring-gold-400"
                />
              </div>

              <fieldset>
                <legend className={`${TILE_LABEL} mb-2`}>How you would like it</legend>
                <div className="grid grid-cols-2 gap-2">
                  {([['cash', 'Cash'], ['store_credit', 'Shop credit']] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={method === value}
                      onClick={() => setMethod(value)}
                      className={`min-h-11 border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 ${
                        method === value
                          ? 'border-stone-800 bg-stone-800 text-white'
                          : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <button className="w-full bg-gold-700 px-4 py-3.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-gold-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
                Send request
              </button>

              {message && <p role="status" className="border border-gold-200 bg-gold-50 px-4 py-3 text-xs leading-relaxed text-stone-700">{message}</p>}
            </form>
          </aside>
        </section>
      </div>
    </>
  );
}

export default function AffiliateDashboardPage() {
  return <AffiliateDashboard />;
}
