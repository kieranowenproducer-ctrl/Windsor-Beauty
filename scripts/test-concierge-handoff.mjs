// Carrying a question from the Concierge to PEARL.
//
//   node --import ./scripts/alias-loader.mjs --test scripts/test-concierge-handoff.mjs
//
// What is being protected here: the question arrives whole, it arrives once,
// and anything that is missing, stale or malformed leaves PEARL
// exactly as it was before this feature existed, with an empty box.

import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  RESEARCH_HANDOFF_KEY,
  clearResearchQuestion,
  sanitiseHandoffQuestion,
  stashResearchQuestion,
  takeResearchQuestion,
} from '../src/lib/concierge/handoff.ts';

/* A stand-in for the browser's per-tab store. Same shape, same behaviour, and
   it can be made to throw the way a private window does. */
function fakeWindow() {
  const map = new Map();
  return {
    sessionStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => void map.set(k, String(v)),
      removeItem: (k) => void map.delete(k),
      get size() {
        return map.size;
      },
    },
  };
}

beforeEach(() => {
  globalThis.window = fakeWindow();
});

// --------------------------------------------------------------------------
// Preserving the customer's words
// --------------------------------------------------------------------------

test('keeps the question exactly as it was typed', () => {
  const asked = 'What dose of BPC-157 does the research use?';
  stashResearchQuestion(asked);
  assert.equal(takeResearchQuestion(), asked);
});

test('does not tidy spacing, casing or punctuation inside the question', () => {
  const fussy = 'Semaglutide  vs   Tirzepatide -- what does the SOURCE say?!';
  stashResearchQuestion(fussy);
  assert.equal(takeResearchQuestion(), fussy);
});

test('keeps line breaks a customer typed', () => {
  const multi = 'Two things:\nWhat is TB-500?\nWhat is it studied for?';
  stashResearchQuestion(multi);
  assert.equal(takeResearchQuestion(), multi);
});

test('trims only the outside edges', () => {
  stashResearchQuestion('   What is BPC-157?   ');
  assert.equal(takeResearchQuestion(), 'What is BPC-157?');
});

test('strips control characters a text box cannot hold', () => {
  const withControls = 'What is' + String.fromCharCode(0) + ' ' + String.fromCharCode(7) + 'BPC-157?';
  stashResearchQuestion(withControls);
  assert.equal(takeResearchQuestion(), 'What is BPC-157?');
});

// --------------------------------------------------------------------------
// Read once: a refresh must not bring it back
// --------------------------------------------------------------------------

test('the question can be collected only once', () => {
  stashResearchQuestion('What does the source say about healing?');
  assert.equal(takeResearchQuestion(), 'What does the source say about healing?');
  assert.equal(takeResearchQuestion(), null, 'a second read, as after a refresh, must find nothing');
});

test('collecting the question empties the store', () => {
  stashResearchQuestion('Which compounds relate to sleep?');
  takeResearchQuestion();
  assert.equal(globalThis.window.sessionStorage.size, 0);
});

test('an unreadable value is cleared rather than retried forever', () => {
  globalThis.window.sessionStorage.setItem(RESEARCH_HANDOFF_KEY, 'not json at all');
  assert.equal(takeResearchQuestion(), null);
  assert.equal(globalThis.window.sessionStorage.size, 0);
});

// --------------------------------------------------------------------------
// Missing or invalid: PEARL carries on with an empty box
// --------------------------------------------------------------------------

test('nothing waiting gives nothing back', () => {
  assert.equal(takeResearchQuestion(), null);
});

test('an empty or blank question is never stored', () => {
  stashResearchQuestion('');
  stashResearchQuestion('     ');
  stashResearchQuestion('\n\t ');
  assert.equal(globalThis.window.sessionStorage.size, 0);
  assert.equal(takeResearchQuestion(), null);
});

test('a question that is not text is refused', () => {
  for (const value of [null, undefined, 42, true, {}, ['a question'], () => 'q']) {
    assert.equal(sanitiseHandoffQuestion(value), null);
  }
});

test('a stale question is not used', () => {
  const fortyMinutesAgo = Date.now() - 40 * 60 * 1000;
  globalThis.window.sessionStorage.setItem(
    RESEARCH_HANDOFF_KEY,
    JSON.stringify({ text: 'What is BPC-157?', at: fortyMinutesAgo }),
  );
  assert.equal(takeResearchQuestion(), null);
});

test('a question from just inside the time limit is still used', () => {
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  globalThis.window.sessionStorage.setItem(
    RESEARCH_HANDOFF_KEY,
    JSON.stringify({ text: 'What is BPC-157?', at: tenMinutesAgo }),
  );
  assert.equal(takeResearchQuestion(), 'What is BPC-157?');
});

test('a record with no timestamp is refused', () => {
  globalThis.window.sessionStorage.setItem(
    RESEARCH_HANDOFF_KEY,
    JSON.stringify({ text: 'What is BPC-157?' }),
  );
  assert.equal(takeResearchQuestion(), null);
});

test('a timestamp from the future is refused rather than treated as fresh', () => {
  globalThis.window.sessionStorage.setItem(
    RESEARCH_HANDOFF_KEY,
    JSON.stringify({ text: 'What is BPC-157?', at: Date.now() + 60 * 60 * 1000 }),
  );
  assert.equal(takeResearchQuestion(), null);
});

