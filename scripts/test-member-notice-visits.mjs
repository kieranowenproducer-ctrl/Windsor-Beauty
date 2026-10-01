// Proves the visit log tells "used the dose calculator" apart from "was shown the sign-in notice"
// (Samuel's voice note, 26 Sept 2026). Visitor Demand listed "Dose calculator" against a Visitor,
// which read as a non-member using a members-only tool; what they had really seen was the notice.
//
// Read-only. The one database call is the same SELECT the page makes, for a token that cannot exist.
// Run: node --import ./scripts/alias-loader.mjs --experimental-strip-types --no-warnings --test scripts/test-member-notice-visits.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// memberOnlyPages imports `next/headers`, which Node only finds with its `.js` on. Nothing here
// calls it: these tests only reach the parts that need no request.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'next/headers' ? 'next/headers.js' : specifier, context);
  },
});
const { MEMBER_NOTICE_SUFFIX, visitPathAsSeen } = await import('@/lib/memberOnlyPages');
const { describePage } = await import('@/lib/ads/pageNames');

test('a signed-out visit to the calculator is logged as the notice', async () => {
  assert.equal(await visitPathAsSeen('/calculator', null), `/calculator${MEMBER_NOTICE_SUFFIX}`);
  assert.equal(await visitPathAsSeen('/calculator/', null), `/calculator${MEMBER_NOTICE_SUFFIX}`);
  assert.equal(await visitPathAsSeen('/dosage-guide', null), `/dosage-guide${MEMBER_NOTICE_SUFFIX}`);
});

test('a member cookie that matches no live session is logged as the notice, as the page shows', async () => {
  assert.equal(await visitPathAsSeen('/calculator', 'not-a-real-session-token'), `/calculator${MEMBER_NOTICE_SUFFIX}`);
});

test('every other page is logged exactly as before', async () => {
  for (const path of ['/', '/shop', '/shop/retatrutide', '/calculators', '/account/login']) {
    assert.equal(await visitPathAsSeen(path, null), path);
  }
});

test('with the gate switched off the calculator is logged as the calculator', async () => {
  const before = process.env.MEMBER_ONLY_TOOLS;
  process.env.MEMBER_ONLY_TOOLS = 'off';
  try {
    assert.equal(await visitPathAsSeen('/calculator', null), '/calculator');
  } finally {
    if (before === undefined) delete process.env.MEMBER_ONLY_TOOLS;
    else process.env.MEMBER_ONLY_TOOLS = before;
  }
});

test('the dashboard names the notice plainly, and never as the calculator itself', () => {
  assert.equal(describePage('/calculator').title, 'Dose calculator');
  assert.match(describePage(`/calculator${MEMBER_NOTICE_SUFFIX}`).title, /blocked: shown the sign-in notice/);
  assert.match(describePage(`/dosage-guide${MEMBER_NOTICE_SUFFIX}`).title, /blocked: shown the sign-in notice/);
});
