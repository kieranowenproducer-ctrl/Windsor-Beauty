'use client';

import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { answerQuestion } from '@/lib/concierge/research/chat-engine.mjs';
import { takeResearchQuestion, type ResearchHandoff } from '@/lib/concierge/handoff';

type ChatAnswer = {
  kind: string;
  title: string;
  summary: string;
  keyPoint?: string;
  bullets: string[];
  sections?: Array<{ title: string; items: string[] }>;
  topicIds?: string[];
  dose?: Array<{
    label: string;
    value: string;
    source?: { label: string; detail?: string; url: string; linkable?: boolean } | null;
  }>;
  comparison?: Array<{
    name: string;
    purpose: string;
    evidence: string;
    halfLife: string;
    status: string;
  }>;
  suggestions?: Array<{ slug: string; label: string }>;
  followUps?: string[];
  needsLanguageReview?: boolean;
  compounds: string[];
  /* `linkable` is set by the engine from its trusted-host list (task dd119599): true for primary
     science a member can open, false for a reference site that is credited but not linked. */
  sources: Array<{ label: string; detail: string; url: string; linkable?: boolean }>;
  interpretation?: {
    status: string;
    type: string;
    method: string;
    confidence: string;
    matchedText: string;
    disclosure: string;
    suggestions: Array<{ slug: string; label: string }>;
    expandedTerms: string[];
    blendId: string | null;
    followedClarification?: boolean;
    acceptedSuggestion?: string;
    rejectedSuggestion?: boolean;
  } | null;
};

type Message = {
  id: number;
  role: 'user' | 'assistant';
  text?: string;
  answer?: ChatAnswer;
  diagnostic?: {
    route: 'ai' | 'fallback';
    reason?: string;
    elapsedMs?: number;
    tokenCount?: number;
  };
};

type ConversationTurn = {
  role: 'user' | 'assistant';
  text?: string;
  answer?: Pick<ChatAnswer, 'kind' | 'title' | 'keyPoint' | 'summary' | 'compounds' | 'topicIds'>;
};

const MAX_CONVERSATION_QUESTIONS = 10;

const cleanTurnText = (value: unknown, limit: number) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, limit);

/* Only the small amount of conversation needed to understand a follow-up is
   sent. The opening card is omitted, and no sources, doses, audit fields or
   account details are copied into conversational memory. */
function recentConversationTurns(messages: Message[]): ConversationTurn[] {
  return messages.flatMap<ConversationTurn>((message, index) => {
    if (message.role === 'user') {
      const text = cleanTurnText(message.text, 500);
      return text ? [{ role: 'user', text }] : [];
    }
    const answer = message.answer;
    if (!answer || messages[index - 1]?.role !== 'user') return [];
    return [{
      role: 'assistant',
      answer: {
        kind: cleanTurnText(answer.kind, 40),
        title: cleanTurnText(answer.title, 180),
        keyPoint: cleanTurnText(answer.keyPoint, 300) || undefined,
        summary: cleanTurnText(answer.summary, 500),
        compounds: (answer.compounds || []).map((name) => cleanTurnText(name, 100)).filter(Boolean).slice(0, 6),
        topicIds: (answer.topicIds || []).map((id) => cleanTurnText(id, 80)).filter(Boolean).slice(0, 6),
      },
    }];
  }).slice(-(MAX_CONVERSATION_QUESTIONS * 2));
}

const suggestions = [
  'Which source entries relate to muscle growth?',
  'Which compounds does the source link to healing?',
  'Which compounds does the source link to sleep?',
  'Show me the source entries about weight loss',
] as const;

const researchBoundaries = [
  'No personal dose or treatment recommendations',
  'No injection, mixing or administration instructions',
  'No emergency assessment',
] as const;

function PearlMark() {
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.99 8.99 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.99 8.99 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
        />
      </svg>
    </span>
  );
}

