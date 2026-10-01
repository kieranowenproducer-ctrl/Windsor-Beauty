'use client';

// The customer-facing concierge. One text box, one conversation, and nothing
// technical on screen: no token counters, no model names, no confidence
// scores. The customer sees a colleague who can look things up.
//
// Two deliberate choices worth knowing about:
//
//  - Model output is rendered as REACT ELEMENTS, never as HTML. There is no
//    dangerouslySetInnerHTML anywhere in this file, so no answer, however it
//    was produced or influenced, can inject markup into the page.
//  - Sources are a small expandable strip rather than footnotes in the prose,
//    so an answer stays readable and the provenance is still one tap away.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import VoiceMic, { type VoicePhase } from '@/components/VoiceMic';
import { Inlines, parseInline } from '@/components/AnswerMarkup';
import ResearchChatButton, { type ResearchChatTarget } from '@/components/ResearchChatButton';

interface Citation {
  label: string;
  url: string;
  kind: 'policy' | 'guide' | 'article' | 'product' | 'account' | 'live';
}

interface Turn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  escalate?: boolean;
  checkedLiveData?: boolean;
  failed?: boolean;
  /* Set when the service redirected a dosage or detailed research question to
     the separate PEARL research library. Drives the button under the
     answer; absent on every ordinary turn. */
  researchChat?: ResearchChatTarget | null;
  /* The question this answer was replying to, kept on the answer itself rather
     than found by walking back through the thread. When the redirect button
     carries the question to PEARL, it carries THIS, so a customer
     who has since typed something else into the box still hands over the
     question that was actually redirected. */
  askedQuestion?: string;
}

const SUGGESTIONS = [
  { label: 'Where is my order?', icon: 'truck' },
  { label: 'Is this product currently in stock?', icon: 'cube' },
  { label: 'How do I verify my product?', icon: 'shield' },
  { label: 'Where can I find the dosage research guide?', icon: 'book' },
  { label: 'What is your returns policy?', icon: 'returns' },
] as const;

const CONTACT = 'https://www.windsorglow.com/contact';

// One stroke icon per suggestion, same line weight as the rest of the account area.
function SuggestionIcon({ name }: { name: (typeof SUGGESTIONS)[number]['icon'] }) {
  const paths: Record<(typeof SUGGESTIONS)[number]['icon'], string> = {
    truck:
      'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375c-.621 0-1.125-.504-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.9 17.9 0 0 0-3.213-9.193 2.06 2.06 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.6 48.6 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
    cube: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9',
    shield:
      'M9 12.75 11.25 15 15 9.75m-3-7.036A11.96 11.96 0 0 1 3.598 6 12 12 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    book: 'M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.99 8.99 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.99 8.99 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25',
    returns: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
  };
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={paths[name]} />
    </svg>
  );
}

