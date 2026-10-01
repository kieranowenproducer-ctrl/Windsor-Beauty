// Shared model + helpers for the on-certificate editor: the draft state,
// labelled-field matching and status logic used by CertificateEditor.tsx and
// src/components/admin/AdminCertificateEdit.tsx.
import {
  type Product, type ProductCertificate, type CertificateTestRow, type CertificateInfoRow,
  type CertificateFillerStatus,
} from '@/data/products';
import { type CertReference } from '@/data/certReference';
import { BATCH_ROW_MATCH, DATE_ROW_MATCH } from '@/lib/certificateStandards';

// ─────────────────────────────────────────────────────────────── draft model ──
// A string-mirror of ProductCertificate (+ the editable size) for controlled
// inputs, holding EVERY field so a save never drops data the tool doesn't show.
export interface Draft {
  enabled: boolean;
  mode: 'template' | 'external';
  fillerStatus?: CertificateFillerStatus;
  dosage: string;
  certificateId: string; productName: string;
  casNumber: string; pubchemCid: string; molecularFormula: string; molecularWeight: string;
  storage: string; caution: string; image?: string;
  externalImages: string[];
  testRows: CertificateTestRow[];
  verificationSummary: CertificateInfoRow[];
  analyticalResults: CertificateInfoRow[];
}

export function certToDraft(c: ProductCertificate | undefined, dosage: string): Draft {
  if (!c) return {
    enabled: false, mode: 'template', dosage,
    certificateId: '', productName: '', casNumber: '', pubchemCid: '', molecularFormula: '', molecularWeight: '',
    storage: '', caution: '', image: undefined, externalImages: [], testRows: [], verificationSummary: [], analyticalResults: [],
  };
  return {
    enabled: c.enabled, mode: c.mode ?? 'template', fillerStatus: c.fillerStatus, dosage,
    certificateId: c.certificateId || '', productName: c.productName ?? '',
    casNumber: c.casNumber ?? '', pubchemCid: c.pubchemCid ?? '', molecularFormula: c.molecularFormula ?? '', molecularWeight: c.molecularWeight ?? '',
    storage: c.storage ?? '', caution: c.caution ?? '', image: c.image,
    externalImages: c.externalImages ? [...c.externalImages] : [],
    testRows: (c.testRows ?? []).map((r) => ({ ...r })),
    verificationSummary: (c.verificationSummary ?? []).map((r) => ({ ...r })),
    analyticalResults: (c.analyticalResults ?? []).map((r) => ({ ...r })),
  };
}
const nonEmptyInfo = (rows: CertificateInfoRow[]) => {
  const c = rows.map((r) => ({ label: r.label.trim(), value: r.value.trim() })).filter((r) => r.label || r.value);
  return c.length ? c : undefined;
};
export function draftToCert(d: Draft): ProductCertificate {
  return {
    enabled: d.enabled,
    mode: d.mode === 'external' ? 'external' : undefined,
    fillerStatus: d.fillerStatus,
    certificateId: d.certificateId.trim(),
    productName: d.productName.trim() || undefined,
    casNumber: d.casNumber.trim() || undefined,
    pubchemCid: d.pubchemCid.trim() || undefined,
    molecularFormula: d.molecularFormula.trim() || undefined,
    molecularWeight: d.molecularWeight.trim() || undefined,
    storage: d.storage.trim() || undefined,
    testRows: d.testRows.map((r) => ({ test: r.test.trim(), specification: r.specification.trim(), result: r.result.trim() })).filter((r) => r.test || r.specification || r.result),
    caution: d.caution.trim() || undefined,
    image: d.image,
    externalImages: d.externalImages.length ? d.externalImages : undefined,
    verificationSummary: nonEmptyInfo(d.verificationSummary),
    analyticalResults: nonEmptyInfo(d.analyticalResults),
  };
}
export const certHasContent = (c: ProductCertificate) =>
  Boolean(c.certificateId || c.testRows.length || c.image || (c.externalImages?.length ?? 0) > 0);

// ─────────────────────────────────────────────────── labelled-field helpers ──
// Find/create a details row by a robust name match, so we edit the existing row
// (whatever it's called) rather than duplicating it, and keep any other rows.
// No test row is fixed: what a certificate lists is up to the document itself,
// so every test row is typed by hand. The key names are historic.
export const VS_KEYS = {
  batch: { re: BATCH_ROW_MATCH, name: 'Batch / Lot' },
  testDate: { re: DATE_ROW_MATCH, name: 'Certificate Date' },
  manufactureDate: { re: /manufact|mfg/i, name: 'Manufacture Date' },
  retestDate: { re: /retest|expiry|expire|best before/i, name: 'Expiry Date' },
  laboratory: { re: /lab\b|laborator|issued by/i, name: 'Issued By' },
} as const;

