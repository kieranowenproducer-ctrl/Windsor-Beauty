'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AccountComparison, ComparisonField, ConnectionUse, MatchState } from '@/lib/db/accountComparison';
import type { AccountActivity } from '@/lib/db/accountActivity';

// The Compare button and the side-by-side view it opens (Samuel, 30 September 2026).
//
// A finding that says "same address as Naomi Wye" is only useful if you can see Naomi's address
// next to this one. So every finding that names another account puts a Compare button beside that
// name, and the button opens both accounts line by line with the matching lines marked. It is the
// ONE component for this: the customers list and the Security Review queue both use it, so the
// same finding reads the same way wherever it is met.

export interface CompareTarget {
  id: number;
  label: string;
}

const MATCH_STYLE: Record<MatchState, { text: string; className: string }> = {
  same: { text: 'Same', className: 'bg-orange-100 text-orange-900 border-orange-300' },
  different: { text: 'Different', className: 'bg-stone-100 text-stone-700 border-stone-200' },
  missing: { text: 'Not given', className: 'bg-white text-stone-600 border-stone-200' },
};

function when(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' });
}

function whenTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
}

function firstName(label: string): string {
  return label.includes('@') ? label : label.split(' ')[0];
}

/** A small button that opens the comparison. `others` lets the view switch between every match. */
export function CompareAccountButton({
  subjectId, subjectLabel, target, others,
}: {
  subjectId: number;
  subjectLabel: string;
  target: CompareTarget;
  /** Every account this finding names, so the view can flick between them. Defaults to just `target`. */
  others?: CompareTarget[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center border border-gold-700 bg-white px-3 py-1.5 text-[11px] font-semibold text-gold-800 hover:bg-gold-50"
      >
        Compare side by side
      </button>
      {open && (
        <AccountComparisonDialog
          subjectId={subjectId}
          subjectLabel={subjectLabel}
          targets={others && others.length > 0 ? others : [target]}
          initialTargetId={target.id}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function AccountComparisonDialog({
  subjectId, subjectLabel, targets, initialTargetId, onClose,
}: {
  subjectId: number;
  subjectLabel: string;
  targets: CompareTarget[];
  initialTargetId: number;
  onClose: () => void;
}) {
  const [targetId, setTargetId] = useState(initialTargetId);
  const [data, setData] = useState<AccountComparison | null>(null);
  const [error, setError] = useState('');
  const target = targets.find(t => t.id === targetId) ?? targets[0];

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    fetch(`/api/admin/account-comparison?a=${subjectId}&b=${targetId}`)
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'The comparison could not be loaded.');
        if (!cancelled) setData(body.comparison as AccountComparison);
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'The comparison could not be loaded.'); });
    return () => { cancelled = true; };
  }, [subjectId, targetId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if(event.key!=='Tab' || !dialog) return;
      const items=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]'));
      const first=items[0],last=items[items.length-1];
      if(!first) {event.preventDefault();return;}
      if(event.shiftKey && (document.activeElement===first || !dialog.contains(document.activeElement))) {event.preventDefault();last.focus();}
      else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
    };
    dialog?.addEventListener('keydown',trap);
    return()=>{dialog?.removeEventListener('keydown',trap);previous?.focus();};
  }, []);

  const left = firstName(subjectLabel);
  const right = firstName(target.label);

  return (
    <div className="fixed inset-0 z-[300] flex h-[100svh] items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Compare ${subjectLabel} with ${target.label}`}
        className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl"
      >
        <div className="shrink-0 border-b border-gold-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold-700">Side by side</p>
              <p className="mt-1 font-serif text-lg leading-snug text-stone-900">
                {subjectLabel} <span className="text-stone-500">and</span> {target.label}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the comparison"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-2xl leading-none text-stone-600 hover:text-stone-900"
            >
              &times;
            </button>
          </div>
          {targets.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Which account to compare with">
              {targets.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={t.id === targetId}
                  onClick={() => setTargetId(t.id)}
                  className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold ${t.id === targetId ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
          {!error && !data && <p className="text-sm text-stone-600">Loading both accounts...</p>}
          {data && <ComparisonBody data={data} left={left} right={right} />}
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 border-t border-stone-200 px-5 py-3">
          <Link href={`/admin/customers/${subjectId}`} className="inline-flex min-h-10 items-center border border-stone-300 px-3 text-xs font-semibold text-stone-800 hover:border-gold-700">
            Open {left}&rsquo;s account
          </Link>
          <Link href={`/admin/customers/${targetId}`} className="inline-flex min-h-10 items-center border border-stone-300 px-3 text-xs font-semibold text-stone-800 hover:border-gold-700">
            Open {right}&rsquo;s account
          </Link>
        </div>
      </div>
    </div>
  );
}

function ComparisonBody({ data, left, right }: { data: AccountComparison; left: string; right: string }) {
  return (
    <div className="space-y-6">
      <section className={`border p-3 ${data.matches.length ? 'border-orange-300 bg-orange-50' : 'border-stone-200 bg-stone-50'}`}>
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-700">What matches</p>
        {data.matches.length ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-stone-900">
            {data.matches.map(m => <li key={m}>{m}</li>)}
          </ul>
        ) : (
          <p className="mt-1.5 text-sm text-stone-700">
            Nothing matches between these two accounts today. One of them may have changed their details
            since the finding was raised.
          </p>
        )}
        <p className="mt-2 text-xs text-stone-600">Evidence to look at, never proof. Families and flatmates share both.</p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-700">Their details</h3>
        <div className="hidden grid-cols-[9rem_1fr_1fr_5.5rem] gap-3 border-b border-stone-200 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-600 sm:grid">
          <span />
          <span>{left}</span>
          <span>{right}</span>
          <span />
        </div>
        <div className="divide-y divide-stone-100">
          {data.fields.map(field => <FieldRow key={field.label} field={field} left={left} right={right} />)}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-700">Internet connections in common</h3>
        {data.sharedConnections.length === 0 ? (
          <p className="text-sm text-stone-700">None. These two have never been seen on the same connection.</p>
        ) : (
          <ul className="space-y-3">
            {data.sharedConnections.map(c => (
              <li key={c.ip} className={`border p-3 ${c.applePrivateRelay ? 'border-blue-200 bg-blue-50' : 'border-orange-200 bg-orange-50/60'}`}>
                <p className="text-sm font-semibold text-stone-900">
                  {c.ip}{c.place ? <span className="font-normal text-stone-600"> &middot; {c.place}</span> : null}
                </p>
                {c.applePrivateRelay && <RelayNote />}
                <UseLine who={left} use={c.subject} />
                <UseLine who={right} use={c.other} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-stone-600">
          {left} has also used {data.unsharedConnections.subject} other connection{data.unsharedConnections.subject === 1 ? '' : 's'},
          and {right} {data.unsharedConnections.other}. A connection is shared by a whole household, office or phone mast.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-700">Orders</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <OrderList who={left} orders={data.orders.subject} />
          <OrderList who={right} orders={data.orders.other} />
        </div>
      </section>
    </div>
  );
}

function FieldRow({ field, left, right }: { field: ComparisonField; left: string; right: string }) {
  const badge = field.match ? MATCH_STYLE[field.match] : null;
  const same = field.match === 'same';
  return (
    <div className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[9rem_1fr_1fr_5.5rem] sm:items-baseline ${same ? 'bg-orange-50/70 -mx-2 px-2' : ''}`}>
      <span className="text-xs font-semibold text-stone-700 sm:text-[13px]">{field.label}</span>
      <span className="justify-self-end sm:order-last">
        {badge && <span className={`inline-block border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.text}</span>}
      </span>
      <span className="col-span-2 break-words text-sm text-stone-900 sm:col-span-1">
        <span className="text-stone-600 sm:hidden">{left}: </span>{field.subject || <span className="text-stone-500">Not given</span>}
      </span>
      <span className="col-span-2 break-words text-sm text-stone-900 sm:col-span-1">
        <span className="text-stone-600 sm:hidden">{right}: </span>{field.other || <span className="text-stone-500">Not given</span>}
      </span>
    </div>
  );
}

function UseLine({ who, use }: { who: string; use: ConnectionUse }) {
  const once = use.firstSeen === use.lastSeen;
  return (
    <p className="mt-1.5 text-xs leading-5 text-stone-700">
      <span className="font-semibold text-stone-900">{who}</span> {use.events.join(', ')}, {use.times} time{use.times === 1 ? '' : 's'}.
      <br />
      {once
        ? <>On it once: {whenTime(use.lastSeen)}</>
        : <>First on it {whenTime(use.firstSeen)}, last on it {whenTime(use.lastSeen)}</>}
    </p>
  );
}

/** "Last logged in ... · last seen ..." for one account, used on every finding. */
export function ActivityLine({ who, activity }: { who: string; activity: AccountActivity | undefined }) {
  if (!activity) return null;
  const login = activity.lastLoggedIn ? whenTime(activity.lastLoggedIn) : 'never recorded';
  const seen = activity.lastSeen ? `${whenTime(activity.lastSeen)} (${activity.lastSeenDoing})` : 'never recorded';
  return (
    <p className="mt-0.5 text-[11px] leading-5 text-stone-600">
      <span className="font-semibold text-stone-800">{who}</span> last logged in {login} &middot; last seen {seen}
    </p>
  );
}

/**
 * One line per shared connection on a finding: the address, the Apple flag when it is one of
 * theirs, and when each of the two accounts was last on it.
 */
export function SharedConnectionLine({
  ip, applePrivateRelay, subjectWho, subjectLastSeen, otherWho, otherLastSeen,
}: {
  ip: string;
  applePrivateRelay: boolean;
  subjectWho: string;
  subjectLastSeen: string | null;
  otherWho: string;
  otherLastSeen: string | null;
}) {
  return (
    <div className={`mt-1.5 border-l-2 pl-2 text-[11px] leading-5 ${applePrivateRelay ? 'border-blue-300' : 'border-orange-300'}`}>
      <p className="text-stone-800">
        Shared connection <span className="font-semibold">{ip}</span>
        {subjectLastSeen || otherLastSeen ? (
          <span className="text-stone-600">
            {' '}&middot; {subjectWho} last on it {subjectLastSeen ? whenTime(subjectLastSeen) : 'not recorded'}
            , {otherWho} last on it {otherLastSeen ? whenTime(otherLastSeen) : 'not recorded'}
          </span>
        ) : null}
      </p>
      {applePrivateRelay && <RelayNote compact />}
    </div>
  );
}

/** Shown on every shared connection that is on Apple's published Private Relay list. */
export function RelayNote({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`mt-1 text-blue-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <span className="font-semibold">Apple iPhone Private Relay.</span>{' '}
      An iPhone privacy setting that puts thousands of unrelated people on the same address, so on its own this proves almost nothing.
    </p>
  );
}

function OrderList({ who, orders }: { who: string; orders: AccountComparison['orders']['subject'] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-stone-900">{who}</p>
      {orders.length === 0 ? (
        <p className="mt-1 text-sm text-stone-600">No orders.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {orders.map(o => (
            <li key={o.orderNumber} className="text-sm text-stone-800">
              <Link href={`/admin/orders?search=${encodeURIComponent(o.orderNumber)}`} className="font-semibold text-gold-800 underline">
                {o.orderNumber}
              </Link>{' '}
              <span className="text-xs text-stone-600">
                {when(o.createdAt)} &middot; {o.status.replace(/_/g, ' ')}{o.discountCode ? ` · code ${o.discountCode}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
