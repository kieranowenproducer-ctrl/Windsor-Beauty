'use client';

// The on-certificate editor: the product certificate rendered in its real
// customer-facing layout (mirrors CertificateModal's CertificateBody), with
// every value editable IN PLACE and auto-saved through the filler's existing
// debounced save.
import { useEffect, useMemo, type ReactNode } from 'react';
import Image from 'next/image';
import { DEFAULT_CERTIFICATE_CAUTION, DEFAULT_PRODUCT_SPECS } from '@/data/products';
import {
  type Draft, type RowMeta, VS_KEYS, vsValue,
  setVsRow, requiredMissing, autoStatus, STATUS_META, draftToCert,
} from './shared';
import { certificateIssuesFor, type CertificateFieldIssue, type CertificateFieldKey } from '@/lib/certificateAudit';
import type { CertificateFillerStatus } from '@/data/products';
import { useOverflowLock } from '@/components/viewportOwner';
import { useVisualViewport } from '@/components/useVisualViewport';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  meta: RowMeta;
  draft: Draft;
  saveState: SaveState;
  duplicate: boolean;
  onEdit: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;
  onClose: () => void;
}

const OPTIONAL_HINT = 'Optional. Leave blank if it is not on the certificate.';

// An input that dresses as certificate text. Amber when a required value is
// still empty, invisible-until-hover otherwise, gold ring while typing.
function cellCls(empty: boolean, required: boolean) {
  return [
    'w-full bg-transparent text-stone-700 leading-relaxed rounded-sm px-1.5 py-0.5 -mx-1.5 outline-none border transition-colors',
    required && empty
      ? 'border-amber-300 bg-amber-50/70 placeholder:text-amber-400'
      : 'border-transparent hover:border-stone-200 focus:bg-white placeholder:text-stone-300',
    'focus:border-gold-400 focus:ring-1 focus:ring-gold-200',
  ].join(' ');
}

// ─── The problems, marked on the boxes you type into ─────────────────────────
// Pressing "Fix these 2" used to leave the certificate behind and open the
// back-office product editor, so the red marks a person had just been shown
// were on one screen and the boxes that put them right were on another
// (task f5c8da12, second round). Now the marks are on this editor, on the very
// box that clears them, and they are recomputed from what is typed — so a mark
// disappears as the value is entered, with nothing saved and no page change.
//
// The rules are certificateAudit's and only certificateAudit's. This screen
// cannot say something different from the Certificates screen, because both
// ask the same function.

/** The one-line correction shown under a marked box. Same wording as the viewer. */
function issueNote(issue: CertificateFieldIssue) {
  return issue.kind === 'missing'
    ? `Not filled in. This needs ${issue.example}.`
    : `${issue.reason}. This needs ${issue.example}.`;
}

/** Wraps a row of the certificate so a problem with it is impossible to miss. */
function MarkedRow({ issue, children }: { issue?: CertificateFieldIssue; children: ReactNode }) {
  if (!issue) return <>{children}</>;
  return (
    <div className="border-l-4 border-red-500 bg-red-50">
      {children}
      <p className="px-4 pb-2 text-xs font-medium text-red-700">{issueNote(issue)}</p>
    </div>
  );
}

