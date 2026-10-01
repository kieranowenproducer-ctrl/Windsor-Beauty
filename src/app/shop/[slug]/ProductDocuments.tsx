'use client';

import type { ProductCertificate } from '@/data/products';

// Moved out of ProductPageClient.tsx unchanged. Every prop keeps the name it had
// as a local there, so the markup below is the same code that used to live in it.

interface Props {
  activeCertificate: ProductCertificate | undefined;
  showStorageButton: boolean;
  setCertificateOpen: (value: boolean) => void;
  setStorageOpen: (value: boolean) => void;
}

export default function ProductDocuments({
  activeCertificate, showStorageButton, setCertificateOpen, setStorageOpen,
}: Props) {
  return (
    <>
          {/* Product document / Storage Instructions */}
          {(activeCertificate?.enabled || showStorageButton) && (
            <div className="border-t border-gold-100 pt-5 flex flex-col sm:flex-row gap-3">
              {activeCertificate?.enabled && (
                <button
                  onClick={() => setCertificateOpen(true)}
                  className="inline-flex items-center justify-center gap-2 text-[9px] tracking-[0.18em] uppercase bg-gold-700 hover:bg-gold-800 text-white px-5 py-3 font-semibold transition-colors"
                >
                  Show Certificate
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
              {showStorageButton && (
                <button
                  onClick={() => setStorageOpen(true)}
                  className="inline-flex items-center justify-center gap-2 text-[9px] tracking-[0.18em] uppercase bg-gold-700 hover:bg-gold-800 text-white px-5 py-3 font-semibold transition-colors"
                >
                  Storage Instructions
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </button>
              )}
            </div>
          )}
    </>
  );
}
