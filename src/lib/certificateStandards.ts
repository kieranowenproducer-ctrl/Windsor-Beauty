// The house standard for a product certificate: the rows the product editor
// always offers on one.
//
// This shop sells skincare. A certificate here is whatever document the owner
// holds for a product, so this file assumes nothing about what was tested. The
// only rows offered on every certificate are the two that identify it: the
// batch it covers and the date on it. Every other row is typed by hand under
// "Other test rows" in the editor.
//
// The rule this file must never break: nothing that belongs to the real
// certificate (a batch number, a date, a result) is ever filled in
// automatically. Those stay blank until a person types the real one in.
// Filling one in would be inventing a certificate value.
import type { CertificateTestRow, CertificateInfoRow } from '@/data/products';

// The two names are historic and are kept because the product editor refers
// to them. Read them as 'vial' = the standard storage line, 'pen' = the
// product's own storage wording.
export type CertificateFormat = 'vial' | 'pen';

// ─────────────────────────────────────────────────────────── standard rows ──
// `match` finds the row on a certificate that already exists under a slightly
// different name (e.g. "Batch" vs "Batch / Lot") so the standard block edits
// that row instead of adding a second one beside it.

export interface StandardTestRow {
  // The three keys are historic. No standard test row is defined any more,
  // but the product editor still switches on these names.
  key: 'appearance' | 'purity' | 'content';
  /** The fixed name printed on the certificate. Never editable. */
  name: string;
  match: RegExp;
  /** Example of a real result, shown as a placeholder only. */
  placeholder: string;
}

export interface StandardSummaryRow {
  key: 'batch' | 'testDate';
  name: string;
  match: RegExp;
  placeholder: string;
}

/** Matches the row that carries the batch or lot number, whatever it was called. */
export const BATCH_ROW_MATCH = /batch|lot/i;
/** Matches the row that carries the certificate's date, whatever it was called. */
export const DATE_ROW_MATCH = /certificate.?date|issue.?date|date.?issued|date of issue|test.?date|date.?test|^date$|tested/i;

/**
 * Test rows that are on every certificate. There are none: what a skincare
 * certificate lists is up to the document itself, so every test row is typed
 * by hand. Kept as an (empty) list so the product editor still compiles and
 * simply shows no fixed test rows.
 */
export const STANDARD_TEST_ROWS: StandardTestRow[] = [];

export const STANDARD_SUMMARY_ROWS: StandardSummaryRow[] = [
  { key: 'batch', name: 'Batch / Lot', match: BATCH_ROW_MATCH, placeholder: 'The batch code on the certificate' },
  { key: 'testDate', name: 'Certificate Date', match: DATE_ROW_MATCH, placeholder: 'e.g. 15/01/2026' },
];

// ──────────────────────────────────────────────────────── approved wording ──

/** Standard wordings offered for a fixed test row. None, because there are no fixed test rows. */
export const APPEARANCE_OPTIONS: readonly string[] = [];

/** Kept for the product editor's imports. None, because there are no fixed test rows. */
export const PURITY_OPTIONS: readonly string[] = [];

interface FormatStandard {
  label: string;
  /** Plain sentence for the admin, explaining what pressing this does. */
  description: string;
  storage: string;
  appearance: string;
}

// Neither choice writes anything into the certificate. A certificate with a
// blank storage box already shows the product's own storage line, or failing
// that the shop's standard one (DEFAULT_PRODUCT_SPECS.storage in
// src/data/productModel.ts). Copying that sentence onto the certificate would
// only leave a stale copy behind the day the product's storage line changes.
// The `storage` and `appearance` values are therefore empty; the two entries
// remain because the product editor shows a button for each.
const STANDARD_STORAGE_LINE = 'Store in a cool, dry place away from direct sunlight.';

export const FORMAT_STANDARDS: Record<CertificateFormat, FormatStandard> = {
  vial: {
    label: 'Standard storage',
    description: 'Leave the storage box blank and the certificate shows the storage line already set on the product.',
    storage: '',
    appearance: '',
  },
  pen: {
    label: 'Own wording',
    description: 'Type this product’s own storage wording in the storage box below.',
    storage: '',
    appearance: '',
  },
};

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
const sameText = (a: string, b: string) => normalise(a) === normalise(b);

/**
 * The list entry a saved value corresponds to, ignoring case and spacing, or
 * undefined when it really is a one-off wording. Used by the dropdown so the
 * standard wording shows as chosen rather than as "type my own".
 */
