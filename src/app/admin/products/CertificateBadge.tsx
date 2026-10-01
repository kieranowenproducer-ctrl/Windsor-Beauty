import { CERTIFICATE_STATUS_WORDS, type CertificateStatus } from '@/lib/certificateAudit';

// The labels used to read "Certificate Live" / "Not Linked" / "No Certificate".
// "Not Linked" meant nothing to the people who use this page, and the real
// explanation was only ever a hover tooltip. The words now come from one place
// (CERTIFICATE_STATUS_WORDS) so the Products page and the Certificates page
// stop calling the same thing two different names, and the reason is shown as
// text on the row rather than hidden behind a hover.
export const CERTIFICATE_STATUS_CONFIG: Record<CertificateStatus, { label: string; dot: string; text: string; bg: string }> = {
  live: { label: CERTIFICATE_STATUS_WORDS.live.label, dot: 'bg-green-500', text: 'text-green-600', bg: 'bg-green-50' },
  warning: { label: CERTIFICATE_STATUS_WORDS.warning.label, dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  missing: { label: CERTIFICATE_STATUS_WORDS.missing.label, dot: 'bg-red-400', text: 'text-red-500', bg: 'bg-red-50' },
};

export function CertificateBadge({ status, issue }: { status: CertificateStatus; issue?: string }) {
  const config = CERTIFICATE_STATUS_CONFIG[status];
  // The reason is spelled out under the badge, not left in a title attribute.
  const reason = issue ?? CERTIFICATE_STATUS_WORDS[status].meaning;
  return (
    <span className="block text-left">
      <span
        className={`inline-flex items-center gap-1.5 text-[8px] tracking-wider uppercase px-2 py-0.5 ${config.bg} ${config.text}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
        {config.label}
      </span>
      {status !== 'live' && (
        <span className="block text-[9px] text-stone-500 leading-snug mt-1 max-w-[220px]">{reason}</span>
      )}
    </span>
  );
}
