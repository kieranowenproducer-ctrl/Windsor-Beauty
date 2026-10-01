'use client';

import { useEffect, useState } from 'react';
import type { StockReportRow } from '@/app/api/admin/products/stock-report/route';
import { useOverflowLock } from '@/components/viewportOwner';
import { useVisualViewport } from '@/components/useVisualViewport';

interface Props {
  open: boolean;
  onClose: () => void;
}

function formatPrice(price: number | null): string {
  return price === null ? 'TBC' : `£${price.toFixed(2)}`;
}

function formatStock(stock: number | null): string {
  return stock === null ? 'Untracked' : String(stock);
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: StockReportRow[], generatedAt: string): string {
  const header = ['Product Name', 'SKU / ID', 'Size / Dosage', 'Category', 'Price', 'Stock Quantity', 'Status', 'Last Updated'];
  const lines: string[] = [];
  lines.push(csvField(`Windsor Glow Stock Check — generated ${new Date(generatedAt).toLocaleString('en-GB')}`));
  lines.push('');

  for (const status of ['enabled', 'disabled'] as const) {
    const group = rows.filter(r => r.status === status);
    lines.push(csvField(status === 'enabled' ? 'ENABLED / ACTIVE PRODUCTS' : 'DISABLED / INACTIVE PRODUCTS'));
    lines.push(header.map(csvField).join(','));
    for (const r of group) {
      lines.push([
        r.name, r.id, r.dosage, r.category, formatPrice(r.price), formatStock(r.stock),
        r.status === 'enabled' ? 'Enabled' : 'Disabled', formatUpdatedAt(r.updatedAt),
      ].map(v => csvField(String(v))).join(','));
    }
    lines.push('');
  }
  return lines.join('\r\n');
}

function downloadCsv(rows: StockReportRow[], generatedAt: string) {
  const csv = buildCsv(rows, generatedAt);
  // UTF-8 BOM so Excel (not just Numbers/Sheets) opens the £ symbol correctly
  // instead of mangling it as a multi-byte mojibake sequence.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `windsor-glow-stock-check-${dateStamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function StockTable({ rows }: { rows: StockReportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-stone-300 py-4">None.</p>;
  }
  return (
    <>
      {/* Mobile: stacked cards so the dosage and price always sit beside each
          product. The desktop table below scrolls sideways on a phone, which
          hid exactly those two columns and made multi-dosage products look
          like duplicate rows. */}
      <div className="sm:hidden border border-stone-200 divide-y divide-stone-100">
        {rows.map(r => (
          <div key={`${r.slug}::${r.dosage}`} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-700">{r.name}</p>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {r.dosage}
                  <span className="text-stone-300"> · </span>
                  <span className="text-stone-600 font-medium">{formatPrice(r.price)}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className={`text-sm font-semibold tabular-nums ${r.stock !== null && r.stock <= 0 ? 'text-red-500' : 'text-stone-700'}`}>
                  {formatStock(r.stock)}
                </p>
                <p className="text-[8px] tracking-[0.15em] uppercase text-stone-300">In stock</p>
              </div>
            </div>
            <p className="mt-1 text-[10px] text-stone-400">
              <span className="font-mono">{r.id}</span>
              <span className="text-stone-200"> · </span>
              {r.category}
            </p>
          </div>
        ))}
      </div>

      {/* Desktop / tablet: full table (unchanged) */}
      <div className="hidden sm:block border border-stone-200 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50">
              <th className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Product</th>
              <th className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">SKU</th>
              <th className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Size / Dosage</th>
              <th className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Category</th>
              <th className="text-right text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Price</th>
              <th className="text-right text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Stock</th>
              <th className="text-left text-[9px] tracking-[0.15em] uppercase text-stone-400 px-4 py-2.5">Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={`${r.slug}::${r.dosage}`} className="border-b border-stone-50 last:border-0">
                <td className="px-4 py-2.5 text-xs font-medium text-stone-700 whitespace-nowrap">{r.name}</td>
                <td className="px-4 py-2.5 text-xs text-stone-400 font-mono">{r.id}</td>
                <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">{r.dosage}</td>
                <td className="px-4 py-2.5 text-xs text-stone-500 whitespace-nowrap">{r.category}</td>
                <td className="px-4 py-2.5 text-xs text-stone-600 text-right whitespace-nowrap">{formatPrice(r.price)}</td>
                <td className={`px-4 py-2.5 text-xs text-right font-semibold whitespace-nowrap ${r.stock !== null && r.stock <= 0 ? 'text-red-500' : 'text-stone-700'}`}>
                  {formatStock(r.stock)}
                </td>
                <td className="px-4 py-2.5 text-[10px] text-stone-400 whitespace-nowrap">{formatUpdatedAt(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// Live inventory snapshot across the entire catalogue, enabled and disabled
// alike — opened from the "Check All Stock" button on the admin Products
// page. Always fetches fresh on open (no caching layer involved anywhere in
// this path), so the numbers reflect the instant the button was clicked.
export default function StockReportModal({ open, onClose }: Props) {
  const [rows, setRows] = useState<StockReportRow[] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRows(null);
    setError('');
    fetch('/api/admin/products/stock-report', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setRows(data.rows);
        setGeneratedAt(data.generatedAt);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Could not load the stock report.'));

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Through the shared counter — see src/components/viewportOwner.ts.
  useOverflowLock(open, 'stock-report');

  // Sized to the visible screen, same reason as the customer message box
  // (task 43f558e8): a report taller than what can be seen makes Safari pan
  // the page instead of scrolling the report.
  const screen = useVisualViewport();
  const overlayStyle =
    screen.height !== null ? { top: screen.offsetTop, height: screen.height } : undefined;

  if (!open) return null;

  const enabledRows = rows?.filter(r => r.status === 'enabled') ?? [];
  const disabledRows = rows?.filter(r => r.status === 'disabled') ?? [];

  return (
    <div
      className="fixed left-0 right-0 top-0 h-[100svh] z-[300] flex items-start sm:items-center justify-center p-2 sm:p-4"
      style={overlayStyle}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-5xl max-h-full flex flex-col overflow-hidden shadow-2xl">
        <div className="shrink-0 bg-white border-b border-gold-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-10">
          <div>
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-400">Windsor Glow Admin</p>
            <p className="font-serif text-sm sm:text-base text-stone-700">Stock Check Report</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {rows && (
              <button
                onClick={() => downloadCsv(rows, generatedAt)}
                className="text-[9px] sm:text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors font-semibold border border-gold-200 px-3 py-2 sm:px-3 sm:py-1.5"
              >
                Download CSV
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close stock report"
              className="p-2 -m-2 text-stone-400 hover:text-stone-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
          {!rows && !error && <p className="text-xs text-stone-400 py-10 text-center">Loading live stock data…</p>}

          {rows && (
            <>
              <p className="text-[10px] text-stone-300 mb-5">
                Generated {new Date(generatedAt).toLocaleString('en-GB')} · {rows.length} product{rows.length === 1 ? '' : 's'} total
              </p>

              <div className="mb-7">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  <h3 className="text-xs tracking-[0.15em] uppercase text-stone-600 font-semibold">
                    Enabled / Active ({enabledRows.length})
                  </h3>
                </div>
                <StockTable rows={enabledRows} />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-stone-300 shrink-0" />
                  <h3 className="text-xs tracking-[0.15em] uppercase text-stone-600 font-semibold">
                    Disabled / Inactive ({disabledRows.length})
                  </h3>
                </div>
                <StockTable rows={disabledRows} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
