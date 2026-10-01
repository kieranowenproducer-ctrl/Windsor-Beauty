'use client';

import { dateLabel, type ExportGroup } from './dispatchTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  toExport: ExportGroup[];
  downloadCSV: (date: string) => void;
  csvDownloading: Set<string>;
}

export default function ExportStep({ toExport, downloadCSV, csvDownloading }: Props) {
  return (
    <>
              {/* ── STEP 1: Export ───────────────────────────────────────────── */}
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-6 rounded-full bg-stone-400 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-white">1</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-stone-700 tracking-wide">Export to Royal Mail</h2>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Download a CSV for each day, then import it into Royal Mail Click &amp; Drop to generate all labels at once.
                    </p>
                  </div>
                </div>

                {toExport.length === 0 ? (
                  <div className="border border-stone-200 bg-white px-6 py-8 text-center">
                    <p className="text-xs text-stone-400">No paid orders waiting to be exported.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {toExport.map(group => (
                      <div key={group.date} className="border border-stone-200 bg-white">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 bg-stone-50">
                          <div>
                            <span className="text-xs font-semibold text-stone-700">{dateLabel(group.date)}</span>
                            <span className="ml-2 text-[10px] text-stone-400">{group.date}</span>
                            <span className="ml-3 text-[10px] text-gold-700 font-medium">
                              {group.orders.length} order{group.orders.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => downloadCSV(group.date)}
                            disabled={csvDownloading.has(group.date)}
                            className="border border-stone-300 text-stone-600 hover:border-gold-300 hover:text-gold-700 disabled:opacity-50 text-[9px] tracking-[0.18em] uppercase px-4 py-2 transition-colors"
                          >
                            {csvDownloading.has(group.date) ? 'Downloading...' : 'Download Royal Mail CSV'}
                          </button>
                        </div>
                        <div className="divide-y divide-stone-100">
                          {group.orders.map(o => (
                            <div key={o.orderNumber} className="flex items-center justify-between px-5 py-3">
                              <div className="flex items-center gap-4">
                                <span className="font-mono text-[11px] text-gold-700 tracking-wider">{o.orderNumber}</span>
                                <span className="text-xs text-stone-700">{o.customerName}</span>
                                <span className="text-[10px] text-stone-400">{o.email}</span>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <span className="text-[10px] text-stone-400">{o.shippingLabel}</span>
                                <span className="text-xs font-medium text-stone-700">£{o.total.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
    </>
  );
}
