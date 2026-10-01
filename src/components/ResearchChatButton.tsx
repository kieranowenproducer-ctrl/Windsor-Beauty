'use client';

// The Open PEARL button. The legacy component name remains for compatibility.
//
// The Concierge no longer answers questions about dosage or detailed research.
// Windsor Glow runs PEARL separately for those, and when the assistant
// redirects one, this button is what carries the customer there.
//
// ONE COMPONENT, BOTH SURFACES, so the storefront widget and the signed-in
// concierge cannot drift apart in how the redirect looks or behaves.
//
// TWO BEHAVIOURS, and the difference matters:
//
//   onOpen given     PEARL is a TAB on the page we are already on
//                    (the signed-in /concierge desk). The button switches to it
//                    in place, so the conversation behind it is not thrown away
//                    by a page load. Rendered as a <button>, because it is one.
//
//   onOpen absent    the storefront widget, where PEARL is a real
//                    destination. Rendered as an <a> to the URL the service
//                    supplied, so it right-clicks, middle-clicks and opens in a
//                    new tab like any other link.
//
// THE URL IS NEVER BUILT HERE. It arrives from the concierge service, which
// reads it from the Windsor Glow tenant config. If the service sends nothing,
// this component renders nothing: no button is the correct outcome when there
// is no destination, and it is what makes a dead link impossible rather than
// merely unlikely.
//
// CARRYING THE QUESTION (2026-08-05). The customer used to arrive at the
// PEARL and have to type their question out for a second time. It now
// travels with them, by whichever route the button is taking:
//
//   in memory        the tab case. The question is handed straight to the
//                    sibling desk as an argument. It never touches storage
//                    and never touches the address bar.
//   session storage  the link case, where this page is about to be replaced.
//                    Same-origin, same tab, read once and then deleted.
//
// Either way the question is only PLACED IN THE BOX. Nothing is submitted, and
// PEARL's "I understand" screen still has to be passed first.

import { stashResearchQuestion } from '@/lib/concierge/handoff';

export interface ResearchChatTarget {
  url: string;
  label: string;
}

export default function ResearchChatButton({
  target,
  question,
  onOpen,
}: {
  target: ResearchChatTarget | null | undefined;
  /* The customer's own words, exactly as they typed them, from the turn this
     button belongs to. Absent is fine and simply means an empty box. */
  question?: string | null;
  onOpen?: (question?: string | null) => void;
}) {
  if (!target?.url) return null;
  // The hosted Concierge may retain the legacy label until its next separate
  // release. The customer-facing Windsor Glow name is PEARL from this build.
  const label = /research chat/i.test(target.label || '') ? 'Open PEARL' : target.label || 'Open PEARL';

  // Full width on a phone so it is easy to hit, shrink-to-fit from `sm` up.
  // min-h-[44px] is the touch target floor; the padding alone does not reach it
  // at this font size.
  const styles =
    'mt-3 inline-flex w-full sm:w-auto min-h-[44px] items-center justify-center gap-2 '
    + 'bg-gold-700 px-6 py-3 text-[10px] uppercase tracking-[0.22em] text-white '
    + 'shadow-lg shadow-black/15 ring-1 ring-black/5 transition-colors '
    + 'hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 '
    + 'focus-visible:ring-gold-500 focus-visible:ring-offset-2';

  const inner = (
    <>
      <span>{label}</span>
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </>
  );

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(question)} className={styles}>
        {inner}
      </button>
    );
  }

  // Same tab: PEARL is a Windsor Glow page, not somewhere else, so
  // opening a new tab would be the odd choice here.
  //
  // The question is put aside on the click, before the browser follows the
  // link. onClick still runs first for a middle-click or a new-tab open, and
  // browsers copy session storage into a tab opened that way, so the question
  // arrives on those routes too.
  return (
    <a href={target.url} onClick={() => stashResearchQuestion(question)} className={styles}>
      {inner}
    </a>
  );
}
