'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';

type LoginMethod = 'login' | 'register' | 'password_set' | 'password_reset' | 'earlier_record';

interface LoginRow {
  id: number;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  method: LoginMethod;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

const METHOD_CONFIG: Record<LoginMethod, { label: string; chip: string; note: string }> = {
  login:          { label: 'Signed In',      chip: 'bg-green-50 text-green-700',   note: 'Signed in with email and password' },
  register:       { label: 'New Member',     chip: 'bg-gold-50 text-gold-700',     note: 'Signed in as part of creating the account' },
  password_set:   { label: 'Password Set',   chip: 'bg-stone-100 text-stone-600',  note: 'Set a password from an invitation and was signed in' },
  password_reset: { label: 'Password Reset', chip: 'bg-amber-50 text-amber-700',   note: 'Finished a password reset and was signed in' },
  earlier_record: { label: 'Earlier Record', chip: 'bg-stone-100 text-stone-500',  note: 'Recorded before this log existed' },
};

function formatDatetime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function londonDay(value: string | Date) {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
}

// A browser string is unreadable in a table. Reduce it to the one word the
// owner actually wants: what kind of thing did they sign in on.
function deviceOf(userAgent: string | null) {
  if (!userAgent) return '';
  if (/iPhone|Android.*Mobile|Windows Phone/i.test(userAgent)) return 'Mobile';
  if (/iPad|Tablet|Android/i.test(userAgent)) return 'Tablet';
  return 'Desktop';
}

type FilterMethod = 'all' | LoginMethod;

export default function AdminMemberLoginsPage() {
  const [log, setLog] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/member-logins')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.logins)) setLog(d.logins);
        else setFailed(true);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const today = londonDay(new Date());
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const members = new Set(
      log.map(r => (r.customer_id !== null ? `id:${r.customer_id}` : `email:${r.customer_email ?? ''}`))
    );
    return {
      total: log.length,
      members: members.size,
      today: log.filter(r => londonDay(r.created_at) === today).length,
      week: log.filter(r => new Date(r.created_at).getTime() >= weekAgo).length,
    };
  }, [log]);

  const filtered = log.filter(row => {
    if (filterMethod !== 'all' && row.method !== filterMethod) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (row.customer_name ?? '').toLowerCase().includes(q) ||
        (row.customer_email ?? '').toLowerCase().includes(q) ||
        (row.ip_address ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">

          <Link
            href="/admin/dashboard"
            className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-700 transition-colors mb-6 inline-block"
          >
            &larr; Dashboard
          </Link>

          <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Member Logins</h1>
          <p className="text-xs text-stone-500 mb-8">
            Audit trail of every member sign-in, newest first. Times are UK time.
          </p>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Sign-ins',  value: loading ? '-' : String(stats.total) },
              { label: 'Members',         value: loading ? '-' : String(stats.members) },
              { label: 'Today',           value: loading ? '-' : String(stats.today) },
              { label: 'Last 7 Days',     value: loading ? '-' : String(stats.week) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-stone-200 p-4">
                <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">{label}</div>
                <div className="text-xl font-semibold text-stone-800">{value}</div>
              </div>
            ))}
          </div>

          {/* Filters — pinned so they stay on screen while you scroll the list
              they filter (task 7fdb1670). */}
          <AdminStickyControls inset="p-8">
          <div className="flex flex-wrap gap-3 pb-3">
            <input
              type="text"
              placeholder="Search name, email or IP address..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-stone-200 px-3 py-2 text-xs text-stone-700 placeholder-stone-300 outline-none focus:border-gold-300"
            />
            <select
              value={filterMethod}
              onChange={e => setFilterMethod(e.target.value as FilterMethod)}
              className="border border-stone-200 px-3 py-2 text-xs text-stone-600 outline-none focus:border-gold-300 bg-white"
            >
              <option value="all">All sign-ins</option>
              {(Object.keys(METHOD_CONFIG) as LoginMethod[]).map(m => (
                <option key={m} value={m}>{METHOD_CONFIG[m].label}</option>
              ))}
            </select>
          </div>
          </AdminStickyControls>

          {/* Table */}
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  {['Date / Time', 'Member', 'How', 'Device', 'IP Address'].map(h => (
                    <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="text-center text-xs text-stone-500 py-10">Loading...</td></tr>
                ) : failed ? (
                  <tr><td colSpan={5} className="text-center text-xs text-stone-500 py-10">
                    Could not load the sign-in log. Please refresh.
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-xs text-stone-500 py-10">
                    {log.length === 0
                      ? 'No sign-ins recorded yet. Every member sign-in from now on appears here.'
                      : 'No sign-ins match this search.'}
                  </td></tr>
                ) : filtered.map(row => {
                  const cfg = METHOD_CONFIG[row.method]
                    ?? { label: row.method, chip: 'bg-stone-100 text-stone-500', note: '' };
                  const device = deviceOf(row.user_agent);
                  return (
                    <tr key={row.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">
                        {formatDatetime(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {row.customer_id ? (
                          <Link href={`/admin/customers/${row.customer_id}`} className="hover:text-gold-700 transition-colors">
                            <div className="text-[10px] text-stone-700">{row.customer_name ?? 'Unknown'}</div>
                            <div className="text-[9px] text-stone-500">{row.customer_email ?? ''}</div>
                          </Link>
                        ) : (
                          <>
                            <div className="text-[10px] text-stone-500">{row.customer_name ?? 'Deleted customer'}</div>
                            <div className="text-[9px] text-stone-300">{row.customer_email ?? ''}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span title={cfg.note} className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${cfg.chip}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[10px] text-stone-500">
                        {device || <span className="text-stone-300">Not recorded</span>}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-stone-500">
                        {row.ip_address ?? <span className="font-sans text-stone-300">Not recorded</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-stone-500 mt-4 leading-relaxed">
            Rows marked <span className="text-stone-500">Earlier Record</span> were reconstructed from
            sign-in times the site was already storing before this log was added, so they carry no
            device or IP address. Everything recorded from now on is captured in full.
          </p>

        </div>
      </main>
    </div>
  );
}
