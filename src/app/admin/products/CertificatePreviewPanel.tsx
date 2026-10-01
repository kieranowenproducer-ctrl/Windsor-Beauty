'use client';

import { useMemo } from 'react';
import { CertificateBody, ExternalCertificateBody } from '@/components/CertificateModal';
import { certificateIssuesFor } from '@/lib/certificateAudit';
import { certificateDraftToPayload, type CertificateDraft } from './productDrafts';
import type { Product } from '@/data/products';

/**
 * The certificate itself, beside the fields being typed into it (task f5c8da12).
 *
 * Before this, the only way to see what a certificate looked like — or what was wrong with it —
 * was to save it and go and open it on another screen. Somebody could be told a product had 21
 * things wrong, open the editor, and be shown a wall of boxes with nothing indicating which of
 * them was the problem. Kieran's words: "if I choose 20, what is wrong? Doesn't tell me anything."
 *
 * So this renders the REAL certificate from what is currently typed, unsaved, with every missing
 * or wrong part marked in red exactly where it belongs. It re-renders on every keystroke, which is
 * cheap: it is plain markup over a handful of rows, and it means a correction is visible in place
 * the moment it is made rather than after a save and a page change.
 *
 * The marking is the same marking the Certificates screen uses, from the same rules in
 * certificateAudit. It cannot say something different from that screen.
 */
export default function CertificatePreviewPanel({
  product, draft, dosage, onClose,
}: {
  product: Product;
  /** What is currently typed. Not saved anywhere yet. */
  draft: CertificateDraft;
  /** Which dosage this certificate is for; blank for the shared one. */
  dosage: string;
  onClose: () => void;
}) {
  const cert = useMemo(() => certificateDraftToPayload(draft), [draft]);
  // A shared certificate is checked against the first dosage it would actually be shown for,
  // because the content rule ("10.2mg must beat the 10mg on the label") needs a figure to compare
  // against. Named on screen so nobody wonders which dosage the marks refer to.
  const checkedDosage = dosage || product.variants.find(v => v.enabled !== false)?.dosage || '';
  const issues = useMemo(() => certificateIssuesFor(cert, checkedDosage), [cert, checkedDosage]);

  const externalImages = cert.mode === 'external' ? cert.externalImages : undefined;
  const isExternal = Boolean(externalImages && externalImages.length > 0);

  return (
    <div className="flex h-full flex-col bg-stone-100">
      <div className="shrink-0 flex items-start justify-between gap-3 border-b border-stone-300 bg-white px-5 py-3">
        <div>
          <p className="text-[10px] tracking-[0.18em] uppercase text-stone-500 font-semibold">
            The certificate, as you type it
          </p>
          <p className="text-[10px] text-stone-500 mt-0.5 leading-snug">
            {dosage ? `For ${dosage}.` : 'The shared certificate.'}{' '}
            {isExternal
              ? 'This is an uploaded document, so there are no typed fields to check.'
              : issues.length === 0
                ? 'Nothing is missing. Everything it needs is filled in.'
                : `${issues.length} ${issues.length === 1 ? 'thing is' : 'things are'} marked in red below.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-[9px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-800 transition-colors"
        >
          Hide preview
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mx-auto max-w-2xl bg-white p-6 shadow-sm">
          {isExternal
            ? <ExternalCertificateBody images={externalImages!} caution={cert.caution} />
            : <CertificateBody product={product} cert={cert} review={{ issues, shownDosage: dosage || undefined }} />}
        </div>
        <p className="mx-auto max-w-2xl text-[10px] text-stone-500 mt-3 leading-relaxed">
          Nothing here is saved until you press Save Changes. This is what the certificate will look
          like, and what a customer would be shown, without the red marks.
        </p>
      </div>
    </div>
  );
}
