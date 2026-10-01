'use client';

import type { DragEvent, RefObject } from 'react';
import { downloadExampleCsv, type PreviewResult, type ImportResult, type ManualOverride } from './upsellTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  mode: 'replace' | 'append';
  setMode: (value: 'replace' | 'append') => void;
  fileName: string;
  csvText: string;
  dragActive: boolean;
  setDragActive: (value: boolean) => void;
  onDrop: (e: DragEvent) => void;
  readFile: (file: File) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handlePreview: () => void;
  previewing: boolean;
  preview: PreviewResult | null;
  setPreview: (value: PreviewResult | null) => void;
  handleImport: () => void;
  importing: boolean;
  importResult: ImportResult | null;
  manualOverrideMap: Map<string, ManualOverride>;
}

export default function CsvImportPanel({
  mode, setMode, fileName, csvText, dragActive, setDragActive, onDrop, readFile, fileInputRef, handlePreview, previewing, preview, setPreview, handleImport, importing, importResult, manualOverrideMap,
}: Props) {
  return (
    <>
          {/* ─── CSV Import / Bulk Upload ──────────────────────────────── */}
          <div className="bg-white border border-stone-200 p-6 mb-8">
            <h2 className="text-sm font-semibold text-stone-800 mb-2">CSV Import / Bulk Upload</h2>

            <div className="bg-gold-50/40 border border-gold-100 px-4 py-3 mb-4 text-xs text-stone-600 leading-relaxed">
              For bulk setup across many products at once. Manually-configured products (above) are never
              affected by an import — their override always takes priority over whatever a CSV says.
            </div>

            <div className="text-xs text-stone-500 mb-4 leading-relaxed">
              <p className="mb-2">Required columns: <code className="bg-stone-100 px-1.5 py-0.5">trigger_product_handle</code>, <code className="bg-stone-100 px-1.5 py-0.5">upsell_product_handle</code>, <code className="bg-stone-100 px-1.5 py-0.5">priority</code>, <code className="bg-stone-100 px-1.5 py-0.5">active</code>.</p>
              <p className="mb-2">Optional columns: <code className="bg-stone-100 px-1.5 py-0.5">custom_message</code>, <code className="bg-stone-100 px-1.5 py-0.5">start_date</code>, <code className="bg-stone-100 px-1.5 py-0.5">end_date</code> (YYYY-MM-DD, reserved for future seasonal/temporary upsells).</p>
              <p>Handles are product slugs (the part of the product&apos;s URL after <code className="bg-stone-100 px-1.5 py-0.5">/shop/</code>) — names change, handles don&apos;t, so they&apos;re the reliable key. Lower <code className="bg-stone-100 px-1.5 py-0.5">priority</code> numbers display first. <code className="bg-stone-100 px-1.5 py-0.5">active</code> accepts TRUE/FALSE.</p>
            </div>

            <div className="flex items-center gap-5 mb-5 flex-wrap">
              <button
                type="button"
                onClick={downloadExampleCsv}
                className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
              >
                Download Example CSV
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                <input type="radio" name="mode" checked={mode === 'replace'} onChange={() => { setMode('replace'); setPreview(null); }} className="accent-gold-500" />
                Replace existing rules
              </label>
              <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer">
                <input type="radio" name="mode" checked={mode === 'append'} onChange={() => { setMode('append'); setPreview(null); }} className="accent-gold-500" />
                Append to existing rules
              </label>
            </div>
            <p className="text-[10px] text-stone-400 mb-4 leading-relaxed">
              {mode === 'replace'
                ? 'Replace fully swaps the CSV rule set — every rule from this file becomes the new active set. Existing CSV rules are only removed once the new file has imported successfully. Manual overrides are never touched by this.'
                : 'Append merges into the existing CSV rule set — a relationship already in this file updates in place, anything new is added, and rules not mentioned in this file are left untouched. Manual overrides are never touched by this.'}
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed px-6 py-8 text-center transition-colors mb-4 ${
                dragActive ? 'border-gold-400 bg-gold-50/40' : 'border-stone-200'
              }`}
            >
              <p className="text-xs text-stone-500 mb-3">
                {fileName ? <>Selected: <span className="font-medium text-stone-700">{fileName}</span></> : 'Drag and drop a CSV file here, or'}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[10px] tracking-[0.15em] uppercase text-gold-700 hover:text-gold-700 transition-colors border border-gold-200 px-4 py-2"
              >
                Choose File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }}
              />
            </div>

            {!preview?.preview && (
              <button
                type="button"
                onClick={handlePreview}
                disabled={!csvText.trim() || previewing}
                className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
              >
                {previewing ? 'Validating…' : 'Preview Import'}
              </button>
            )}

            {preview?.error && (
              <div className="mt-5 border border-red-200 bg-red-50 px-4 py-4 text-xs">
                <p className="text-red-700 font-medium">{preview.error}</p>
                {preview.errors && preview.errors.length > 0 && (
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                    {preview.errors.map((e, i) => (
                      <li key={i} className="text-red-600">
                        {e.row > 0 ? <span className="text-red-400">Row {e.row}:</span> : null} {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {preview?.preview && (
              <div className="mt-5 border border-stone-200 bg-stone-50 px-4 py-4 text-xs">
                <p className="text-stone-700 font-semibold mb-2">Import Preview — nothing has been saved yet</p>
                <ul className="text-stone-500 space-y-0.5 mb-4">
                  <li>Total rows in file: <span className="font-medium text-stone-700">{preview.totalRows}</span></li>
                  <li>Valid rules ready to import: <span className="font-medium text-green-700">{preview.validRows}</span></li>
                  <li>Invalid rows (will be skipped): <span className="font-medium text-red-600">{preview.invalidRows}</span></li>
                  <li>Products recognised: <span className="font-medium text-stone-700">{preview.recognizedProducts?.length ?? 0}</span></li>
                </ul>

                {preview.rules && preview.rules.length > 0 && (
                  <div className="mb-4">
                    <p className="text-stone-700 font-semibold mb-1.5">Rules to be imported ({preview.rules.length})</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {preview.rules.map((r, i) => (
                        <li key={i} className="text-stone-500">
                          <span className="text-stone-400">Row {r.row}:</span> {r.triggerName} <span className="text-gold-700">&rarr;</span> {r.upsellName}
                          {' '}<span className="text-stone-400">(priority {r.priority}{!r.active ? ', inactive' : ''})</span>
                          {manualOverrideMap.has(r.triggerHandle) && (
                            <span className="ml-2 px-1.5 py-0.5 text-[8px] tracking-wider uppercase bg-gold-100 text-gold-700">Manual override active — won&apos;t take effect</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.recognizedProducts && preview.recognizedProducts.length > 0 && (
                  <div className="mb-4">
                    <p className="text-stone-700 font-semibold mb-1.5">Products recognised</p>
                    <p className="text-stone-500 leading-relaxed">{preview.recognizedProducts.map(p => p.name).join(', ')}</p>
                  </div>
                )}

                {preview.errors && preview.errors.some(e => e.kind === 'unknown_handle') && (
                  <div className="mb-4">
                    <p className="text-red-700 font-semibold mb-1.5">
                      Invalid handles ({preview.errors.filter(e => e.kind === 'unknown_handle').length})
                    </p>
                    <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {preview.errors.filter(e => e.kind === 'unknown_handle').map((e, i) => (
                        <li key={i} className="text-red-600">
                          <span className="text-red-400">Row {e.row}:</span> {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.errors && preview.errors.some(e => e.kind === 'duplicate') && (
                  <div className="mb-4">
                    <p className="text-amber-700 font-semibold mb-1.5">
                      Duplicate rows ({preview.errors.filter(e => e.kind === 'duplicate').length})
                    </p>
                    <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {preview.errors.filter(e => e.kind === 'duplicate').map((e, i) => (
                        <li key={i} className="text-amber-700">
                          <span className="text-amber-500">Row {e.row}:</span> {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {preview.errors && preview.errors.some(e => !e.kind) && (
                  <div className="mb-4">
                    <p className="text-stone-700 font-semibold mb-1.5">
                      Other invalid rows ({preview.errors.filter(e => !e.kind).length})
                    </p>
                    <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
                      {preview.errors.filter(e => !e.kind).map((e, i) => (
                        <li key={i} className="text-stone-500">
                          <span className="text-stone-400">Row {e.row}:</span> {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={importing || !preview.validRows}
                    className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
                  >
                    {importing ? 'Importing…' : `Confirm & Import ${preview.validRows} Rule${preview.validRows !== 1 ? 's' : ''}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    disabled={importing}
                    className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className={`mt-5 border px-4 py-4 text-xs ${importResult.error ? 'border-red-200 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
                {importResult.error ? (
                  <p className="text-red-700 font-medium">{importResult.error}</p>
                ) : (
                  <div className="mb-3">
                    <p className="text-stone-700 font-semibold mb-1">Import Summary</p>
                    <ul className="text-stone-500 space-y-0.5">
                      <li>Total rules imported: <span className="font-medium text-stone-700">{importResult.summary?.totalRules ?? importResult.imported}</span></li>
                      <li>Total products referenced: <span className="font-medium text-stone-700">{importResult.summary?.totalProducts}</span></li>
                      <li>Total errors: <span className="font-medium text-stone-700">{importResult.summary?.totalErrors ?? importResult.errors?.length ?? 0}</span></li>
                      <li>Imported at: <span className="font-medium text-stone-700">{importResult.summary?.at ? new Date(importResult.summary.at).toLocaleString('en-GB') : '—'}</span></li>
                    </ul>
                  </div>
                )}
                {importResult.errors && importResult.errors.length > 0 && (
                  <div>
                    <p className="text-stone-700 font-semibold mb-1.5">Validation Report ({importResult.errors.length} skipped row{importResult.errors.length !== 1 ? 's' : ''})</p>
                    <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {importResult.errors.map((e, i) => (
                        <li key={i} className="text-stone-500">
                          {e.row > 0 ? <span className="text-stone-400">Row {e.row}:</span> : null} {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
    </>
  );
}
