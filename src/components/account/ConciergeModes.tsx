'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import ConciergeChat from '@/components/account/ConciergeChat';
import { sanitiseHandoffQuestion, type ResearchHandoff } from '@/lib/concierge/handoff';

type Mode = 'concierge' | 'research';

const ResearchDesk = dynamic(() => import('@/components/account/ResearchDesk'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-stone-200 bg-white px-6 py-10 text-center text-sm text-stone-500 shadow-sm"
    >
      Opening the research library…
    </div>
  ),
});

/**
 * Which tab the address bar is asking for.
 *
 * Added 2026-08-05. The Concierge now redirects dosage and detailed research
 * questions here, and the button it shows points at /concierge?mode=research.
 * Without this the link would land the customer back on the Concierge tab,
 * which is where they just were: a link that appears to work and does nothing,
 * which is worse than no link at all.
 *
 * Read from window rather than useSearchParams so this component does not drag
 * a Suspense boundary onto the page for one query string.
 */
function modeFromUrl(): Mode {
  if (typeof window === 'undefined') return 'concierge';
  const asked = new URLSearchParams(window.location.search).get('mode');
  return asked === 'research' ? 'research' : 'concierge';
}

export default function ConciergeModes({
  firstName,
  adminPreview = false,
}: {
  firstName: string | null;
  adminPreview?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('concierge');
  const [researchOpened, setResearchOpened] = useState(false);

  // After hydration, not during: the server render has no query string, so
  // reading it in the initial state would mismatch and React would warn.
  useEffect(() => {
    const initialMode = modeFromUrl();
    setMode(initialMode);
    if (initialMode === 'research') setResearchOpened(true);
  }, []);

  // A tab click updates the address without a navigation, so the two never
  // disagree and the customer can share or reload the desk they are on.
  //
  // Only the tab name goes in the address. The question does not: see the note
  // at the top of lib/concierge/handoff.ts for why.
  const choose = useCallback((next: Mode) => {
    // Do not mount or download PEARL until it is requested. Once opened, keep
    // it mounted while hidden so its consent state and conversation survive
    // switching back to the Concierge.
    if (next === 'research') setResearchOpened(true);
    setMode(next);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (next === 'research') url.searchParams.set('mode', 'research');
    else url.searchParams.delete('mode');
    window.history.replaceState(null, '', url.toString());
  }, []);

  /* The question the Concierge redirected, on its way to PEARL.
     Held in memory for the length of this page view and nowhere else. */
  const [handoff, setHandoff] = useState<ResearchHandoff | null>(null);
  const handoffCount = useRef(0);

  // What the Open PEARL button does on this page: switch desks, and
  // bring the question along. A rising number rather than the text alone, so
  // asking the same thing twice still counts as two separate handovers.
  const openResearch = useCallback(
    (question?: string | null) => {
      const text = sanitiseHandoffQuestion(question);
      if (text) {
        handoffCount.current += 1;
        setHandoff({ text, key: handoffCount.current });
      }
      choose('research');
    },
    [choose],
  );

  return (
    <div>
      <div
        className="mx-auto mb-7 grid w-full max-w-xl rounded-xl border border-stone-200 bg-stone-100 p-1 sm:grid-cols-2"
        role="group"
        aria-label="Choose an assistant mode"
      >
        <button
          type="button"
          aria-controls="concierge-mode-panel"
          aria-pressed={mode === 'concierge'}
          onClick={() => choose('concierge')}
          className={`rounded-lg px-5 py-3 text-left transition-colors ${
            mode === 'concierge' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <strong className="block text-xs font-semibold">Concierge</strong>
          <span className="mt-0.5 block text-[10px]">Orders, products and website help</span>
        </button>
        <button
          type="button"
          aria-controls="research-mode-panel"
          aria-pressed={mode === 'research'}
          onClick={() => choose('research')}
          className={`rounded-lg px-5 py-3 text-left transition-colors ${
            mode === 'research' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <strong className="block text-xs font-semibold">PEARL</strong>
          <span className="mt-0.5 block text-[10px]">Compounds, categories and evidence</span>
        </button>
      </div>

      {/* The Concierge is always mounted. PEARL mounts on first use, then stays
          mounted while hidden so neither conversation is lost. */}
      <section id="concierge-mode-panel" aria-label="Concierge" hidden={mode !== 'concierge'} className="mx-auto max-w-3xl">
        {/* The Concierge redirects dosage and detailed research questions to
            PEARL. Here that desk is the sibling tab, so the button
            switches to it rather than reloading the page and losing both
            conversations. */}
        <ConciergeChat firstName={firstName} onOpenResearch={openResearch} />
      </section>

      <section
        id="research-mode-panel"
        aria-label="PEARL"
        hidden={mode !== 'research'}
        className="mx-auto max-w-3xl"
      >
        {researchOpened ? <ResearchDesk handoff={handoff} adminPreview={adminPreview} /> : null}
      </section>
    </div>
  );
}
