// Bacteriostatic water is not an upsell — it is part of selling a vial of dry powder, and no
// amount of curation may remove it. This check proves that, and FAILS THE BUILD when it stops
// being true. Run: npm run check:upsell-water (also inside npm run check).
//
// Why it exists: the pairing used to be a fallback, offered only to products nobody had curated
// rules for. On 22 Aug 2026, 27 of the 48 curated products carried no water rule and HGH 191AA,
// Oxytocin, NAD+ and the Wolverine blend showed none anywhere on the page. A fallback cannot
// express "always", so the rule became a standing one and this check holds it there.
//
// The existing scripts/test-upsell-compute.ts uses console.assert, which prints and carries on.
// This one exits 1.

import {
  buildReconstitutionRules,
  buildCategoryFallbackRules,
  buildEffectiveRules,
  computeUpsellRecommendations,
  coveredTriggerSlugs,
  needsReconstitution,
  RECONSTITUTION_TARGET_SLUG,
  ACETIC_ACID_SLUG,
  reconstitutionTargetFor,
} from '../src/lib/upsells.ts';

let failures = 0;
const ok = (label) => console.log(`  ok       ${label}`);
const fail = (label, detail) => { failures++; console.log(`  FAILED   ${label}${detail ? `\n           ${detail}` : ''}`); };
const check = (label, condition, detail) => (condition ? ok(label) : fail(label, detail));

const product = (slug, name, categories, price = 30) => ({
  id: slug, slug, name, categories,
  variants: [{ dosage: '10mg', price, enabled: true }],
});

const CATALOGUE = [
  product('bac-water', 'BAC Water', ['BAC Water'], 9),
  product('acetic-acid-06-10ml', 'Acetic Acid 0.6% (AA Water)', ['BAC Water'], 9),
  product('bpc-157', 'BPC-157', ['Peptides']),
  product('hgh191aa', 'HGH (191 AA) - Human Growth Hormone', ['Muscle / Growth']),
  product('oxytocin', 'Oxytocin', ['Peptides']),
  product('retatrutide-pen', 'Retatrutide Pen', ['Pens', 'Fat Loss']),
  product('nasal-spray-melanotan-ii', 'Nasal Spray (Melanotan II)', ['Tanning']),
  // Named in a review by Samuel: it needs water, and its name must never be read as a reason to
  // withhold it. "5-Amino-1MQ Will Need bac water so do not assume this is a capsule."
  product('5-amino-1mq-100mg', '5-Amino-1MQ', ['Fat Loss']),
  product('l-carnitine-5000mg', 'L-Carnitine', ['Beauty / Healing / Repair / Recovery']),
  // Named by Samuel, 23 Aug 2026, as already liquid: "L-Carnitine Doesn't needs any water !!!
  // It already is already liquid as is Pag NRG and UP 389."
  product('pag-nrg', 'PAG~NRG', ['Muscle / Growth']),
  product('super-human-blend', 'UP-389', ['Muscle / Growth']),
  // Named the same day as needing acetic acid, not BAC water, at every dosage:
  // "The pH value of these products must be kept between 4.0 and 6.0."
  product('ipamorelin', 'Ipamorelin', ['Peptides']),
  product('cjc-1295-no-dac-ipamorelin-10mg', 'Ipamorelin 10mg+CJC-1295 No DAC +', ['Fat Loss']),
  product('aod-9604', 'AOD-9604', ['Peptides', 'Fat Loss']),
  product('tesamorelin', 'Tesamorelin', ['Peptides', 'Fat Loss']),
  product('cjc-1295', 'CJC-1295', ['Peptides', 'Fat Loss']),
  product('kisspeptin-10', 'Kisspeptin-10', ['Peptides']),
  product('kisspeptin-54', 'Kisspeptin-54', ['Peptides']),
];

const AA_PRODUCTS = ['ipamorelin', 'cjc-1295-no-dac-ipamorelin-10mg', 'aod-9604', 'tesamorelin',
  'cjc-1295', 'kisspeptin-10', 'kisspeptin-54'];
const NO_WATER_PRODUCTS = ['l-carnitine-5000mg', 'pag-nrg', 'super-human-blend'];

const recommend = (trigger, csvRules, manualOverrides) => computeUpsellRecommendations({
  basketSlugs: [trigger],
  rules: [
    ...buildReconstitutionRules([trigger], CATALOGUE),
    ...buildEffectiveRules([trigger], csvRules, manualOverrides),
    ...buildCategoryFallbackRules([trigger], CATALOGUE, coveredTriggerSlugs(csvRules, manualOverrides)),
  ],
  catalogue: CATALOGUE,
  hiddenSlugs: new Set(),
  stockMap: {},
  today: '2026-08-22',
}).map(r => r.slug);

const rule = (trigger, upsell, priority = 1) => ({
  id: 1, trigger_handle: trigger, upsell_handle: upsell, priority,
  custom_message: null, active: true, start_date: null, end_date: null,
  import_batch_id: 'csv', created_at: '2026-08-22T00:00:00.000Z',
});

console.log('\n=== Which products need water ===');
const needs = (slug) => needsReconstitution(CATALOGUE.find(p => p.slug === slug));
check('a dry powder vial needs water', needs('bpc-157'));
check('a pen does not (it arrives pre-mixed)', !needs('retatrutide-pen'));
check('BAC Water cannot recommend itself', !needs('bac-water'));
check('acetic acid is a diluent too, so it does not', !needs('acetic-acid-06-10ml'));
check('5-Amino-1MQ needs water, whatever its name suggests', needs('5-amino-1mq-100mg'));
 check('L-Carnitine needs NO water - it is already liquid', !needs('l-carnitine-5000mg'));
 check('a name is never a reason to withhold water', needs('nasal-spray-melanotan-ii'),
   'Nothing may be excluded because of a word in its name. Only pens, the diluents, and products'
   + ' somebody has deliberately named in NEVER_NEEDS_WATER.');

