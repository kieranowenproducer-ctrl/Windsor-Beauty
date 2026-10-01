import assert from 'node:assert/strict';
import test from 'node:test';
import { answerPearlConversation, interpretAudienceBenefitQuestion, PEARL_CONVERSATION_MODEL } from '../src/lib/concierge/research/conversation-ai.ts';

const base = {
  priorTurns: [{ role: 'user', text: 'I meant skin tanning', productIds: [], goalIds: ['tanning'] }],
  evidence: [{ sourceId: 'source-1', productId: 'mt2', goalIds: ['tanning'], summary: 'MT2 is associated with pigmentation research.', limitations: 'Research limitations apply.' }],
  allowedProductIds: new Set(['mt2']), allowedGoalIds: new Set(['tanning']), allowedSourceIds: new Set(['source-1']), apiKey: 'test',
};

const answer = { title: 'Closest research match', summary: 'MT2 is the closest source-listed match.', matches: [{ productId: 'mt2', explanation: 'It is associated with pigmentation research.', sourceIds: ['source-1'] }], sourceIds: ['source-1'], followUp: 'Ask for more detail if useful.' };

function responseFetch(payload, calls = []) {
  return async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ output_text: JSON.stringify(payload), usage: { input_tokens: 90, output_tokens: 40 } }), { status: 200 });
  };
}

test('protected questions bypass fetch, including combinations', async () => {
  for (const question of ['I took too much MT2', 'how do I inject it', 'what dose is used', 'can I stack MT2 with BPC']) {
    let called = false;
    const result = await answerPearlConversation({ ...base, question, fetchImpl: async () => { called = true; throw new Error('no'); } });
    assert.equal(result.route, 'deterministic');
    assert.equal(called, false);
  }
});

test('uses Luna, low reasoning, store false, no tools and compact history', async () => {
  const calls = [];
  const result = await answerPearlConversation({ ...base, question: 'What helps with a tan?', fetchImpl: responseFetch(answer, calls) });
  assert.equal(result.route, 'ai');
  assert.equal(calls[0].model, PEARL_CONVERSATION_MODEL);
  assert.equal(calls[0].reasoning.effort, 'low');
  assert.equal(calls[0].store, false);
  assert.equal('tools' in calls[0], false);
  assert.equal(calls[0].text.format.strict, true);
});

test('general who-it-works-for wording becomes a researched-benefits question', async () => {
  assert.match(interpretAudienceBenefitQuestion('Who does it work for?'), /what does it do.*benefits.*researched for/i);
  assert.equal(interpretAudienceBenefitQuestion('Is it suitable for me?'), 'Is it suitable for me?');
  const calls = [];
  await answerPearlConversation({ ...base, question: 'Who does it work for?', fetchImpl: responseFetch(answer, calls) });
  const sent = JSON.parse(calls[0].input[0].content[0].text);
  assert.match(sent.question, /what does it do.*benefits.*researched for/i);
});

test('keeps ten complete question-and-answer turns for follow-up reasoning', async () => {
  const calls = [];
  const priorTurns = Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user', text: `turn ${index}`,
    productIds: index % 2 ? ['mt2'] : [], goalIds: ['tanning'],
  }));
  const result = await answerPearlConversation({ ...base, priorTurns, question: 'Why was that selected?', fetchImpl: responseFetch(answer, calls) });
  assert.equal(result.route, 'ai');
  const sent = JSON.parse(calls[0].input[0].content[0].text);
  assert.equal(sent.priorTurns.length, 20);
  assert.equal(sent.priorTurns[0].text, 'turn 4');
});

test('rejects products and sources outside retrieved evidence', async () => {
  const bad = { ...answer, matches: [{ productId: 'invented', explanation: 'Made up.', sourceIds: ['source-1'] }] };
  const result = await answerPearlConversation({ ...base, question: 'What helps with a tan?', fetchImpl: responseFetch(bad) });
  assert.equal(result.route, 'deterministic');
  assert.equal(result.reason, 'invalid_or_ungrounded_output');
});

test('filters unapproved evidence before the request', async () => {
  const calls = [];
  await answerPearlConversation({ ...base, question: 'What helps with a tan?', evidence: [...base.evidence, { sourceId: 'bad', productId: 'invented', goalIds: [], summary: 'bad', limitations: '' }], fetchImpl: responseFetch(answer, calls) });
  const sent = JSON.parse(calls[0].input[0].content[0].text);
  assert.equal(sent.approvedEvidence.length, 1);
});

test('retries once, then falls back without throwing', async () => {
  let calls = 0;
  const result = await answerPearlConversation({ ...base, question: 'What helps with a tan?', fetchImpl: async () => { calls += 1; return new Response('busy', { status: 503 }); } });
  assert.equal(calls, 2);
  assert.equal(result.route, 'deterministic');
  assert.equal(result.reason, 'api_503');
  assert.deepEqual(Object.keys(result.audit).sort(), ['attempts', 'evidenceItemCount', 'model', 'priorTurnCount', 'promptVersion', 'questionCharacters', 'usage'].sort());
});