// The concierge's face in the thread: the same mark as the account entry card,
// so the customer meets one consistent identity from dashboard to conversation.
function ConciergeAvatar() {
  return (
    <div className="shrink-0 w-8 h-8 rounded-full bg-gold-100 text-gold-700 flex items-center justify-center" aria-hidden>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-3.4-.59L3 21l1.7-4.06A7.4 7.4 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Answer text rendering. The inline pieces (links made gold, underlined and
// clickable whatever shape the model wrote them in, bold, code) live in the
// shared AnswerMarkup module so this page and the public widget can never
// disagree about how a link looks. Only the block layout is kept here, on the
// account page's own type scale.
// ---------------------------------------------------------------------------

function AnswerBody({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const result: Array<{ type: 'p' | 'ul'; lines: string[] }> = [];
    for (const line of lines) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        const prev = result[result.length - 1];
        if (prev && prev.type === 'ul') prev.lines.push(bullet[1]);
        else result.push({ type: 'ul', lines: [bullet[1]] });
        continue;
      }
      if (!line.trim()) continue;
      result.push({ type: 'p', lines: [line.trim()] });
    }
    return result;
  }, [text]);

  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="space-y-1.5 pl-4">
            {b.lines.map((l, j) => (
              <li key={j} className="text-sm text-stone-700 leading-relaxed list-disc marker:text-gold-700">
                <Inlines parts={parseInline(l)} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-sm text-stone-700 leading-relaxed">
            <Inlines parts={parseInline(b.lines[0])} />
          </p>
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice input lives in the shared <VoiceMic /> component (the Social Engine's
// mic behaviour: live interim text, a real level meter, a timer, Escape to
// discard, and words kept even when the server transcription fails).
// ---------------------------------------------------------------------------

export default function ConciergeChat({
  firstName,
  onOpenResearch,
}: {
  firstName: string | null;
  /* Supplied by ConciergeModes, where PEARL is the sibling tab. It
     switches desks in place so this conversation is not lost to a page load,
     and carries the redirected question across so it does not have to be typed
     again. Absent means the button falls back to a plain link. */
  onOpenResearch?: (question?: string | null) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [openSources, setOpenSources] = useState<string | null>(null);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [interim, setInterim] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The send callback can finish after React has created a newer render. Keep
  // one current copy for the next message so a quick follow-up never reaches
  // the service with an older, incomplete conversation.
  const turnsRef = useRef<Turn[]>([]);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;
      setNotice(null);
      setDraft('');
      const userTurn: Turn = { id: `u${Date.now()}`, role: 'user', content: question };
      setTurns((t) => [...t, userTurn]);
      setBusy(true);
      try {
        const history = turnsRef.current.slice(-8).map((t) => ({ role: t.role, content: t.content }));
        const res = await fetch('/api/account/concierge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: question, history, conversationId }),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 401) {
          window.location.href = '/account/login';
          return;
        }
        if (!res.ok || !json?.ok) {
          setTurns((t) => [
            ...t,
            {
              id: `a${Date.now()}`,
              role: 'assistant',
              failed: true,
              content:
                json?.error ||
                `I could not get an answer just then. Please try again, or our [contact page](${CONTACT}) will reach a person.`,
            },
          ]);
          return;
        }
        if (json.conversationId) setConversationId(json.conversationId);
        setTurns((t) => [
          ...t,
          {
            id: `a${Date.now()}`,
            role: 'assistant',
            content: json.answer,
            citations: json.citations ?? [],
            escalate: json.escalate,
            checkedLiveData: json.checkedLiveData,
            researchChat: json.researchChat ?? null,
            askedQuestion: question,
          },
        ]);
        // PEARL questions should not stop at a refusal or make the customer
        // press a separate redirect button. Switch desks and carry their exact
        // words across. ResearchDesk still requires its acknowledgement and a
        // real press of Ask before it answers anything.
        if (json.researchChat && onOpenResearch) onOpenResearch(question);
      } catch {
        setTurns((t) => [
          ...t,
          {
            id: `a${Date.now()}`,
            role: 'assistant',
            failed: true,
            content: `I could not reach our system just then. Please check your connection and try again, or use our [contact page](${CONTACT}).`,
          },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, conversationId, onOpenResearch],
  );

  function reset() {
    setTurns([]);
    setConversationId(null);
    setOpenSources(null);
    setNotice(null);
    inputRef.current?.focus();
  }

  const empty = turns.length === 0;
  const listening = voicePhase === 'listening';
  // While listening, the box shows the live interim text so the person can see
  // the mic hearing them; their typed draft is never overwritten, only appended to.
  const shownDraft = listening && interim ? (draft ? `${draft} ${interim}` : interim) : draft;

  return (
    <div className="flex flex-col">
      {/* Conversation */}
      <div className="min-h-[16rem]">
        {empty ? (
          /* The Slideshow Studio's panel language (task 40e5bdf6): a generous radius,
             a clear stone border and its soft gold gradient, instead of the old
             square, pale-gold-on-white box that washed out on screen. */
          <div className="rounded-xl border border-stone-200 bg-gradient-to-br from-gold-50/70 via-white to-white shadow-sm px-5 py-7 sm:px-7">
            <div className="flex items-start gap-3">
              <ConciergeAvatar />
              <p className="text-sm text-stone-700 leading-relaxed pt-1">
                {firstName ? `Hello ${firstName}. ` : 'Hello. '}
                I can check where your order has got to, look up live prices and stock, explain our
                delivery and returns policies, point you to the right page, and find you an article to
                read. If I cannot help, I will pass it to a colleague.
              </p>
            </div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-stone-500 mt-7 mb-3">
              Try one of these
            </p>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => send(s.label)}
                  className="group flex items-center gap-3 rounded-lg border border-stone-200 bg-white shadow-sm text-sm text-stone-700 px-4 py-3 text-left hover:border-gold-500 hover:shadow-md hover:-translate-y-px transition-all"
                >
                  <span className="shrink-0 w-8 h-8 rounded-full bg-gold-50 text-gold-700 flex items-center justify-center group-hover:bg-gold-100 transition-colors">
                    <SuggestionIcon name={s.icon} />
                  </span>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5" role="log" aria-live="polite" aria-label="Conversation with the concierge">
            {turns.map((t) =>
              t.role === 'user' ? (
                <div key={t.id} className="flex justify-end">
                  <p className="max-w-[85%] rounded-lg bg-stone-800 text-white text-sm leading-relaxed px-4 py-3">
                    {t.content}
                  </p>
                </div>
              ) : (
                <div key={t.id} className="flex gap-3 max-w-[92%]">
                  <ConciergeAvatar />
                  <div
                    className={`flex-1 rounded-lg border px-4 py-3.5 ${
                      t.failed ? 'border-amber-300 bg-amber-50/60' : 'border-stone-200 bg-white shadow-sm'
                    }`}
                  >
                    <AnswerBody text={t.content} />

                    {/* The redirect, directly under the words that explain it,
                        and above the sources and escalation notes so it is the
                        first thing to act on rather than the last. The question
                        that was redirected travels with it. */}
                    <ResearchChatButton
                      target={t.researchChat}
                      question={t.askedQuestion}
                      onOpen={onOpenResearch}
                    />

                    {t.checkedLiveData && (
                      <p className="flex items-center gap-1.5 text-[10px] text-stone-500 mt-3">
                        <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-gold-700" />
                        Checked against live data just now
                      </p>
                    )}

                    {t.citations && t.citations.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setOpenSources(openSources === t.id ? null : t.id)}
                          aria-expanded={openSources === t.id}
                          className="text-[10px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-700 transition-colors py-2 -my-2"
                        >
                          {openSources === t.id ? 'Hide sources' : `Sources (${t.citations.length})`}
                        </button>
                        {openSources === t.id && (
                          <ul className="mt-2 space-y-1.5 rounded-md border border-stone-200 bg-gold-50/40 px-4 py-3">
                            {t.citations.map((c) => (
                              <li key={c.url}>
                                <a
                                  href={c.url}
                                  className="text-xs text-gold-700 underline underline-offset-2 decoration-gold-300 hover:decoration-gold-700"
                                >
                                  {c.label}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {t.escalate && (
                      <p className="text-xs text-stone-600 leading-relaxed mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
                        Would you rather a person looked at this?{' '}
                        <a href="/contact" className="text-gold-700 underline underline-offset-2">
                          Contact the team
                        </a>
                        .
                      </p>
                    )}
                  </div>
                </div>
              ),
            )}

            {busy && (
              /* Motion justification: during a lookup that can run 20+ seconds, the
                 animated dots are the only signal the concierge is still working. */
              <div className="flex gap-3 items-start" aria-live="polite">
                <ConciergeAvatar />
                <div className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white shadow-sm px-4 py-4">
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-gold-700 animate-bounce [animation-delay:-0.3s]" />
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-gold-700 animate-bounce [animation-delay:-0.15s]" />
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-gold-700 animate-bounce" />
                  <span className="sr-only">The concierge is looking that up</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {notice && (
        <p className="text-xs text-stone-500 mt-4 rounded-md border border-stone-200 px-3 py-2" role="status">
          {notice}
        </p>
      )}

      {/* Composer */}
      <form
        /* Not pinned to the screen: Kieran asked for the typing box to scroll
           with the page like everything else (4 Aug). */
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <label htmlFor="concierge-input" className="sr-only">
          Ask the Windsor Glow concierge a question
        </label>
        {/* The one focus indicator for typing lives on THIS box (gold border +
            ring via focus-within), because the global :focus-visible outline
            drew a second rectangle inside it every time the field was clicked
            — browsers count text boxes as keyboard-focused even on a click.
            Warm gold-tinted fill to match the welcome panel above. */}
        <div
          className={`flex items-end gap-2 rounded-lg border bg-gold-50/60 shadow-sm transition-colors px-3 py-2 ${
            listening ? 'border-red-200' : 'border-stone-400 focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-500'
          }`}
        >
          <textarea
            id="concierge-input"
            ref={inputRef}
            rows={1}
            value={shownDraft}
            disabled={busy}
            readOnly={listening}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Ask about an order, a product, or how something works"
            /* 16px on the input stops iOS zooming the page when it focuses. */
            className="flex-1 resize-none outline-none focus-visible:outline-none text-base sm:text-sm text-stone-700 placeholder:text-stone-500 bg-transparent py-1.5 max-h-[140px]"
          />
          <VoiceMic
            endpoint="/api/account/voice-transcribe"
            disabled={busy}
            onText={(t) => {
              setDraft((d) => (d ? `${d} ${t}` : t));
              inputRef.current?.focus();
            }}
            onInterim={setInterim}
            onPhase={setVoicePhase}
            onNotice={setNotice}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim() || voicePhase !== 'idle'}
            className="shrink-0 rounded-md bg-gold-700 text-white text-[10px] tracking-[0.18em] uppercase px-5 h-11 hover:bg-gold-800 transition-colors disabled:opacity-40 disabled:hover:bg-gold-700"
          >
            {busy ? 'Sending' : 'Send'}
          </button>
        </div>
        {listening && (
          <p className="text-xs text-stone-600 mt-2" role="status">
            Listening. Press stop when you are done, or Escape to throw it away.
          </p>
        )}
        {voicePhase === 'transcribing' && (
          <p className="text-xs text-stone-600 mt-2" role="status">
            Writing down what you said...
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
          <button
            type="button"
            onClick={reset}
            disabled={empty || busy}
            className="text-[11px] tracking-[0.18em] uppercase font-semibold underline underline-offset-4 decoration-stone-400 text-stone-700 hover:text-stone-900 hover:decoration-stone-700 transition-colors disabled:opacity-40 py-2 -my-2"
          >
            Start again
          </button>
          <a
            href="/contact"
            className="text-[11px] tracking-[0.18em] uppercase font-semibold underline underline-offset-4 decoration-gold-400 text-gold-700 hover:text-gold-800 hover:decoration-gold-700 transition-colors py-2 -my-2"
          >
            Talk to a person
          </a>
          <p className="text-[10px] text-stone-500 ml-auto">
            Research use only. Not medical advice.
          </p>
        </div>
      </form>
    </div>
  );
}