console.log('\n=== Water is offered whatever else is set up ===');
const uncurated = recommend('bpc-157', [], []);
check('a product with no rules at all is offered water',
  uncurated.includes(RECONSTITUTION_TARGET_SLUG), `got: ${uncurated.join(', ') || '(none)'}`);

// The exact live failure: a curated rule that never mentions water.
const curatedWithoutWater = recommend('hgh191aa', [rule('hgh191aa', 'oxytocin', 1)], []);
check('a product curated WITHOUT water is still offered water',
  curatedWithoutWater.includes(RECONSTITUTION_TARGET_SLUG), `got: ${curatedWithoutWater.join(', ') || '(none)'}`);
check('water comes first, so a long list cannot push it off the end',
  curatedWithoutWater[0] === RECONSTITUTION_TARGET_SLUG, `got: ${curatedWithoutWater.join(', ')}`);

// A hand-set override is meant to be the whole story for a product. Not for this.
const manualWithoutWater = recommend('oxytocin', [], [{
  trigger_handle: 'oxytocin', heading: null, basket_heading: null,
  upsell_handles: ['bpc-157'], updated_at: '2026-08-22T00:00:00.000Z',
}]);
check('a hand-set list that leaves water out still gets water',
  manualWithoutWater.includes(RECONSTITUTION_TARGET_SLUG), `got: ${manualWithoutWater.join(', ') || '(none)'}`);

const listed = recommend('bpc-157', [rule('bpc-157', 'bac-water', 3)], []);
check('a product that already lists water is not offered it twice',
  listed.filter(s => s === RECONSTITUTION_TARGET_SLUG).length === 1, `got: ${listed.join(', ')}`);

console.log('\n=== And not where it makes no sense ===');
const pen = recommend('retatrutide-pen', [], []);
check('a pen is never offered water', !pen.includes(RECONSTITUTION_TARGET_SLUG), `got: ${pen.join(', ') || '(none)'}`);
const water = recommend('bac-water', [], []);
check('water is never offered with water', !water.includes(RECONSTITUTION_TARGET_SLUG), `got: ${water.join(', ') || '(none)'}`);
const amino = recommend('5-amino-1mq-100mg', [rule('5-amino-1mq-100mg', 'bpc-157', 1)], []);
check('5-Amino-1MQ is offered water even with its own curated list',
  amino[0] === RECONSTITUTION_TARGET_SLUG, `got: ${amino.join(', ') || '(none)'}`);

console.log('\n=== Already liquid: no water at all ===');
for (const slug of NO_WATER_PRODUCTS) {
  const name = CATALOGUE.find(p => p.slug === slug).name;
  check(`${name} is offered no water`, !needs(slug));
  const got = recommend(slug, [rule(slug, 'bac-water', 1), rule(slug, 'acetic-acid-06-10ml', 2)], []);
  check(`${name} gets no water even when a saved rule names it`,
    !got.includes(RECONSTITUTION_TARGET_SLUG) && !got.includes(ACETIC_ACID_SLUG),
    `got: ${got.join(', ') || '(none)'}`);
}

console.log('\n=== Acetic acid INSTEAD OF bacteriostatic water ===');
for (const slug of AA_PRODUCTS) {
  const product = CATALOGUE.find(p => p.slug === slug);
  const name = product.name;
  check(`${name} asks for acetic acid`, reconstitutionTargetFor(product) === ACETIC_ACID_SLUG,
    `got: ${reconstitutionTargetFor(product)}`);
  const got = recommend(slug, [], []);
  check(`${name} leads with acetic acid`, got[0] === ACETIC_ACID_SLUG, `got: ${got.join(', ') || '(none)'}`);
  check(`${name} is NOT offered BAC water as well`, !got.includes(RECONSTITUTION_TARGET_SLUG),
    `got: ${got.join(', ')}`);
  const curated = recommend(slug, [rule(slug, 'bac-water', 1)], []);
  check(`${name} drops BAC water even when a saved rule names it`,
    !curated.includes(RECONSTITUTION_TARGET_SLUG) && curated[0] === ACETIC_ACID_SLUG,
    `got: ${curated.join(', ') || '(none)'}`);
}

console.log('\n=== A basket holding both kinds gets both ===');
const mixedBasket = ['bpc-157', 'ipamorelin'];
const mixed = computeUpsellRecommendations({
  basketSlugs: mixedBasket,
  rules: [
    ...buildReconstitutionRules(mixedBasket, CATALOGUE),
    ...buildEffectiveRules(mixedBasket, [], []),
    ...buildCategoryFallbackRules(mixedBasket, CATALOGUE, coveredTriggerSlugs([], [])),
  ],
  catalogue: CATALOGUE,
  hiddenSlugs: new Set(),
  stockMap: {},
  today: '2026-08-23',
}).map(r => r.slug);
check('a BAC product plus an acetic-acid product is offered both waters',
  mixed.includes(RECONSTITUTION_TARGET_SLUG) && mixed.includes(ACETIC_ACID_SLUG),
  `got: ${mixed.join(', ') || '(none)'}`);

console.log('');
if (failures > 0) {
  console.log(`  ${failures} check(s) FAILED. The wrong water, or none, is reaching a product that needs it.\n`);
  process.exit(1);
}
console.log('  Every product that needs water is offered the RIGHT water, and nothing else is.\n');
