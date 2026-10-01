'use client';

import { useEffect, useRef, useState } from 'react';
import { ADMIN_SENDER_OPTIONS, type AdminSenderKey } from '@/lib/email/adminSenders';
import { useOverflowLock } from '@/components/viewportOwner';
import { useVisualViewport } from '@/components/useVisualViewport';

// The "send a message" dialog behind every clickable customer email address
// (task bc9b6309), pulled out of CustomerEmailButton so the customer page
// can also open it on a saved draft (task 72260d57).
//
// It is CONTROLLED on purpose: subject/message/sender live in whoever opened
// it, so closing by accident never loses what was typed — the behaviour the
// button always had.
//
// Three iPhone lessons are baked into the dialog:
//   - The page behind is locked while it is open (shared overflow lock,
//     task 5bc92178's fix) — before this, a swipe scrolled the DASHBOARD
//     while the dialog sat still.
//   - Its height cap uses svh (the visible screen with Safari's toolbars
//     showing). 92vh counts the toolbar space too, so the dialog was taller
//     than the screen, its own scrollbar never engaged, and the Send button
//     sat out of reach below the fold. The vh class stays as the fallback
//     for browsers without svh.
//   - THE ONE THAT WAS STILL WRONG (task 43f558e8): svh does not shrink when
//     the keyboard opens. With the keyboard up the box was still taller than
//     the visible strip, so Safari panned the page and the Send button sat
//     under the keyboard — worse the longer the message, and fine in landscape
//     purely because a shorter box happened to fit. The box is now sized to
//     the VISUAL viewport and laid out as a flex column: header, a body that
//     is the only thing that scrolls, and a button bar that is always the last
//     thing on the visible screen. On a phone it sits at the top of that strip
//     rather than centred, so opening the keyboard cannot push it half out of
//     view. svh stays as the fallback where the API is missing.

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; from: string }
  | { kind: 'failed'; error: string };

interface Props {
  email: string;
  customerName?: string | null;
  sender: AdminSenderKey;
  setSender: (v: AdminSenderKey) => void;
  subject: string;
  setSubject: (v: string) => void;
  message: string;
  setMessage: (v: string) => void;
  /** Set once a draft exists; further saves update it, a send clears it. */
  draftId: number | null;
  setDraftId: (v: number | null) => void;
  onClose: () => void;
  /** Fired after a successful send or draft save, so a page showing Email History can refresh it. */
  onChanged?: () => void;
  /**
   * When supplied, WHO it goes to becomes editable (task ce308493).
   *
   * Kieran, 19 September 2026: "we should be able to edit, copy, delete, do whatever to that email
   * and use it for another member." That is this: an answer written once for one person, opened,
   * changed if it needs changing, and sent to the next person who asks the same question. Without
   * it the composer can only ever write to the customer whose page it is on.
   */
  setEmail?: (v: string) => void;
  /** A line at the top explaining where the wording came from, when it was reused from an old email. */
  reusedFrom?: string | null;
}

