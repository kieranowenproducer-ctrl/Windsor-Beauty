'use client';

import CountrySelect from '@/components/CountrySelect';
import { INPUT_CLASS, SELECT_CLASS, LABEL_CLASS } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  billingLine1: string;
  setBillingLine1: (value: string) => void;
  billingLine2: string;
  setBillingLine2: (value: string) => void;
  billingCity: string;
  setBillingCity: (value: string) => void;
  billingPostcode: string;
  setBillingPostcode: (value: string) => void;
  billingCountry: string;
  setBillingCountry: (value: string) => void;
  shipDifferent: boolean;
  setShipDifferent: (value: boolean) => void;
  shippingLine1: string;
  setShippingLine1: (value: string) => void;
  shippingLine2: string;
  setShippingLine2: (value: string) => void;
  shippingCity: string;
  setShippingCity: (value: string) => void;
  shippingPostcode: string;
  setShippingPostcode: (value: string) => void;
  shippingCountry: string;
  setShippingCountry: (value: string) => void;
  /** Whether the parcel is going to somebody other than the person being invoiced. */
  sendToSomeoneElse: boolean;
  setSendToSomeoneElse: (value: boolean) => void;
  shippingRecipient: string;
  setShippingRecipient: (value: string) => void;
  /** Shown so it is obvious whose name is on the parcel when the box is left unticked. */
  customerName: string;
}

export default function InvoiceAddresses({
  billingLine1, setBillingLine1, billingLine2, setBillingLine2,
  shippingLine1, setShippingLine1, shippingLine2, setShippingLine2,
  billingCity, setBillingCity, billingPostcode, setBillingPostcode,
  billingCountry, setBillingCountry, shipDifferent, setShipDifferent,
  shippingCity, setShippingCity, shippingPostcode, setShippingPostcode,
  shippingCountry, setShippingCountry,
  sendToSomeoneElse, setSendToSomeoneElse, shippingRecipient, setShippingRecipient, customerName,
}: Props) {
  return (
    <>
        {/* Addresses */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-4">Billing Address</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={LABEL_CLASS}>Address Line 1</span>
              <input type="text" value={billingLine1} onChange={(e) => setBillingLine1(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className={LABEL_CLASS}>Address Line 2 (optional)</span>
              <input type="text" value={billingLine2} onChange={(e) => setBillingLine2(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>City</span>
              <input type="text" value={billingCity} onChange={(e) => setBillingCity(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Postcode</span>
              <input type="text" value={billingPostcode} onChange={(e) => setBillingPostcode(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Country</span>
              <CountrySelect value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} className={SELECT_CLASS} />
            </label>
          </div>
          <label className="flex items-center gap-2 mb-4">
            <input type="checkbox" checked={shipDifferent} onChange={(e) => setShipDifferent(e.target.checked)} className="accent-gold-500" />
            <span className={LABEL_CLASS}>Ship to a different address</span>
          </label>
          {shipDifferent && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-stone-100">
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={LABEL_CLASS}>Shipping Address Line 1</span>
                <input type="text" value={shippingLine1} onChange={(e) => setShippingLine1(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1.5 sm:col-span-2">
                <span className={LABEL_CLASS}>Shipping Address Line 2 (optional)</span>
                <input type="text" value={shippingLine2} onChange={(e) => setShippingLine2(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLASS}>City</span>
                <input type="text" value={shippingCity} onChange={(e) => setShippingCity(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLASS}>Postcode</span>
                <input type="text" value={shippingPostcode} onChange={(e) => setShippingPostcode(e.target.value)} className={INPUT_CLASS} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={LABEL_CLASS}>Country</span>
                <CountrySelect value={shippingCountry} onChange={(e) => setShippingCountry(e.target.value)} className={SELECT_CLASS} />
              </label>

              {/* Somebody paying for a parcel that goes to a friend used to have nowhere to put the
                  friend's name, so it went into the first line of the address — which is a Royal
                  Mail address line, and which then came back as that customer's billing address on
                  their next invoice (task 77b818aa). It has its own box now. */}
              <div className="sm:col-span-2 border-t border-stone-100 pt-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sendToSomeoneElse}
                    onChange={(e) => setSendToSomeoneElse(e.target.checked)}
                    className="accent-gold-500"
                  />
                  <span className={LABEL_CLASS}>Send it to a different person</span>
                </label>
                <p className="text-[10px] text-stone-500 mt-1">
                  {sendToSomeoneElse
                    ? 'The parcel goes to the name below. The invoice, and who owes the money, stay with the customer above.'
                    : `The parcel will be addressed to ${customerName.trim() || 'the customer above'}. Tick this if it is going to somebody else.`}
                </p>
                {sendToSomeoneElse && (
                  <label className="flex flex-col gap-1.5 mt-3">
                    <span className={LABEL_CLASS}>Name on the parcel</span>
                    <input
                      type="text"
                      value={shippingRecipient}
                      onChange={(e) => setShippingRecipient(e.target.value)}
                      placeholder="Who is receiving it"
                      className={INPUT_CLASS}
                    />
                    <span className="text-[10px] text-stone-500">
                      This is the name Royal Mail prints. Put it here, never in the address lines.
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}
        </div>
    </>
  );
}
