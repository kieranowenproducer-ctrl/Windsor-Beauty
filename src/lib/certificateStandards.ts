// The house standard for every Certificate of Analysis: the rows that are
// always on one, the approved wording for each, and the two product formats
// (vial and pen) that decide which wording applies.
//
// This exists because the certificate section of the product editor started
// completely blank, so the same four rows had to be typed by hand on every new
// product — and a pen would quietly keep a vial's powder wording because
// nobody remembered to change it.
//
// The rule this file must never break: only the ROW NAMES and the
// SPECIFICATION (the standard the batch is measured against) are ever filled
// in automatically. Every measured value — a purity result, a content result,
// a batch number, a test date — is the lab's, and stays blank until a person
// types the real one in. Pre-filling one of those would be inventing a lab
// result.
import type { CertificateTestRow, CertificateInfoRow } from '@/data/products';

export type CertificateFormat = 'vial' | 'pen';

// ─────────────────────────────────────────────────────────── standard rows ──
// `match` finds the row on a certificate that already exists under a slightly
// different name (e.g. "Purity" vs "Purity (HPLC)") so the standard block
// edits that row instead of adding a second one beside it.

export interface StandardTestRow {
  key: 'appearance' | 'purity' | 'content';
  /** The fixed name printed on the certificate. Never editable. */
  name: string;
  match: RegExp;
  /** Example of a real measured result, shown as a placeholder only. */
  placeholder: string;
}

export interface StandardSummaryRow {
  key: 'batch' | 'testDate';
  name: string;
  match: RegExp;
  placeholder: string;
}

export const STANDARD_TEST_ROWS: StandardTestRow[] = [
  { key: 'appearance', name: 'Appearance', match: /appear/i, placeholder: 'e.g. Conforms' },
  { key: 'purity', name: 'Purity (HPLC)', match: /purit/i, placeholder: 'e.g. 99.2%' },
  { key: 'content', name: 'Content', match: /content|assay/i, placeholder: 'e.g. 10.15mg' },
];

export const STANDARD_SUMMARY_ROWS: StandardSummaryRow[] = [
  { key: 'batch', name: 'Batch / Lot', match: /batch|lot/i, placeholder: 'e.g. WG240115' },
  { key: 'testDate', name: 'Test Date', match: /test.?date|date.?test|^date$|tested/i, placeholder: 'e.g. 15/01/2026' },
];

// ──────────────────────────────────────────────────────── approved wording ──

/** Appearance specifications offered in the dropdown, most common first. */
export const APPEARANCE_OPTIONS = [
  'White to off-white lyophilised powder',
  'Pre-mixed solution in a pre-filled pen',
  'Clear, colourless sterile solution',
] as const;

/**
 * Purity specifications offered in the dropdown. Windsor Glow advertises above
 * 99% on every research compound, so 99% is the floor — see MIN_PURITY in
 * src/lib/certificateAudit.ts, which fails any certificate that claims less.
 */
export const PURITY_OPTIONS = ['≥ 99%', '≥ 99.5%'] as const;

interface FormatStandard {
  label: string;
  /** Plain sentence for the admin, explaining what pressing this does. */
  description: string;
  storage: string;
  appearance: string;
}

// Both storage sentences are the wording already used elsewhere on the site:
// the vial one is DEFAULT_PRODUCT_SPECS.storage (src/data/productModel.ts) and
// the pen one is the storage line already carried by the pen products in
// src/data/certReference.ts. They are repeated here rather than imported so
// this file stays the single place the certificate defaults are decided.
export const FORMAT_STANDARDS: Record<CertificateFormat, FormatStandard> = {
  vial: {
    label: 'Vial',
    description: 'Powder in a vial: store at -20°C, protect from light.',
    storage: 'Store at -20°C. Protect from light.',
    appearance: 'White to off-white lyophilised powder',
  },
  pen: {
    label: 'Pen',
    description: 'Pre-filled pen: store at 2-8°C, do not freeze.',
    storage: 'Store at 2-8°C. Do not freeze. Protect from light.',
    appearance: 'Pre-mixed solution in a pre-filled pen',
  },
};

/** Every storage sentence this file may have written, in any format. */
const MANAGED_STORAGE = Object.values(FORMAT_STANDARDS).map((f) => f.storage);
/** Every appearance wording the dropdown offers, in any format. */
const MANAGED_APPEARANCE: string[] = [...APPEARANCE_OPTIONS];

// Much of the catalogue was typed with the American "lyophilized" while the
// house wording is "lyophilised". They are the same wording, so a one-letter
// spelling difference must not make a standard row look like a one-off.
const normalise = (value: string) =>
  value.trim().toLowerCase().replace(/lyophili[sz]ed/g, 'lyophilised').replace(/\s+/g, ' ');
const sameText = (a: string, b: string) => normalise(a) === normalise(b);
const isOneOf = (value: string, list: string[]) => list.some((entry) => sameText(value, entry));

