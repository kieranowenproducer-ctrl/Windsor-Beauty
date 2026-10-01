// Shared certificate-quality checks for the admin Products table and the
// dedicated Certificates review page (src/app/admin/certificates/page.tsx) —
// kept in one place so both views agree on what "live", "missing", and
// "needs review" mean for a product's Certificate of Analysis.
import type { Product } from '@/data/products';
import { certificateForDosage } from '@/data/products';

export type CertificateStatus = 'live' | 'warning' | 'missing';

/**
 * What each status actually means, in words a non-technical person can read off
 * the screen. The old labels ("Not Linked", "Draft") said nothing, and the real
 * explanation was only ever passed as a hover tooltip nobody found.
 */
export const CERTIFICATE_STATUS_WORDS: Record<CertificateStatus, { label: string; meaning: string }> = {
  live: {
    label: 'On the site',
    meaning: 'Customers can open this certificate from the product page.',
  },
  warning: {
    label: 'Not on the site',
    meaning: 'A certificate has been filled in for this product, but customers cannot see it yet.',
  },
  missing: {
    label: 'None yet',
    meaning: 'No certificate has been started for this product at all.',
  },
};

// Derives certificate coverage straight from the product's own data — no
// separate stored flag to fall out of sync. 'missing' means no certificate
// data has ever been entered; 'warning' means data exists but isn't actually
// showing on the product page (disabled, or enabled with nothing to render);
// 'live' means it's enabled and has content the "Show Certificate" button
// will actually display.
// The core evaluation of a single certificate object (whatever its source —
// product-level or a specific dosage). Shared by the product-level and per-dosage
// entry points below so they can never disagree on what live/warning/missing mean.
function evaluateCert(cert: Product['certificate']): { status: CertificateStatus; issue?: string } {
  const hasAnyData = Boolean(
    cert && (cert.certificateId || cert.testRows.length > 0 || cert.image || (cert.mode === 'external' && (cert.externalImages?.length ?? 0) > 0))
  );
  if (!cert || !hasAnyData) {
    return { status: 'missing' };
  }

  const hasDisplayableContent = cert.mode === 'external'
    ? (cert.externalImages?.length ?? 0) > 0
    : cert.testRows.length > 0;

  if (!cert.enabled) {
    return { status: 'warning', issue: 'Certificate data exists but is not enabled, so the "Show Certificate" button is hidden on the product page.' };
  }
  if (!hasDisplayableContent) {
    return {
      status: 'warning',
      issue: cert.mode === 'external'
        ? 'Certificate is enabled in external mode but has no uploaded pages.'
        : 'Certificate is enabled but has no test result rows, so the certificate page would show almost nothing.',
    };
  }
  return { status: 'live' };
}

export function evaluateCertificate(product: Product): { status: CertificateStatus; issue?: string } {
  return evaluateCert(product.certificate);
}

// Evaluate the certificate a customer would actually see for a specific dosage —
// the dosage's own certificate if it has one, otherwise the shared product-level
// certificate (certificateForDosage handles that fallback). This is the per-dosage
// truth that Option A makes possible.
export function evaluateCertificateForDosage(product: Product, dosage: string): { status: CertificateStatus; issue?: string } {
  return evaluateCert(certificateForDosage(product, dosage));
}

// Per-dosage certificate coverage for a product: the status each dosage resolves
// to. For a single-dosage product this is one entry; for a multi-dosage product it
// is the real per-dosage picture Option A enables.
export function dosageCertificateCoverage(product: Product): { dosage: string; status: CertificateStatus }[] {
  return product.variants.map((v) => ({ dosage: v.dosage, status: evaluateCertificateForDosage(product, v.dosage).status }));
}

export type ProductFormat = 'Pen' | 'Water' | 'Vial' | 'Other';

// A simple, honest classification — not a precise lab taxonomy. "Pen" and
// "Water" are the two formats this catalogue actually distinguishes by
// category; everything else defaults to "Vial" (the vast majority of the
// catalogue: lyophilised powder peptides), which is intentionally broad
// rather than guessing at sub-types (powder vial vs liquid vial) the product
// data doesn't actually record anywhere.
export function classifyProductFormat(product: Product): ProductFormat {
  if (product.categories.includes('Pens')) return 'Pen';
  if (/water|bac.?water/i.test(product.slug) || /water/i.test(product.name)) return 'Water';
  if (product.categories.length === 0) return 'Other';
  return 'Vial';
}

const POWDER_VIAL_WORDING = /lyophili[sz]ed powder|\bvial\b|reconstitut/i;

