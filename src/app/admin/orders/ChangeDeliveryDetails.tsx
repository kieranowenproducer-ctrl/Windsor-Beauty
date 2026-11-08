'use client';

import { useState } from 'react';
import { COUNTRY_OPTIONS } from '@/components/CountrySelect';
import { useConfirm } from '@/components/admin/ConfirmProvider';
import type { Order } from './orderTypes';

// "Change name or address" on an order that has not gone yet (Samuel, 3 Nov 2026:
// a customer emails before dispatch to correct where it goes or who it is for).
// Saving removes the old Royal Mail order and, on a paid order, makes a new one
// from the new details. The rules live in src/lib/orderDeliveryChange.ts; this is
// only the form.

interface Details { recipient: string; line1: string; line2: string; city: string; postcode: string; country: string }
interface Loaded {
  details: Details;
  version: string;
  customerName: string;
  blocked: string | null;
  byRoyalMail: boolean;
  paid: boolean;
  royalMailOrderExists: boolean;
  oldLabelPaid: boolean;
  labelPrinted: boolean;
}

const LOCKED = ['dispatched', 'delivered', 'refunded', 'cancelled'];
// 16px on a phone so iOS does not zoom the page when a box is tapped.
const INPUT = 'w-full border border-stone-200 bg-white px-3 py-2.5 text-[16px] sm:text-xs text-stone-700 focus:outline-none focus:border-gold-400 transition-colors';
const LABEL = 'block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1';