export default function CustomerEmailComposer(props: Props) {
  const { email, customerName, sender, setSender, subject, setSubject, message, setMessage, draftId, setDraftId, onClose, onChanged, setEmail, reusedFrom } = props;
  const [state, setState] = useState<SendState>({ kind: 'idle' });
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const subjectRef = useRef<HTMLInputElement>(null);

  useOverflowLock(true, 'customer-email-composer');

  // Sized to what can actually be seen, so the button bar is never under the
  // keyboard. Null height means the browser has no visual viewport API and the
  // svh fallback below does the work instead.
  const screen = useVisualViewport();
  const overlayStyle =
    screen.height !== null ? { top: screen.offsetTop, height: screen.height } : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Straight into the subject box, because the address is already decided by what was clicked.
    subjectRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bind once for the dialog's lifetime.
  }, []);

  async function send() {
    if (state.kind === 'sending') return;
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/admin/customer-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, customerName, subject, message, sender }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState({ kind: 'failed', error: data?.error || 'The message could not be sent.' });
        return;
      }
      setState({ kind: 'sent', from: data?.from || '' });
      setSubject('');
      setMessage('');
      // The send itself is recorded under the customer by the message route;
      // the draft has served its purpose. Best effort — a leftover draft is
      // visible and deletable, never harmful.
      if (draftId) {
        fetch(`/api/admin/customer-drafts?id=${draftId}`, { method: 'DELETE' }).catch(() => {});
        setDraftId(null);
      }
      onChanged?.();
    } catch {
      setState({ kind: 'failed', error: 'No connection to the site, so nothing was sent.' });
    }
  }

  async function saveDraft() {
    if (draftState === 'saving') return;
    setDraftState('saving');
    try {
      const res = await fetch('/api/admin/customer-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, to: email, sender, subject, message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setDraftState('failed');
        setState({ kind: 'failed', error: data?.error || 'The draft could not be saved.' });
        return;
      }
      if (Number.isInteger(data?.id)) setDraftId(Number(data.id));
      setDraftState('saved');
      if (state.kind === 'failed') setState({ kind: 'idle' });
      onChanged?.();
    } catch {
      setDraftState('failed');
      setState({ kind: 'failed', error: 'No connection to the site, so the draft was not saved.' });
    }
  }

  const chosen = ADMIN_SENDER_OPTIONS.find((s) => s.key === sender) ?? ADMIN_SENDER_OPTIONS[0];
  const canSend = subject.trim().length > 0 && message.trim().length > 0 && state.kind !== 'sending';
  const canSaveDraft = (subject.trim().length > 0 || message.trim().length > 0) && draftState !== 'saving' && state.kind !== 'sending';

  return (
    <div
      className="fixed left-0 right-0 top-0 h-[100svh] z-[300] flex items-start sm:items-center justify-center p-2 sm:p-4"
      style={overlayStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Send a message to ${customerName || email}`}
        className="relative bg-white w-full max-w-lg max-h-full flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="shrink-0 bg-white border-b border-gold-100 px-5 py-3 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.3em] uppercase text-gold-650 font-bold">
              {setEmail ? 'Edit and send' : 'Send a message'}
            </p>
            {setEmail ? (
              <p className="text-[11px] text-stone-500">Change anything below, then choose who it goes to.</p>
            ) : (
              <>
                <p className="font-serif text-base text-stone-700 truncate">{customerName || email}</p>
                {customerName && <p className="text-[11px] text-stone-500 truncate">{email}</p>}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the message box"
            className="text-stone-500 hover:text-stone-700 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* The only thing that scrolls. min-h-0 is what lets a flex child
            shrink below its content and actually take the scrollbar. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {/* Where the wording came from, when an old email is being reused (task ce308493). */}
          {reusedFrom && (
            <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-200 px-3 py-2">
              Started from the email &ldquo;{reusedFrom}&rdquo;. The original is untouched; this sends a new one.
            </p>
          )}

          {/* WHO IT GOES TO, editable only when the parent asked for that. On a customer's own page
              it stays a fixed line, because typing an address there would be a way to send somebody
              else's mail from the wrong person's record. */}
          {setEmail && (
            <div>
              <label htmlFor="wb-msg-to" className="block text-[10px] tracking-[0.18em] uppercase text-stone-500 mb-1">
                Send it to
              </label>
              <input
                id="wb-msg-to"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="their@email.com"
                className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-700 focus:border-gold-700 outline-none bg-white"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Put another member&rsquo;s address here to reuse this answer for them. A copy is saved under
                whoever it goes to.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="wb-msg-sender" className="block text-[10px] tracking-[0.18em] uppercase text-stone-500 mb-1">
              Send it from
            </label>
            <select
              id="wb-msg-sender"
              value={sender}
              onChange={(e) => setSender(e.target.value as AdminSenderKey)}
              className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-700 focus:border-gold-700 outline-none bg-white"
            >
              {ADMIN_SENDER_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({option.address})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-stone-500 mt-1">{chosen.hint}</p>
          </div>

          <div>
            <label htmlFor="wb-msg-subject" className="block text-[10px] tracking-[0.18em] uppercase text-stone-500 mb-1">
              Subject
            </label>
            <input
              id="wb-msg-subject"
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder="About your order"
              className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-700 focus:border-gold-700 outline-none"
            />
          </div>

          <div>
            <label htmlFor="wb-msg-body" className="block text-[10px] tracking-[0.18em] uppercase text-stone-500 mb-1">
              Message
            </label>
            <textarea
              id="wb-msg-body"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              maxLength={8000}
              placeholder={`Hello${customerName ? ` ${customerName.split(' ')[0]}` : ''}, just to let you know...`}
              className="w-full border border-stone-300 px-3 py-2 text-sm text-stone-700 focus:border-gold-700 outline-none resize-y"
            />
            <p className="text-[11px] text-stone-500 mt-1">
              Type it as you would say it. Your line breaks are kept, and it goes out in the
              usual Windsor Beauty email design.
            </p>
          </div>

          {state.kind === 'sent' && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2">
              Sent to {email}{state.from ? ` from ${state.from}` : ''}.
            </p>
          )}
          {draftState === 'saved' && state.kind !== 'sent' && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 px-3 py-2">
              Draft saved under {customerName || email}. It is in their Email History whenever you want it - edit it, send it, or discard it.
            </p>
          )}
          {state.kind === 'failed' && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">
              {state.error}
            </p>
          )}
        </div>

        <div className="shrink-0 bg-white border-t border-stone-200 px-5 py-3 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={saveDraft}
            disabled={!canSaveDraft}
            className="mr-auto border border-stone-300 text-stone-600 text-[10px] tracking-[0.18em] uppercase px-4 py-2.5 hover:border-gold-400 hover:text-gold-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {draftState === 'saving' ? 'Saving' : draftId ? 'Save draft again' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs tracking-[0.18em] uppercase text-stone-500 hover:text-stone-800 transition-colors"
          >
            {state.kind === 'sent' ? 'Close' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 py-2.5 hover:bg-gold-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {state.kind === 'sending' ? 'Sending' : 'Send message'}
          </button>
        </div>
      </div>
    </div>
  );
}