test('a stuffed value is capped instead of being carried whole', () => {
  const huge = 'a'.repeat(5000);
  stashResearchQuestion(huge);
  const back = takeResearchQuestion();
  assert.equal(back.length, 2000);
});

// --------------------------------------------------------------------------
// Never throws
// --------------------------------------------------------------------------

test('storage that refuses to write loses the question and nothing else', () => {
  globalThis.window = {
    sessionStorage: {
      getItem() {
        throw new Error('private browsing');
      },
      setItem() {
        throw new Error('private browsing');
      },
      removeItem() {
        throw new Error('private browsing');
      },
    },
  };
  assert.doesNotThrow(() => stashResearchQuestion('What is BPC-157?'));
  assert.doesNotThrow(() => clearResearchQuestion());
  assert.equal(takeResearchQuestion(), null);
});

test('on the server, where there is no window, nothing happens and nothing breaks', () => {
  delete globalThis.window;
  assert.doesNotThrow(() => stashResearchQuestion('What is BPC-157?'));
  assert.doesNotThrow(() => clearResearchQuestion());
  assert.equal(takeResearchQuestion(), null);
});

// --------------------------------------------------------------------------
// Nothing is ever submitted, and the consent screen is still there
// --------------------------------------------------------------------------

test('PEARL asks a question in exactly one place, on a real press', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/account/ResearchDesk.tsx', import.meta.url),
    'utf8',
  );

  /* Three call sites and no more: the opening overview, inside ask(), and the
     clear-conversation reset. Never from an effect, and never from the
     handover. A fourth would need checking by hand. */
  const calls = source.match(/answerQuestion\(/g) ?? [];
  assert.equal(calls.length, 3, 'a new call site here would need checking by hand');

  assert.match(source, /if \(!trimmed \|\| !accepted\) return;/, 'ask must still refuse before consent');
  assert.match(source, /I understand\. Open PEARL/, 'the consent button must still exist');
  assert.match(source, /onClick=\{acceptTerms\}/, 'consent must still be a real press');

  /* The handover effect is allowed to fill the box and nothing more. */
  const effect = source.slice(source.indexOf('if (!accepted || !handoff) return;'));
  const body = effect.slice(0, effect.indexOf('}, [accepted, handoff]);'));
  assert.ok(!body.includes('ask('), 'the handover must never ask the question itself');
  assert.ok(!body.includes('answerQuestion'), 'the handover must never produce an answer');
});

test('the question never travels in the address bar', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of [
    '../src/components/account/ConciergeModes.tsx',
    '../src/components/ResearchChatButton.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(
      !/searchParams\.set\(\s*['"](q|question|ask|query)['"]/.test(source),
      `${file} must not put the question in the URL`,
    );
  }
});

test('PEARL is downloaded only after the research tab is first opened', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/account/ConciergeModes.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(
    source,
    /import ResearchDesk from/,
    'a static ResearchDesk import would put the full PEARL library back into the opening page bundle',
  );
  assert.match(source, /dynamic\(\(\) => import\(['"]@\/components\/account\/ResearchDesk['"]\)/);
  assert.match(source, /if \(next === ['"]research['"]\) setResearchOpened\(true\);/);
  assert.match(source, /researchOpened \? <ResearchDesk handoff=\{handoff\} adminPreview=\{adminPreview\} \/> : null/);
  assert.ok(
    !source.includes('setResearchOpened(false)'),
    'once mounted, PEARL must remain mounted so its conversation survives tab switches',
  );
});

test('late mounting keeps both PEARL handoff routes intact', async () => {
  const { readFileSync } = await import('node:fs');
  const modes = readFileSync(
    new URL('../src/components/account/ConciergeModes.tsx', import.meta.url),
    'utf8',
  );
  const desk = readFileSync(
    new URL('../src/components/account/ResearchDesk.tsx', import.meta.url),
    'utf8',
  );

  /* Same-page route: the parent keeps the question while the dynamic desk is
     loading, then passes that unchanged handoff into the first mount. */
  assert.match(modes, /setHandoff\(\{ text, key: handoffCount\.current \}\);/);
  assert.match(modes, /<ResearchDesk handoff=\{handoff\} adminPreview=\{adminPreview\} \/>/);

  /* Fresh-page route: ?mode=research requests the late mount, and the stored
     question is still read once only after the customer accepts the notice. */
  assert.match(modes, /if \(initialMode === ['"]research['"]\) setResearchOpened\(true\);/);
  const acceptStart = desk.indexOf('function acceptTerms()');
  const acceptEnd = desk.indexOf('\n  }', acceptStart);
  const acceptBody = desk.slice(acceptStart, acceptEnd);
  assert.match(acceptBody, /const stashed = takeResearchQuestion\(\);/);
  assert.match(acceptBody, /if \(handoff \|\| !stashed\) return;/);
  assert.doesNotMatch(acceptBody, /answerQuestion\(/, 'a carried question must never be asked automatically');
});

test('a PEARL-tagged Concierge answer opens PEARL with the original question', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/account/ConciergeChat.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /if \(json\.researchChat && onOpenResearch\) onOpenResearch\(question\);/);
});

test('each Concierge follow-up sends the latest rendered conversation', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(
    new URL('../src/components/account/ConciergeChat.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /turnsRef\.current = turns;/);
  assert.match(source, /const history = turnsRef\.current\.slice\(-8\)/);
});