// The exact bug this whole audit was built to catch: a pen product (already
// pre-mixed, never sold as a powder) whose certificate or storage text still
// describes it as a powder/vial — almost always copy-pasted from a vial
// product's certificate when the pen listing was first created.
function hasPenFormatIssue(product: Product): boolean {
  if (classifyProductFormat(product) !== 'Pen') return false;
  const cert = product.certificate;
  if (!cert) return false;
  const fields = [
    cert.storage,
    ...(cert.testRows ?? []).flatMap(r => [r.specification, r.result]),
  ].filter(Boolean) as string[];
  return fields.some(f => POWDER_VIAL_WORDING.test(f));
}

// Known pen brands sold across this catalogue — used only to flag when a
// product's certificate text mentions a *different* one of these brands
// than the product's own assigned brand, the exact mix-up this audit was
// built to catch (e.g. a Slimfinity pen's certificate text naming
// Remedium). Deliberately conservative: this only looks at plain-text
// certificate fields (template mode), never at uploaded certificate images,
// since image content can't be verified by reading text.
const KNOWN_PEN_BRANDS = ['Remedium Research', 'Remedium', 'Slimfinity', 'Synedica', 'Lean Luxe'];

function hasBrandMismatch(product: Product): boolean {
  const cert = product.certificate;
  if (!cert || cert.mode === 'external') return false;
  const ownBrand = product.brand?.trim();
  const textFields = [cert.productName, cert.caution, cert.certificateId].filter(Boolean) as string[];
  const haystack = textFields.join(' ');
  return KNOWN_PEN_BRANDS.some(brand => {
    if (ownBrand && brand.toLowerCase().startsWith(ownBrand.toLowerCase().slice(0, 6))) return false;
    return new RegExp(`\\b${brand}\\b`, 'i').test(haystack);
  });
}

// A certificate of analysis is per product PER DOSAGE — Melanotan 10mg and 20mg
// are separate batches that each need their own COA (Option A). Now that a product
// can hold a certificate per dosage, this returns exactly which of a multi-dosage
// product's dosages currently have NO live certificate (their own or the shared
// fallback), so the product can be flagged precisely — "certificate missing for
// 20mg" — instead of a blanket "check this product". A single-dosage product
// returns nothing here (its coverage is the ordinary product-level status).
export function dosagesMissingCertificate(product: Product): string[] {
  if (product.variants.length < 2) return [];
  return product.variants
    .filter((v) => evaluateCertificateForDosage(product, v.dosage).status !== 'live')
    .map((v) => v.dosage);
}

function hasMissingStorage(product: Product): boolean {
  const cert = product.certificate;
  if (!cert || !cert.enabled) return false;
  // An explicit storage line anywhere means there is nothing to chase.
  if (cert.storage || product.storage) return false;
  // Nothing explicit, so the page falls back to the site-wide default, which is
  // the VIAL sentence (DEFAULT_PRODUCT_SPECS.storage, byte-identical to
  // FORMAT_STANDARDS.vial.storage). For a vial that fallback is already the
  // correct wording and it is what the operator sees on the certificate, so
  // calling it "missing" sent someone hunting for a field that was already
  // filled in — the same false alarm Batch/Lot and Test Date used to raise.
  // It stays a warning only where the vial sentence would actually be wrong.
  return classifyProductFormat(product) !== 'Vial';
}

// Cross-product duplicate detection: two *different* products sharing the
// same uploaded certificate (external images) or the same certificate ID
// almost always means one was copy-pasted into the wrong product. Returns
// the set of slugs involved in any such collision.
export function findDuplicateCertificateSlugs(catalogue: Product[]): Set<string> {
  const bySignature = new Map<string, string[]>();
  for (const p of catalogue) {
    const cert = p.certificate;
    if (!cert) continue;
    const signatures: string[] = [];
    if (cert.mode === 'external') {
      for (const img of cert.externalImages ?? []) signatures.push(`img:${img}`);
    } else if (cert.certificateId) {
      signatures.push(`id:${cert.certificateId}`);
    }
    for (const sig of signatures) {
      const list = bySignature.get(sig) ?? [];
      list.push(p.slug);
      bySignature.set(sig, list);
    }
  }
  const duplicates = new Set<string>();
  for (const slugs of Array.from(bySignature.values())) {
    if (slugs.length > 1) slugs.forEach((s: string) => duplicates.add(s));
  }
  return duplicates;
}

// ─── Field-level certificate issues ──────────────────────────────────────────
// A precise, per-dosage list of exactly WHICH certificate fields are missing or
// wrong, each with a worked example — so the admin can fix it immediately
// instead of being told only that "some fields are missing".
/**
 * Which part of a certificate an issue belongs to. Lets the certificate viewer
 * mark the offending row itself instead of only listing the problem elsewhere,
 * which is what left an admin opening a certificate that looked perfectly fine.
 */
