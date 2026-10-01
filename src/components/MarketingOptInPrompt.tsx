'use client';

import { useId } from 'react';
import { useDialog } from './useDialog';

/**
 * ONE LAST ASK BEFORE A NEW MEMBER GOES WITHOUT THE OFFERS.
 *
 * Kieran's request, 7 September 2026. The marketing box on the sign-up form is small grey text
 * sitting between the password fields and the compulsory confirmations, so most people tick what
 * they have to tick and never read it. They are not refusing the offers. They are missing them.
 *
 * So when somebody submits with the box unticked, this asks once. Whichever they choose, the
 * account is created and they carry on, and it is never shown to the same person twice.
 *
 * WHY THE DECLINE IS WORDED THE WAY IT IS, because it will look odd to whoever reads this next.
 * "No thanks, I will pay full price" is deliberate: it makes the customer feel what she is
 * turning down. An earlier draft had her decline by saying "I do not wish to save money", which
 * is the pattern the ICO and the CMA call confirmshaming in their work on harmful online design.
 * The problem with that version is not manners, it is that UK consent has to be FREELY GIVEN, and
 * consent squeezed out under that kind of pressure may not count at all, which would leave Kieran
 * with a mailing list he could not rely on. "I will pay full price" is simply true. It describes
 * what happens next rather than asking her to recite something about herself, and it stings just
 * as much. Do not sharpen it further without understanding that trade.
 *
 * Three rules this must keep, for the same reason:
 *   1. Declining always works, first press, no second ask.
 *   2. The account is created either way. This never blocks anybody from joining.
 *   3. It appears once. A pop-up that keeps coming back is the thing that turns a fair nudge into
 *      the pattern regulators actually act on.
 */
export default function MarketingOptInPrompt({
  open,
  onOptIn,
  onDecline,
  busy,
}: {
  open: boolean;
  /** They said yes. Tick the box and create the account. */
  onOptIn: () => void;
  /** They said no. Create the account exactly as it was. */
  onDecline: () => void;
  /** The account is being created, so neither answer can be pressed twice. */
  busy: boolean;
}) {
  const titleId = useId();
  // Escape is deliberately wired to DECLINE rather than to nothing. Pressing Escape is a person
  // saying no; treating it as "answer me again" would be the trap this must not become.
  const dialog = useDialog({ open, onClose: busy ? undefined : onDecline, labelledBy: titleId });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/55 px-4 py-8">
      <div
        {...dialog}
        className="w-full max-w-sm overflow-y-auto border-t-[3px] border-gold-500 bg-white shadow-2xl"
        style={{ maxHeight: 'calc(100vh - 4rem)' }}
      >
        <div className="px-6 pb-6 pt-7">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-gold-700">
            Before you go
          </p>
          <h2
            id={titleId}
            className="mt-2 font-serif text-[26px] leading-[1.12] tracking-tight text-stone-800"
          >
            You are about to miss the members&rsquo; prices
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-stone-600">
            You have not asked to hear from us, so we will not be able to send you any of this:
          </p>

          <ul className="mt-4 grid gap-2.5 border-l-2 border-gold-300 bg-gold-50 px-4 py-3.5">
            {[
              ['Discount codes', 'that are never shown on the website'],
              ['Money off', 'the products you already buy'],
              ['First look', 'at new stock and members’ offers'],
            ].map(([lead, rest]) => (
              <li key={lead} className="flex items-start gap-2.5 text-[12.5px] leading-snug text-stone-800">
                <span aria-hidden className="mt-px shrink-0 text-[13px] text-gold-500">
                  &#9670;
                </span>
                <span>
                  <strong className="font-semibold">{lead}</strong> {rest}
                </span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={onOptIn}
            disabled={busy}
            className="mt-5 block w-full bg-gold-700 px-4 py-3.5 text-[11px] font-bold uppercase tracking-[0.17em] text-white transition-colors hover:bg-gold-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 disabled:opacity-60"
          >
            {busy ? 'One moment…' : 'Yes, send me the offers'}
          </button>

          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="mt-3 block w-full px-2 py-2 text-center text-[11px] leading-relaxed text-stone-500 underline underline-offset-[3px] transition-colors hover:text-stone-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 disabled:opacity-60"
          >
            No thanks, I will pay full price and do not want special offers or discounts.
          </button>

          <p className="mt-3.5 text-center text-[10.5px] leading-snug text-stone-500">
            Choose how we contact you in your account at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