/**
 * The list entry a saved value corresponds to, ignoring that spelling
 * difference — or undefined when it really is a one-off wording. Used by the
 * dropdown so the standard wording shows as chosen rather than as "type my own".
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

/** Rows that are not one of the standard ones — shown in their own editor so nothing is hidden. */
export const extraTestRows = (rows: CertificateTestRow[]) =>
  rows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => !STANDARD_TEST_ROWS.some((s) => s.match.test(row.test)));
export const extraSummaryRows = (rows: CertificateInfoRow[]) =>
  rows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => !STANDARD_SUMMARY_ROWS.some((s) => s.match.test(row.label)));

// ─────────────────────────────────────────────────────── saving / discarding ──

/**
 * True for a standard test row that is only there because it was filled in
 * automatically: no measured result, and a specification that is either blank
 * or one of the standard wordings. Those rows are dropped on save so an
 * untouched certificate is stored exactly as it was before this block existed —
 * otherwise every product would gain empty rows that print on the customer's
 * certificate, and a dosage with no certificate of its own would stop falling
 * back to the shared one.
 */
export function isUntouchedStandardTestRow(row: CertificateTestRow): boolean {
  const standard = STANDARD_TEST_ROWS.find((s) => s.match.test(row.test));
  if (!standard) return false;
  if (row.result.trim()) return false;
  const spec = row.specification.trim();
  return !spec || isOneOf(spec, MANAGED_APPEARANCE) || isOneOf(spec, [...PURITY_OPTIONS]);
}

/** The same, for Batch / Lot and Test Date: no value typed means nothing to save. */
export function isUntouchedStandardSummaryRow(row: CertificateInfoRow): boolean {
  const standard = STANDARD_SUMMARY_ROWS.find((s) => s.match.test(row.label));
  if (!standard) return false;
  return !row.value.trim();
}

// ──────────────────────────────────────────────────────────────── the format ──

/**
 * Which format a certificate is currently set up for. The product's own
 * category decides it first; failing that, the storage sentence already saved
 * on the certificate does — so pressing "Pen" and saving keeps it on Pen the
 * next time the drawer opens, even for a pen that is not in the Pens category.
 */
export function detectFormat(
  categories: readonly string[] | undefined,
  storage: string | undefined,
): CertificateFormat {
  if ((categories ?? []).includes('Pens')) return 'pen';
  const text = (storage ?? '').trim();
  if (text && sameText(text, FORMAT_STANDARDS.pen.storage)) return 'pen';
  if (text && /pre-?filled pen|pre-?mixed pen|do not freeze/i.test(text)) return 'pen';
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

// Wording that plainly belongs to the OTHER format. Rewriting it is the whole
// point of the buttons: a pen carrying a vial's "-20°C, lyophilised powder"
// wording is the exact mistake the certificate warnings flag.
const WRONG_FOR_PEN = /lyophili[sz]ed|powder|\bvial\b|-\s?20\s?°?c|reconstitut/i;
const WRONG_FOR_VIAL = /pre-?filled pen|pre-?mixed|do not freeze/i;

const shouldReplace = (current: string, managed: string[], wrongForThisFormat: RegExp): boolean =>
  !current.trim() || isOneOf(current, managed) || wrongForThisFormat.test(current);

/**
 * Apply a format's standard wording to a certificate. It rewrites a field that
 * is blank, that still holds one of the standard wordings this file manages, or
 * that plainly describes the other format. Anything else typed by hand is left
 * exactly as it is, and a measured result is never touched at all. Nothing is
 * saved until the admin presses Save Changes, so a press that rewrites more
 * than intended can be undone by cancelling the drawer.
 */
export function applyFormatStandards(target: FormatApplyTarget, format: CertificateFormat): FormatApplyResult {
  const standard = FORMAT_STANDARDS[format];
  const wrong = format === 'pen' ? WRONG_FOR_PEN : WRONG_FOR_VIAL;
  const changed: string[] = [];

  let storage = target.storage;
  if (shouldReplace(storage, MANAGED_STORAGE, wrong) && !sameText(storage, standard.storage)) {
    storage = standard.storage;
    changed.push('Storage');
  }

  const appearanceRow = STANDARD_TEST_ROWS[0];
  const currentAppearance = standardTestSpec(target.testRows, appearanceRow);
  let testRows = target.testRows;
  if (shouldReplace(currentAppearance, MANAGED_APPEARANCE, wrong) && !sameText(currentAppearance, standard.appearance)) {
    testRows = setStandardTestRow(testRows, appearanceRow, 'specification', standard.appearance);
    changed.push('Appearance');
  }

  // The purity standard is the same whatever the format, but a brand-new
  // certificate has nothing in it, so fill the floor in here too.
  const purityRow = STANDARD_TEST_ROWS[1];
  if (!standardTestSpec(testRows, purityRow).trim()) {
    testRows = setStandardTestRow(testRows, purityRow, 'specification', PURITY_OPTIONS[0]);
    changed.push('Purity');
  }

  return { storage, testRows, changed };
}
