'use client';

/**
 * Every live certificate on one page, exactly as a member sees it, ready to save
 * as a single PDF.
 *
 * Kieran's ask (task de7e8496): "allow admin a button to export all certificates
 * as they are viewed by a member on pdf. This is so I can manually view the
 * verticals as and when I like."
 *
 * It reuses CertificateBody — the same component the customer's certificate
 * viewer draws — rather than a second copy of the layout. That is the point: a
 * separate print template would drift, and then this page would stop being
 * proof of what a member actually sees. The @media print rules in globals.css
 * already hide everything outside `.certificate-print` and force a page break
 * on `.certificate-print-page-break`, so one certificate lands per sheet of A4.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PRODUCTS, mergeProducts, activeVariants, certificateForDosage, type Product } from '@/data/products';
import { CertificateBody, ExternalCertificateBody } from '@/components/CertificateModal';
import type { ProductCertificate } from '@/data/products';

interface Sheet {
  key: string;
  product: Product;
  cert: ProductCertificate;
  dosage: string | null;
}

// One sheet per certificate a member can actually open. A product with a
// different certificate per dosage produces one sheet per dosage, because that
// is what a member gets when they switch strength on the product page.
function sheetsFor(product: Product): Sheet[] {
  const variants = activeVariants(product);
  const out: Sheet[] = [];
  const seen = new Set<string>();

  for (const variant of variants) {
    const cert = certificateForDosage(product, variant.dosage);
    if (!cert?.enabled) continue;
    // Products that share one certificate across every dosage must not be
    // printed once per dosage — that is the same sheet several times over.
    const fingerprint = cert.certificateId || JSON.stringify(cert);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push({
      key: `${product.slug}-${variant.dosage}`,
      product,
      cert,
      dosage: variants.length > 1 ? variant.dosage : null,
    });
  }

  // A product with no active variants can still carry a certificate.
  if (out.length === 0 && product.certificate?.enabled) {
    out.push({ key: product.slug, product, cert: product.certificate, dosage: null });
  }
  return out;
}

export default function CertificateExportPage() {
  // Same shape the certificates list uses: a map of slug to the admin's edited
  // version of that product, which is what mergeProducts expects.
  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/admin/products/catalogue')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setOverrides(d.overrides && typeof d.overrides === 'object' ? d.overrides : {}))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);
  const sheets = useMemo(() => catalogue.flatMap(sheetsFor), [catalogue]);

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Everything in here is hidden the moment the page is printed. */}
      <div className="print:hidden">
        <div className="mx-auto max-w-3xl px-6 py-10">
          <Link
            href="/admin/certificates"
            className="text-[10px] tracking-[0.2em] uppercase text-stone-500 hover:text-stone-700"
          >
            Back to certificates
          </Link>

          <h1 className="font-serif text-3xl text-stone-800 mt-4 mb-2">Print every certificate</h1>
          <p className="text-sm text-stone-600 leading-relaxed mb-6">
            {loading
              ? 'Loading the certificates...'
              : failed
                ? 'The certificates could not be loaded. Refresh the page to try again.'
                : `${sheets.length} certificate${sheets.length === 1 ? '' : 's'} are live and shown below, exactly as a member sees them. Each one prints on its own page.`}
          </p>

          {!loading && !failed && (
            <>
              <button
                type="button"
                onClick={() => window.print()}
                className="bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase font-semibold px-6 py-3.5 hover:bg-gold-800 transition-colors"
              >
                Print / Save all as PDF
              </button>
              <p className="text-xs text-stone-500 leading-relaxed mt-3">
                Choose &quot;Save as PDF&quot; as the printer to keep a copy on your computer.
              </p>

              <ol className="mt-8 border-t border-stone-200 pt-6 space-y-1.5">
                {sheets.map((s, i) => (
                  <li key={s.key} className="text-xs text-stone-600">
                    <span className="text-stone-500 mr-2">{i + 1}.</span>
                    {s.product.name}
                    {s.dosage ? `, ${s.dosage}` : ''}
                    {s.cert.certificateId ? (
                      <span className="text-stone-500"> · {s.cert.certificateId}</span>
                    ) : null}
                  </li>
                ))}
              </ol>

              {sheets.length === 0 && (
                <p className="text-sm text-stone-600">
                  No certificates are live at the moment, so there is nothing to print.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* The printed document. Hidden on screen, visible only to the printer,
          which is the same arrangement the customer's certificate viewer uses. */}
      <div className="hidden print:block certificate-print">
        {sheets.map((sheet, i) => {
          const externalImages = sheet.cert.mode === 'external' ? sheet.cert.externalImages : undefined;
          return (
            <div
              key={sheet.key}
              className={i < sheets.length - 1 ? 'certificate-print-page-break' : undefined}
            >
              {externalImages && externalImages.length > 0 ? (
                <ExternalCertificateBody images={externalImages} caution={sheet.cert.caution} />
              ) : (
                <CertificateBody product={sheet.product} cert={sheet.cert} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
