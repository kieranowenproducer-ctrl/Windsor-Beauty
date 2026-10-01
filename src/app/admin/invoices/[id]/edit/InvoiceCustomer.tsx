'use client';

import { CUSTOMER_SOURCE_LABEL, INPUT_CLASS, LABEL_CLASS, type CustomerMatch } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  customerName: string;
  setCustomerName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  companyName: string;
  setCompanyName: (value: string) => void;
  customerSearch: string;
  setCustomerSearch: (value: string) => void;
  customerResults: CustomerMatch[];
  customerSearching: boolean;
  customerSearchOpen: boolean;
  setCustomerSearchOpen: (value: boolean) => void;
  applyCustomer: (c: CustomerMatch) => void;
}

export default function InvoiceCustomer({
  customerName, setCustomerName, email, setEmail, phone, setPhone,
  companyName, setCompanyName, customerSearch, setCustomerSearch,
  customerResults, customerSearching, customerSearchOpen, setCustomerSearchOpen, applyCustomer,
}: Props) {
  return (
    <>
        {/* Customer / company */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-1">Customer</h2>

          {/* Look up an existing member or past customer and prefill the fields
              below. Searches name, email, phone, postcode or company. */}
          <div className="relative mb-5">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Search for a customer</span>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                onFocus={() => { if (customerResults.length) setCustomerSearchOpen(true); }}
                placeholder="Name, email, phone, postcode or company"
                autoComplete="off"
                className={INPUT_CLASS}
              />
            </label>
            <p className="text-[10px] text-stone-500 mt-1">
              Pick an existing member or someone who has ordered or been invoiced before to fill in their details automatically.
            </p>
            {customerSearchOpen && customerSearch.trim().length >= 2 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-stone-200 shadow-lg max-h-72 overflow-y-auto">
                {customerSearching && (
                  <p className="px-3 py-2.5 text-xs text-stone-500">Searching…</p>
                )}
                {!customerSearching && customerResults.length === 0 && (
                  <p className="px-3 py-2.5 text-xs text-stone-500">No matching customer found. Type the details in below.</p>
                )}
                {customerResults.map((c, i) => (
                  <button
                    key={`${c.email}-${i}`}
                    type="button"
                    onClick={() => applyCustomer(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-100 last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-stone-800 truncate">{c.name || c.email}</span>
                      <span className="text-[9px] tracking-[0.1em] uppercase text-gold-700 shrink-0">{CUSTOMER_SOURCE_LABEL[c.source]}</span>
                    </div>
                    <p className="text-[11px] text-stone-500 truncate">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ''}
                      {c.postcode ? ` · ${c.postcode}` : ''}
                      {c.company ? ` · ${c.company}` : ''}
                    </p>
                    {/* Where the address came from, said out loud. All we hold for some people is
                        where a past parcel went, and a delivery address can be a one-off — so it
                        fills in the delivery section, never the billing one (task 77b818aa). */}
                    {(c.line1 || c.postcode) && !c.billingAddressIsReal && (
                      <p className="text-[10px] text-amber-700 mt-0.5">
                        Only a past delivery address on file. It fills in the delivery section, not the billing address.
                      </p>
                    )}
                  </button>
                ))}
                {customerResults.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setCustomerSearchOpen(false); setCustomerSearch(''); }}
                    className="w-full text-left px-3 py-2 text-[10px] tracking-[0.15em] uppercase text-stone-500 hover:text-stone-600"
                  >
                    Close
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Customer Name</span>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={INPUT_CLASS} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLASS} required />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Phone (optional)</span>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Company / Wholesale Name (optional)</span>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
        </div>
    </>
  );
}
