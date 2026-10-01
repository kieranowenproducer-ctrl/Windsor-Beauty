// Shared certificate-quality checks for the admin Products table and the
// dedicated Certificates review page (src/app/admin/certificates/page.tsx) —
// kept in one place so both views agree on what "live", "missing", and
// "needs review" mean for a product's certificate.
import type { Product } from '@/data/products';
import { certificateForDosage } from '@/data/products';
import { BATCH_ROW_MATCH, DATE_ROW_MATCH } from '@/lib/certificateStandards';

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
    : cert.testRows.length > 0 || (cert.verificationSummary?.length ?? 0) > 0 || (cert.analyticalResults?.length ?? 0) > 0;

  if (!cert.enabled) {
    return { status: 'warning', issue: 'A certificate has been filled in but is switched off, so the "Show Certificate" button is hidden on the product page.' };
  }
  if (!hasDisplayableContent) {
    return {
      status: 'warning',
      issue: cert.mode === 'external'
        ? 'The certificate is switched on as an uploaded document, but no pages have been uploaded.'
        : 'The certificate is switched on but has no rows typed in, so it would show almost nothing.',
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

// What the Certificates page groups products by. This shop sells skincare, so
// it is simply the product's first category ("Serums", "Cleansers" and so on).
// The type and function names are historic and kept for the pages that use them.
export type ProductFormat = string;

export function classifyProductFormat(product: Product): ProductFormat {
  return product.categories[0] ?? 'Other';
}

// The sizes of a product that have no live certificate, reported only when the
// product shows a certificate on at least one other size. A product with no
// certificate at all is not flagged: a certificate is optional here, and the
// status column already says "None yet". A single-size product returns nothing.
export function dosagesMissingCertificate(product: Product): string[] {
  if (product.variants.length < 2) return [];
  const sold = product.variants.filter((v) => v.enabled !== false);
  const live = sold.filter((v) => evaluateCertificateForDosage(product, v.dosage).status === 'live');
  if (live.length === 0) return [];
  return sold.filter((v) => !live.includes(v)).map((v) => v.dosage);
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
// A precise, per-size list of exactly WHICH certificate fields are missing, so
// the admin can fix it straight away. Several keys below are historic (the
// certificate still has those boxes) and are never reported as a problem.
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
  /** The field's human name, e.g. "Batch / Lot". */
  field: string;
  /** A plain hint for what belongs here. Never a made-up value. */
  example: string;
  /** 'missing' = nothing entered; 'invalid' = entered but fails the rule. */
  kind: 'missing' | 'invalid';
  /** Only for 'invalid' — why it fails. */
  reason?: string;
}

const rowResult = (cert: Product['certificate'], re: RegExp): string =>
  (cert?.testRows ?? []).find((r) => re.test(r.test))?.result?.trim() ?? '';
const infoValue = (cert: Product['certificate'], re: RegExp): string =>
  (cert?.verificationSummary ?? []).find((r) => re.test(r.label))?.value?.trim() ?? '';

/**
 * Every certificate gap on a product, size by size. The checks are deliberately
 * light: a typed certificate needs a certificate number, a batch or lot, and a
 * date, and nothing else. No value is judged, because what a skincare
 * certificate lists is up to the document itself. A size with no certificate
 * is not a problem, and an uploaded document is skipped because it has no
 * typed fields to check.
 */
export function certificateFieldIssues(product: Product): CertificateFieldIssue[] {
  const issues: CertificateFieldIssue[] = [];
  for (const variant of product.variants) {
    if (variant.enabled === false) continue; // not sold, so not a live certificate
    issues.push(...certificateIssuesFor(certificateForDosage(product, variant.dosage), variant.dosage));
  }
  return issues;
}

/**
 * The same checks, run against ONE certificate on its own, so the certificate
 * being typed can be checked as it is typed and the gaps marked beside the
 * fields. The rules live here and only here, so the editor cannot drift from
 * the Certificates screen: both call this.
 */
export function certificateIssuesFor(
  cert: Product['certificate'] | undefined,
  dosage: string,
): CertificateFieldIssue[] {
  const issues: CertificateFieldIssue[] = [];
  if (!cert || cert.mode === 'external') return issues;
  const need = (key: CertificateFieldKey, field: string, example: string, value: string) => {
    if (!value) issues.push({ dosage, key, field, example, kind: 'missing' });
  };
  need('certificateId', 'Certificate number', 'the number printed on the certificate', cert.certificateId?.trim() ?? '');
  // Batch / Lot and the date belong in the details block, but some certificates
  // were typed with them as test rows instead. The value is on the certificate
  // either way, so it counts.
  const batch = infoValue(cert, BATCH_ROW_MATCH) || rowResult(cert, BATCH_ROW_MATCH);
  const dated = infoValue(cert, DATE_ROW_MATCH) || rowResult(cert, DATE_ROW_MATCH);
  need('batch', 'Batch / Lot', 'the batch code printed on the certificate', batch);
  need('testDate', 'Certificate date', 'the date printed on the certificate', dated);
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
  const missingSizes = dosagesMissingCertificate(product);
  if (missingSizes.length > 0) {
    warnings.push({
      label: `Certificate missing: ${missingSizes.join(', ')}`,
      detail: `Other sizes of this product show a certificate, but these do not: ${missingSizes.join(', ')}. Add one in the certificate section for that size, or share one certificate across all sizes.`,
    });
  }
  if (duplicateSlugs.has(product.slug)) {
    warnings.push({ label: 'Possible duplicate', detail: 'Shares an uploaded certificate or certificate number with at least one other product.' });
  }
  return warnings;
}
