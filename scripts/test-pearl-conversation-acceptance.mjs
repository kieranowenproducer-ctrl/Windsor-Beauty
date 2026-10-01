/**
 * PEARL multi-turn conversation acceptance audit.
 *
 * This exercises the same pure answer API used by ResearchDesk. Each turn
 * carries the prior answer and named compounds in the same shape as the UI.
 * It intentionally tests outcomes, rather than taking another output snapshot.
 *
 * Run:
 *   node --test scripts/test-pearl-conversation-acceptance.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';
import { GOAL_GUIDANCE } from '../src/lib/concierge/research/goal-guidance.mjs';

const clean = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function conversation() {
  const turns = [];
  return {
    turns,
    ask(question) {
      const prior = [...turns].reverse().find((turn) => turn.answer?.compounds?.length)?.answer;
      const answer = answerQuestion(question, prior?.compounds || [], {
        adminPreview: true,
        askedQuestions: [...turns.map((turn) => turn.question), question],
        previousAnswer: prior ? {
          kind: prior.kind,
          title: prior.title,
          compounds: prior.compounds,
          topicIds: prior.topicIds || [],
        } : null,
      });
      turns.push({ question, answer });
      return answer;
    },
  };
}

function optionNames(answer) {
  return answer.compounds || [];
}

function assertInitialShortlist(answer, goal) {
  const expected = goal.shortlist.slice(0, goal.maxVisible).map((pick) => clean(pick.name));
  const actual = optionNames(answer).map(clean);
  assert.equal(answer.kind, 'recommendation', goal.id);
  assert.ok(actual.length <= 3, `${goal.id}: more than three initial options`);
  assert.deepEqual(actual, expected, `${goal.id}: wrong reviewed order`);
  const items = (answer.sections || []).flatMap((section) => section.items || []);
  assert.equal(items.length, actual.length, `${goal.id}: each option needs exactly one short explanation`);
}

function assertSelected(answer, expectedName, question) {
  assert.notEqual(answer.kind, 'clarify', `${question}: lost the previous answer`);
  assert.ok(
    optionNames(answer).some((name) => clean(name).includes(clean(expectedName)) || clean(expectedName).includes(clean(name))),
    `${question}: expected ${expectedName}, received ${optionNames(answer).join(', ')}`,
  );
}

const REPRESENTATIVE_CONVERSATIONS = [
  ['weight loss', 'What should I take for weight loss?', 'weight-loss'],
  ['tanning', 'What should I take to get a tan?', 'pigmentation'],
  ['skincare', 'What should I take for better skin?', 'skin-collagen'],
  ['acne', 'What should I take for acne-prone skin?', 'skin-collagen'],
  ['sleep', 'What should I take to sleep better?', 'sleep'],
  ['sexual health', 'What should I take for sex drive?', 'sexual-health'],
  ['recovery', 'What should I take for injury recovery?', 'healing'],
  ['cognition', 'What should I take for brain fog?', 'cognitive'],
];

test('representative conversations support why, ordinals, comparisons, corrections and dose follow-ups', async (t) => {
  for (const [label, opening, goalId] of REPRESENTATIVE_CONVERSATIONS) {
    await t.test(label, () => {
      const goal = GOAL_GUIDANCE.find((item) => item.id === goalId);
      assert.ok(goal?.shortlist.length, `Missing reviewed guidance for ${goalId}`);
      const chat = conversation();
      const initial = chat.ask(opening);
      assertInitialShortlist(initial, goal);

      const why = chat.ask('And why?');
      assertSelected(why, goal.shortlist[0].name, 'And why?');
      assert.match(
        clean([why.keyPoint, why.summary, ...(why.bullets || []), ...(why.sections || []).flatMap((section) => section.items || [])].join(' ')),
        /research|source|linked|receptor|signalling|mechanism|study/,
        'And why? needs a short source-based explanation',
      );

      if (goal.shortlist.length > 1) {
        const second = chat.ask('Tell me about the second one');
        assertSelected(second, goal.shortlist[1].name, 'the second one');

        const freshComparison = conversation();
        freshComparison.ask(opening);
        const comparison = freshComparison.ask('Compare the first two');
        assert.equal(comparison.kind, 'comparison', 'Compare the first two');
        assert.deepEqual(
          optionNames(comparison).map(clean),
          goal.shortlist.slice(0, 2).map((pick) => clean(pick.name)),
          'Comparison must preserve the reviewed first-two order',
        );
      }

      const doseChat = conversation();
      doseChat.ask(opening);
      const dose = doseChat.ask('What source-listed dose is shown for the first one?');
      assert.equal(dose.kind, 'dose', 'A dose follow-up must bypass goal recommendations');
      assertSelected(dose, goal.shortlist[0].name, 'dose for the first one');
      assert.ok(Array.isArray(dose.dose), 'Dose facts must come from the deterministic dose data');
      assert.ok((dose.dose || []).every((row) => row.label && typeof row.value === 'string'));
      assert.ok(!(dose.sections || []).some((section) => /recommend|top match/i.test(section.title || '')));
    });
  }
});

test('every mapped goal keeps its reviewed context for why, second choice and dose', async (t) => {
  for (const goal of GOAL_GUIDANCE.filter((item) => item.shortlist.length)) {
    await t.test(goal.id, () => {
      const chat = conversation();
      const initial = chat.ask(`What should I take for ${goal.intentPhrases[0]}?`);
      assertInitialShortlist(initial, goal);
      assertSelected(chat.ask('And why is that the first match?'), goal.shortlist[0].name, `${goal.id}: why`);
      if (goal.shortlist.length > 1) {
        assertSelected(chat.ask('Tell me about the second one'), goal.shortlist[1].name, `${goal.id}: second`);

        const compareChat = conversation();
        compareChat.ask(`What should I take for ${goal.intentPhrases[0]}?`);
        const comparison = compareChat.ask('Compare the first two');
        assert.equal(comparison.kind, 'comparison', `${goal.id}: compare`);
        assert.deepEqual(
          optionNames(comparison).map(clean),
          goal.shortlist.slice(0, 2).map((pick) => clean(pick.name)),
          `${goal.id}: comparison changed the reviewed order`,
        );
      }

      const doseChat = conversation();
      doseChat.ask(`What should I take for ${goal.intentPhrases[0]}?`);
      const dose = doseChat.ask('Dose for the first one?');
      assert.equal(dose.kind, 'dose', `${goal.id}: dose must bypass recommendation routing`);
      assertSelected(dose, goal.shortlist[0].name, `${goal.id}: dose selection`);

      const changeChat = conversation();
      changeChat.ask(`What should I take for ${goal.intentPhrases[0]}?`);
      const destination = goal.id === 'weight-loss' ? 'pigmentation' : 'weight-loss';
      const destinationGoal = GOAL_GUIDANCE.find((item) => item.id === destination);
      const changed = changeChat.ask(destination === 'pigmentation'
        ? 'Actually, I mean tanning'
        : 'Actually, I mean weight loss');
      assertInitialShortlist(changed, destinationGoal);
    });
  }
});

test('a correction or clear topic change discards the old shortlist', () => {
  const chat = conversation();
  chat.ask('What should I take for weight loss?');
  const corrected = chat.ask('Actually, I mean tanning');
  assertInitialShortlist(corrected, GOAL_GUIDANCE.find((goal) => goal.id === 'pigmentation'));
  assert.deepEqual(optionNames(corrected).map(clean), ['mt2 melanotan ii']);

  const changed = chat.ask('Forget tanning. What about sleep instead?');
  assertInitialShortlist(changed, GOAL_GUIDANCE.find((goal) => goal.id === 'sleep'));
  assert.deepEqual(optionNames(changed).map(clean), ['dsip']);
});

test('AI writes grounded explanations while protected dose routes remain deterministic', async () => {
  const [interpreter, route, conversationAi] = await Promise.all([
    readFile(new URL('../src/lib/concierge/research/ai-interpreter.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/account/pearl-conversation/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/concierge/research/conversation-ai.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(interpreter, /Interpret language only/);
  assert.match(interpreter, /Never add medical facts, doses, procedures, products or sources/);
  assert.match(interpreter, /protectedPearlRoute\(input\.question\)/);
  assert.match(interpreter, /reason: `protected_\$\{protectedRoute\}`/);
  assert.doesNotMatch(interpreter, /answerText\s*:/, 'Interpreter schema must not accept AI-written answer text');
  assert.doesNotMatch(interpreter, /doseText\s*:/, 'Interpreter schema must not accept AI-written dose text');
  assert.match(route, /protectedConversationRoute\(question\)/);
  assert.match(route, /answerQuestion\(researchQuestion, priorNames, \{ adminPreview: true, previousAnswer \}\)/);
  assert.match(route, /interpretAudienceBenefitQuestion\(question\)/);
  assert.match(route, /answerPearlConversation\(/);
  assert.match(conversationAi, /store: false/);
  assert.match(conversationAi, /evidence/);
  assert.match(conversationAi, /allowedProductIds/);
});

test('ResearchDesk carries the prior structured answer into the pure engine', async () => {
  const desk = await readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8');
  assert.match(desk, /const priorCompounds = resetContext \? \[\] : priorAnswer\?\.compounds \?\? \[\]/);
  assert.match(desk, /previousAnswer: priorAnswer \? \{/);
  assert.match(desk, /topicIds: priorAnswer\.topicIds \|\| \[\]/);
  assert.match(desk, /askedQuestions,/);
  assert.match(desk, /MAX_CONVERSATION_QUESTIONS = 10/);
  assert.match(desk, /You have asked ten questions/);
  assert.match(desk, /Start a new conversation/);
});

test('the server searches the complete approved library before returning no evidence', async () => {
  const route = await readFile(new URL('../src/app/api/account/pearl-conversation/route.ts', import.meta.url), 'utf8');
  assert.match(route, /function libraryMatches\(/);
  assert.match(route, /const lexicalIds = libraryMatches\(researchQuestion\)/);
  assert.match(route, /interpretPearlQuestion\(/);
  assert.match(route, /\.\.\.lexicalIds/);
  assert.match(route, /userTurnCount >= 10/);
});