/* Keeping a record of what was asked (Kieran's instruction, 2026-08-05), so we can
   see what members want to know and improve the tool. Admin only.
   Nothing here touches how answers are produced: the answer has already been
   worked out and shown by the time this runs, and it is sent as a copy.
   Nothing waits for it and nothing shows if it fails, because a member's answer
   must never depend on our audit trail. `keepalive` so a question asked just
   before leaving the page is still recorded. */
function recordQuestion(question: string, answer: ChatAnswer) {
  try {
    void fetch('/api/account/research-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* Deliberately silent. */
  }
}

function AssistantAnswer({
  answer,
  originalQuestion,
  onSuggestion,
  onReject,
  onFollowUp,
  askedQuestions,
  adminPreview,
  diagnostic,
}: {
  answer: ChatAnswer;
  originalQuestion?: string;
  onSuggestion: (question: string, answer: ChatAnswer, suggestion: { slug: string; label: string }) => void;
  onReject: (question: string, answer: ChatAnswer) => void;
  onFollowUp: (question: string) => void;
  askedQuestions: Set<string>;
  adminPreview: boolean;
  diagnostic?: Message['diagnostic'];
}) {
  const urgent = answer.kind === 'emergency';
  const boundary = answer.kind === 'boundary';
  const titleId = useId();
  // Dose answers are deliberately just the figures, their sources and the
  // research-use line. Do not duplicate that line in a "Key answer" box.
  const keyPoint = answer.kind === 'dose' ? (answer.keyPoint?.trim() || '') : (answer.keyPoint?.trim() || answer.summary.trim());
  const supportingSummary = answer.summary.startsWith(keyPoint)
    ? answer.summary.slice(keyPoint.length).trim()
    : answer.summary.trim();
  const visibleFollowUps = (answer.followUps || []).filter((followUp) => !askedQuestions.has(followUp.trim().toLowerCase()));
  const populatedSections = (answer.sections || []).filter((section) => section.items.length);
  const primarySections = answer.kind === 'topic'
    ? populatedSections.filter((section) => !['Evidence strength', 'Research details and numbers', 'Limitations'].includes(section.title))
    : answer.kind === 'evidence' && populatedSections.length
      ? populatedSections.slice(0, 1)
    : populatedSections;
  const extraSections = answer.kind === 'topic'
    ? populatedSections.filter((section) => ['Evidence strength', 'Research details and numbers', 'Limitations'].includes(section.title))
    : answer.kind === 'evidence'
      ? populatedSections.slice(1)
    : [];
  const bulletsAreExtraDetail = populatedSections.length > 0;

  return (
    <article
      aria-labelledby={titleId}
      className={`rounded-xl border px-4 py-4 sm:px-5 ${
        urgent
          ? 'border-red-200 bg-red-50'
          : boundary
            ? 'border-amber-200 bg-amber-50/60'
            : 'border-stone-200 bg-white shadow-sm'
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold-700">
        {answer.kind === 'dose'
          ? 'Source-listed range'
          : answer.kind === 'comparison'
            ? 'Research comparison'
            : 'Educational answer'}
      </p>
      {adminPreview && diagnostic ? (
        <p className="mt-1 text-[9px] leading-relaxed text-stone-400" title={diagnostic.reason || undefined}>
          {diagnostic.route === 'ai' ? 'AI answer' : 'PEARL fallback'}
          {typeof diagnostic.elapsedMs === 'number' ? ` · ${diagnostic.elapsedMs} ms` : ''}
          {typeof diagnostic.tokenCount === 'number' ? ` · ${diagnostic.tokenCount} tokens` : ''}
        </p>
      ) : null}
      <h3 id={titleId} className="mt-1.5 font-serif text-2xl leading-tight text-stone-800">{answer.title}</h3>
      {answer.interpretation?.disclosure ? (
        <p className="mt-3 rounded-lg border border-gold-200 bg-gold-50/70 px-3 py-2.5 text-xs leading-relaxed text-stone-700">
          {answer.interpretation.disclosure}
        </p>
      ) : null}
      {keyPoint ? (
        <div className="mt-3 rounded-lg border-l-2 border-gold-500 bg-gold-50/60 px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-800">Key answer</p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-stone-800">{keyPoint}</p>
        </div>
      ) : null}
      {supportingSummary ? (
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{supportingSummary}</p>
      ) : null}

      {answer.comparison?.length ? (
        <div
          className={`mt-4 grid gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 ${
            answer.comparison.length === 3 ? 'lg:grid-cols-3' : 'md:grid-cols-2'
          }`}
          aria-label="Research comparison"
        >
          {answer.comparison.map((item) => (
            <section key={item.name} className="border-t-2 border-gold-600 bg-white px-4 py-4">
              <h4 className="font-serif text-xl leading-tight text-stone-800">{item.name}</h4>
              <dl className="mt-3">
                {[
                  ['Research purpose', item.purpose],
                  ['Evidence quality', item.evidence],
                  ['Half-life', item.halfLife],
                  ['Development status', item.status],
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-stone-200 py-3 first:border-t-0 first:pt-0">
                    <dt className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-800">
                      {label}
                    </dt>
                    <dd className="mt-1 text-xs leading-relaxed text-stone-600">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : null}

      {(answer.kind === 'clarify' || answer.kind === 'no-match') && answer.suggestions?.length && originalQuestion ? (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Possible research terms">
          {answer.suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion.slug}
              type="button"
              onClick={() => onSuggestion(originalQuestion, answer, suggestion)}
              className="min-h-11 rounded-md bg-gold-700 px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white hover:bg-gold-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
            >
              Use {suggestion.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onReject(originalQuestion, answer)}
            className="min-h-11 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-600 hover:border-gold-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
          >
            None of these
          </button>
        </div>
      ) : null}

      {answer.dose ? (
        <ul className="mt-4 space-y-2 pl-5">
          {answer.dose.map((item) => (
            <li key={item.label} className="list-disc text-sm leading-relaxed text-stone-800 marker:text-gold-600">
              <strong className="font-semibold">{item.label}:</strong> {item.value}
              {item.source ? (
                <span className="mt-1 block text-[11px] leading-5 text-stone-500">
                  Source: {item.source.linkable ? (
                    <a href={item.source.url} target="_blank" rel="noreferrer" className="font-medium text-gold-800 underline underline-offset-2">
                      {item.source.label}
                    </a>
                  ) : (
                    <span className="font-medium text-stone-700">{item.source.label}</span>
                  )}
                  {item.source.detail ? ` · ${item.source.detail}` : ''}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {primarySections.length ? (
        <div className="mt-4 space-y-3">
          {primarySections.map((section) => (
            <section key={section.title} className="rounded-lg border border-stone-200 bg-stone-50/70 px-3.5 py-3">
              <h4 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-800">
                {section.title}
              </h4>
              <ul className="mt-2 space-y-1.5 pl-4">
                {section.items.map((item, index) => (
                  <li key={`${section.title}-${index}-${item}`} className="list-disc text-xs leading-relaxed text-stone-600 marker:text-gold-500">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {extraSections.length || (bulletsAreExtraDetail && answer.bullets.length) ? (
        <details className="mt-4 border-t border-stone-200 pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700">
            More research detail
          </summary>
          <div className="mt-3 space-y-3">
            {extraSections.map((section) => (
              <section key={section.title} className="rounded-lg border border-stone-200 bg-stone-50/70 px-3.5 py-3">
                <h4 className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold-800">{section.title}</h4>
                <ul className="mt-2 space-y-1.5 pl-4">
                  {section.items.map((item, index) => (
                    <li key={`${section.title}-${index}-${item}`} className="list-disc text-xs leading-relaxed text-stone-600 marker:text-gold-500">{item}</li>
                  ))}
                </ul>
              </section>
            ))}
            {answer.bullets.length ? (
              <ul className="space-y-2 pl-4">
                {answer.bullets.map((bullet, index) => (
                  <li key={`${index}-${bullet}`} className="list-disc text-sm leading-relaxed text-stone-600 marker:text-gold-500">{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      {!bulletsAreExtraDetail && answer.bullets.length ? (
        <ul className="mt-4 space-y-2 pl-4">
          {answer.bullets.map((bullet, index) => (
            <li
              key={`${index}-${bullet}`}
              className="list-disc text-sm leading-relaxed text-stone-600 marker:text-gold-500"
            >
              {bullet}
            </li>
          ))}
        </ul>
      ) : null}

      {visibleFollowUps.length ? (
        <div className="mt-4 border-t border-stone-200 pt-3" aria-label="Related research questions">
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-500">Continue exploring</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {visibleFollowUps.slice(0, 3).map((followUp) => (
              <button
                key={followUp}
                type="button"
                onClick={() => onFollowUp(followUp)}
                className="min-h-11 rounded-lg border border-gold-200 bg-gold-50/50 px-3 py-2 text-left text-xs leading-snug text-stone-700 hover:border-gold-400 hover:bg-gold-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
              >
                {followUp}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {answer.sources.length ? (
        <details className="mt-4 border-t border-stone-200 pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
            View sources used ({answer.sources.length})
          </summary>
          {/* A SOURCE IS EITHER A DESTINATION OR A CREDIT (task dd119599, 7 September 2026).
              Every source was a link out, and the peptide reference sites sat above PubMed, so a
              member reading his own research tool was offered a door to somebody else's shop.
              Kieran's decision: the primary science stays tappable, the reference sites become
              plain text. Both are still shown and still named, so nothing about where an answer
              came from is hidden. The engine sets `linkable`; this only draws it. */}
          <div className="mt-3 space-y-2">
            {answer.sources.map((source, index) =>
              source.linkable ? (
                <a
                  key={`${source.url}-${index}`}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block min-h-11 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 hover:border-gold-300 hover:bg-gold-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                >
                  <strong className="block text-xs font-medium text-stone-800">{source.label}</strong>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">{source.detail}</span>
                </a>
              ) : (
                /* No hover and no pointer cursor, because nothing happens when it is pressed.
                   An element that lights up under the finger and then does nothing is worse
                   than one that plainly never invited the press. */
                <div
                  key={`${source.url}-${index}`}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2.5"
                >
                  <strong className="block text-xs font-medium text-stone-800">{source.label}</strong>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-stone-500">{source.detail}</span>
                </div>
              ),
            )}
          </div>
        </details>
      ) : null}
    </article>
  );
}

/**
 * The PEARL desk. The legacy component name remains for compatibility.
 *
 * `handoff` is a question the Concierge redirected here, arriving from the
 * sibling tab on this same page. It is PUT IN THE BOX AND NOTHING MORE. It is
 * never asked automatically, the consent screen below is still shown and still
 * has to be passed, and the customer presses Ask themselves.
 *
 * How the answers are produced is not touched by any of this: `answerQuestion`
 * is called from exactly one place, `ask`, and only ever from a real press.
 */
export default function ResearchDesk({
  handoff = null,
  adminPreview = false,
}: {
  handoff?: ResearchHandoff | null;
  adminPreview?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [question, setQuestion] = useState('');
  const [carried, setCarried] = useState(false);
  const [terminologyOverrides, setTerminologyOverrides] = useState<unknown[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: 'assistant', answer: answerQuestion('') as ChatAnswer },
  ]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  /* The newest answer on screen, and the last one already brought into view, so
     an ordinary re-render cannot drag the page back to an answer the customer
     has since scrolled away from. */
  const newestAnswerRef = useRef<HTMLDivElement>(null);
  const shownAnswerRef = useRef<number | null>(null);
  /* The last handover already dealt with, so re-renders cannot re-fill a box
     the customer has since edited or cleared. */
  const appliedRef = useRef<number | null>(null);
  const conversationEpochRef = useRef(0);

  // Only approved, active administrator records are returned. If this small
  // optional request fails, PEARL continues with its built-in reviewed terms.
  useEffect(() => {
    fetch('/api/account/pearl-terminology')
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (Array.isArray(data?.records)) setTerminologyOverrides(data.records);
      })
      .catch(() => {});
  }, []);

  /* A question handed over from the Concierge tab, applied once the consent
     screen has been passed and once per handover. */
  useEffect(() => {
    if (!accepted || !handoff) return;
    if (appliedRef.current === handoff.key) return;
    appliedRef.current = handoff.key;
    setQuestion(handoff.text);
    setCarried(true);
  }, [accepted, handoff]);

  /* Grow the box to fit, up to the same ceiling the class list sets, so a long
     question can be read in full before it is sent. */
  useEffect(() => {
    const box = inputRef.current;
    if (!box) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 144)}px`;
  }, [question]);

  /* Bring the filled box into view rather than focusing it: focus would open
     the keyboard on a phone and hide the Ask button the customer is being
     asked to read and press. */
  useEffect(() => {
    if (!carried) return;
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [carried]);

  /* Put the top of a new answer on screen, so it is read downwards.
   *
   * Only a real answer moves the page. The opening card and Clear conversation
   * leave it where it is, and each answer is brought into view only once.
   */
  useEffect(() => {
    if (messages.length < 2) return;
    const newest = messages[messages.length - 1];
    if (newest.role !== 'assistant') return;
    if (shownAnswerRef.current === newest.id) return;
    shownAnswerRef.current = newest.id;

    const card = newestAnswerRef.current;
    if (!card) return;

    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const behavior: ScrollBehavior = still ? 'auto' : 'smooth';
    card.scrollIntoView({ behavior, block: 'start' });

    /* A phone closes its keyboard as the question is sent and moves the page
       while it does. Put the answer back once the keyboard has settled. */
    const settle = window.setTimeout(() => {
      newestAnswerRef.current?.scrollIntoView({ behavior, block: 'start' });
    }, 400);
    return () => window.clearTimeout(settle);
  }, [messages]);

  function acceptTerms() {
    setAccepted(true);
    /* Taken in every case, so a question left over from a link click cannot sit
       in storage and reappear later. Used only when there is no handover from
       the sibling tab, which is the fresher of the two. */
    const stashed = takeResearchQuestion();
    if (handoff || !stashed) return;
    setQuestion(stashed);
    setCarried(true);
  }

  async function ask(text: string, displayText = text, acceptedSuggestion?: string, resetContext = false) {
    const trimmed = text.trim();
    if (!trimmed || !accepted) return;
    const existingQuestionCount = messages.filter((message) => message.role === 'user').length;
    if (existingQuestionCount >= MAX_CONVERSATION_QUESTIONS) return;
    const stamp = Date.now();
    const conversationEpoch = conversationEpochRef.current;
    const priorAnswer = resetContext
      ? undefined
      : [...messages]
          .reverse()
          .find((message) => message.role === 'assistant' && message.answer?.compounds.length)
          ?.answer;
    const priorCompounds = resetContext ? [] : priorAnswer?.compounds ?? [];
    const askedQuestions = [
      ...messages.filter((message) => message.role === 'user').map((message) => message.text || ''),
      trimmed,
    ];
    /* Produced once, here, rather than inside the state updater below: React can
       run an updater more than once, which would ask the engine twice and could
       record an answer that is not the one on screen. */
    const answer = answerQuestion(trimmed, priorCompounds, {
      overrides: terminologyOverrides,
      adminPreview,
      askedQuestions,
      previousAnswer: priorAnswer ? {
        kind: priorAnswer.kind,
        title: priorAnswer.title,
        compounds: priorAnswer.compounds,
        topicIds: priorAnswer.topicIds || [],
      } : null,
    }) as ChatAnswer;
    const previousWasClarification = messages.at(-1)?.role === 'assistant' && messages.at(-1)?.answer?.kind === 'clarify';
    if (answer.interpretation && (previousWasClarification || acceptedSuggestion)) {
      answer.interpretation = {
        ...answer.interpretation,
        followedClarification: previousWasClarification,
        acceptedSuggestion,
      };
    }
    setMessages((current) => [
      ...current,
      { id: stamp, role: 'user', text: displayText },
      { id: stamp + 1, role: 'assistant', answer },
    ]);
    setQuestion('');
    setCarried(false);
    /* Let go of the box so a phone puts its keyboard away and the new answer
       has the full screen available for reading. */
    inputRef.current?.blur();
    const mayUseConversation = adminPreview && !['dose', 'emergency', 'boundary'].includes(answer.kind);
    if (!mayUseConversation) {
      recordQuestion(trimmed, answer);
      return;
    }
    const startedAt = performance.now();
    try {
      const response = await fetch('/api/account/pearl-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: cleanTurnText(trimmed, 500),
          turns: recentConversationTurns(messages),
        }),
      });
      const payload = await response.json() as {
        answer?: ChatAnswer | null;
        route?: string;
        reason?: string;
        audit?: { elapsedMs?: number; durationMs?: number; tokenCount?: number; totalTokens?: number; tokens?: number } | null;
      };
      if (conversationEpoch !== conversationEpochRef.current) return;
      const returnedAnswer = payload.answer;
      const validAnswer = returnedAnswer
        && typeof returnedAnswer.kind === 'string'
        && typeof returnedAnswer.title === 'string'
        && typeof returnedAnswer.summary === 'string'
        && Array.isArray(returnedAnswer.compounds)
        && Array.isArray(returnedAnswer.sources)
        && Array.isArray(returnedAnswer.bullets);
      if (response.ok && validAnswer) {
        const route = payload.route === 'ai' ? 'ai' : 'fallback';
        const elapsedMs = payload.audit?.elapsedMs ?? payload.audit?.durationMs ?? Math.round(performance.now() - startedAt);
        const tokenCount = payload.audit?.tokenCount ?? payload.audit?.totalTokens ?? payload.audit?.tokens;
        setMessages((current) => current.map((message) => message.id === stamp + 1
          ? {
              ...message,
              answer: returnedAnswer as ChatAnswer,
              diagnostic: { route, reason: payload.reason, elapsedMs, tokenCount },
            }
          : message));
        recordQuestion(trimmed, returnedAnswer as ChatAnswer);
        return;
      }
    } catch {
      /* The reviewed deterministic answer stays on screen. */
    }
    if (conversationEpoch !== conversationEpochRef.current) return;
    setMessages((current) => current.map((message) => message.id === stamp + 1
      ? {
          ...message,
          diagnostic: { route: 'fallback', reason: 'The conversational answer was unavailable.', elapsedMs: Math.round(performance.now() - startedAt) },
        }
      : message));
    recordQuestion(trimmed, answer);
  }

  function useSuggestion(originalQuestion: string, answer: ChatAnswer, suggestion: { slug: string; label: string }) {
    const matched = answer.interpretation?.matchedText || '';
    const startsNewTopic = suggestion.slug.startsWith('topic:');
    const expanded = startsNewTopic
      ? `Which source entries relate to ${suggestion.label}?`
      : suggestion.slug.startsWith('product:')
        ? `What is in ${suggestion.label}?`
        : matched
          ? originalQuestion.replace(new RegExp(matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), suggestion.label)
          : `What research is listed for ${suggestion.label}?`;
    /* A category button always starts a new subject. Without this reset, an
       older compound or blend can be mistaken for the subject of the new
       category question. */
    ask(expanded, `Use ${suggestion.label}`, suggestion.label, startsNewTopic);
  }

  function rejectSuggestion(originalQuestion: string, answer: ChatAnswer) {
    const stamp = Date.now();
    const response: ChatAnswer = {
      kind: 'clarify',
      title: 'Please give me a little more detail',
      summary: 'Thanks for confirming. Check the spelling, enter the full compound name, or list the components of the blend you mean.',
      bullets: [],
      suggestions: [],
      compounds: [],
      sources: [],
      interpretation: {
        status: 'unknown',
        type: 'none',
        method: 'rejected-suggestion',
        confidence: 'low',
        matchedText: answer.interpretation?.matchedText || '',
        disclosure: '',
        suggestions: answer.suggestions || [],
        expandedTerms: [],
        blendId: null,
        rejectedSuggestion: true,
      },
    };
    setMessages(current => [
      ...current,
      { id: stamp, role: 'user', text: 'None of those' },
      { id: stamp + 1, role: 'assistant', answer: response },
    ]);
    recordQuestion(originalQuestion, {
      ...response,
      kind: 'terminology-feedback',
      title: 'Member rejected the suggested terminology match',
    });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  function clearConversation() {
    conversationEpochRef.current += 1;
    setMessages([{ id: Date.now(), role: 'assistant', answer: answerQuestion('') as ChatAnswer }]);
  }

  const askedQuestions = new Set(
    messages
      .filter((message) => message.role === 'user')
      .map((message) => (message.text || '').trim().toLowerCase()),
  );
  const questionCount = messages.filter((message) => message.role === 'user').length;
  const conversationComplete = questionCount >= MAX_CONVERSATION_QUESTIONS;

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-gradient-to-br from-gold-50/70 via-white to-white shadow-sm">
        <section className="min-w-0" aria-label="PEARL research chat">
          {!accepted ? (
            <div className="px-5 py-7 sm:px-7">
              <div className="flex items-start gap-3">
                <PearlMark />
                <div className="pt-0.5">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.24em] text-gold-700">
                    PEARL
                  </p>
                  <h3 className="mt-1.5 font-serif text-3xl leading-tight text-stone-800">
                    Research education only.
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Peptide Experimental Analysis Research Library can repeat source-listed ranges and
                    explain the research supplied with them. It cannot decide what is safe or suitable for you.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
                {researchBoundaries.map((boundary) => (
                  <div
                    key={boundary}
                    className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm"
                  >
                    <span
                      aria-hidden
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                    {boundary}
                  </div>
                ))}
              </div>

              {/* Said before they agree, not only under the box, because this is
                  the screen where they choose to go ahead. */}
              <p className="mt-5 text-xs leading-relaxed text-stone-600">
                Your questions and the answers are saved to your member record. Only Windsor Glow
                staff can see them, and we use them to improve this tool.
              </p>

                <button
                  type="button"
                  onClick={acceptTerms}
                  className="mt-6 min-h-11 rounded-lg bg-gold-700 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm hover:bg-gold-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                >
                  I understand. Open PEARL
                </button>
            </div>
          ) : (
            <div className="flex min-h-[32rem] flex-col">
              <div className="flex items-center justify-between border-b border-stone-200 bg-white/50 px-4 py-3 sm:px-5">
                <span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  <i aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold-500" />
                  PEARL research-only mode
                </span>
                <button
                  type="button"
                  onClick={clearConversation}
                  className="min-h-11 rounded px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-gold-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                >
                  Clear conversation
                </button>
              </div>

              <div
                className="flex-1 space-y-4 px-4 py-5 sm:px-5"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-atomic="false"
              >
                {messages.map((message, index) => (
                  <div
                    key={message.id}
                    ref={index === messages.length - 1 ? newestAnswerRef : undefined}
                    style={{ scrollMarginTop: 'calc(var(--site-header-stack-height, 0px) + 1rem)' }}
                  >
                    {message.role === 'user' ? (
                      <div className="flex justify-end">
                        <p className="max-w-[88%] rounded-xl bg-stone-800 px-4 py-3 text-sm leading-relaxed text-white">
                          {message.text}
                        </p>
                      </div>
                    ) : (
                      <AssistantAnswer
                        answer={message.answer!}
                        originalQuestion={messages[index - 1]?.role === 'user' ? messages[index - 1].text : undefined}
                        onSuggestion={useSuggestion}
                        onReject={rejectSuggestion}
                        onFollowUp={ask}
                        askedQuestions={askedQuestions}
                        adminPreview={adminPreview}
                        diagnostic={message.diagnostic}
                      />
                    )}
                  </div>
                ))}
              </div>

              {messages.length === 1 ? (
                <div className="grid gap-2.5 border-t border-stone-100 px-4 py-4 sm:grid-cols-2 sm:px-5" aria-label="Example questions">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => ask(suggestion)}
                      className="group flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 text-left text-xs leading-snug text-stone-700 shadow-sm hover:border-gold-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                    >
                      <span
                        aria-hidden
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-50 text-gold-700 group-hover:bg-gold-100"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 0 1-3.4-.59L3 21l1.7-4.06A7.4 7.4 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" />
                        </svg>
                      </span>
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}

              {conversationComplete ? (
                <div className="border-t border-stone-200 bg-gold-50/40 p-4 sm:p-5" role="status">
                  <div className="rounded-lg border border-gold-300 bg-white px-4 py-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-700">Conversation complete</p>
                    <p className="mt-2 text-sm leading-relaxed text-stone-700">
                      You have asked ten questions. Start a new conversation so PEARL can keep its answers focused and control the AI cost.
                    </p>
                    <button
                      type="button"
                      onClick={clearConversation}
                      className="mt-4 min-h-11 rounded-md bg-gold-700 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-gold-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                    >
                      Start a new conversation
                    </button>
                  </div>
                </div>
              ) : (
              <form ref={composerRef} className="border-t border-stone-200 bg-gold-50/40 p-4 sm:p-5" onSubmit={submit}>
                <label htmlFor="research-question" className="text-[9px] font-semibold uppercase tracking-[0.18em] text-stone-600">
                  Ask PEARL about a compound or research category
                </label>

                {/* Says plainly where the words in the box came from, so a
                    pre-filled question reads as help rather than as something
                    the page did on its own. It also states that nothing has
                    been sent yet, which is the part that matters. */}
                {carried ? (
                  <p
                    role="status"
                    className="mt-2 flex items-start gap-2 rounded-lg border border-gold-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-stone-600"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700"
                    >
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    </span>
                    <span>
                      We have brought your question over from the Concierge. Nothing has been sent yet.
                      Have a read, change it if you like, then press Ask.
                    </span>
                  </p>
                ) : null}
                <div className="mt-2 flex items-end gap-2 rounded-lg border border-stone-400 bg-white p-2 focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-500">
                  <textarea
                    id="research-question"
                    ref={inputRef}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        ask(question);
                      }
                    }}
                    placeholder="For example: Which entries relate to healing?"
                    rows={2}
                    className="max-h-36 min-h-11 flex-1 resize-none bg-transparent px-2 py-2 text-base text-stone-700 outline-none placeholder:text-stone-400 focus-visible:outline-none sm:text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!question.trim()}
                    className="h-11 shrink-0 rounded-md bg-gold-700 px-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-gold-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 disabled:opacity-40"
                  >
                    Ask
                  </button>
                </div>
                {/* This line used to say questions stayed in the browser. They are
                    now saved against the member's record, so it says so. The page
                    must never promise something the site does not do. */}
                <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
                  Do not enter personal health details. Your questions and the answers are saved to
                  your member record, seen only by Windsor Glow staff, and used to improve this tool.
                </p>
              </form>
              )}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