export const rowResult = (rows: CertificateTestRow[], re: RegExp) => rows.find((r) => re.test(r.test))?.result ?? '';
export const rowSpec = (rows: CertificateTestRow[], re: RegExp) => rows.find((r) => re.test(r.test))?.specification ?? '';
export const vsValue = (rows: CertificateInfoRow[], re: RegExp) => rows.find((r) => re.test(r.label))?.value ?? '';

export function setVsRow(rows: CertificateInfoRow[], key: keyof typeof VS_KEYS, value: string): CertificateInfoRow[] {
  const cfg = VS_KEYS[key];
  const next = rows.map((r) => ({ ...r }));
  const idx = next.findIndex((r) => cfg.re.test(r.label));
  if (idx >= 0) { next[idx].value = value; return next; }
  return [...next, { label: cfg.name, value }];
}
// Rows that AREN'T one of the labelled ones — shown in an "other rows" editor so nothing is hidden.
export const otherVsRows = (rows: CertificateInfoRow[]) => rows.map((r, i) => ({ r, i })).filter(({ r }) => !Object.values(VS_KEYS).some((k) => k.re.test(r.label)));

// ───────────────────────────────────────────────────────────── row metadata ──
export interface RowMeta {
  key: string; slug: string; product: Product; variantIndex: number;
  origDosage: string; variantEnabled: boolean; single: boolean;
  ref: CertReference | undefined; special: boolean; imageUrl?: string;
}
// Historic. No product in this shop has a reference kind, so this is always false.
export const isSpecialKind = (k?: CertReference['kind']) => k === 'blend' || k === 'water' || k === 'pen-external';

export type StatusKey = 'not_started' | 'in_progress' | 'ready' | 'needs_review' | 'blocked' | 'complete';
export const STATUS_META: Record<StatusKey, { label: string; cls: string; dot: string }> = {
  not_started: { label: 'Not started', cls: 'bg-stone-100 text-stone-500', dot: 'bg-stone-300' },
  in_progress: { label: 'In progress', cls: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  ready: { label: 'Ready to check', cls: 'bg-sky-50 text-sky-700', dot: 'bg-sky-400' },
  needs_review: { label: 'Needs review', cls: 'bg-violet-50 text-violet-700', dot: 'bg-violet-400' },
  blocked: { label: 'Blocked / on hold', cls: 'bg-rose-50 text-rose-600', dot: 'bg-rose-400' },
  complete: { label: 'Complete', cls: 'bg-green-100 text-green-800', dot: 'bg-green-500' },
};

export function requiredMissing(d: Draft, meta: RowMeta): string[] {
  if (d.mode === 'external') return d.externalImages.length ? [] : ['Uploaded certificate page(s)'];
  const miss: string[] = [];
  if (!d.certificateId.trim()) miss.push('Certificate number');
  // The same three things the Certificates screen asks for
  // (certificateIssuesFor in src/lib/certificateAudit.ts). A batch or date
  // typed as a test row counts, exactly as it does there.
  void meta;
  if (!(vsValue(d.verificationSummary, VS_KEYS.batch.re) || rowResult(d.testRows, VS_KEYS.batch.re)).trim()) miss.push('Batch / Lot');
  if (!(vsValue(d.verificationSummary, VS_KEYS.testDate.re) || rowResult(d.testRows, VS_KEYS.testDate.re)).trim()) miss.push('Certificate date');
  return miss;
}
export function autoStatus(d: Draft, meta: RowMeta): StatusKey {
  if (d.fillerStatus === 'complete') return 'complete';
  if (d.fillerStatus === 'needs_review') return 'needs_review';
  if (d.fillerStatus === 'blocked') return 'blocked';
  const miss = requiredMissing(d, meta);
  if (miss.length === 0) return 'ready';
  const anyData = certHasContent(draftToCert(d)) && (d.testRows.some((r) => r.result.trim()) || vsValue(d.verificationSummary, VS_KEYS.batch.re).trim() || vsValue(d.verificationSummary, VS_KEYS.testDate.re).trim());
  return anyData ? 'in_progress' : 'not_started';
}
