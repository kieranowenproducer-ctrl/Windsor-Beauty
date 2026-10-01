'use client';

import Link from 'next/link';
import type { DuplicateFinding } from '@/lib/db/duplicateAccounts';

// What the Check For Second Accounts button shows (task c76f31fb).
//
// It names the accounts and says which of the two things matched, because "3 accounts look
// suspicious" is not something anybody can act on. It never says a word about what should happen
// next: nobody is blocked, nothing is refused, and whether two accounts at one address are a fraud
// or a couple is a judgement this screen is not entitled to make.

interface Props {
  checking: boolean;
  checked: boolean;
  failed: boolean;
  findings: DuplicateFinding[];
  /** Mark one account as genuine. Takes it off this list and off the dashboard for good. */
  onAllow: (customerId: number) => void;
  /** Which account is being allowed right now, so its own button can say so. */
  allowingId: number | null;
  allowError: string;
}

export default function DuplicateAccountsPanel({
  checking, checked, failed, findings,
}: Props) {
  // Nothing has been asked yet, so nothing is said. The panel appears when it has an answer.
  if (!checking && !checked && !failed) return null;

  if (checking) {
    return (
      <div className="border border-stone-200 bg-stone-50 px-5 py-4 mb-6 text-xs text-stone-600">
        Checking every account for a second sign-up...
      </div>
    );
  }

  // A REFUSED CHECK IS NOT AN EMPTY ONE. Never reassure on a failed read.
  if (failed) {
    return (
      <div className="border border-red-200 bg-red-50 px-5 py-4 mb-6 text-xs text-red-700">
        The check could not run just now, so this is not an all-clear. Try again in a moment.
      </div>
    );
  }

  if (findings.length === 0) {
    return (
      <div className="border border-stone-200 bg-stone-50 px-5 py-4 mb-6 text-xs text-stone-600">
        No account looks like a second sign-up for a second 10% discount.
      </div>
    );
  }

  return (
    <div className="border border-gold-300 bg-gold-50 px-5 py-4 mb-6">
      <div className="text-[9px] tracking-[0.2em] uppercase text-gold-700 font-semibold mb-1">
        Worth a look
      </div>
      <p className="text-sm text-stone-800 font-semibold mb-1">
        {findings.length === 1
          ? '1 account may be a second sign-up for a second 10% discount'
          : `${findings.length} accounts may be second sign-ups for a second 10% discount`}
      </p>
      <p className="text-[10px] text-stone-500 mb-4">
        Nobody has been blocked and every valid discount remains available. A shared address or
        connection is evidence to review, never proof. Record decisions in Security Review.
      </p>

      <Link href="/admin/security-reviews" className="mb-4 inline-block text-[10px] font-semibold uppercase tracking-wider text-gold-800 underline">
        Open Security Review
      </Link>

      <ul className="space-y-3">
        {findings.map(finding => (
          <li key={finding.customerId} className="border border-gold-200 bg-white px-4 py-3">
            <Link
              href={`/admin/customers/${finding.customerId}`}
              className="text-xs font-semibold text-stone-800 hover:text-gold-700 transition-colors"
            >
              {finding.name ?? finding.email}
            </Link>
            {finding.name && <span className="text-[10px] text-stone-500 ml-2">{finding.email}</span>}

            {finding.sameAddress.length > 0 && (
              <p className="text-[11px] text-stone-600 mt-1.5">
                <span className="font-semibold">Same address as:</span>{' '}
                {finding.sameAddress.map(a => a.name ?? a.email).join(', ')}
              </p>
            )}
            {finding.sameConnection.length > 0 && (
              <p className="text-[11px] text-stone-600 mt-1">
                <span className="font-semibold">Same internet connection as:</span>{' '}
                {finding.sameConnection.map(a => a.name ?? a.email).join(', ')}
              </p>
            )}

            {finding.offerStatus === 'review' && (
              <p className="text-[10px] text-stone-600 mt-1.5">Historical review marker only — their discount is not paused.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
