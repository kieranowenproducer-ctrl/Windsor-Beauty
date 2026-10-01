'use client';

// Concierge usage and cost. One screen answering: what is it costing, how much
// room is left, how many answers avoided a model entirely, and is anything
// going wrong that nobody has been told about.

import { useCallback, useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { GBP_PER_USD } from '@/lib/costs/pricing';

// pricing.ts is plain constants with no imports of its own, so it is safe in a client component.
// Latest entry rather than a hardcoded number, so this screen follows the one place the rate is
// defined instead of quietly drifting from it.
const GBP_PER_USD_RATE = GBP_PER_USD[GBP_PER_USD.length - 1].value;

interface Usage {
  enabled: boolean;
  limits: {
    perDay: number; perMonth: number; burstPerTenMin: number; perHour: number;
    dailyUsdCap: number; monthlyUsdCap: number; maxOutputTokens: number; maxMessageChars: number;
  };
  spend: {
    today: number; month: number; messagesToday: number; messagesMonth: number;
    dailyHeadroom: number; monthlyHeadroom: number;
  };
  mix: { messages: number; model_calls: number; cache_hits: number; deterministic: number; tokens_in: number; tokens_out: number };
  daily: { day: string; cost_usd: number; messages: number }[];
  heavy: { actor: string; messages: number; cost_usd: number }[];
  routes: { route: string; n: number }[];
  cases: { open: number; open_unnotified: number; notify_failures: number; urgent_open: number };
  conversations: { account_conversations: number; account_last_30: number };
  cache: { entries: number; hits: number };
}

// Metered in dollars, because that is what Anthropic and OpenAI bill in, but shown in pounds.
// Kieran, 2 August: a screen he reads every day should be in the currency he actually pays in,
// and an unconverted dollar figure is not a number he can compare to anything. The rate is the
// deliberately cautious 0.80 he chose over the market rate, with the words "be safe", so a figure
// here should always come out at or above the real bill rather than under it.
// See GBP_PER_USD in src/lib/costs/pricing.ts, which is the single definition of that rate.
function gbp(n: number): string {
  const pounds = n * GBP_PER_USD_RATE;
  return `£${pounds.toFixed(pounds < 1 ? 4 : 2)}`;
}

function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export default function ConciergeAdminPage() {
  const [data, setData] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/concierge-usage');
      const json = await res.json();
      if (!res.ok) setError(json?.error || 'Could not load usage.');
      else {
        setData(json);
        setError(null);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const peak = data ? Math.max(0.0001, ...data.daily.map((d) => d.cost_usd)) : 1;

  // This screen is deliberately not in the sidebar menu (it is an AI spending report, not a
  // shop screen — see AdminSidebar.tsx). It was also the only admin page with no sidebar AT
  // ALL, so anybody who followed a link here had no way back except the browser's Back button.
  // Off the menu is a choice; stranded is not.
  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />
      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-semibold text-stone-900">Concierge usage &amp; cost</h1>
            <button type="button" onClick={() => void load()} className="text-xs text-stone-500 hover:text-stone-800">
              Refresh
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-8">
            What the AI concierge has cost and how much headroom is left. Every limit shown here is
            enforced before a model is called, not after the bill arrives.
          </p>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-6">{error}</div>}
          {loading && !data && <p className="text-sm text-stone-400">Loading…</p>}

          {data && (
            <>
              {!data.enabled && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
                  The concierge is switched OFF (CONCIERGE_ENABLED=off). Customers are told the team
                  is still reachable.
                </div>
              )}

              {data.cases.open_unnotified > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 mb-6">
                  {data.cases.open_unnotified} open case
                  {data.cases.open_unnotified === 1 ? '' : 's'} where the team was never emailed.
                  {data.cases.notify_failures > 0 && ` ${data.cases.notify_failures} notification(s) failed outright.`}{' '}
                  Check RESEND_API_KEY and CONCIERGE_CASE_EMAIL.
                </div>
              )}

              {/* Spend */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-3">Spend</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Today', value: gbp(data.spend.today), sub: `cap ${gbp(data.limits.dailyUsdCap)}`, bar: data.spend.today / data.limits.dailyUsdCap },
                    { label: 'This month', value: gbp(data.spend.month), sub: `cap ${gbp(data.limits.monthlyUsdCap)}`, bar: data.spend.month / data.limits.monthlyUsdCap },
                    { label: 'Messages today', value: String(data.spend.messagesToday), sub: `${data.limits.perDay}/account/day`, bar: 0 },
                    { label: 'Messages this month', value: String(data.spend.messagesMonth), sub: `${data.limits.perMonth}/account/month`, bar: 0 },
                  ].map((c) => (
                    <div key={c.label} className="bg-white border border-stone-200 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">{c.label}</div>
                      <div className="text-xl font-semibold text-stone-900">{c.value}</div>
                      <div className="text-[11px] text-stone-400 mt-1">{c.sub}</div>
                      {c.bar > 0 && (
                        <div className="h-1 bg-stone-100 mt-2">
                          <div
                            className={`h-1 ${c.bar >= 1 ? 'bg-red-500' : c.bar >= 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, c.bar * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  At 70% of a cap the concierge drops to the cheap model automatically. At 100% it
                  stops calling a model at all and answers orders, tracking, prices, stock and
                  policies from data.
                </p>
              </section>

              {/* How answers were produced */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-3">
                  How the last 30 days were answered
                </h2>
                <div className="bg-white border border-stone-200 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-stone-400">Total turns</div>
                      <div className="text-xl font-semibold text-stone-900">{data.mix.messages}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-stone-400">No model needed</div>
                      <div className="text-xl font-semibold text-emerald-700">{data.mix.deterministic}</div>
                      <div className="text-[11px] text-stone-400">{pct(data.mix.deterministic, data.mix.messages)} of turns</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-stone-400">Served from cache</div>
                      <div className="text-xl font-semibold text-emerald-700">{data.mix.cache_hits}</div>
                      <div className="text-[11px] text-stone-400">{data.cache.entries} entries stored</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wide text-stone-400">Model calls</div>
                      <div className="text-xl font-semibold text-stone-900">{data.mix.model_calls}</div>
                      <div className="text-[11px] text-stone-400">
                        {data.mix.tokens_in.toLocaleString()} in / {data.mix.tokens_out.toLocaleString()} out
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Daily */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-3">Last 30 days</h2>
                {data.daily.length === 0 ? (
                  <p className="text-sm text-stone-400 bg-white border border-stone-200 px-4 py-6 text-center">
                    No usage recorded yet.
                  </p>
                ) : (
                  <div className="bg-white border border-stone-200 p-4">
                    <div className="flex items-end gap-1 h-24">
                      {data.daily.map((d) => (
                        <div
                          key={d.day}
                          title={`${d.day}: ${gbp(d.cost_usd)} across ${d.messages} turn(s)`}
                          className="flex-1 bg-stone-300 hover:bg-gold-700 transition-colors min-h-[2px]"
                          style={{ height: `${Math.max(2, (d.cost_usd / peak) * 100)}%` }}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-[11px] text-stone-400 mt-2">
                      <span>{data.daily[0]?.day}</span>
                      <span>peak {gbp(peak)}/day</span>
                      <span>{data.daily[data.daily.length - 1]?.day}</span>
                    </div>
                  </div>
                )}
              </section>

              {/* Heaviest accounts */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-3">
                  Heaviest accounts this month
                </h2>
                {data.heavy.length === 0 ? (
                  <p className="text-sm text-stone-400 bg-white border border-stone-200 px-4 py-6 text-center">
                    Nothing yet.
                  </p>
                ) : (
                  <div className="bg-white border border-stone-200 divide-y divide-stone-100">
                    {data.heavy.map((h) => (
                      <div key={h.actor} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-mono text-xs text-stone-500">{h.actor}</span>
                        <span className="text-stone-600">
                          {h.messages} turn{h.messages === 1 ? '' : 's'} · {gbp(h.cost_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-stone-400 mt-2">
                  Shown by account ID rather than email. An account near {data.limits.perMonth}{' '}
                  messages this month is either a very engaged customer or a shared login.
                </p>
              </section>

              {/* Cases */}
              <section className="mb-10">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-600 mb-3">Cases</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Open', value: data.cases.open },
                    { label: 'Urgent open', value: data.cases.urgent_open },
                    { label: 'Team never told', value: data.cases.open_unnotified },
                    { label: 'Account conversations', value: data.conversations.account_last_30 },
                  ].map((c) => (
                    <div key={c.label} className="bg-white border border-stone-200 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-1">{c.label}</div>
                      <div className="text-xl font-semibold text-stone-900">{c.value}</div>
                    </div>
                  ))}
                </div>
                {/* "AI Support Inbox" was retired as a name on 2 August, and /admin/support is
                    now only a redirect. Pointing at the old name from here is the exact thing
                    the sidebar note warns about: two names for one screen, so somebody believes
                    they have checked both. It names the real screen now. */}
                <p className="text-[11px] text-stone-400 mt-2">
                  Cases open in{' '}
                  <a href="/admin/enquiries" className="underline">
                    Website Enquiries
                  </a>
                  .
                </p>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