export function matchingOption(value: string, options: readonly string[]): string | undefined {
  return options.find((option) => sameText(option, value));
}

// ───────────────────────────────────────────────────────── row read / write ──

export const standardTestSpec = (rows: CertificateTestRow[], row: StandardTestRow): string =>
  rows.find((r) => row.match.test(r.test))?.specification ?? '';
export const standardTestResult = (rows: CertificateTestRow[], row: StandardTestRow): string =>
  rows.find((r) => row.match.test(r.test))?.result ?? '';
export const standardSummaryValue = (rows: CertificateInfoRow[], row: StandardSummaryRow): string =>
  rows.find((r) => row.match.test(r.label))?.value ?? '';

/**
 * Write one field of a standard test row, creating the row under its fixed
 * name if the certificate does not have it yet. Any row already there keeps
 * whatever name it was given, so nothing is duplicated.
 */
export function setStandardTestRow(
  rows: CertificateTestRow[],
  row: StandardTestRow,
  field: 'specification' | 'result',
  value: string,
): CertificateTestRow[] {
  const next = rows.map((r) => ({ ...r }));
  const index = next.findIndex((r) => row.match.test(r.test));
  if (index >= 0) {
    next[index][field] = value;
    return next;
  }
  const created: CertificateTestRow = { test: row.name, specification: '', result: '' };
  created[field] = value;
  return [...next, created];
}

export function setStandardSummaryRow(
  rows: CertificateInfoRow[],
  row: StandardSummaryRow,
  value: string,
): CertificateInfoRow[] {
  const next = rows.map((r) => ({ ...r }));
  const index = next.findIndex((r) => row.match.test(r.label));
  if (index >= 0) {
    next[index].value = value;
    return next;
  }
  return [...next, { label: row.name, value }];
}

/** Rows that are not one of the standard ones, shown in their own editor so nothing is hidden. */
export const extraTestRows = (rows: CertificateTestRow[]) =>
  rows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => !STANDARD_TEST_ROWS.some((s) => s.match.test(row.test)));
export const extraSummaryRows = (rows: CertificateInfoRow[]) =>
  rows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => !STANDARD_SUMMARY_ROWS.some((s) => s.match.test(row.label)));

// ─────────────────────────────────────────────────────── saving / discarding ──

/**
 * True for a standard test row that is only there because it was filled in
 * automatically: no result, and no specification typed. Those rows are dropped
 * on save so an untouched certificate is stored exactly as it was. With no
 * standard test rows defined this is always false, which is correct: every
 * test row on a certificate is one somebody typed.
 */
export function isUntouchedStandardTestRow(row: CertificateTestRow): boolean {
  const standard = STANDARD_TEST_ROWS.find((s) => s.match.test(row.test));
  if (!standard) return false;
  if (row.result.trim()) return false;
  return !row.specification.trim();
}

/** The same, for Batch / Lot and Certificate Date: no value typed means nothing to save. */
export function isUntouchedStandardSummaryRow(row: CertificateInfoRow): boolean {
  const standard = STANDARD_SUMMARY_ROWS.find((s) => s.match.test(row.label));
  if (!standard) return false;
  return !row.value.trim();
}

// ──────────────────────────────────────────────────────────────── the format ──

/**
 * Which of the two storage choices a certificate is currently on. A product
 * (or certificate) with a storage line of its own that is not the shop's
 * standard sentence is on "own wording"; everything else is on the standard.
 * The product's categories no longer decide anything and are ignored.
 */
export function detectFormat(
  categories: readonly string[] | undefined,
  storage: string | undefined,
): CertificateFormat {
  void categories;
  const text = (storage ?? '').trim();
  if (text && !sameText(text, STANDARD_STORAGE_LINE)) return 'pen';
  return 'vial';
}

export interface FormatApplyTarget {
  storage: string;
  testRows: CertificateTestRow[];
}

export interface FormatApplyResult extends FormatApplyTarget {
  /** Plain names of the fields this actually rewrote, for showing back to the admin. */
  changed: string[];
}

/**
 * Apply a storage choice to a certificate. It deliberately rewrites nothing:
 * there is no standard wording to fill in any more (see FORMAT_STANDARDS), so
 * the storage line and every test row come back exactly as they went in and
 * `changed` is always empty. Kept so the product editor's calls still work.
 */
export function applyFormatStandards(target: FormatApplyTarget, format: CertificateFormat): FormatApplyResult {
  void format;
  return { storage: target.storage, testRows: target.testRows, changed: [] };
}
