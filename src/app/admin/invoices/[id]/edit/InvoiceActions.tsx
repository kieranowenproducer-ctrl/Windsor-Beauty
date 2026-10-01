'use client';

import type { InvoiceRow, AutomationFlags } from './invoiceEditTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  // Non-null: the page returns early on line 541 before this is ever rendered.
  invoice: InvoiceRow;
  automationFlags: AutomationFlags;
  handleSave: () => void;
  saving: boolean;
  handleSend: () => void;
  sending: boolean;
  saveMessage: string;
  saveError: string;
  /* Whether this draft is saving itself, and when it last did (task de561135). */
  autoSaveNotice: { text: string; bad: boolean } | null;
  sendResult: { ok: boolean; message: string } | null;
}

export default function InvoiceActions({
  invoice, automationFlags, handleSave, saving, handleSend, sending,
  saveMessage, saveError, sendResult, autoSaveNotice,
}: Props) {
  return (
    <>
        {/* Actions */}
        <div className="bg-white border border-stone-200 p-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || sending}
            className="bg-stone-800 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
            <button
              onClick={handleSend}
              disabled={sending || saving}
              className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-6 py-3 hover:bg-gold-800 transition-colors disabled:opacity-50"
            >
              {sending
                ? 'Sending…'
                : invoice.status === 'draft'
                  ? 'Send Invoice'
                  : automationFlags.sendPaymentLink
                    ? 'Resend Payment Link'
                    : 'Resend Invoice'}
            </button>
          )}
          {autoSaveNotice && (
            <p className={`text-xs ${autoSaveNotice.bad ? 'text-red-600' : 'text-stone-500'}`}>
              {autoSaveNotice.text}
            </p>
          )}
          {saveMessage && <p className="text-xs text-stone-600">{saveMessage}</p>}
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
          {sendResult && <p className={`text-xs ${sendResult.ok ? 'text-green-700' : 'text-red-600'}`}>{sendResult.message}</p>}
        </div>
    </>
  );
}
