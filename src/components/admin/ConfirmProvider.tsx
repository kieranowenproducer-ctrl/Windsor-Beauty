'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useDialog } from '@/components/useDialog';

/**
 * The admin's "are you sure?" question, asked on the page instead of by the browser.
 *
 * WHY IT EXISTS. Every one of these used to be window.confirm(). Visually that is a grey box at
 * the top of the screen, which is ugly but works on a laptop. On an iPhone, inside an in-app
 * browser (the admin opened from a link in Mail, WhatsApp or Instagram), the box frequently never
 * appears at all. window.confirm() then returns false, or never returns, and the button the person
 * pressed simply does nothing. Kieran reported exactly that twice: once on the order delete button
 * and once on "send this email to another customer". Both were working. Neither could be used.
 *
 * So the question is now part of the page. It always appears, it reads in plain words, and it
 * cannot be swallowed by a browser that has decided not to show native dialogs.
 *
 * It is promise-based on purpose, so converting a call site stays a one-line change and the
 * control flow around it does not move:
 *
 *     if (!window.confirm('Delete this?')) return;        // before
 *     if (!(await confirm({ title: 'Delete this?' }))) return;   // after
 */

export type ConfirmOptions = {
  /** The question itself, short. Shown as the heading. */
  title: string;
  /** What will happen, in plain words. Blank lines start a new paragraph. */
  body?: string;
  /** The button that goes ahead. Say what it does, never just "OK". */
  confirmLabel?: string;
  /** The button that backs out. */
  cancelLabel?: string;
  /** 'danger' for anything that destroys or cannot be undone. */
  tone?: 'danger' | 'normal';
};

type Pending = ConfirmOptions & { resolve: (answer: boolean) => void };

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Ask the question and wait for the answer.
 *
 * Outside the provider it falls back to window.confirm rather than throwing: a screen that has
 * not been wrapped yet keeps working exactly as it did, instead of breaking on the button press.
 */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  return useMemo(
    () =>
      ctx ??
      (async (options: ConfirmOptions) => {
        if (typeof window === 'undefined') return false;
        const text = [options.title, options.body].filter(Boolean).join('\n\n');
        return window.confirm(text);
      }),
    [ctx],
  );
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // Held in a ref as well, so answering cannot resolve a question that has already been answered.
  const openRef = useRef<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        const next: Pending = { ...options, resolve };
        openRef.current = next;
        setPending(next);
      }),
    [],
  );

  const answer = useCallback((value: boolean) => {
    const open = openRef.current;
    openRef.current = null;
    setPending(null);
    open?.resolve(value);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && <ConfirmDialog pending={pending} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ pending, onAnswer }: { pending: Pending; onAnswer: (value: boolean) => void }) {
  // Escape backs out, which matches the Cancel button rather than the destructive one.
  const dialog = useDialog({ open: true, onClose: () => onAnswer(false), labelledBy: 'confirm-title' });
  const danger = pending.tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-stone-900/40 px-4 py-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onAnswer(false); }}
    >
      <div
        {...dialog}
        className="w-full max-w-md bg-white border border-stone-200 shadow-xl px-5 py-5 sm:px-6 sm:py-6 outline-none"
      >
        <h2 id="confirm-title" className="font-serif text-lg text-stone-800 leading-snug">
          {pending.title}
        </h2>

        {pending.body
          ? pending.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="text-[11px] text-stone-600 leading-relaxed mt-3 whitespace-pre-line">
                {para}
              </p>
            ))
          : null}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => onAnswer(false)}
            className="text-[9px] tracking-[0.15em] uppercase text-stone-500 border border-stone-200 px-4 py-2.5 hover:text-stone-700 hover:border-stone-300 transition-colors"
          >
            {pending.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            /* Deliberately NOT autofocused. Cancel comes first in the markup, so the dialog
               helper lands focus there: pressing Enter out of habit backs out, it never deletes. */
            onClick={() => onAnswer(true)}
            className={
              'text-[9px] tracking-[0.15em] uppercase text-white px-4 py-2.5 transition-colors ' +
              (danger ? 'bg-red-600 hover:bg-red-700' : 'bg-stone-800 hover:bg-stone-900')
            }
          >
            {pending.confirmLabel || 'Yes, go ahead'}
          </button>
        </div>
      </div>
    </div>
  );
}
