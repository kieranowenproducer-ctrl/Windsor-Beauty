'use client';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  certAuditOpen: boolean;
  certAudit: {
    missing: { name: string; id: string; categories: string }[];
    issues: { name: string; id: string; issue: string }[];
  };
}

export default function CertificateAuditPanel({ certAuditOpen, certAudit }: Props) {
  return (
    <>
          {/* The certificate audit panel. It used to sit between the filters and the search box,
              which would have put it INSIDE the pinned bar and made that bar taller than the
              screen whenever it was open. It renders under the bar now, still directly above the
              list it describes. */}
          {certAuditOpen && (
            <div className="bg-white border border-stone-200 p-5 mt-5 mb-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div>
                <p className="text-[9px] tracking-[0.18em] uppercase text-red-500 font-semibold mb-3">
                  Missing Certificates ({certAudit.missing.length})
                </p>
                {certAudit.missing.length === 0 ? (
                  <p className="text-stone-400">Every product has at least certificate data on file.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {certAudit.missing.map(row => (
                      <li key={row.id} className="text-stone-600">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-stone-400"> — ID {row.id} — {row.categories || 'Uncategorised'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-[9px] tracking-[0.18em] uppercase text-amber-600 font-semibold mb-3">
                  Certificate Issues ({certAudit.issues.length})
                </p>
                {certAudit.issues.length === 0 ? (
                  <p className="text-stone-400">No certificates with data are currently broken or unlinked.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {certAudit.issues.map(row => (
                      <li key={row.id} className="text-stone-600">
                        <span className="font-medium">{row.name}</span>
                        <span className="text-stone-400"> — {row.issue}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
    </>
  );
}
