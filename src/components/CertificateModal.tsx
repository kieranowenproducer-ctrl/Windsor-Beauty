'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useDialog } from './useDialog';
import { useOverflowLock } from './viewportOwner';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// Admin-only editor entry point, loaded as its own chunk ONLY when the page
// passes adminEdit (i.e. for staff sessions) — customers never download it.
const AdminCertificateEdit = dynamic(() => import('@/components/admin/AdminCertificateEdit'), { ssr: false });
import type { Product, ProductCertificate } from '@/data/products';
import { DEFAULT_PRODUCT_SPECS, DEFAULT_CERTIFICATE_CAUTION, cardImage } from '@/data/products';
import type { CertificateFieldIssue, CertificateFieldKey } from '@/lib/certificateAudit';

// ─── Staff-only review marking ───────────────────────────────────────────────
// Telling an admin a certificate has a problem and then showing them a
// certificate that looks perfectly fine sent them into the editor to hunt for
// it by hand. When `review` is passed — only ever from an admin screen — every
// field with a problem is marked here, on the certificate itself, and a field
// that is missing altogether is shown as a row rather than silently left out.
// Nothing in this block renders for a customer: without the prop the
// certificate is exactly what it always was.

export interface CertificateReview {
  /** Problems belonging to the certificate actually on screen. */
  issues: CertificateFieldIssue[];
  /** Which dosage this certificate is for, when the product has more than one. */
  shownDosage?: string;
  /** Other dosages of the same product that have problems of their own. */
  otherDosages?: string[];
  /**
   * Every certificate this product has, so the viewer can offer a choice instead of guessing
   * (task f5c8da12). Without it the viewer opened one dosage's certificate and marked only that
   * dosage's problems, which is how somebody could be told a product had 21 things wrong and then
   * shown a certificate with nothing wrong on it.
   */
  dosageOptions?: { dosage: string; issueCount: number; hasCertificate: boolean }[];
  /** Switch the certificate on screen to another dosage. */
  onSelectDosage?: (dosage: string) => void;
  /** Where to send the admin to fix them. */
  editHref?: string;
}

/**
 * Pick which of a product's certificates you are looking at, with what is wrong with each one
 * written on the button. Screen only: never printed, and never rendered for a customer, because
 * `review` is only ever passed from an admin screen.
 */
