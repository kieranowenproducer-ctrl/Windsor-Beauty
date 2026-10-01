/**
 * PEARL catalogue and everyday-language acceptance audit.
 *
 * This is deliberately separate from the large answer snapshot. A snapshot
 * proves that an answer stayed the same; this file proves that the answer is
 * useful. It checks the shop catalogue, its complete keyword vocabulary,
 * short recommendation shape, common wording, collisions and live wiring.
 *
 * Run from the website root:
 *   node --import ./scripts/alias-loader.mjs --experimental-strip-types \
 *     --no-warnings --test scripts/test-pearl-catalogue-acceptance.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PRODUCTS } from '../src/data/products.ts';
import { answerQuestion } from '../src/lib/concierge/research/chat-engine.mjs';
import { resolveProductComposition } from '../src/lib/concierge/research/product-compositions.mjs';

const normal = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const compact = (value) => normal(value).replace(/\s+/g, '');
const unique = (values) => [...new Set(values.filter(Boolean))];

const CATALOGUE_KEYWORDS = unique(
  PRODUCTS.flatMap((product) => product.keywords || []).map((word) => String(word).trim().toLowerCase()),
).sort();

assert.equal(PRODUCTS.length, 61, 'The catalogue changed: review and extend this acceptance audit.');
assert.equal(CATALOGUE_KEYWORDS.length, 294, 'The catalogue keyword set changed: review the new words before accepting it.');

const SUPPORT_OR_COMPOSITION_PRODUCTS = new Set([
  'bac-water',
  'acetic-acid-06-10ml',
  'peptide-complex',
  'glow-pen',
  'wolverine-recovery-pen',
  'wolverine-blend',
  'cjc-1295-no-dac-ipamorelin-10mg',
]);

const SHOP_NAME_EQUIVALENTS = {
  'aod-9604': ['aod9604'],
  'hgh-fragment-176-191': ['hgh fragment', 'hgh fragment 176 191'],
  'll-37': ['ll37'],
  'hgh191aa': ['hgh 191aa'],
  'igf-1-des': ['igf des', 'igf 1 des'],
  'n-acetyl-semax-amidate': ['n acetyl semax amidate'],
  'pt-141': ['pt 141', 'bremelanotide'],
  'mt2-tanning-pen': ['melanotan ii', 'melanotan 2', 'mt2'],
  '5-amino-1mq-100mg': ['5 amino 1mq'],
  'nad-1000mg': ['nad', 'nad+'],
  'l-carnitine-5000mg': ['l carnitine'],
  'dsip-5mg': ['dsip'],
  'cjc-1295': ['cjc 1295 no dac', 'cjc 1295 with dac'],
};

function identityTerms(product) {
  const name = normal(product.name)
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg)\b/g, '')
    .replace(/\b(remedium research|slimfinity|synedica|lean luxe)\b/g, '')
    .replace(/\bpen\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return unique([
    product.name,
    product.slug.replaceAll('-', ' '),
    name,
    ...(SHOP_NAME_EQUIVALENTS[product.slug] || []),
  ]).map(compact);
}

function answerText(answer) {
  return normal([
    answer.title,
    answer.keyPoint,
    answer.summary,
    ...(answer.compounds || []),
    ...(answer.bullets || []),
    ...(answer.sections || []).flatMap((section) => section.items || []),
  ].join(' '));
}

function recommendationCandidates(answer) {
  if (Array.isArray(answer.recommendations)) return answer.recommendations;
  if (Array.isArray(answer.candidates)) return answer.candidates;
  if (answer.kind === 'recommendation' && Array.isArray(answer.compounds)) return answer.compounds;
  const recommendationSection = (answer.sections || []).find((section) =>
    /recommend|best match|top match|shortlist/i.test(section.title || ''),
  );
  if (recommendationSection) return recommendationSection.items || [];
  return answer.kind === 'topic' ? (answer.compounds || []) : [];
}

function candidateIdentity(candidate) {
  if (typeof candidate === 'string') return candidate;
  return candidate.productSlug || candidate.slug || candidate.compoundSlug
    || candidate.name || candidate.label || candidate.title || '';
}

function hasBriefReason(candidate, answer) {
  if (typeof candidate === 'object' && candidate) {
    return Boolean(candidate.reason || candidate.summary || candidate.mechanism || candidate.description);
  }
  const text = answerText(answer);
  return text.length > normal(candidate).length + 12;
}

const suppliedTerms = new Set(PRODUCTS.flatMap(identityTerms));

function isSupplied(candidate) {
  const identity = compact(candidateIdentity(candidate));
  if (!identity) return false;
  if (suppliedTerms.has(identity)) return true;
  return [...suppliedTerms].some((term) => term.length >= 4 && (identity.includes(term) || term.includes(identity)));
}

async function loadGoalGuidance() {
  try {
    return await import('../src/lib/concierge/research/goal-guidance.mjs');
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

const guidanceModule = await loadGoalGuidance();

for (const goal of guidanceModule?.GOAL_GUIDANCE || []) {
  for (const pick of goal.shortlist || []) {
    suppliedTerms.add(compact(pick.slug));
    suppliedTerms.add(compact(pick.name));
  }
}

function registryFrom(module) {
  if (!module) return null;
  return module.GOAL_GUIDANCE || module.GOAL_REGISTRY || module.PRODUCT_GOAL_GUIDANCE
    || module.GUIDANCE_REGISTRY || module.goalRegistry || null;
}

function resolverFrom(module) {
  if (!module) return null;
  return module.resolveGoalGuidance || module.resolveProductGoal || module.resolveGoal
    || module.matchGoalGuidance || null;
}

function flattenedGuidanceWords(registry) {
  const records = Array.isArray(registry) ? registry : Object.values(registry || {});
  return new Set(records.flatMap((record) => [
    record.id,
    record.label,
    ...(record.keywords || []),
    ...(record.aliases || []),
    ...(record.phrases || []),
    ...(record.misspellings || []),
  ]).map(normal).filter(Boolean));
}

test('all 61 catalogue identities resolve without an unrelated fuzzy guess', async (t) => {
  for (const product of PRODUCTS) {
    await t.test(product.name, () => {
      const composition = SUPPORT_OR_COMPOSITION_PRODUCTS.has(product.slug);
      const question = composition ? `What is in ${product.name}?` : `Tell me about ${product.name}`;
      const answer = answerQuestion(question, [], { adminPreview: true });
      assert.notEqual(answer.title, 'I could not match that question yet', `${product.name}: no identity match`);
      const text = compact(answerText(answer));
      const expected = identityTerms(product);
      assert.ok(
        expected.some((term) => term.length >= 3 && text.includes(term)),
        `${product.name}: answer appears unrelated (${answer.title})`,
      );
    });
  }
});

function onePhoneTypo(value) {
  const words = normal(value).split(' ');
  const index = words.findIndex((word) => /^[a-z]{7,}$/.test(word));
  if (index < 0) return null;
  const word = words[index];
  const at = Math.max(1, Math.floor(word.length / 2) - 1);
  words[index] = `${word.slice(0, at)}${word[at + 1]}${word[at]}${word.slice(at + 2)}`;
  return words.join(' ');
}

function oneMissingLetter(value) {
  const words = normal(value).split(' ');
  const index = words.findIndex((word) => /^[a-z]{7,}$/.test(word));
  if (index < 0) return null;
  const word = words[index];
  const at = Math.floor(word.length / 2);
  words[index] = `${word.slice(0, at)}${word.slice(at + 1)}`;
  return words.join(' ');
}

function oneExtraLetter(value) {
  const words = normal(value).split(' ');
  const index = words.findIndex((word) => /^[a-z]{7,}$/.test(word));
  if (index < 0) return null;
  const word = words[index];
  const at = Math.floor(word.length / 2);
  words[index] = `${word.slice(0, at)}${word[at]}${word.slice(at)}`;
  return words.join(' ');
}

test('every shop product survives capitals, punctuation, spacing and common phone typos', async (t) => {
  for (const product of PRODUCTS) {
    await t.test(product.name, () => {
      const variants = unique([
        product.name,
        normal(product.name),
        compact(product.name),
        product.name.toUpperCase(),
        onePhoneTypo(product.name),
        oneMissingLetter(product.name),
        oneExtraLetter(product.name),
      ]);
      for (const wording of variants) {
        const result = resolveProductComposition(`What is in ${wording}?`);
        assert.equal(result.status, 'resolved', `${product.name}: did not resolve “${wording}”`);
        assert.equal(result.slug, product.slug, `${product.name}: “${wording}” resolved to ${result.name}`);
      }
    });
  }
});

test('the first three meaningful characters of every shop product reach a relevant answer or choice', async (t) => {
  for (const product of PRODUCTS) {
    await t.test(product.name, () => {
      const base = normal(product.name)
        .replace(/\b\d+(?:\.\d+)?\s*(?:mg|ml|mcg)\b/g, '')
        .replace(/\b(remedium research|slimfinity|synedica|lean luxe)\b/g, '')
        .trim();
      const prefix = compact(base).slice(0, 3);
      assert.ok(prefix.length === 3 && /[a-z]/.test(prefix), `${product.name}: no meaningful three-character start`);
      const answer = answerQuestion(`What does ${prefix} do?`, [], { adminPreview: true });
      assert.notEqual(answer.title, 'I could not match that question yet', `${product.name}: “${prefix}” was lost`);
      assert.ok(
        (answer.compounds || []).length || (answer.suggestions || []).length,
        `${product.name}: “${prefix}” returned neither an answer nor choices`,
      );
    });
  }
});

test('the goal-guidance layer accounts for every one of the 294 catalogue keywords', async (t) => {
  assert.ok(guidanceModule, 'Missing goal-guidance.mjs: deterministic recommendations need one owned vocabulary.');
  const registry = registryFrom(guidanceModule);
  const resolver = resolverFrom(guidanceModule);
  const productGuidance = guidanceModule.SUPPLIED_PRODUCT_GUIDANCE_BY_SLUG;
  assert.ok(registry, 'goal-guidance.mjs must export GOAL_GUIDANCE.');
  assert.ok(productGuidance instanceof Map, 'goal-guidance.mjs must classify every supplied product by slug.');
  assert.deepEqual(
    guidanceModule.validateGoalGuidance?.({ productSlugs: PRODUCTS.map((product) => product.slug) }),
    [],
    'The goal-guidance registry failed its own integrity check.',
  );

  for (const keyword of CATALOGUE_KEYWORDS) {
    await t.test(keyword, () => {
      const owners = PRODUCTS.filter((product) =>
        (product.keywords || []).some((word) => String(word).trim().toLowerCase() === keyword),
      );
      const guidance = owners.map((product) => productGuidance.get(product.slug)).filter(Boolean);
      const resolved = typeof resolver === 'function' ? resolver(keyword) : null;
      assert.ok(
        resolved || guidance.some((item) => item.goalIds?.length || item.supplyOnly),
        `Catalogue keyword has no classified supplied product: ${keyword}`,
      );
    });
  }
});

const GOAL_CASES = [
  { id: 'weight-loss', first: /retatrutide|reta/i, phrases: ['weight loss', 'lose weight', 'slim down', 'burn fat', 'appetite suppression', 'belly fat', 'weigth loss'] },
  { id: 'tanning', first: /mt2|melanotan ii|melanotan 2/i, phrases: ['get a tan', 'tanning', 'skin darker', 'get brown', 'sun tan', 'tannning'] },
  { id: 'sleep', first: /dsip/i, phrases: ['sleep better', 'cannot sleep', 'insomnia', 'restful sleep', 'sleap'] },
  { id: 'healing', first: /bpc|wolverine|tb-?500/i, phrases: ['healing', 'recover after gym', 'sore muscles', 'tendon injury', 'wound repair', 'recovary'] },
  { id: 'skin', first: /ghk|glow/i, phrases: ['better skin', 'glowing skin', 'wrinkles', 'collagen', 'skin repair', 'skinn health'] },
  { id: 'hair', first: /ghk|glow/i, phrases: ['hair loss', 'hair thinning', 'hair growth', 'alopecia', 'thining hair'] },
  { id: 'anxiety', first: /selank/i, phrases: ['anxiety', 'calm me down', 'stress relief', 'panic', 'anxiaty'] },
  { id: 'focus', first: /semax/i, phrases: ['focus', 'concentrate', 'brain fog', 'mental clarity', 'concentraition'] },
  { id: 'libido', first: /pt-?141|bremelanotide/i, phrases: ['libido', 'sex drive', 'sexual performance', 'erectile problems', 'arousal'] },
  { id: 'energy', first: /mots|nad|l carnitine|slu/i, phrases: ['energy', 'stamina', 'fatigue', 'endurance', 'enerjy'] },
  { id: 'muscle', first: /igf|follistatin|mgf/i, phrases: ['muscle gain', 'build muscle', 'get ripped', 'bodybuilding', 'strengh'] },
  { id: 'immune', first: /thymosin alpha|kpv|ll-?37/i, phrases: ['immune support', 'immunity', 'inflammation', 'immune defence'] },
  { id: 'fertility', first: /kisspeptin|gonadorelin/i, phrases: ['fertility', 'ovulation', 'sperm health', 'reproductive hormones'] },
  { id: 'longevity', first: /epithalon|nad|mots/i, phrases: ['anti ageing', 'look younger', 'longevity', 'healthy ageing'] },
  { id: 'gut', first: /bpc|kpv/i, phrases: ['gut health', 'gut problems', 'bowel health', 'digestive repair'] },
];

test('natural goal variants and misspellings return a supplied, unique top three with brief reasons', async (t) => {
  for (const goal of GOAL_CASES) {
    for (const phrase of goal.phrases) {
      await t.test(`${goal.id}: ${phrase}`, () => {
        const answer = answerQuestion(`What should I take for ${phrase}?`, [], { adminPreview: true });
        const candidates = recommendationCandidates(answer);
        assert.ok(candidates.length >= 1, `${phrase}: no recommendation candidates`);
        assert.ok(candidates.length <= 3, `${phrase}: returned ${candidates.length}, expected no more than 3`);
        const identities = candidates.map((candidate) => compact(candidateIdentity(candidate)));
        assert.equal(new Set(identities).size, identities.length, `${phrase}: duplicate candidates`);
        assert.match(candidateIdentity(candidates[0]), goal.first, `${phrase}: wrong first match`);
        assert.ok(candidates.every(isSupplied), `${phrase}: recommendation includes an unsupplied item: ${identities.join(', ')}`);
        assert.ok(candidates.every((candidate) => hasBriefReason(candidate, answer)), `${phrase}: each result needs a brief reason`);
      });
    }
  }
});

const COLLISIONS = [
  ['What should I take to relax?', /relaxin/i],
  ['What should I take to get a tan?', /thymosin alpha|ta-?1/i],
  ['What should I take for rest?', /retatrutide/i],
  ['What is MT1?', /melanotan ii/i],
  ['What is MT2?', /melanotan i(?!i)/i],
  ['What is MT3?', /^Melanotan (?:I|II)$/i],
  ['What is TB?', /^TB-500:/i],
  ['What is TB4?', /^TB-500:/i],
  ['10 mg dose', /melanotan|thymosin|retatrutide/i],
  ['zibble frax information', /melanotan|thymosin|retatrutide/i],
];

test('short words and adjacent names do not become false confident matches', async (t) => {
  for (const [question, forbidden] of COLLISIONS) {
    await t.test(question, () => {
      const answer = answerQuestion(question, [], { adminPreview: true });
      const first = candidateIdentity(recommendationCandidates(answer)[0] || answer.title);
      if (/What is MT3|What is TB\?|What is TB4/.test(question)) {
        assert.equal(answer.kind, 'clarify', `${question}: must ask rather than guess`);
      }
      assert.doesNotMatch(first, forbidden, `${question}: false match ${first}`);
    });
  }
});

test('an explicit dosage request bypasses recommendation guidance and keeps the short dose contract', () => {
  for (const question of [
    'What dosage is listed for Retatrutide?',
    'MT2 dose',
    'What dose of BPC-157 should I take for my shoulder?',
    'Dose?',
  ]) {
    const context = question === 'Dose?' ? ['BPC-157'] : [];
    const answer = answerQuestion(question, context, { adminPreview: true });
    assert.equal(answer.kind, 'dose', question);
    assert.ok(Array.isArray(answer.dose), question);
    if (!/should i take/i.test(question)) assert.equal(answer.keyPoint || '', '', question);
    assert.doesNotMatch(answer.title || '', /top match|recommend/i, question);
    assert.deepEqual(answer.sections || [], [], question);
    assert.deepEqual(answer.bullets || [], [], question);
    assert.deepEqual(answer.followUps || [], ['How do I use the dosage calculator?'], question);
  }
});

test('the live concierge page passes the staff flag through every UI layer into PEARL', async () => {
  const [page, modes, desk] = await Promise.all([
    readFile(new URL('../src/app/concierge/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/account/ConciergeModes.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/account/ResearchDesk.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /<ConciergeModes[^>]+adminPreview=\{visitor\.staff\}/);
  assert.match(modes, /<ResearchDesk[^>]+adminPreview=\{adminPreview\}/);
  assert.match(desk, /answerQuestion\(trimmed, priorCompounds, \{[\s\S]*?adminPreview,/);
});
