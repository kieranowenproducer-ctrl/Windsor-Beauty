'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { categoryLabel, isCustomerEvent } from '@/lib/automationFailureKinds';

interface AutomationFailureRow {
  id: number;
  category: string;
  message: string;
  order_number: string | null;
  detail: string | null;
  created_at: string;
  resolved_at?: string | null;
}

interface CronStatus {
  job: string;
  label: string;
  schedule: string;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  overdue: boolean;
}

interface UnverifiedCustomer {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  account_status: string;
  created_at: string;
  last_sent_at: string | null;
  times_sent: number;
  last_failure_at: string | null;
  last_failure_message: string | null;
}

// Labels and the fault/event split both live in src/lib/automationFailureKinds.ts
// so this page, the dashboard banner and the sidebar badge cannot disagree
// about what counts as a problem. The local copy that used to be here is how
// "fena_payment_not_completed" ended up on screen as a raw database slug: the
// category was added to the payment webhook and never to the list.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function customerName(c: UnverifiedCustomer): string {
  const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return name || c.email;
}

export default function SystemHealthPage() {
  const [failures, setFailures] = useState<AutomationFailureRow[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  // False between the deploy and the database setup, when there is no column to
  // tick anything off in. The page then hides the buttons and groups by age
  // instead, so the list always agrees with the number above it.
  const [canResolve, setCanResolve] = useState(false);
  const [unverified, setUnverified] = useState<UnverifiedCustomer[]>([]);
  const [crons, setCrons] = useState<CronStatus[]>([]);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [dbSetupRunning, setDbSetupRunning] = useState(false);
  const [dbSetupResult, setDbSetupResult] = useState<{ ok?: boolean; message?: string; error?: string } | null>(null);

  // One resend in flight at a time, and the answer stays on the row it belongs
  // to. Keyed by customer id so pressing one button never puts a message next
  // to somebody else's name.
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendResults, setResendResults] = useState<Record<number, { ok: boolean; message: string }>>({});

  async function resendVerification(customer: UnverifiedCustomer) {
    setResendingId(customer.id);
    setResendResults(r => { const next = { ...r }; delete next[customer.id]; return next; });
    try {
      const res = await fetch(`/api/admin/customers/${customer.id}/resend-verification`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setResendResults(r => ({ ...r, [customer.id]: { ok: true, message: `Sent to ${customer.email}. Ask them to check junk if it does not appear.` } }));
        setUnverified(list => list.map(u => (u.id === customer.id
          ? { ...u, last_sent_at: new Date().toISOString(), times_sent: u.times_sent + 1, last_failure_at: null, last_failure_message: null }
          : u)));
      } else {
        setResendResults(r => ({ ...r, [customer.id]: { ok: false, message: data?.error ?? 'Could not send it. Please try again shortly.' } }));
      }
    } catch {
      setResendResults(r => ({ ...r, [customer.id]: { ok: false, message: 'Could not reach the server. Please try again.' } }));
    } finally {
      setResendingId(null);
    }
  }

  // Ticking one off. The row is updated on screen first so the list does not
  // jump about, and put back exactly as it was if the save does not land.
  const [tickingId, setTickingId] = useState<number | null>(null);
  const [tickError, setTickError] = useState('');

  async function setResolved(row: AutomationFailureRow, resolved: boolean) {
    setTickingId(row.id);
    setTickError('');
    const before = row.resolved_at ?? null;
    setFailures(list => (list ?? []).map(f => (f.id === row.id ? { ...f, resolved_at: resolved ? new Date().toISOString() : null } : f)));
    setOpenCount(n => Math.max(0, n + (resolved ? -1 : 1)));
    try {
      const res = await fetch(`/api/admin/system-health/failures/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setFailures(list => (list ?? []).map(f => (f.id === row.id ? { ...f, resolved_at: before } : f)));
        setOpenCount(n => Math.max(0, n + (resolved ? 1 : -1)));
        setTickError(data?.error ?? 'Could not save that. Please try again.');
      }
    } catch {
      setFailures(list => (list ?? []).map(f => (f.id === row.id ? { ...f, resolved_at: before } : f)));
      setOpenCount(n => Math.max(0, n + (resolved ? 1 : -1)));
      setTickError('Could not reach the server. Please try again.');
    } finally {
      setTickingId(null);
    }
  }

  function load() {
    fetch('/api/admin/system-health')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.failures)) {
          setFailures(data.failures);
          setOpenCount(data.openCount ?? data.count24h ?? 0);
          setCanResolve(data.canResolve === true);
          setUnverified(Array.isArray(data.unverified) ? data.unverified : []);
          setCrons(Array.isArray(data.crons) ? data.crons : []);
        } else {
          setLoadError(data.error || 'Failed to load system health.');
        }
      })
      .catch(() => setLoadError('Failed to load system health.'));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-4xl">
          <h1 className="text-lg font-semibold text-stone-800 mb-1">System Health</h1>
          <p className="text-xs text-stone-500 mb-8 leading-relaxed">
            The things the website does on its own: sending emails, booking dispatches, taking payment
            updates. When one of them does not work it is written down here the moment it happens, so a
            confirmation email that never sent is found in minutes instead of by a customer complaint.
          </p>

          <div className="flex items-center gap-3 mb-8">
            <div className={`border px-5 py-4 ${openCount > 0 ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-white'}`}>
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Still To Look At</p>
              <p className={`text-xl font-semibold ${openCount > 0 ? 'text-red-600' : 'text-stone-700'}`}>{openCount}</p>
            </div>
          </div>

          {/* Customers waiting to verify. This is the fix-it list, and it is
              deliberately built from who is STUCK rather than from what threw
              an error: an email the provider accepted and then dropped in a
              junk folder leaves no error behind, so a list built from failures
              would miss exactly the customer who phones up. */}
          <div className="bg-white border border-stone-200 p-5 mb-8">
            <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Customers Waiting To Verify Their Email</p>
            <p className="text-xs text-stone-500 mb-4 leading-relaxed">
              They created an account but have never clicked their verification link, so they have no member
              discount yet. Press Resend to send it again now. It does not matter whether the first one failed
              or simply went to junk.
            </p>

            {unverified.length === 0 ? (
              <p className="text-xs text-stone-500">Everyone who has signed up has verified their email. Nothing to do.</p>
            ) : (
              <div className="border border-stone-200 divide-y divide-stone-100">
                {unverified.map(u => {
                  const result = resendResults[u.id];
                  return (
                    <div key={u.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/admin/customers/${u.id}`}
                            className="text-xs text-stone-800 font-medium hover:text-gold-700 transition-colors"
                          >
                            {customerName(u)}
                          </Link>
                          <p className="text-[10px] text-stone-500 mt-0.5">{u.email}</p>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Signed up {formatDateShort(u.created_at)}. Link last sent {formatDateShort(u.last_sent_at)}
                            {u.times_sent > 1 ? ` (${u.times_sent} times in total)` : ''}.
                          </p>
                          {u.last_failure_at && (
                            <p className="text-[10px] text-red-500 mt-1">
                              The last attempt failed at {formatDateShort(u.last_failure_at)}.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => resendVerification(u)}
                          disabled={resendingId === u.id}
                          className="shrink-0 text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {resendingId === u.id ? 'Sending...' : 'Resend'}
                        </button>
                      </div>
                      {result && (
                        <div className={`mt-2 text-[10px] px-3 py-2 border ${result.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                          {result.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Scheduled jobs. Nothing watched whether these were still happening: a reminder cron
              that quietly stopped would look exactly like a website with nothing to remind
              anybody about. */}
          {crons.length > 0 && (
            <div className="bg-white border border-stone-200 p-5 mb-8">
              <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Scheduled Jobs</p>
              <p className="text-xs text-stone-500 mb-4 leading-relaxed">
                Jobs the website runs on its own overnight. Each one stamps the clock when it finishes, so a job
                that has stopped shows up here instead of going unnoticed.
              </p>
              <div className="border border-stone-200 divide-y divide-stone-100">
                {crons.map(c => (
                  <div key={c.job} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-800 font-medium">{c.label}</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">{c.schedule}</p>
                      {c.lastError && <p className="text-[10px] text-red-500 mt-1">Last run reported: {c.lastError}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[10px] ${c.overdue ? 'text-red-600 font-semibold' : 'text-stone-500'}`}>
                        {c.lastRunAt ? `Last ran ${formatDateShort(c.lastRunAt)}` : 'Has not run yet'}
                      </p>
                      {c.overdue && <p className="text-[9px] text-red-500 mt-0.5">Overdue, check this</p>}
                      {!c.overdue && c.lastResult && <p className="text-[9px] text-stone-500 mt-0.5">{c.lastResult}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DB Schema Maintenance */}
          <div className="bg-white border border-stone-200 p-5 mb-8">
            <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Database Schema</p>
            <p className="text-xs text-stone-500 mb-4">
              Run after deployments that add new tables or columns. Safe to run multiple times.
            </p>
            {dbSetupResult && (
              <div className={`mb-3 text-xs px-3 py-2 border ${dbSetupResult.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                {dbSetupResult.ok ? dbSetupResult.message : dbSetupResult.error}
              </div>
            )}
            <button
              type="button"
              disabled={dbSetupRunning}
              onClick={async () => {
                setDbSetupRunning(true);
                setDbSetupResult(null);
                try {
                  const res = await fetch('/api/admin/db/setup', { method: 'POST' });
                  const data = await res.json();
                  setDbSetupResult(data);
                } catch {
                  setDbSetupResult({ error: 'Failed to connect to the setup endpoint.' });
                } finally {
                  setDbSetupRunning(false);
                }
              }}
              className="text-[9px] tracking-[0.18em] uppercase border border-stone-300 text-stone-600 px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {dbSetupRunning ? 'Running…' : 'Run DB Setup'}
            </button>
          </div>

          {loadError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">
              {loadError}
            </div>
          )}

          {failures === null && !loadError && (
            <p className="text-xs text-stone-500">Loading…</p>
          )}

          {tickError && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-3 mb-6">{tickError}</div>
          )}

          {/* Three lists, because they ask three different things of the reader.
              Faults still open need somebody. Customer events need nobody, and
              are here only so the shop is not a mystery. Dealt-with is history. */}
          {failures !== null && (() => {
            // With the column in place, "open" means nobody has ticked it off.
            // Without it, fall back to the same rolling 24 hours the count uses,
            // so the two never contradict each other on screen.
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            const isOpen = (f: AutomationFailureRow) => (canResolve
              ? !f.resolved_at
              : new Date(f.created_at).getTime() > dayAgo);

            const openFaults = failures.filter(f => !isCustomerEvent(f.category) && isOpen(f));
            const events = failures.filter(f => isCustomerEvent(f.category));
            const done = failures.filter(f => !isCustomerEvent(f.category) && !isOpen(f));

            const row = (f: AutomationFailureRow, options: { tick?: 'resolve' | 'reopen' }) => {
              const expanded = expandedId === f.id;
              return (
                <div key={f.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : f.id)}
                      className="min-w-0 text-left flex-1"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] tracking-[0.1em] uppercase text-gold-700 font-semibold">
                          {categoryLabel(f.category)}
                        </span>
                        {f.order_number && (
                          <span className="text-[10px] font-mono text-stone-500">{f.order_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-stone-700">{f.message}</p>
                      <p className="text-[10px] text-stone-500 mt-1">
                        {formatDate(f.created_at)}
                        {f.resolved_at ? ` · dealt with ${formatDateShort(f.resolved_at)}` : ''}
                        {f.detail ? (expanded ? ' · tap to hide the detail' : ' · tap for the detail') : ''}
                      </p>
                    </button>
                    {options.tick && (
                      <button
                        type="button"
                        disabled={tickingId === f.id}
                        onClick={() => setResolved(f, options.tick === 'resolve')}
                        className={`shrink-0 text-[9px] tracking-[0.18em] uppercase px-3 py-2 border transition-colors disabled:opacity-50 ${
                          options.tick === 'resolve'
                            ? 'border-stone-300 text-stone-600 hover:border-gold-400 hover:text-gold-700'
                            : 'border-stone-200 text-stone-500 hover:border-stone-400 hover:text-stone-600'
                        }`}
                      >
                        {tickingId === f.id ? 'Saving…' : options.tick === 'resolve' ? 'Done' : 'Reopen'}
                      </button>
                    )}
                  </div>
                  {expanded && f.detail && (
                    <pre className="mt-3 bg-stone-50 border border-stone-100 p-3 text-[10px] text-stone-500 overflow-x-auto whitespace-pre-wrap">
                      {f.detail}
                    </pre>
                  )}
                </div>
              );
            };

            return (
              <>
                <div className="mb-8">
                  <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Still To Look At</p>
                  <p className="text-xs text-stone-500 mb-3 leading-relaxed">
                    {canResolve
                      ? 'Something the website tried to do and could not. Press Done once it is sorted and it moves to the list at the bottom. Nothing disappears on its own any more.'
                      : 'Something the website tried to do and could not, in the last 24 hours. Press Run DB Setup above to switch on ticking things off, so nothing disappears on its own.'}
                  </p>
                  {openFaults.length === 0 ? (
                    <p className="text-xs text-stone-500">Nothing waiting. Everything the website has tried to do has worked.</p>
                  ) : (
                    <div className="border border-red-200 bg-white divide-y divide-stone-100">
                      {openFaults.map(f => row(f, canResolve ? { tick: 'resolve' } : {}))}
                    </div>
                  )}
                </div>

                {events.length > 0 && (
                  <div className="mb-8">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Payments That Did Not Go Through</p>
                    <p className="text-xs text-stone-500 mb-3 leading-relaxed">
                      A customer&apos;s bank did not complete a payment. Nothing is broken and there is nothing to
                      fix: their order stays payable so they can simply try again. Listed here so you can see it
                      happened, and who it was.
                    </p>
                    <div className="border border-stone-200 bg-white divide-y divide-stone-100">
                      {events.map(f => row(f, {}))}
                    </div>
                  </div>
                )}

                {done.length > 0 && (
                  <div className="mb-8">
                    <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Already Dealt With</p>
                    <p className="text-xs text-stone-500 mb-3 leading-relaxed">
                      Kept so there is a record. Press Reopen if one turns out not to be finished after all.
                    </p>
                    <div className="border border-stone-200 bg-white divide-y divide-stone-100">
                      {done.map(f => row(f, { tick: 'reopen' }))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </main>
    </div>
  );
}