export default function CertificateEditor({ meta, draft: d, saveState, duplicate, onEdit, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // Through the shared counter rather than setting `overflow` here. Each overlay
  // doing it itself means whichever closes FIRST hands the page back while the
  // other is still open. See src/components/viewportOwner.ts.
  useOverflowLock(true, 'certificate-editor');
  // Sized to the visible screen, not the page, so the footer buttons stay
  // reachable on an upright iPhone with the keyboard open (task 43f558e8,
  // same fault as the customer message box).
  const screen = useVisualViewport();
  const overlayStyle =
    screen.height !== null ? { top: screen.offsetTop, height: screen.height } : undefined;

  const status = autoStatus(d, meta);
  const miss = requiredMissing(d, meta);
  const sm = STATUS_META[status];
  const external = d.mode === 'external';

  // Recomputed on every keystroke, from what is typed rather than what is saved. Cheap: it is a
  // handful of string checks over a dozen rows, and it is what makes a red mark clear itself the
  // moment the value is entered.
  const issues = useMemo(
    () => certificateIssuesFor(draftToCert(d), d.dosage),
    [d],
  );
  const issueFor = (key: CertificateFieldKey) => issues.find((i) => i.key === key);
  const canComplete = miss.length === 0 && !duplicate;
  const canShow = status === 'complete' && !duplicate;
  const setStatus = (s?: CertificateFillerStatus) => onEdit({ fillerStatus: s });

  const setVs = (k: keyof typeof VS_KEYS, v: string) =>
    onEdit((cur) => ({ verificationSummary: setVsRow(cur.verificationSummary, k, v) }));

  // Ordered spec rows — same order as the customer certificate.
  // None of these is required. Product Name and Storage fall back to the product's own value, and
  // the four reference rows only appear on the certificate when something is typed in them.
  const specRows: Array<{ label: string; value: string; key: keyof Draft; placeholder: string; audit?: CertificateFieldKey }> = [
    { label: 'Product Name', value: d.productName, key: 'productName', placeholder: meta.product.name },
    { label: 'CAS Number', value: d.casNumber, key: 'casNumber', placeholder: meta.ref?.verify?.cas || OPTIONAL_HINT, audit: 'casNumber' },
    { label: 'PubChem CID', value: d.pubchemCid, key: 'pubchemCid', placeholder: meta.ref?.verify?.cid || OPTIONAL_HINT, audit: 'pubchemCid' },
    { label: 'Molecular Formula', value: d.molecularFormula, key: 'molecularFormula', placeholder: meta.ref?.verify?.formula || OPTIONAL_HINT, audit: 'molecularFormula' },
    { label: 'Molecular Weight', value: d.molecularWeight, key: 'molecularWeight', placeholder: meta.ref?.verify?.mw || OPTIONAL_HINT, audit: 'molecularWeight' },
    { label: 'Storage', value: d.storage, key: 'storage', placeholder: meta.product.storage || DEFAULT_PRODUCT_SPECS.storage },
  ];

  // No test row is fixed. Every one is typed by hand from the real document.
  const extraTests = d.testRows.map((r, i) => ({ r, i }));

  return (
    <div
      className="fixed left-0 right-0 top-0 h-[100svh] z-[300] flex items-start sm:items-center justify-center p-0 sm:p-4"
      style={overlayStyle}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full max-w-3xl h-full sm:h-auto sm:max-h-[92svh] overflow-y-auto overscroll-contain shadow-2xl">
        {/* controls */}
        <div className="sticky top-0 bg-white border-b border-gold-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 z-10">
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-400">Editing certificate</p>
            <p className="text-[11px] text-stone-500 truncate">{meta.product.name}{d.dosage ? ` · ${d.dosage}` : ''}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[11px] min-w-[70px] text-right" aria-live="polite">
              {saveState === 'saving' ? <span className="text-stone-400">Saving…</span>
                : saveState === 'saved' ? <span className="text-green-600">Saved ✓</span>
                : saveState === 'error' ? <span className="text-red-500">Save failed</span>
                : <span className="text-stone-300">Auto-saves</span>}
            </span>
            <button onClick={onClose} aria-label="Close editor" className="text-stone-400 hover:text-stone-700 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* compliance strip */}
        <div className="px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-800 leading-snug">
          Type only what is printed on the real certificate for this product. Never make up a batch number,
          a date or a result. Leave a box blank until you have the real value. Every change saves on its own.
        </div>

        {external ? (
          <div className="p-6 sm:p-10 text-[13px] text-stone-600">
            This product uses an <b>uploaded supplier certificate</b> ({d.externalImages.length} page{d.externalImages.length !== 1 ? 's' : ''}),
            so there are no fields to type on the certificate itself. Manage the uploaded pages on the Products page.
          </div>
        ) : (
          <div className="p-4 sm:p-10">
            {/* What is still wrong, live. The same count and the same wording as the viewer this
                editor was opened from, so pressing "Fix these 2" does not land on a screen that
                says something different. */}
            {issues.length > 0 ? (
              <div className="mb-6 border-2 border-red-500 bg-red-50 px-5 py-4">
                <p className="mb-2 text-sm font-semibold text-red-700">
                  {issues.length === 1
                    ? 'One thing still needs fixing on this certificate'
                    : `${issues.length} things still need fixing on this certificate`}
                </p>
                <ul className="mb-2 space-y-0.5">
                  {issues.map((issue, i) => (
                    <li key={i} className="text-xs leading-snug text-red-700">
                      <span className="font-semibold">{issue.field}</span>
                      {issue.kind === 'missing' ? ' is not filled in' : `: ${issue.reason}`}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-red-700">
                  Each one is marked in red below, on the box that fixes it. Type the real value and
                  the mark goes.
                </p>
              </div>
            ) : (
              <div className="mb-6 border-2 border-green-600 bg-green-50 px-5 py-4">
                <p className="text-sm font-semibold text-green-800">
                  Nothing left to fix on this certificate. Every field it needs is filled in.
                </p>
              </div>
            )}

            {/* logo */}
            <div className="mb-8 flex justify-center">
              <Image src="/images/windsor-beauty-logo-transparent.png" alt="Windsor Beauty" width={220} height={70} className="h-14 sm:h-16 w-auto object-contain" />
            </div>

            {/* header bar with inline certificate number */}
            {/* gold-800 to gold-700, not 500 to 400. White on gold-500 is 2.97:1 and on
                gold-400 is worse; this pair is 7.64:1 falling to 5.09:1, so the heading
                stays readable across the whole width of the bar. */}
            <div className="bg-gradient-to-r from-gold-800 to-gold-700 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 mb-2">
              <span className="font-serif text-xl sm:text-2xl tracking-wide">Product Certificate</span>
              <input
                value={d.certificateId}
                onChange={(e) => onEdit({ certificateId: e.target.value })}
                placeholder="CERTIFICATE NUMBER"
                aria-label="Certificate number"
                className={`text-xs sm:text-sm tracking-[0.18em] uppercase font-bold text-right rounded-sm px-2 py-1 outline-none w-44 sm:w-56 transition-colors ${
                  duplicate ? 'bg-rose-100 text-rose-700 border border-rose-300'
                  : !d.certificateId.trim() ? 'bg-white/20 border border-white/50 text-white placeholder:text-white/60'
                  : 'bg-transparent border border-transparent hover:border-white/40 focus:border-white/70 text-white'
                }`}
              />
            </div>
            {duplicate && (
              <p className="text-[11px] text-rose-600 mb-4">This certificate number is already used on another product or size. Each one needs its own.</p>
            )}
            {issueFor('certificateId') && (
              <p className="mb-4 border-l-4 border-red-500 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">
                Certificate number: {issueNote(issueFor('certificateId')!)}
              </p>
            )}

            {/* specifications */}
            <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3 mt-6">Product Specifications</h3>
            <div className="border border-gold-100 mb-8 text-sm">
              {specRows.map((row, i) => {
                const issue = row.audit ? issueFor(row.audit) : undefined;
                return (
                  <MarkedRow key={row.label} issue={issue}>
                    <div className={`flex ${issue ? '' : i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}>
                      <div className={`w-2/5 sm:w-1/3 px-4 py-3 font-medium ${issue ? 'text-red-700' : 'text-stone-500'}`}>{row.label}</div>
                      <div className="flex-1 px-3 py-2 flex items-center">
                        <input
                          className={cellCls(!row.value.trim(), false)}
                          value={row.value}
                          placeholder={row.placeholder}
                          aria-label={row.label}
                          onChange={(e) => onEdit({ [row.key]: e.target.value } as Partial<Draft>)}
                        />
                      </div>
                    </div>
                  </MarkedRow>
                );
              })}
            </div>

            {/* certificate details: labelled rows first, then any extras, then add */}
            <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Certificate Details</h3>
            <div className="border border-gold-100 mb-2 text-sm">
              {([
                { k: 'batch' as const, required: true },
                { k: 'testDate' as const, required: true },
                { k: 'manufactureDate' as const, required: false },
                { k: 'retestDate' as const, required: false },
                { k: 'laboratory' as const, required: false },
              ]).map(({ k, required }, i) => {
                const v = vsValue(d.verificationSummary, VS_KEYS[k].re);
                // Batch / Lot and Certificate Date are the two rows the audit checks here.
                const issue = k === 'batch' || k === 'testDate' ? issueFor(k) : undefined;
                return (
                  <MarkedRow key={k} issue={issue}>
                    <div className={`flex ${issue ? '' : i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}>
                      <div className={`w-2/5 sm:w-1/3 px-4 py-3 font-medium ${issue ? 'text-red-700' : 'text-stone-500'}`}>{VS_KEYS[k].name}{!required && <span className="text-stone-300"> (optional)</span>}</div>
                      <div className="flex-1 px-3 py-2 flex items-center">
                        <input className={cellCls(!v.trim(), required)} value={v} aria-label={VS_KEYS[k].name}
                          placeholder={k === 'batch' ? 'The batch code on the certificate' : k === 'laboratory' ? 'Who issued the certificate' : 'e.g. 15/01/2026'}
                          onChange={(e) => setVs(k, e.target.value)} />
                      </div>
                    </div>
                  </MarkedRow>
                );
              })}
              {/* extra rows already on the certificate stay visible + editable */}
              {d.verificationSummary.map((r, i) => (Object.values(VS_KEYS).some((cfg) => cfg.re.test(r.label)) ? null : (
                <div key={`x${i}`} className="flex border-t border-gold-100 bg-white">
                  <div className="w-2/5 sm:w-1/3 px-3 py-2 flex items-center">
                    <input className={cellCls(false, false)} value={r.label} placeholder="Label" aria-label="Extra detail label"
                      onChange={(e) => onEdit((cur) => { const t = cur.verificationSummary.map((x) => ({ ...x })); t[i].label = e.target.value; return { verificationSummary: t }; })} />
                  </div>
                  <div className="flex-1 px-3 py-2 flex items-center">
                    <input className={cellCls(false, false)} value={r.value} placeholder="Value" aria-label="Extra detail value"
                      onChange={(e) => onEdit((cur) => { const t = cur.verificationSummary.map((x) => ({ ...x })); t[i].value = e.target.value; return { verificationSummary: t }; })} />
                  </div>
                </div>
              )))}
            </div>
            <button type="button" className="text-[11px] text-gold-700 hover:text-gold-700 mb-8"
              onClick={() => onEdit((cur) => ({ verificationSummary: [...cur.verificationSummary, { label: '', value: '' }] }))}>
              + Add a details row
            </button>

            {/* test results */}
            <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Test Results</h3>
            <div className="border border-gold-100 mb-2 text-sm">
              <div className="flex text-xs tracking-[0.12em] uppercase text-gold-700 font-semibold bg-gold-50 border-b border-gold-100">
                <div className="w-2/5 sm:w-1/3 px-4 py-3">Test</div>
                <div className="w-[30%] px-4 py-3">Specification</div>
                <div className="flex-1 px-4 py-3">Result</div>
              </div>
              {extraTests.map(({ r, i }) => (
                <div key={`t${i}`} className="flex border-t border-gold-100 bg-white">
                  <div className="w-2/5 sm:w-1/3 px-3 py-2 flex items-center">
                    <input className={cellCls(false, false)} value={r.test} placeholder="Test" aria-label="Test name"
                      onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].test = e.target.value; return { testRows: t }; })} />
                  </div>
                  <div className="w-[30%] px-3 py-2 flex items-center">
                    <input className={cellCls(false, false)} value={r.specification} placeholder="Specification" aria-label="Test specification"
                      onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].specification = e.target.value; return { testRows: t }; })} />
                  </div>
                  <div className="flex-1 px-3 py-2 flex items-center">
                    <input className={cellCls(false, false)} value={r.result} placeholder="Result" aria-label="Test result"
                      onChange={(e) => onEdit((cur) => { const t = cur.testRows.map((x) => ({ ...x })); t[i].result = e.target.value; return { testRows: t }; })} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="text-[11px] text-gold-700 hover:text-gold-700 mb-8"
              onClick={() => onEdit((cur) => ({ testRows: [...cur.testRows, { test: '', specification: '', result: '' }] }))}>
              + Add a test row
            </button>

            {/* additional information */}
            {(d.analyticalResults.length > 0) && (
              <>
                <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Additional Information</h3>
                <div className="border border-gold-100 mb-2 text-sm">
                  {d.analyticalResults.map((r, i) => (
                    <div key={i} className={`flex ${i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}>
                      <div className="w-2/5 sm:w-1/3 px-3 py-2 flex items-center">
                        <input className={cellCls(false, false)} value={r.label} placeholder="Label" aria-label="Additional information label"
                          onChange={(e) => onEdit((cur) => { const t = cur.analyticalResults.map((x) => ({ ...x })); t[i].label = e.target.value; return { analyticalResults: t }; })} />
                      </div>
                      <div className="flex-1 px-3 py-2 flex items-center">
                        <input className={cellCls(false, false)} value={r.value} placeholder="Value" aria-label="Additional information value"
                          onChange={(e) => onEdit((cur) => { const t = cur.analyticalResults.map((x) => ({ ...x })); t[i].value = e.target.value; return { analyticalResults: t }; })} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <button type="button" className="text-[11px] text-gold-700 hover:text-gold-700 mb-8"
              onClick={() => onEdit((cur) => ({ analyticalResults: [...cur.analyticalResults, { label: '', value: '' }] }))}>
              + Add an additional information row
            </button>

            {/* caution */}
            <div className="mb-2">
              <span className="text-xs font-bold uppercase tracking-wide text-stone-800">Note:</span>
              <textarea
                className="w-full mt-1 text-xs font-bold uppercase tracking-wide text-stone-800 leading-relaxed bg-transparent border border-transparent hover:border-stone-200 focus:border-gold-400 focus:ring-1 focus:ring-gold-200 focus:bg-white rounded-sm px-1.5 py-1 outline-none h-24 resize-y placeholder:font-normal placeholder:normal-case placeholder:text-stone-300"
                value={d.caution}
                placeholder={DEFAULT_CERTIFICATE_CAUTION}
                aria-label="Note text"
                onChange={(e) => onEdit({ caution: e.target.value })}
              />
              <p className="text-[10px] text-stone-400">Leave blank to print the standard note.</p>
            </div>
          </div>
        )}

        {/* footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-gold-100 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[10px] tracking-[0.08em] uppercase px-2 py-1 rounded-full ${sm.cls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sm.dot}`} />{sm.label}
          </span>
          {status !== 'complete' && miss.length > 0 && (
            <span className="text-[11px] text-amber-700">Still needed: {miss.join(', ')}</span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status === 'complete' ? (
              <button onClick={() => setStatus(undefined)} className="text-xs px-3 py-1.5 rounded border border-stone-200 text-stone-600 hover:border-stone-300">Reopen</button>
            ) : (
              <button onClick={() => canComplete && setStatus('complete')} disabled={!canComplete}
                title={canComplete ? 'Mark this certificate as checked and finished' : duplicate ? 'Fix the duplicate number first' : `Still need: ${miss.join(', ')}`}
                className={`text-xs px-3 py-1.5 rounded ${canComplete ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-stone-100 text-stone-400 cursor-not-allowed'}`}>
                Mark complete
              </button>
            )}
            <label className={`flex items-center gap-2 text-[12px] ${canShow || d.enabled ? 'text-stone-700 cursor-pointer' : 'text-stone-300 cursor-not-allowed'}`}
              title={canShow ? 'Show this certificate on the live product page' : 'Mark the certificate complete first'}>
              <input type="checkbox" checked={d.enabled} disabled={!canShow && !d.enabled} onChange={(e) => onEdit({ enabled: e.target.checked })} />
              Show on site
            </label>
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-stone-800 text-white hover:bg-stone-700">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
