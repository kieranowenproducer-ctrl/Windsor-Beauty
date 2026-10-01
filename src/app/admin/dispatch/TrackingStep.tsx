'use client';

import type { DragEvent, RefObject } from 'react';
import type { ExportGroup, TrackOrder } from './dispatchTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  toTrack: TrackOrder[];
  toExport: ExportGroup[];
  trackingInputs: Record<string, string>;
  setTrackingInputs: (update: (prev: Record<string, string>) => Record<string, string>) => void;
  filledTrackingCount: number;
  saveAllTracking: () => void;
  saving: boolean;
  saveResults: Record<string, { success: boolean; emailSent: boolean; error?: string }>;
  importText: string;
  setImportText: (value: string) => void;
  applyImport: (content: string) => void;
  importFeedback: { matched: number; unmatched: string[]; strategy: string } | null;
  dragOver: boolean;
  setDragOver: (value: boolean) => void;
  handleDrop: (e: DragEvent) => void;
  handleFileUpload: (file: File) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export default function TrackingStep({
  toTrack, toExport, trackingInputs, setTrackingInputs, filledTrackingCount,
  saveAllTracking, saving, saveResults,
  importText, setImportText, applyImport, importFeedback,
  dragOver, setDragOver, handleDrop, handleFileUpload, fileInputRef,
}: Props) {
  return (
    <>
              {/* ── STEP 2: Tracking numbers ─────────────────────────────────── */}
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-white">2</span>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-stone-700 tracking-wide">Enter Tracking Numbers</h2>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Import the tracking file from Royal Mail Click &amp; Drop — it auto-assigns every tracking number to the right order.
                    </p>
                  </div>
                </div>

                {toTrack.length === 0 ? (
                  <div className="border border-stone-200 bg-white px-6 py-8 text-center">
                    <p className="text-xs text-stone-400">
                      {toExport.length > 0
                        ? 'Export the orders above first, then come back here to enter tracking numbers.'
                        : 'All exported orders have tracking numbers. Nothing to do.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">

                    {/* Smart import box */}
                    <div className="border border-stone-200 bg-white">
                      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-stone-700">Import from Royal Mail Click &amp; Drop</span>
                          <p className="text-[10px] text-stone-400 mt-0.5">
                            After printing labels, export your dispatched orders from Click &amp; Drop and drop the file here — or paste any text containing order numbers and tracking numbers.
                          </p>
                        </div>
                      </div>

                      <div className="p-5 space-y-3">
                        {/* Drop zone */}
                        <div
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-sm px-6 py-6 text-center cursor-pointer transition-colors ${
                            dragOver
                              ? 'border-gold-400 bg-gold-50'
                              : 'border-stone-200 hover:border-gold-300 hover:bg-stone-50'
                          }`}
                        >
                          <p className="text-xs text-stone-500 mb-1">
                            Drop your Click &amp; Drop CSV here, or <span className="text-gold-700 underline">click to choose a file</span>
                          </p>
                          <p className="text-[10px] text-stone-400">Accepts .csv or .txt — any format containing WB-order references</p>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.txt,text/plain,text/csv"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(file);
                              e.target.value = '';
                            }}
                          />
                        </div>

                        {/* Paste fallback */}
                        <div>
                          <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1.5">Or paste text directly</p>
                          <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder={'Paste copied text from Click & Drop here — e.g.:\nWG-XGRXZ9, TT123456789GB\nWG-ABCDE1, TT987654321GB'}
                            rows={4}
                            className="w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-xs text-stone-600 bg-white resize-none font-mono"
                          />
                          <button
                            onClick={() => applyImport(importText)}
                            disabled={!importText.trim()}
                            className="mt-2 bg-stone-700 hover:bg-stone-800 disabled:opacity-40 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2 transition-colors"
                          >
                            Auto-assign Tracking Numbers
                          </button>
                        </div>

                        {/* Import feedback */}
                        {importFeedback && (
                          <div className={`border px-4 py-3 text-xs ${
                            importFeedback.matched > 0
                              ? 'border-green-200 bg-green-50 text-green-700'
                              : 'border-red-200 bg-red-50 text-red-600'
                          }`}>
                            {importFeedback.matched > 0 ? (
                              <>
                                <span className="font-semibold">{importFeedback.matched} tracking number{importFeedback.matched !== 1 ? 's' : ''} matched</span>
                                {' '}and filled in automatically
                                <span className="text-[10px] opacity-70 ml-2">({importFeedback.strategy})</span>
                                {importFeedback.unmatched.length > 0 && (
                                  <p className="mt-1 text-[10px] text-amber-600">
                                    {importFeedback.unmatched.length} order{importFeedback.unmatched.length !== 1 ? 's' : ''} in the file not found in current queue: {importFeedback.unmatched.join(', ')}
                                  </p>
                                )}
                              </>
                            ) : (
                              'No matching order numbers found in the imported content. Make sure the file contains WB-order references and Royal Mail tracking numbers.'
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Per-order tracking table */}
                    <div className="border border-stone-200 bg-white">
                      <div className="grid grid-cols-[1fr_1fr_auto_auto_200px] gap-4 px-5 py-2.5 border-b border-stone-100 bg-stone-50">
                        <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Order</span>
                        <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Customer</span>
                        <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Service</span>
                        <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Total</span>
                        <span className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Tracking Number</span>
                      </div>

                      <div className="divide-y divide-stone-100">
                        {toTrack.map(o => {
                          const result = saveResults[o.orderNumber];
                          const filled = !!trackingInputs[o.orderNumber]?.trim();
                          return (
                            <div key={o.orderNumber}
                              className={`grid grid-cols-[1fr_1fr_auto_auto_200px] gap-4 items-center px-5 py-3 ${filled ? 'bg-green-50/40' : ''}`}>
                              <span className="font-mono text-[11px] text-gold-700 tracking-wider">{o.orderNumber}</span>
                              <div>
                                <div className="text-xs text-stone-700">{o.customerName}</div>
                                <div className="text-[10px] text-stone-400">{o.email}</div>
                              </div>
                              <span className="text-[10px] text-stone-500 whitespace-nowrap">{o.shippingLabel}</span>
                              <span className="text-xs font-medium text-stone-700 whitespace-nowrap">£{o.total.toFixed(2)}</span>
                              <div>
                                {result?.success ? (
                                  <p className="text-[10px] text-green-600 font-medium">
                                    {result.emailSent ? 'Dispatched — email sent' : 'Dispatched'}
                                  </p>
                                ) : (
                                  <>
                                    <input
                                      type="text"
                                      value={trackingInputs[o.orderNumber] ?? ''}
                                      onChange={e => setTrackingInputs(prev => ({ ...prev, [o.orderNumber]: e.target.value }))}
                                      placeholder="e.g. TT123456789GB"
                                      className={`w-full border focus:border-gold-400 outline-none px-2.5 py-1.5 text-xs text-stone-700 bg-white tracking-wider uppercase ${
                                        filled ? 'border-green-300 bg-green-50' : 'border-stone-200'
                                      }`}
                                    />
                                    {result?.error && (
                                      <p className="text-[9px] text-red-400 mt-1">{result.error}</p>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="px-5 py-4 border-t border-stone-100 flex items-center justify-between bg-stone-50">
                        <p className="text-[10px] text-stone-400">
                          {filledTrackingCount} of {toTrack.length} tracking number{toTrack.length !== 1 ? 's' : ''} ready
                        </p>
                        <button
                          onClick={saveAllTracking}
                          disabled={saving || filledTrackingCount === 0}
                          className="bg-stone-800 hover:bg-stone-900 disabled:opacity-40 text-white text-[9px] tracking-[0.18em] uppercase px-5 py-2.5 transition-colors"
                        >
                          {saving
                            ? 'Saving...'
                            : `Save ${filledTrackingCount > 0 ? filledTrackingCount : ''} & Send Dispatch Emails`}
                        </button>
                      </div>
                    </div>

                  </div>
                )}
              </section>
    </>
  );
}
