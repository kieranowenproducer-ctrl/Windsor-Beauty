'use client';

import { editInput, type CustomerDraft } from './customerTypes';

// The edit boxes for a customer record, in one place (task 99476dc9).
//
// There are two ways into a customer: clicking their row on the list, which
// opens the panel beside it, and clicking their name, which opens their full
// page. Only the first could be edited. Rather than write the form out twice
// and have the two drift, both now render these fields, so whichever way you
// got to somebody you are editing exactly the same things.
//
// Presentational only: the draft, the saving state and the save itself belong
// to whichever screen is using it.

interface Props {
  draft: CustomerDraft;
  setField: <K extends keyof CustomerDraft>(key: K, value: CustomerDraft[K]) => void;
  disabled: boolean;
}

export default function CustomerEditFields({ draft, setField, disabled }: Props) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          value={draft.firstName}
          onChange={e => setField('firstName', e.target.value)}
          placeholder="First name"
          aria-label="First name"
          disabled={disabled}
          className={editInput}
        />
        <input
          type="text"
          value={draft.lastName}
          onChange={e => setField('lastName', e.target.value)}
          placeholder="Last name"
          aria-label="Last name"
          disabled={disabled}
          className={editInput}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Contact</p>
        <input
          type="email"
          value={draft.email}
          onChange={e => setField('email', e.target.value)}
          placeholder="Email"
          aria-label="Email"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
        <input
          type="tel"
          value={draft.phone}
          onChange={e => setField('phone', e.target.value)}
          placeholder="Phone"
          aria-label="Phone"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400">How they heard about us</p>
        <input
          type="text"
          value={draft.referredBy}
          onChange={e => setField('referredBy', e.target.value)}
          placeholder="e.g. a salon or partner name"
          aria-label="How they heard about us"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
        <p className="text-[9px] text-stone-400">
          This is what groups members under a referral partner, so a misspelling
          here is why someone does not appear under their partner.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400">Address</p>
        <input
          type="text"
          value={draft.addressLine1}
          onChange={e => setField('addressLine1', e.target.value)}
          placeholder="Address line 1"
          aria-label="Address line 1"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
        <input
          type="text"
          value={draft.addressLine2}
          onChange={e => setField('addressLine2', e.target.value)}
          placeholder="Address line 2 (optional)"
          aria-label="Address line 2"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            value={draft.addressCity}
            onChange={e => setField('addressCity', e.target.value)}
            placeholder="City"
            aria-label="City"
            disabled={disabled}
            className={editInput}
          />
          <input
            type="text"
            value={draft.addressPostcode}
            onChange={e => setField('addressPostcode', e.target.value)}
            placeholder="Postcode"
            aria-label="Postcode"
            disabled={disabled}
            className={editInput}
          />
        </div>
        <input
          type="text"
          value={draft.addressCountry}
          onChange={e => setField('addressCountry', e.target.value)}
          placeholder="Country"
          aria-label="Country"
          disabled={disabled}
          className={`${editInput} w-full`}
        />
      </div>

      <label className="flex items-center gap-2 text-[10px] text-stone-600">
        <input
          type="checkbox"
          checked={draft.marketingConsent}
          onChange={e => setField('marketingConsent', e.target.checked)}
          disabled={disabled}
          className="accent-gold-500"
        />
        Opted in to marketing
      </label>
      {/* Ticking this now genuinely puts them on the Email Marketing list
          (task 99476dc9). It used to change this screen and nothing else. */}
      <p className="text-[9px] text-stone-400 leading-relaxed">
        This is the same list the Email Marketing page sends from. Ticking it adds them,
        unticking it takes them off.
      </p>
    </>
  );
}