export default function ChangeDeliveryDetails({ order, onChanged }: {
  order: Order;
  onChanged: (orderNumber: string, patch: Partial<Order>) => void;
}) {
  const confirm = useConfirm();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Details | null>(null);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ lines: string[]; warn: boolean } | null>(null);

  // The panel keys this on the order number, so opening another order starts fresh.
  if (LOCKED.includes(order.status) || order.shippingEmailSentAt || order.royalMailShippedOn) return null;

  async function open() {
    setOpening(true); setError(''); setDone(null);
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/delivery-address`, { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not open the delivery details. Please try again.');
      if (data.blocked) { setError(data.blocked); return; }
      setLoaded(data); setDraft(data.details);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the delivery details. Please try again.');
    } finally {
      setOpening(false);
    }
  }

  function close() { setLoaded(null); setDraft(null); setError(''); }

  async function save() {
    if (!loaded || !draft) return;
    if (loaded.byRoyalMail && (loaded.oldLabelPaid || loaded.labelPrinted)) {
      const ok = await confirm({
        title: 'Cancel the old Royal Mail label?',
        body: `A label has already been ${loaded.labelPrinted ? 'printed' : 'made'} for the old details. Saving deletes it in Royal Mail and makes a new one.\n\nThe old label stops working. Throw it away: Royal Mail can charge if a cancelled label is posted.\n\nThe old postage was already paid. Check in Click & Drop whether it is refunded.`,
        confirmLabel: 'Yes, cancel it and make a new one',
        cancelLabel: 'Keep the old label',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${encodeURIComponent(order.orderNumber)}/delivery-address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, country: loaded.details.country, expectedVersion: loaded.version }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Could not save that. Please try again.');

      onChanged(order.orderNumber, data.order);
      const lines = ['Delivery details saved. A note has been added to this order.'];
      let warn = false;
      if (data.deletedRoyalMailOrders?.length) {
        lines.push(data.oldLabelWasPaid
          ? 'The old Royal Mail order and its label were cancelled. Do not use the old label.'
          : 'The old Royal Mail order was deleted.');
      }
      const rm = data.royalMail;
      if (rm?.ok && rm.trackingNumber) lines.push(`New Royal Mail label made. Tracking number ${rm.trackingNumber}.`);
      else if (rm?.pending) lines.push('Royal Mail has the new order. Pay the postage in Click & Drop as usual and the tracking number will appear.');
      else if (rm && !rm.ok) { warn = true; lines.push(`Royal Mail could not make the new order: ${rm.error ?? 'no reason given'}. Use "Create Royal Mail Label" below to try again.`); }
      else if (!loaded.paid && loaded.byRoyalMail) lines.push('Royal Mail gets these details when the payment comes in.');
      setDone({ lines, warn });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof Details) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setDraft(d => (d ? { ...d, [key]: value } : d));
  };
  const id = (key: string) => `delivery-${key}-${order.orderNumber}`;

  return (
    <div className="mt-2" data-change-delivery>
      {done && (
        <div role="status" className={`mb-2 border px-2.5 py-2 leading-relaxed ${done.warn ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          {done.lines.map(line => <p key={line}>{line}</p>)}
        </div>
      )}

      {!loaded || !draft ? (
        <>
          <button
            type="button"
            onClick={open}
            disabled={opening || saving}
            className="w-full border border-gold-300 bg-white text-gold-700 text-[9px] tracking-[0.14em] uppercase font-semibold py-2 hover:bg-gold-50 transition-colors disabled:opacity-50"
          >
            {opening ? 'Opening…' : 'Change name or address'}
          </button>
          {error && <p className="mt-1.5 text-[11px] text-red-700">{error}</p>}
        </>
      ) : (
        <div className="border border-gold-300 bg-gold-50/30 p-3 space-y-2.5">
          <p className="text-[11px] text-stone-600 leading-relaxed">
            Change who the parcel goes to, where, or both.
            {loaded.byRoyalMail && loaded.royalMailOrderExists && ' Royal Mail already has this order, so saving deletes it there and makes a new one with these details.'}
            {loaded.byRoyalMail && !loaded.royalMailOrderExists && loaded.paid && ' Saving also makes the Royal Mail order with these details.'}
            {loaded.byRoyalMail && !loaded.paid && ' It is not paid yet, so Royal Mail gets these details when the payment comes in.'}
            {' '}The customer is not emailed.
          </p>
          {loaded.byRoyalMail && (loaded.oldLabelPaid || loaded.labelPrinted) && (
            <p className="border border-red-200 bg-red-50 px-2.5 py-2 text-[11px] text-red-800 leading-relaxed">
              A label has already been {loaded.labelPrinted ? 'printed' : 'made'} for the old details. Saving cancels it. Throw the old label away, and check in Click &amp; Drop whether its postage is refunded.
            </p>
          )}

          <div>
            <label htmlFor={id('recipient')} className={LABEL}>Name on the parcel</label>
            <input id={id('recipient')} value={draft.recipient} onChange={set('recipient')} autoComplete="off" className={INPUT} />
            {draft.recipient.trim().toLowerCase() !== loaded.customerName.trim().toLowerCase() && (
              <p className="mt-1 text-[10px] text-stone-500">Going to someone other than {loaded.customerName}, who placed the order.</p>
            )}
          </div>
          <div>
            <label htmlFor={id('line1')} className={LABEL}>Address line 1</label>
            <input id={id('line1')} value={draft.line1} onChange={set('line1')} autoComplete="off" className={INPUT} />
          </div>
          <div>
            <label htmlFor={id('line2')} className={LABEL}>Address line 2 (if any)</label>
            <input id={id('line2')} value={draft.line2} onChange={set('line2')} autoComplete="off" className={INPUT} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={id('city')} className={LABEL}>Town or city</label>
              <input id={id('city')} value={draft.city} onChange={set('city')} autoComplete="off" className={INPUT} />
            </div>
            <div>
              <label htmlFor={id('postcode')} className={LABEL}>Postcode</label>
              <input id={id('postcode')} value={draft.postcode} onChange={set('postcode')} autoComplete="off" autoCapitalize="characters" spellCheck={false} className={INPUT} />
            </div>
          </div>
          <div>
            <label htmlFor={id('country')} className={LABEL}>Country</label>
            <input
              id={id('country')}
              value={COUNTRY_OPTIONS.find(option => option.code === loaded.details.country)?.label ?? loaded.details.country}
              readOnly
              aria-describedby={id('country-help')}
              className={INPUT.replace('bg-white', 'bg-stone-50')}
            />
            <p id={id('country-help')} className="mt-1 text-[10px] text-stone-500">
              Changing country needs a separate review of the delivery service and price.
            </p>
          </div>

          {error && <p role="alert" className="text-[11px] text-red-700 leading-relaxed">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 bg-gold-700 text-white text-[9px] tracking-[0.14em] uppercase font-semibold py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : loaded.byRoyalMail && loaded.paid ? 'Save and make Royal Mail order' : 'Save'}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="border border-stone-300 bg-white text-stone-600 text-[9px] tracking-[0.14em] uppercase font-semibold px-4 py-2.5 hover:border-stone-400 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
