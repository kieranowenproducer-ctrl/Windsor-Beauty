'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DuplicateFinding, MatchedAccount, SharedConnectionNote } from '@/lib/db/duplicateAccounts';
import type { IgnoredPair } from '@/lib/db/securityReviews';

// Mirrors isRelayOnlyMatch() in duplicateAccounts.ts. Repeated rather than imported because that
// file brings the database driver and Apple's address list with it, and this runs in the browser.
function isRelayOnlyMatch(account: MatchedAccount): boolean {
  const shared = account.sharedConnections ?? [];
  return shared.length > 0 && shared.every(c => c.applePrivateRelay);
}
import { ActivityLine, CompareAccountButton, SharedConnectionLine, type CompareTarget } from '@/components/admin/AccountComparison';

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
  /** Pairs somebody has pressed Ignore on, so each can be undone. */
  ignored: IgnoredPair[];
  /** Stop raising these two accounts against each other. */
  onIgnore: (customerId: number, otherCustomerId: number) => void;
  onStopIgnoring: (customerId: number, otherCustomerId: number) => void;
  /** The pair being saved right now ("low:high"), so its own button can say so. */
  ignoringKey: string | null;
  ignoreError: string;
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)}:${Math.max(a, b)}`;
}

export default function DuplicateAccountsPanel({
  checking, checked, failed, findings, ignored, onIgnore, onStopIgnoring, ignoringKey, ignoreError,
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
        <IgnoredList ignored={ignored} onStopIgnoring={onStopIgnoring} ignoringKey={ignoringKey} ignoreError={ignoreError} />
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
        connection is evidence to review, never proof. Record decisions in Security Review, or press
        Ignore on a pair that is plainly unrelated (an Apple iPhone Private Relay match, for example)
        and those two will not be raised against each other again.
      </p>

      {ignoreError && <p className="mb-3 text-[11px] text-red-700">{ignoreError}</p>}

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

            <MatchedAccounts finding={finding} onIgnore={onIgnore} ignoringKey={ignoringKey} />

            {finding.offerStatus === 'review' && (
              <p className="text-[10px] text-stone-600 mt-1.5">Historical review marker only. Their discount is not paused.</p>
            )}
          </li>
        ))}
      </ul>

      <IgnoredList ignored={ignored} onStopIgnoring={onStopIgnoring} ignoringKey={ignoringKey} ignoreError="" />
    </div>
  );
}

/**
 * The pairs that have been ignored, folded away under one line, each with a way back. Without it an
 * Ignore pressed by mistake could never be taken back from the screen it was pressed on.
 */
function IgnoredList({ ignored, onStopIgnoring, ignoringKey, ignoreError }: {
  ignored: IgnoredPair[];
  onStopIgnoring: (customerId: number, otherCustomerId: number) => void;
  ignoringKey: string | null;
  ignoreError: string;
}) {
  const [open, setOpen] = useState(false);
  if (ignored.length === 0) return ignoreError ? <p className="mt-3 text-[11px] text-red-700">{ignoreError}</p> : null;
  return (
    <div className="mt-4 border-t border-gold-100 pt-3">
      {ignoreError && <p className="mb-2 text-[11px] text-red-700">{ignoreError}</p>}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="text-[10px] font-semibold uppercase tracking-wider text-stone-600 underline"
      >
        {open ? 'Hide ignored pairs' : `Ignored pairs (${ignored.length})`}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {ignored.map(pair => {
            const key = pairKey(pair.firstId, pair.secondId);
            return (
              <li key={key} className="flex flex-wrap items-center justify-between gap-2 bg-white border border-stone-200 px-3 py-2 text-[11px] text-stone-700">
                <span className="min-w-0">
                  <span className="font-semibold text-stone-900">{pair.firstLabel}</span> and{' '}
                  <span className="font-semibold text-stone-900">{pair.secondLabel}</span>
                  <span className="ml-1.5 text-stone-500">ignored {formatDay(pair.ignoredAt)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onStopIgnoring(pair.firstId, pair.secondId)}
                  disabled={ignoringKey !== null}
                  className="inline-flex min-h-9 items-center border border-stone-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ignoringKey === key ? 'Saving...' : 'Stop ignoring'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function formatDay(value: string): string {
  const at = new Date(value);
  return Number.isFinite(at.getTime())
    ? at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

/**
 * One row per OTHER account, saying what it shares with this one and offering the side-by-side
 * view. An account that shares both the address and the connection is one row saying both, not
 * two rows under two headings, so the reader never has to cross-reference names.
 */
function MatchedAccounts({ finding, onIgnore, ignoringKey }: {
  finding: DuplicateFinding;
  onIgnore: (customerId: number, otherCustomerId: number) => void;
  ignoringKey: string | null;
}) {
  const rows = new Map<number, { label: string; email: string; reasons: string[]; shared: SharedConnectionNote[] }>();
  for (const a of finding.sameAddress) {
    rows.set(a.id, { label: a.name ?? a.email, email: a.email, reasons: ['same home address'], shared: [] });
  }
  for (const a of finding.sameConnection) {
    const row = rows.get(a.id) ?? { label: a.name ?? a.email, email: a.email, reasons: [], shared: [] };
    row.reasons.push(isRelayOnlyMatch(a) ? 'same Apple iPhone Private Relay address' : 'same internet connection');
    row.shared = a.sharedConnections ?? [];
    rows.set(a.id, row);
  }
  const targets: CompareTarget[] = Array.from(rows.entries()).map(([id, row]) => ({ id, label: row.label }));
  const subjectLabel = finding.name ?? finding.email;
  const subjectWho = firstWord(subjectLabel);

  return (
    <>
      <ActivityLine who={subjectWho} activity={finding.activity?.[finding.customerId]} />
      <ul className="mt-2 space-y-2">
        {Array.from(rows.entries()).map(([id, row]) => (
          <li key={id} className="border-t border-gold-100 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 text-[11px] text-stone-700">
                <span className="font-semibold text-stone-900">{row.label}</span>
                {row.label !== row.email && <span className="ml-1.5 text-stone-600">{row.email}</span>}
                <div className="mt-0.5">Matches on: {row.reasons.join(' and ')}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CompareAccountButton subjectId={finding.customerId} subjectLabel={subjectLabel} target={{ id, label: row.label }} others={targets} />
                <button
                  type="button"
                  onClick={() => onIgnore(finding.customerId, id)}
                  disabled={ignoringKey !== null}
                  className="inline-flex min-h-9 items-center border border-stone-400 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ignoringKey === pairKey(finding.customerId, id) ? 'Ignoring...' : 'Ignore'}
                </button>
              </div>
            </div>
            <ActivityLine who={firstWord(row.label)} activity={finding.activity?.[id]} />
            {row.shared.map(c => (
              <SharedConnectionLine
                key={c.ip}
                ip={c.ip}
                applePrivateRelay={c.applePrivateRelay}
                subjectWho={subjectWho}
                subjectLastSeen={c.subjectLastSeen}
                otherWho={firstWord(row.label)}
                otherLastSeen={c.otherLastSeen}
              />
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

function firstWord(label: string): string {
  return label.includes('@') ? label : label.split(' ')[0];
}
