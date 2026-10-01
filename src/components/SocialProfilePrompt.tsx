'use client';

import { useId } from 'react';
import { useDialog } from './useDialog';

export default function SocialProfilePrompt({
  open,
  busy,
  onAdd,
  onContinue,
}: {
  open: boolean;
  busy: boolean;
  onAdd: () => void;
  onContinue: () => void;
}) {
  const titleId = useId();
  const dialog = useDialog({ open, onClose: busy ? undefined : onContinue, labelledBy: titleId });
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/55 px-4 py-8">
      <div {...dialog} className="w-full max-w-sm border-t-[3px] border-gold-500 bg-white px-6 py-7 shadow-2xl">
        <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-gold-700">One more thing</p>
        <h2 id={titleId} className="mt-2 font-serif text-[26px] leading-tight text-stone-800">
          Hear about our social offers
        </h2>
        <p className="mt-3 text-[13px] leading-relaxed text-stone-600">
          We sometimes run exclusive Instagram and Facebook offers. Would you like to add a profile
          so we can reach you there?
        </p>
        <button type="button" onClick={onAdd} disabled={busy}
          className="mt-5 block w-full bg-gold-700 px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.17em] text-white hover:bg-gold-800 disabled:opacity-60">
          Add my profiles
        </button>
        <button type="button" onClick={onContinue} disabled={busy}
          className="mt-3 block w-full px-2 py-2 text-center text-[11px] text-stone-500 underline underline-offset-[3px] hover:text-stone-700 disabled:opacity-60">
          Continue without them
        </button>
      </div>
    </div>
  );
}
