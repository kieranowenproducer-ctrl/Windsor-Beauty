import assert from 'node:assert/strict';
import test from 'node:test';
import {
  interpretPearlQuestion, PEARL_INTERPRETER_MODEL, protectedPearlRoute, redactPearlQuestion,
} from '../src/lib/concierge/research/ai-interpreter.ts';

const candidates = {
  goals: [{ id: 'tanning', label: 'Tanning', description: 'skin pigmentation', sourceIds: ['approved-source'] }],
  products: [{ id: 'mt2', label: 'MT2', description: 'pigmentation research', sourceIds: ['approved-source'] }],
  sources: [{ id: 'approved-source', label: 'Approved source', description: 'reviewed', sourceIds: ['approved-source'] }],
  allowedGoalIds: new Set(['tanning']),
  allowedProductIds: new Set(['mt2']),
  allowedSourceIds: new Set(['approved-source']),
};

function okFetch(result, calls) {
  return async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ output_text: JSON.stringify(result), usage: { input_tokens: 40, output_tokens: 20 } }), { status: 200 });
  };
}

test('protected routes never call AI', async () => {
  for (const [question, route] of [
    ['I took too much MT2', 'emergency'], ['how do I inject MT2', 'procedure'], ['what dose of MT2', 'dosage'],
  ]) {
    let called = false;
    const result = await interpretPearlQuestion({ ...candidates, question, apiKey: 'test', fetchImpl: async () => { called = true; throw new Error('must not call'); } });
    assert.equal(called, false);
    assert.equal(result.reason, `protected_${route}`);
  }
});

test('tanning can resolve only to allowed MT2 and uses Responses privacy controls', async () => {
  const calls = [];
  const result = await interpretPearlQuestion({
    ...candidates, question: 'what do I take to get a tan', apiKey: 'test', fetchImpl: okFetch({
      intent: 'goal', goalIds: ['tanning'], productIds: ['mt2'], sourceIds: ['approved-source'],
      confidence: 0.98, needsClarification: false, clarification: '',
    }, calls),
  });
  assert.equal(result.route, 'ai');
  assert.deepEqual(result.interpretation?.productIds, ['mt2']);
  assert.equal(calls[0].model, PEARL_INTERPRETER_MODEL);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].text.format.type, 'json_schema');
  assert.equal(calls[0].text.format.strict, true);
});

test('redacts personal and secret-shaped text before sending', async () => {
  const calls = [];
  await interpretPearlQuestion({ ...candidates, question: 'email me@site.com postcode SL4 1AA sk-testsecret123456 about a tan', apiKey: 'test', fetchImpl: okFetch({
    intent: 'goal', goalIds: ['tanning'], productIds: ['mt2'], sourceIds: ['approved-source'], confidence: 0.9, needsClarification: false, clarification: '',
  }, calls) });
  const sent = calls[0].input[0].content[0].text;
  assert.doesNotMatch(sent, /me@site|SL4 1AA|sk-testsecret/);
  assert.match(redactPearlQuestion('me@site.com'), /email removed/);
});

test('rejects an invented product ID', async () => {
  const result = await interpretPearlQuestion({ ...candidates, question: 'help me tan', apiKey: 'test', fetchImpl: okFetch({
    intent: 'goal', goalIds: ['tanning'], productIds: ['invented'], sourceIds: [], confidence: 0.9, needsClarification: false, clarification: '',
  }, []) });
  assert.equal(result.route, 'deterministic');
  assert.equal(result.reason, 'invalid_or_unapproved_output');
});

test('retries once for a transient failure then falls back', async () => {
  let calls = 0;
  const result = await interpretPearlQuestion({ ...candidates, question: 'help me tan', apiKey: 'test', fetchImpl: async () => {
    calls += 1;
    return new Response('busy', { status: 503 });
  } });
  assert.equal(calls, 2);
  assert.equal(result.route, 'deterministic');
  assert.equal(result.reason, 'api_503');
});

test('local protected-route classifier is explicit', () => {
  assert.equal(protectedPearlRoute('how much should I use'), 'dosage');
  assert.equal(protectedPearlRoute('show tanning research'), null);
});

test('does not truncate approved products to the first forty', async () => {
  const products = Array.from({ length: 80 }, (_, index) => ({
    id: `product-${index}`, label: `Product ${index}`, description: 'approved', sourceIds: ['approved-source'],
  }));
  const calls = [];
  await interpretPearlQuestion({
    ...candidates, products, allowedProductIds: new Set(products.map((item) => item.id)),
    question: 'which research matches this goal', apiKey: 'test', fetchImpl: okFetch({
      intent: 'product', goalIds: [], productIds: ['product-79'], sourceIds: ['approved-source'], confidence: 0.9,
      needsClarification: false, clarification: '',
    }, calls),
  });
  const sent = JSON.parse(calls[0].input[0].content[0].text);
  assert.equal(sent.approvedCandidates.products.length, 80);
});
