'use client';
import AdminStickyControls from '@/components/admin/AdminStickyControls';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';

type AuditStatus =
  | 'verified'
  | 'failed_invalid_code'
  | 'failed_already_used'
  | 'failed_no_account'
  | 'failed_order_not_found'
  | 'failed_email_mismatch'
  | 'failed_format'
  | 'failed_error';

interface AuditRow {
  id: number;
  code: string;
  product_name: string | null;
  order_number: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  status: AuditStatus;
  failure_reason: string | null;
  is_repeat_attempt: boolean;
  ip_address: string | null;
  created_at: string;
}

const STATUS_CONFIG: Record<AuditStatus, { label: string; chip: string }> = {
  verified:                  { label: 'Verified',             chip: 'bg-green-50 text-green-700' },
  failed_invalid_code:       { label: 'Invalid Code',         chip: 'bg-red-50 text-red-500' },
  failed_already_used:       { label: 'Already Used',         chip: 'bg-amber-50 text-amber-600' },
  failed_no_account:         { label: 'No Account',           chip: 'bg-stone-100 text-stone-500' },
  failed_order_not_found:    { label: 'Order Not Found',      chip: 'bg-red-50 text-red-500' },
  failed_email_mismatch:     { label: 'Email Mismatch',       chip: 'bg-amber-50 text-amber-600' },
  failed_format:             { label: 'Bad Format',           chip: 'bg-stone-100 text-stone-400' },
  failed_error:              { label: 'Error',                chip: 'bg-stone-100 text-stone-400' },
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

type FilterStatus = 'all' | AuditStatus;

export default function AdminVerificationPage() {
  const [log, setLog] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/verification')
      .then(r => r.json())
      .then(d => setLog(Array.isArray(d.log) ? d.log : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = log.filter(row => {
    if (filterStatus !== 'all' && row.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        row.code.toLowerCase().includes(q) ||
        (row.order_number ?? '').toLowerCase().includes(q) ||
        (row.customer_email ?? '').toLowerCase().includes(q) ||
        (row.customer_name ?? '').toLowerCase().includes(q) ||
        (row.product_name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const successCount = log.filter(r => r.status === 'verified').length;
  const failCount = log.filter(r => r.status !== 'verified').length;
  const repeatCount = log.filter(r => r.is_repeat_attempt).length;

  return (
    <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
      <AdminSidebar />

      <main className="flex-1 p-8 overflow-clip">
        <div className="max-w-6xl">

          <Link
            href="/admin/dashboard"
            className="text-[9px] tracking-[0.18em] uppercase text-stone-400 hover:text-gold-700 transition-colors mb-6 inline-block"
          >
            &larr; Dashboard
          </Link>

          <h1 className="text-lg font-semibold text-stone-800 mb-0.5">Verification Log</h1>
          <p className="text-xs text-stone-400 mb-8">Full audit trail of every verification attempt</p>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Attempts', value: loading ? '-' : String(log.length) },
              { label: 'Successful',     value: loading ? '-' : String(successCount) },
              { label: 'Failed',         value: loading ? '-' : String(failCount) },
              { label: 'Repeat Attempts',value: loading ? '-' : String(repeatCount) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-stone-200 p-4">
                <div className="text-[9px] tracking-[0.18em] uppercase text-stone-400 mb-1">{label}</div>
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
              placeholder="Search code, order, email, product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] border border-stone-200 px-3 py-2 text-xs text-stone-700 placeholder-stone-300 outline-none focus:border-gold-300"
            />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="border border-stone-200 px-3 py-2 text-xs text-stone-600 outline-none focus:border-gold-300 bg-white"
            >
              <option value="all">All statuses</option>
              {(Object.keys(STATUS_CONFIG) as AuditStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
          </AdminStickyControls>

          {/* Table */}
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  {['Date / Time', 'Status', 'Code', 'Product', 'Order', 'Customer', 'Repeat'].map(h => (
                    <th key={h} className="text-left text-[9px] tracking-[0.18em] uppercase text-stone-400 px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center text-xs text-stone-400 py-10">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-xs text-stone-400 py-10">No records found.</td></tr>
                ) : filtered.map(row => {
                  const cfg = STATUS_CONFIG[row.status] ?? { label: row.status, chip: 'bg-stone-100 text-stone-400' };
                  return (
                    <tr key={row.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                      <td className="px-4 py-3 text-[10px] text-stone-500 whitespace-nowrap">{formatDatetime(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${cfg.chip}`}>
                          {cfg.label}
                        </span>
                        {row.failure_reason && (
                          <p className="text-[9px] text-stone-400 mt-0.5">{row.failure_reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[10px] font-mono text-stone-700">{row.code}</td>
                      <td className="px-4 py-3 text-[10px] text-stone-600">{row.product_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {row.order_number ? (
                          <Link
                            href={`/admin/orders?search=${encodeURIComponent(row.order_number)}`}
                            className="text-[10px] font-mono text-gold-700 hover:text-gold-700"
                          >
                            {row.order_number}
                          </Link>
                        ) : (
                          <span className="text-[10px] text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.customer_id ? (
                          <Link href={`/admin/customers/${row.customer_id}`} className="hover:text-gold-700 transition-colors">
                            <div className="text-[10px] text-stone-700">{row.customer_name ?? '—'}</div>
                            <div className="text-[9px] text-stone-400">{row.customer_email ?? ''}</div>
                          </Link>
                        ) : (
                          <>
                            <div className="text-[10px] text-stone-400">{row.customer_name ?? '—'}</div>
                            <div className="text-[9px] text-stone-300">{row.customer_email ?? ''}</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.is_repeat_attempt ? (
                          <span className="text-[8px] tracking-wider uppercase px-2 py-0.5 bg-amber-50 text-amber-600">
                            Repeat
                          </span>
                        ) : (
                          <span className="text-[8px] text-stone-300">First</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
