/**
 * Prove the answer-layout layer holds (Kieran's feature, 18 Aug 2026).
 *
 * Runs in `npm run check`, so the build fails if the rules ever weaken:
 * no layout means byte-identical answers; the title and one-line summary are
 * pinned; unapproved custom words never render; safety and emergency answers
 * keep their fixed form; and a layout only touches its own target.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, applyAnswerLayout } from '../src/lib/concierge/research/chat-engine.mjs';

const QUESTION = 'What does BPC-157 research focus on?';

function layoutRecord(extra) {
  return {
    recordType: 'layout', reviewStatus: 'approved', enabled: true,
    targetKind: 'compound', targetValue: 'bpc-157',
    blocks: [
      { type: 'section', title: 'Limitations' },
      { type: 'custom', id: 'c1', heading: 'A note', text: 'Approved words.', approved: true },
      { type: 'rest' },
    ],
    ...extra,
  };
}

test('no layout means a byte-identical answer', () => {
  const plain = answerQuestion(QUESTION);
  assert.equal(JSON.stringify(answerQuestion(QUESTION, [], { overrides: [] })), JSON.stringify(plain));
});

test('a layout reorders sections and pins the title and summary', () => {
  const plain = answerQuestion(QUESTION);
  const laid = answerQuestion(QUESTION, [], { overrides: [layoutRecord()] });
  assert.equal(laid.sections[0].title, 'Limitations');
  assert.equal(laid.title, plain.title);
  assert.equal(laid.summary, plain.summary);
});

test('hidden sections disappear and the rest keep their order', () => {
  const plain = answerQuestion(QUESTION);
  const laid = answerQuestion(QUESTION, [], {
    overrides: [layoutRecord({ blocks: [{ type: 'section', title: 'Evidence strength', hidden: true }, { type: 'rest' }] })],
  });
  const titles = laid.sections.map((section) => section.title);
  assert.equal(titles.includes('Evidence strength'), false);
  assert.equal(titles.length, plain.sections.length - 1);
});

test('approved custom words render; unapproved words never do', () => {
  const laid = answerQuestion(QUESTION, [], {
    overrides: [layoutRecord({ blocks: [
      { type: 'custom', id: 'ok', heading: 'A note', text: 'Approved words.', approved: true },
      { type: 'custom', id: 'draft', heading: 'Draft', text: 'DRAFT WORDS', approved: false },
      { type: 'rest' },
    ] })],
  });
  const flat = JSON.stringify(laid.sections);
  assert.equal(flat.includes('Approved words.'), true);
  assert.equal(flat.includes('DRAFT WORDS'), false);
});

test('safety and emergency answers keep their fixed form', () => {
  const record = layoutRecord();
  for (const question of ['What risks are listed for BPC-157?', 'I think I took an overdose of BPC-157']) {
    const plain = answerQuestion(question);
    const laid = answerQuestion(question, [], { overrides: [record] });
    assert.equal(JSON.stringify(laid), JSON.stringify(plain), `${plain.kind} answer must not change`);
  }
});

test('a layout for another compound leaves this answer alone', () => {
  const plain = answerQuestion(QUESTION);
  const laid = answerQuestion(QUESTION, [], { overrides: [layoutRecord({ targetValue: 'semaglutide' })] });
  assert.equal(JSON.stringify(laid), JSON.stringify(plain));
});

test('category targeting reaches every compound in the category', () => {
  const laid = answerQuestion(QUESTION, [], { overrides: [layoutRecord({ targetKind: 'category', targetValue: 'healing' })] });
  assert.equal(laid.sections[0].title, 'Limitations');
});

test('a disabled or unapproved layout record changes nothing', () => {
  const plain = answerQuestion(QUESTION);
  const laid = answerQuestion(QUESTION, [], {
    overrides: [layoutRecord({ enabled: false }), layoutRecord({ reviewStatus: 'review' })],
  });
  assert.equal(JSON.stringify(laid), JSON.stringify(plain));
});

test('the rest marker places unlisted sections where it sits', () => {
  const answer = { kind: 'overview', sections: [{ title: 'A', items: ['1'] }, { title: 'B', items: ['2'] }, { title: 'C', items: ['3'] }] };
  const laid = applyAnswerLayout(answer, { blocks: [{ type: 'section', title: 'C' }, { type: 'rest' }] });
  assert.deepEqual(laid.sections.map((section) => section.title), ['C', 'A', 'B']);
});

test('applyAnswerLayout never mutates the original answer', () => {
  const answer = { kind: 'overview', sections: [{ title: 'A', items: ['1'] }] };
  const frozen = JSON.stringify(answer);
  applyAnswerLayout(answer, { blocks: [{ type: 'section', title: 'A', hidden: true }] });
  assert.equal(JSON.stringify(answer), frozen);
});