export type CertificateFieldKey =
  | 'certificate'
  | 'certificateId'
  | 'casNumber'
  | 'molecularFormula'
  | 'molecularWeight'
  | 'pubchemCid'
  | 'appearance'
  | 'purity'
  | 'content'
  | 'batch'
  | 'testDate';

export interface CertificateFieldIssue {
  dosage: string;
  /** Which row of the certificate this is about. */
  key: CertificateFieldKey;
  /** The field's human name, e.g. "Purity (HPLC) result". */
  field: string;
  /** What a correct value looks like, e.g. "99.2%". */
  example: string;
  /** 'missing' = nothing entered; 'invalid' = entered but fails the rule. */
  kind: 'missing' | 'invalid';
  /** Only for 'invalid' — why it fails. */
  reason?: string;
}

/** First number in a string ("10.2mg" -> 10.2, "36 IU" -> 36). Null if none. */
function firstNumber(value: string | undefined): number | null {
  const m = String(value ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}
const rowResult = (cert: Product['certificate'], re: RegExp): string =>
  (cert?.testRows ?? []).find((r) => re.test(r.test))?.result?.trim() ?? '';
const infoValue = (cert: Product['certificate'], re: RegExp): string =>
  (cert?.verificationSummary ?? []).find((r) => re.test(r.label))?.value?.trim() ?? '';

// The minimum purity Windsor Glow advertises on every research compound.
const MIN_PURITY = 99;

/**
 * Every certificate problem on a product, dosage by dosage. Covers both blanks
 * and values that break the house rules:
 *   • purity must be above 99%
 *   • measured content must exceed the dosage on the label (10mg -> e.g. 10.2mg)
 * External (uploaded-document) certificates are skipped — there are no typed
 * fields to check on them.
 */
export function certificateFieldIssues(product: Product): CertificateFieldIssue[] {
  const issues: CertificateFieldIssue[] = [];
  for (const variant of product.variants) {
    if (variant.enabled === false) continue; // not sold — not a live certificate
    issues.push(...certificateIssuesFor(certificateForDosage(product, variant.dosage), variant.dosage));
  }
  return issues;
}

/**
 * The same checks, run against ONE certificate on its own.
 *
 * Split out (task f5c8da12) so the certificate being TYPED — which is not saved anywhere yet and so
 * belongs to no product — can be checked as it is typed, and the problems marked on a live preview
 * beside the fields. Before this, the only way to see what was wrong with a certificate was to save
 * it and then go and look at it somewhere else.
 *
 * The rules live here and only here. The preview cannot drift from the Certificates screen, because
 * both call this.
 */
export function certificateIssuesFor(
  cert: Product['certificate'] | undefined,
  dosage: string,
): CertificateFieldIssue[] {
  const issues: CertificateFieldIssue[] = [];
  {
    if (!cert || cert.mode === 'external') {
      if (!cert) issues.push({ dosage, key: 'certificate', field: 'Certificate', example: 'Add one in Certificate Filler', kind: 'missing' });
      return issues;
    }
    const need = (key: CertificateFieldKey, field: string, example: string, value: string) => {
      if (!value) issues.push({ dosage, key, field, example, kind: 'missing' });
    };
    need('certificateId', 'Certificate number', 'WG-BPC157-10MG', cert.certificateId?.trim() ?? '');
    need('casNumber', 'CAS number', '137525-51-0', cert.casNumber?.trim() ?? '');
    need('molecularFormula', 'Molecular formula', 'C62H98N16O22', cert.molecularFormula?.trim() ?? '');
    need('molecularWeight', 'Molecular weight', '1419.55 g/mol', cert.molecularWeight?.trim() ?? '');
    need('pubchemCid', 'PubChem CID', '9941957', cert.pubchemCid?.trim() ?? '');

    const appearance = rowResult(cert, /appear/i);
    const purity = rowResult(cert, /purit/i);
    const content = rowResult(cert, /content|assay/i);
    // Batch / Lot and Test Date belong in the Verification Summary, but some
    // certificates were typed with them as Test Results rows instead. The value
    // is plainly on the certificate either way, so reporting it missing sent
    // someone hunting for a field that was already filled in.
    const batch = infoValue(cert, /batch|lot/i) || rowResult(cert, /batch|lot/i);
    const tested = infoValue(cert, /test.?date|date.?test|^date$|tested/i) || rowResult(cert, /test.?date|date.?test|^date$|tested/i);
    need('appearance', 'Appearance result', 'Conforms', appearance);
    need('purity', 'Purity (HPLC) result', '99.2%', purity);
    need('content', 'Content result', `${dosage} or more, e.g. ${(firstNumber(dosage) ?? 10) + 0.2}mg`, content);
    need('batch', 'Batch / Lot', 'WG240115', batch);
    need('testDate', 'Test date', '15/01/2026', tested);

    // Purity must be ABOVE 99%.
    const purityNum = firstNumber(purity);
    if (purity && purityNum !== null && purityNum <= MIN_PURITY) {
      issues.push({ dosage, key: 'purity', field: 'Purity (HPLC) result', example: '99.2%', kind: 'invalid', reason: `${purity} is not above ${MIN_PURITY}%` });
    }
    // Measured content must EXCEED the label dosage (single-number dosages only —
    // blends like "5mg + 5mg" have no single figure to compare against).
    const doseNum = /\+/.test(dosage) ? null : firstNumber(dosage);
    const contentNum = firstNumber(content);
    if (content && doseNum !== null && contentNum !== null && contentNum <= doseNum) {
      issues.push({ dosage, key: 'content', field: 'Content result', example: `${(doseNum + 0.2).toFixed(1)}mg`, kind: 'invalid', reason: `${content} is not above the ${dosage} label claim` });
    }
  }
  return issues;
}

/**
 * Which of a product's dosages a person can be shown a certificate for, and how many problems each
 * one has (task f5c8da12).
 *
 * The View button used to open the first dosage that had a certificate and mark only that dosage's
 * problems, so a product whose problems were on 20mg opened a clean-looking 10mg certificate with
 * nothing marked on it — while the row beside it still said there were problems. This is what the
 * viewer needs to offer a choice instead of guessing.
 */
export function certificateDosageOptions(
  product: Product,
): { dosage: string; issueCount: number; hasCertificate: boolean }[] {
  return product.variants
    .filter((v) => v.enabled !== false)
    .map((v) => ({
      dosage: v.dosage,
      hasCertificate: Boolean(certificateForDosage(product, v.dosage)),
      issueCount: certificateIssuesFor(certificateForDosage(product, v.dosage), v.dosage).length,
    }));
}

/**
 * The dosage the viewer should open on: the one with the most to fix, so pressing View always lands
 * on something worth looking at. Falls back to the first dosage that has a certificate at all.
 */
export function dosageWorthOpening(product: Product): string {
  const options = certificateDosageOptions(product).filter((o) => o.hasCertificate);
  if (options.length === 0) return product.variants[0]?.dosage ?? '';
  const worst = options.reduce((a, b) => (b.issueCount > a.issueCount ? b : a));
  return worst.issueCount > 0 ? worst.dosage : options[0].dosage;
}

export interface CertificateWarning {
  label: string;
  detail: string;
}

// All warning badges for one product, given the whole catalogue (needed
// only for the duplicate check, which is inherently cross-product).
export function getCertificateWarnings(product: Product, duplicateSlugs: Set<string>): CertificateWarning[] {
  const warnings: CertificateWarning[] = [];
  if (hasPenFormatIssue(product)) {
    warnings.push({ label: 'Pen labelled as powder', detail: 'This pen’s certificate or storage text still uses powder/vial/reconstitution wording.' });
  }
  if (hasBrandMismatch(product)) {
    warnings.push({ label: 'Brand mismatch', detail: 'Certificate text mentions a different pen brand than this product’s own assigned brand.' });
  }
  if (hasMissingStorage(product)) {
    warnings.push({ label: 'Missing storage', detail: 'This product is not a vial, but no storage line is set on the certificate or the product, so it is showing the vial default (-20°C, protect from light). Set the right storage line for this format.' });
  }
  // Single-dosage products: the simple product-level "missing" flag.
  if (product.variants.length < 2 && evaluateCertificate(product).status === 'missing') {
    warnings.push({ label: 'No certificate uploaded', detail: 'No certificate data has been entered for this product yet.' });
  }
  // Multi-dosage products (Option A): flag exactly which dosages have no live
  // certificate of their own or via the shared fallback, so the gap can be filled
  // for that specific dosage.
  const missingDosages = dosagesMissingCertificate(product);
  if (missingDosages.length > 0) {
    warnings.push({
      label: `Certificate missing: ${missingDosages.join(', ')}`,
      detail: `These dosages have no live Certificate of Analysis (their own or a shared one): ${missingDosages.join(', ')}. Each dosage is a separate batch that needs its own COA — add one under the certificate section for that dosage.`,
    });
  }
  if (duplicateSlugs.has(product.slug)) {
    warnings.push({ label: 'Possible duplicate', detail: 'Shares an uploaded certificate or certificate ID with at least one other product.' });
  }
  return warnings;
}