function DosagePicker({ review }: { review: CertificateReview }) {
  const options = review.dosageOptions ?? [];
  if (options.length < 2 || !review.onSelectDosage) return null;
  return (
    <div className="mb-6 border border-stone-200 bg-stone-50 px-4 py-3 print:hidden">
      <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold mb-2">
        This product has a certificate for each dosage
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.dosage === review.shownDosage;
          const tone = !option.hasCertificate
            ? 'border-stone-200 bg-white text-stone-400'
            : option.issueCount > 0
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-green-300 bg-green-50 text-green-700';
          return (
            <button
              key={option.dosage}
              type="button"
              onClick={() => review.onSelectDosage?.(option.dosage)}
              disabled={!option.hasCertificate}
              aria-pressed={selected}
              className={`border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${tone} ${
                selected ? 'ring-2 ring-stone-800 ring-offset-1' : 'hover:border-stone-500'
              }`}
            >
              <span className="block text-xs font-semibold">{option.dosage}</span>
              <span className="block text-[10px] leading-snug">
                {!option.hasCertificate
                  ? 'No certificate'
                  : option.issueCount === 0
                    ? 'Nothing to fix'
                    : `${option.issueCount} to fix`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-stone-500 mt-2 leading-relaxed">
        Press one to see that certificate. The problems marked below belong to the one on screen.
      </p>
    </div>
  );
}

const findIssue = (review: CertificateReview | undefined, key: CertificateFieldKey) =>
  review?.issues.find((issue) => issue.key === key);

/** The one-line correction shown under a marked row. */
function issueNote(issue: CertificateFieldIssue) {
  return issue.kind === 'missing'
    ? `Missing — this needs the real value, e.g. ${issue.example}`
    : `${issue.reason}. It should be something like ${issue.example}`;
}

// Every mark below is screen-only. Print / Save as PDF must produce the clean
// certificate a customer would be handed, with none of the review marking on it.

/** Wraps a certificate row so a problem with it is impossible to miss. */
function ReviewMark({ issue, children }: { issue?: CertificateFieldIssue; children: ReactNode }) {
  if (!issue) return <>{children}</>;
  return (
    <div className="border-l-4 border-red-500 bg-red-50 print:border-l-0 print:bg-transparent">
      {children}
      <p className="px-4 pb-2 text-xs text-red-700 font-medium print:hidden">{issueNote(issue)}</p>
    </div>
  );
}

/** A required row that is not on the certificate at all, shown so its absence is visible. */
function MissingRow({ label, issue }: { label: string; issue: CertificateFieldIssue }) {
  return (
    <div className="border-t border-gold-100 border-l-4 border-l-red-500 bg-red-50 print:hidden">
      <div className="flex">
        <div className="w-2/5 sm:w-1/3 px-4 py-3 font-medium text-stone-500">{label}</div>
        <div className="flex-1 px-4 py-3 text-red-700 font-semibold">Not filled in</div>
      </div>
      <p className="px-4 pb-2 text-xs text-red-700">{issueNote(issue)}</p>
    </div>
  );
}

interface CertificateModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  /**
   * The certificate to display. Pass the dosage-resolved certificate
   * (certificateForDosage) so a multi-dosage product shows the certificate for the
   * dosage the customer selected. Falls back to the product-level certificate when
   * omitted, so existing callers are unaffected.
   */
  certificate?: ProductCertificate;
  /**
   * When set (staff sessions only), shows a button that opens the on-certificate editor for this
   * product + dosage. When the certificate also has problems, that button IS the red "Fix these N"
   * button: pressing it keeps the certificate on screen and makes its boxes typeable, with each
   * problem marked on the box that fixes it (task f5c8da12). `onSaved` lets the list behind the
   * viewer catch up once the editor closes.
   */
  adminEdit?: { slug: string; dosage: string; onSaved?: () => void };
  /**
   * Staff only. Marks every field with a problem on the certificate itself and
   * lists them at the top. Leave it off and the certificate is exactly what a
   * customer sees — this must never be passed on a customer-facing surface.
   */
  review?: CertificateReview;
}

// The certificate layout itself — rendered twice by CertificateModal: once
// inside the on-screen modal, and once inside a hidden .certificate-print
// container that's the only thing visible when the user prints/saves as PDF
// (see the @media print rules in globals.css). Keeping a single source for
// the markup means the printed certificate always matches what's on screen.
export function CertificateBody({ product, cert, review }: { product: Product; cert: ProductCertificate; review?: CertificateReview }) {
  const imageSrc = cert.image || cardImage(product) || `/images/products/${product.slug}.jpg`;
  // Compared against the failed src, not a plain boolean — see ProductCard.tsx for why.
  const [erroredImageSrc, setErroredImageSrc] = useState<string | null>(null);
  const imageError = erroredImageSrc === imageSrc;

  // A row with no value is left off the certificate, which is right for a
  // customer and wrong for the admin checking it — an absent row reads as
  // "nothing to fix here". In review mode the empty ones stay, marked.
  const specRows: { label: string; value?: string; key?: CertificateFieldKey }[] = [
    { label: 'Product Name', value: cert.productName || product.name },
    { label: 'CAS Number', value: cert.casNumber, key: 'casNumber' },
    { label: 'PubChem CID', value: cert.pubchemCid, key: 'pubchemCid' },
    { label: 'Molecular Formula', value: cert.molecularFormula, key: 'molecularFormula' },
    { label: 'Molecular Weight', value: cert.molecularWeight, key: 'molecularWeight' },
    { label: 'Storage', value: cert.storage || product.storage || DEFAULT_PRODUCT_SPECS.storage },
  ];
  const visibleSpecRows = specRows.filter((row) => row.value || (review && row.key && findIssue(review, row.key)));

  // The two Verification Summary rows every certificate must carry, and the
  // three Test Results rows, shown as missing when they are not there at all.
  const missingSummary = review
    ? ([{ key: 'batch' as const, label: 'Batch / Lot' }, { key: 'testDate' as const, label: 'Test Date' }])
        .map((row) => ({ ...row, issue: findIssue(review, row.key) }))
        .filter((row) => row.issue && !(cert.verificationSummary ?? []).some((r) => new RegExp(row.key === 'batch' ? 'batch|lot' : 'test.?date|date.?test|^date$|tested', 'i').test(r.label)))
    : [];
  const missingTests = review
    ? ([{ key: 'appearance' as const, label: 'Appearance' }, { key: 'purity' as const, label: 'Purity (HPLC)' }, { key: 'content' as const, label: 'Content' }])
        .map((row) => ({ ...row, issue: findIssue(review, row.key) }))
        .filter((row) => row.issue && !cert.testRows.some((r) => new RegExp(row.key === 'appearance' ? 'appear' : row.key === 'purity' ? 'purit' : 'content|assay', 'i').test(r.test)))
    : [];

  /** Which issue, if any, belongs to a row already printed on the certificate. */
  const testRowIssue = (name: string) => {
    if (!review) return undefined;
    if (/appear/i.test(name)) return findIssue(review, 'appearance');
    if (/purit/i.test(name)) return findIssue(review, 'purity');
    if (/content|assay/i.test(name)) return findIssue(review, 'content');
    return undefined;
  };
  const summaryRowIssue = (label: string) => {
    if (!review) return undefined;
    if (/batch|lot/i.test(label)) return findIssue(review, 'batch');
    if (/test.?date|date.?test|^date$|tested/i.test(label)) return findIssue(review, 'testDate');
    return undefined;
  };

  const certificateIdIssue = findIssue(review, 'certificateId');
  const showSummary = (cert.verificationSummary && cert.verificationSummary.length > 0) || missingSummary.length > 0;
  const showTests = cert.testRows.length > 0 || missingTests.length > 0;

  return (
    <div>
      {review && <DosagePicker review={review} />}
      {review && review.issues.length > 0 && (
        <div className="mb-6 border-2 border-red-500 bg-red-50 px-5 py-4 print:hidden">
          <p className="text-sm font-semibold text-red-700 mb-2">
            {review.issues.length === 1
              ? 'One thing needs fixing on this certificate'
              : `${review.issues.length} things need fixing on this certificate`}
          </p>
          <ul className="space-y-0.5 mb-2">
            {review.issues.map((issue, i) => (
              <li key={i} className="text-xs text-red-700 leading-snug">
                <span className="font-semibold">{issue.field}</span>
                {issue.kind === 'missing' ? ' is not filled in' : ` — ${issue.reason}`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-700">
            Each one is marked in red further down, exactly where it belongs on the certificate.
          </p>
          {review.shownDosage && (
            <p className="text-xs text-red-700 mt-1">
              This is the certificate for {review.shownDosage}.
            </p>
          )}
        </div>
      )}
      {review && review.issues.length === 0 && (
        <div className="mb-6 border-2 border-green-600 bg-green-50 px-5 py-4 print:hidden">
          <p className="text-sm font-semibold text-green-800">
            Nothing to fix on this certificate. Every field it needs is filled in
            {review.shownDosage ? ` for ${review.shownDosage}.` : '.'}
          </p>
        </div>
      )}
      {/* Other dosages with problems of their own. Only worth saying when there are no buttons
          above to press: with the picker there, the counts are already on screen. */}
      {review && (review.otherDosages?.length ?? 0) > 0 && !review.onSelectDosage && (
        <div className="mb-6 border-2 border-amber-500 bg-amber-50 px-5 py-4 print:hidden">
          <p className="text-sm text-amber-900">
            {review.otherDosages!.join(' and ')} {review.otherDosages!.length === 1 ? 'has' : 'have'} a
            separate certificate with problems of {review.otherDosages!.length === 1 ? 'its' : 'their'} own.
            Pick that dosage in the editor to see {review.otherDosages!.length === 1 ? 'it' : 'them'}.
          </p>
        </div>
      )}
      {/* Logo — centred and sized up from the original top-left mark, with
          enough margin below to keep clear air above the header bar. */}
      <div className="mb-8 flex justify-center">
        <Image
          src="/images/windsor-beauty-logo-transparent.png"
          alt="Windsor Beauty"
          width={220}
          height={70}
          className="h-14 sm:h-16 w-auto object-contain"
        />
      </div>

      {/* Header bar */}
      <div className="bg-gradient-to-r from-gold-500 to-gold-400 text-white px-5 py-4 flex items-center justify-between gap-4 mb-2">
        <span className="font-serif text-xl sm:text-2xl tracking-wide">Certificate of Analysis</span>
        {cert.certificateId && (
          <span className="text-xs sm:text-sm tracking-[0.18em] uppercase font-bold whitespace-nowrap">{cert.certificateId}</span>
        )}
      </div>
      {certificateIdIssue ? (
        <p className="mb-7 border-l-4 border-red-500 bg-red-50 px-4 py-2 text-xs text-red-700 font-medium print:hidden">
          Certificate number: {issueNote(certificateIdIssue)}
        </p>
      ) : (
        <div className="mb-5" />
      )}

      {/* Specifications */}
      <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Product Specifications</h3>
      <div className="border border-gold-100 mb-8 text-sm">
        {visibleSpecRows.map((row, i) => (
          <ReviewMark key={row.label} issue={row.key ? findIssue(review, row.key) : undefined}>
            <div className={`flex ${i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}>
              <div className="w-2/5 sm:w-1/3 px-4 py-3 font-medium text-stone-500">{row.label}</div>
              <div className="flex-1 px-4 py-3 text-stone-700 leading-relaxed">
                {row.value || <span className="text-red-700 font-semibold print:hidden">Not filled in</span>}
              </div>
            </div>
          </ReviewMark>
        ))}
      </div>

      {/* Verification summary — optional, for mass-spec/lab-verification
          style certificates (e.g. issue date, batch/lot, instrument) that
          don't fit the Product Specifications rows above. */}
      {showSummary && (
        // When the only rows here are the missing ones, the whole section is
        // review-only: its rows do not print, so neither must its heading.
        <div className={(cert.verificationSummary?.length ?? 0) === 0 ? 'print:hidden' : undefined}>
          <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Verification Summary</h3>
          <div className="border border-gold-100 mb-8 text-sm">
            {(cert.verificationSummary ?? []).map((row, i) => (
              <ReviewMark key={i} issue={summaryRowIssue(row.label)}>
                <div className={`flex ${i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}>
                  <div className="w-2/5 sm:w-1/3 px-4 py-3 font-medium text-stone-500">{row.label || 'N/A'}</div>
                  <div className="flex-1 px-4 py-3 text-stone-700 leading-relaxed">{row.value || 'N/A'}</div>
                </div>
              </ReviewMark>
            ))}
            {missingSummary.map((row) => (
              <MissingRow key={row.key} label={row.label} issue={row.issue!} />
            ))}
          </div>
        </div>
      )}

      {/* Test results */}
      {showTests && (
        <div className={cert.testRows.length === 0 ? 'print:hidden' : undefined}>
          <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Test Results</h3>
          <div className="border border-gold-100 mb-8 text-sm">
            <div className="flex text-xs tracking-[0.12em] uppercase text-gold-700 font-semibold bg-gold-50 border-b border-gold-100">
              <div className="w-2/5 sm:w-1/3 px-4 py-3">Test</div>
              <div className="w-[30%] px-4 py-3">Specification</div>
              <div className="flex-1 px-4 py-3">Result</div>
            </div>
            {cert.testRows.map((row, i) => (
              <ReviewMark key={i} issue={testRowIssue(row.test)}>
                <div className={`flex ${i % 2 === 1 ? 'bg-gold-50/40' : 'bg-white'} border-t border-gold-100`}>
                  <div className="w-2/5 sm:w-1/3 px-4 py-3 font-medium text-stone-600">{row.test}</div>
                  <div className="w-[30%] px-4 py-3 text-stone-500">{row.specification}</div>
                  <div className="flex-1 px-4 py-3 text-stone-700">
                    {row.result || (testRowIssue(row.test) ? <span className="text-red-700 font-semibold print:hidden">Not filled in</span> : '')}
                  </div>
                </div>
              </ReviewMark>
            ))}
            {missingTests.map((row) => (
              <MissingRow key={row.key} label={row.label} issue={row.issue!} />
            ))}
          </div>
        </div>
      )}

      {/* Analytical results — optional, for fields a lab report includes
          that don't fit the test/specification/result shape above (e.g.
          Main Peak, Total Peaks, MS Verification, Detection wavelength). */}
      {cert.analyticalResults && cert.analyticalResults.length > 0 && (
        <>
          <h3 className="font-serif text-lg text-stone-800 font-semibold mb-3">Analytical Results</h3>
          <div className="border border-gold-100 mb-8 text-sm">
            {cert.analyticalResults.map((row, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 1 ? 'bg-gold-50/60' : 'bg-white'} ${i > 0 ? 'border-t border-gold-100' : ''}`}
              >
                <div className="w-2/5 sm:w-1/3 px-4 py-3 font-medium text-stone-500">{row.label || 'N/A'}</div>
                <div className="flex-1 px-4 py-3 text-stone-700 leading-relaxed">{row.value || 'N/A'}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Caution / disclaimer */}
      <p className="text-xs font-bold uppercase tracking-wide text-stone-800 leading-relaxed mb-10">
        Caution: {cert.caution || DEFAULT_CERTIFICATE_CAUTION}
      </p>

      {/* Product image */}
      <div className="flex justify-center">
        {!imageError ? (
          <div className="relative w-full max-w-xs h-56 rounded-md bg-white">
            <Image
              src={imageSrc}
              alt={product.name}
              fill
              className="object-contain p-4"
              sizes="320px"
              onError={() => setErroredImageSrc(imageSrc)}
            />
          </div>
        ) : (
          <div className="w-full max-w-xs h-56 rounded-md bg-white flex flex-col items-center justify-center gap-1">
            <span className="text-[9px] tracking-widest text-gold-700 text-center leading-tight font-semibold">
              WINDSOR&nbsp;GLOW
            </span>
            {product.purity && (
              <span className="text-[8px] text-stone-500 tracking-[0.2em] uppercase">{product.purity} Purity</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Alternative certificate body for products using an admin-uploaded external
// certificate (e.g. a supplier-branded PDF exported as one image per page)
// instead of the generated template above. Renders each page in order with a
// plain <img> (matching the convention used elsewhere for variable-aspect
// uploaded images, e.g. ReviewCard.tsx) so no page gets cropped to a fixed
// ratio. The page-break class only takes effect when printing, so each page
// still lands on its own sheet of A4.
export function ExternalCertificateBody({ images, caution }: { images: string[]; caution?: string }) {
  return (
    <div className="flex flex-col gap-8">
      {images.map((src, i) => (
        <div key={src} className={i < images.length - 1 ? 'certificate-print-page-break' : undefined}>
          {images.length > 1 && (
            <p className="text-[9px] tracking-[0.25em] uppercase text-gold-700 mb-2">
              Page {i + 1} of {images.length}
            </p>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded certificate scan of unknown size, shown full width. next/image would need its dimensions up front, and a certificate must never be cropped or resampled. */}
          <img src={src} alt={`Certificate page ${i + 1}`} className="w-full border border-gold-100" />
        </div>
      ))}
      {/* Uploaded supplier pages carry their own data, but the disclaimer is
          Windsor Beauty's own legal wording, not the supplier's — every
          certificate must show it regardless of mode. */}
      <p className="text-xs font-bold uppercase tracking-wide text-stone-800 leading-relaxed">
        Caution: {caution || DEFAULT_CERTIFICATE_CAUTION}
      </p>
    </div>
  );
}

// Branded Certificate of Analysis viewer — opened from the "Show Certificate"
// button on a product page when product.certificate?.enabled is true. Mirrors
// the CalculatorModal overlay pattern, with a hidden print-only copy of the
// certificate (.certificate-print) so "Print / Save as PDF" produces a clean
// single A4 page via the @media print rules in globals.css. When the product
// has an external certificate (cert.mode === 'external') with at least one
// uploaded page, the uploaded images are shown instead of the generated
// template — every other part of this component (open/close, print button,
// modal chrome) is unchanged either way.
export default function CertificateModal({ open, onClose, product, certificate, adminEdit, review }: CertificateModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  // Holds the page still while it is open, through the shared counter. It used
  // to set and clear `overflow` itself, which meant closing this released the
  // page underneath anything else that was still open. See viewportOwner.ts.
  useOverflowLock(open, 'certificate-modal');

  const dialog = useDialog({ open, label: 'Certificate of Analysis' });

  if (!open) return null;
  const cert = certificate ?? product.certificate;
  if (!cert) return null;

  const externalImages = cert.mode === 'external' ? cert.externalImages : undefined;
  const isExternal = Boolean(externalImages && externalImages.length > 0);
  const body = isExternal
    ? <ExternalCertificateBody images={externalImages!} caution={cert.caution} />
    : <CertificateBody product={product} cert={cert} review={review} />;

  return (
    <>
      <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 print:hidden">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div {...dialog} className="relative bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl outline-none">
          {/* Controls */}
          <div className="sticky top-0 bg-white border-b border-gold-100 px-6 py-3 flex items-center justify-between z-10">
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700">Certificate of Analysis</p>
            <div className="flex items-center gap-4">
              {/* "Fix these 2" used to be a link to the back-office product editor, which left the
                  certificate — and the red marks that had just been pointed out — behind on
                  another screen. Where the certificate has typed fields, the same button now opens
                  the certificate itself with those fields typeable and every problem marked on the
                  box that clears it. An uploaded supplier document has nothing to type into, so it
                  keeps the link to where its pages are managed. */}
              {adminEdit ? (
                <AdminCertificateEdit
                  slug={adminEdit.slug}
                  dosage={adminEdit.dosage}
                  fixCount={isExternal ? 0 : (review?.issues.length ?? 0)}
                  onSaved={adminEdit.onSaved}
                />
              ) : null}
              {review?.editHref && review.issues.length > 0 && (!adminEdit || isExternal) && (
                <a
                  href={review.editHref}
                  className="bg-red-600 text-white text-[9px] tracking-[0.18em] uppercase px-3 py-1.5 hover:bg-red-700 transition-colors font-semibold"
                >
                  Fix {review.issues.length === 1 ? 'it' : `these ${review.issues.length}`}
                </a>
              )}
              <button
                onClick={() => window.print()}
                className="text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-800 transition-colors font-semibold"
              >
                Print / Save PDF
              </button>
              <button
                onClick={onClose}
                aria-label="Close certificate"
                className="text-stone-500 hover:text-stone-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            {/* An uploaded supplier certificate has no typed fields to check, so
                saying "nothing to fix" would be a false all-clear. */}
            {/* The picker lives inside CertificateBody for a template certificate. An uploaded
                supplier certificate does not render that body at all, so it is repeated here —
                otherwise choosing a dosage became impossible the moment one dosage happened to
                use an uploaded document. */}
            {review && isExternal && <DosagePicker review={review} />}
            {review && isExternal && (
              <div className="mb-6 border-2 border-stone-300 bg-stone-50 px-5 py-4 print:hidden">
                <p className="text-sm text-stone-700">
                  This is the supplier&apos;s own certificate, uploaded as pages. There are no typed
                  fields on it, so nothing here can be checked automatically. Read the pages below
                  and check them yourself.
                </p>
              </div>
            )}
            {body}
          </div>
        </div>
      </div>

      <div className="hidden print:block certificate-print">
        {body}
      </div>
    </>
  );
}
