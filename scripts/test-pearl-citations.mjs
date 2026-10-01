/**
 * Prove the citation-correction layer holds (dashboard audit fix 3, 18 Aug
 * 2026). Citations are baked into the evidence build; an approved
 * citation_correction proposal is the ONLY way to change the source strip at
 * answer time. Runs in `npm run check`, so the build fails if the rules ever
 * weaken: no correction means byte-identical answers, corrections only touch
 * their own compound, and a link can only ever be ADDED from a trusted
 * research host or the approved source library.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, isApprovedCitationUrl } from '../src/lib/concierge/research/chat-engine.mjs';

const QUESTION = 'What does BPC-157 research focus on?';

function correction(extra) {
  return { recordType: 'citation', reviewStatus: 'approved', enabled: true, compoundSlug: 'bpc-157', ...extra };
}

test('no corrections means a byte-identical answer', () => {
  const plain = answerQuestion(QUESTION);
  const withEmpty = answerQuestion(QUESTION, [], { overrides: [] });
  assert.equal(JSON.stringify(withEmpty), JSON.stringify(plain));
});

test('an approved remove correction drops exactly that link', () => {
  const plain = answerQuestion(QUESTION);
  const target = plain.sources[0].url;
  const fixed = answerQuestion(QUESTION, [], { overrides: [correction({ action: 'remove', url: target })] });
  assert.equal(fixed.sources.some((source) => source.url === target), false);
  assert.equal(fixed.sources.length, plain.sources.length - 1);
});

test('an approved add correction appends the link with its label', () => {
  const url = 'https://pubmed.ncbi.nlm.nih.gov/12345678/';
  const fixed = answerQuestion(QUESTION, [], { overrides: [correction({ action: 'add', url, label: 'Added study' })] });
  const added = fixed.sources.find((source) => source.url === url);
  assert.ok(added, 'the approved link should be shown');
  assert.equal(added.label, 'Added study');
});

test('a link from an unapproved host is never added, even if approved', () => {
  const fixed = answerQuestion(QUESTION, [], {
    overrides: [correction({ action: 'add', url: 'https://unapproved.example.com/claim' })],
  });
  assert.equal(fixed.sources.some((source) => String(source.url).includes('unapproved')), false);
});

test('a correction for another compound leaves this answer alone', () => {
  const plain = answerQuestion(QUESTION);
  const fixed = answerQuestion(QUESTION, [], {
    overrides: [correction({ compoundSlug: 'semaglutide', action: 'remove', url: plain.sources[0].url })],
  });
  assert.equal(JSON.stringify(fixed.sources), JSON.stringify(plain.sources));
});

test('an unapproved or disabled correction changes nothing', () => {
  const plain = answerQuestion(QUESTION);
  const target = plain.sources[0].url;
  const stillThere = answerQuestion(QUESTION, [], {
    overrides: [
      correction({ action: 'remove', url: target, reviewStatus: 'review' }),
      correction({ action: 'remove', url: target, enabled: false }),
    ],
  });
  assert.equal(stillThere.sources.some((source) => source.url === target), true);
});

test('remove matches the link with or without a trailing slash', () => {
  const plain = answerQuestion(QUESTION);
  const target = plain.sources[0].url;
  const flipped = target.endsWith('/') ? target.replace(/\/+$/, '') : `${target}/`;
  const fixed = answerQuestion(QUESTION, [], { overrides: [correction({ action: 'remove', url: flipped })] });
  assert.equal(fixed.sources.some((source) => source.url === target), false);
});

test('the shared URL guard only accepts https on approved hosts', () => {
  assert.equal(isApprovedCitationUrl('https://pubmed.ncbi.nlm.nih.gov/1/'), true);
  assert.equal(isApprovedCitationUrl('http://pubmed.ncbi.nlm.nih.gov/1/'), false);
  assert.equal(isApprovedCitationUrl('https://random.site/page'), false);
  assert.equal(isApprovedCitationUrl('not a url'), false);
});
