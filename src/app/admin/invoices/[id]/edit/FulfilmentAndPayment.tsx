'use client';

import {
  FULFILMENT_TYPE_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  SELECT_CLASS,
  LABEL_CLASS,
  type FulfilmentType,
  type PaymentMethod,
  type AutomationFlags,
} from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  fulfilmentType: FulfilmentType;
  handleFulfilmentTypeChange: (value: FulfilmentType) => void;
  intendedPaymentMethod: PaymentMethod;
  setIntendedPaymentMethod: (value: PaymentMethod) => void;
  automationFlags: AutomationFlags;
  setAutomationFlags: (update: (prev: AutomationFlags) => AutomationFlags) => void;
}

export default function FulfilmentAndPayment({
  fulfilmentType, handleFulfilmentTypeChange,
  intendedPaymentMethod, setIntendedPaymentMethod,
  automationFlags, setAutomationFlags,
}: Props) {
  return (
    <>
        {/* Fulfilment & Payment */}
        <div className="bg-white border border-stone-200 p-6 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-1">Fulfilment &amp; Payment</h2>
          <p className="text-xs text-stone-500 mb-4 leading-relaxed">
            Controls how this invoice is paid and delivered, and which automations run. Defaults reproduce a normal
            online order (Royal Mail, all automations on) - change these for an in-person/cash/collection sale.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Payment Method</span>
              <select value={intendedPaymentMethod} onChange={(e) => setIntendedPaymentMethod(e.target.value as PaymentMethod)} className={SELECT_CLASS}>
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={LABEL_CLASS}>Fulfilment Type</span>
              <select value={fulfilmentType} onChange={(e) => handleFulfilmentTypeChange(e.target.value as FulfilmentType)} className={SELECT_CLASS}>
                {FULFILMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={automationFlags.sendPaymentLink} onChange={(e) => setAutomationFlags((prev) => ({ ...prev, sendPaymentLink: e.target.checked }))} className="accent-gold-500" />
              <span className={LABEL_CLASS}>Send payment link/email</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={automationFlags.sendConfirmation} onChange={(e) => setAutomationFlags((prev) => ({ ...prev, sendConfirmation: e.target.checked }))} className="accent-gold-500" />
              <span className={LABEL_CLASS}>Send customer order confirmation</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={automationFlags.triggerRoyalMail} onChange={(e) => setAutomationFlags((prev) => ({ ...prev, triggerRoyalMail: e.target.checked }))} className="accent-gold-500" />
              <span className={LABEL_CLASS}>Trigger Royal Mail dispatch</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={automationFlags.sendDispatchEmail} onChange={(e) => setAutomationFlags((prev) => ({ ...prev, sendDispatchEmail: e.target.checked }))} className="accent-gold-500" />
              <span className={LABEL_CLASS}>Send dispatch/tracking email</span>
            </label>
          </div>
        </div>
    </>
  );
}
