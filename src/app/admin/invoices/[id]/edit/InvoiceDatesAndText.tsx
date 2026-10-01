'use client';

import { INPUT_CLASS, LABEL_CLASS } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  invoiceNumber: string;
  setInvoiceNumber: (value: string) => void;
  invoiceDate: string;
  setInvoiceDate: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  subject: string;
  setSubject: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  footerText: string;
  setFooterText: (value: string) => void;
  internalNotes: string;
  setInternalNotes: (value: string) => void;
  customerNotes: string;
  setCustomerNotes: (value: string) => void;
}

export default function InvoiceDatesAndText({
  invoiceNumber, setInvoiceNumber, invoiceDate, setInvoiceDate, dueDate, setDueDate,
  subject, setSubject, message, setMessage, footerText, setFooterText,
  internalNotes, setInternalNotes, customerNotes, setCustomerNotes,
}: Props) {
  return (
    <>
        {/* Dates + text */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Invoice Number</span>
              <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={`${INPUT_CLASS} font-mono`} />
            </label>
            <div />
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Invoice Date</span>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={INPUT_CLASS} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Due Date (optional)</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT_CLASS} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 mb-4">
            <span className={LABEL_CLASS}>Subject / Header Text</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Wholesale order — June restock" className={INPUT_CLASS} />
          </label>
          <label className="flex flex-col gap-1.5 mb-4">
            <span className={LABEL_CLASS}>Message to Customer</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className={`${INPUT_CLASS} resize-y`} />
          </label>
          <label className="flex flex-col gap-1.5 mb-4">
            <span className={LABEL_CLASS}>Footer / Disclaimer Text</span>
            <input type="text" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="All products are supplied strictly for research purposes only. Not for human use." className={INPUT_CLASS} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Internal Admin Notes (not shown to customer)</span>
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} className={`${INPUT_CLASS} resize-y`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Customer-Facing Notes</span>
              <textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} className={`${INPUT_CLASS} resize-y`} />
            </label>
          </div>
        </div>
    </>
  );
}
