// Finding a group of customers to market to (task c22cb6cb).
//
//   npm run test:customer-segments
//
// Kieran, 19 September 2026: "I should be able to click some drop downs and filter by that and then
// market those people... I think it is very important that I should have as many variables as
// possible, because at the moment I do not know how many people have come by Instagram, how many by
// Ross McCarthy or PAG Gym."
//
// WHAT IS WORTH TESTING HERE. Most of this is a database query, and a query is best proved against
// the real data, which the run below does separately. What CAN be pinned down without a database is
// the part that decides what the drop-downs say, and that matters more than it looks: Kieran asked
// for "a certain part of the UK, example Berkshire", and there is no county anywhere in this data.
// The postcode area is what stands in for it, so it has to be right, and it has to be honest about
// what it is.
import { postcodeArea, postcodeAreaLabel } from '../src/lib/db/customerSegments.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

console.log('\n=== Working out which part of the country a postcode is ===\n');

// The real postcodes in the shop today, in the shapes people actually type them.
check('"RG40 1JT" is the RG area', postcodeArea('RG40 1JT') === 'RG');
check('a one-letter area works too', postcodeArea('B15 2TT') === 'B', `got "${postcodeArea('B15 2TT')}"`);
check('lower case is fine', postcodeArea('gu51 3xy') === 'GU');
check('no space is fine', postcodeArea('RG401JT') === 'RG');
check('leading spaces are fine', postcodeArea('  TN6 2QR ') === 'TN');
check('a two-letter area with two digits works', postcodeArea('SW1A 1AA') === 'SW');

// Nothing invented from nothing: a blank postcode must not quietly become an area.
check('an empty postcode has no area', postcodeArea('') === '');
check('a missing postcode has no area', postcodeArea(null) === '' && postcodeArea(undefined) === '');
check('something that is not a postcode has no area', postcodeArea('12345') === '',
  `got "${postcodeArea('12345')}"`);

console.log('\n=== What the drop-down calls it ===\n');

check('RG reads as Reading', postcodeAreaLabel('RG') === 'RG — Reading', postcodeAreaLabel('RG'));
check('GU reads as Guildford', postcodeAreaLabel('GU') === 'GU — Guildford');
check('SL reads as Slough', postcodeAreaLabel('SL') === 'SL — Slough');
check('DE reads as Derby', postcodeAreaLabel('DE') === 'DE — Derby');

// The safe direction: an area nobody has named must show as itself, never as a guess.
check('an unknown area is left exactly as it is', postcodeAreaLabel('ZZ') === 'ZZ',
  `got "${postcodeAreaLabel('ZZ')}"`);
check('and an empty one does not become a stray dash', postcodeAreaLabel('') === '');

// The honesty check. Kieran asked for Berkshire; this is a postcode area, not a county, and it must
// not claim otherwise. RG covers most of Berkshire but also Henley, which is Oxfordshire.
check('no label claims to be a county', !/shire|county/i.test(
  ['RG', 'GU', 'SL', 'OX', 'B', 'M'].map(postcodeAreaLabel).join(' ')),
  'Calling a postcode area a county would be stating something the data does not know.');

console.log('\n=== The thing this exists to answer ===\n');

// Kieran: "at the moment I do not know how many people have come by Instagram, how many by Ross
// McCarthy or PAG Gym". The reason a plain drop-down of tidy values cannot answer that is that the
// real data is not tidy: PAG alone is written eight different ways. These are the actual values in
// the shop, which is why the screen offers a "contains" box as well as the drop-down.
const realPagSpellings = [
  'PAG', 'Pag', 'PAG GYM', 'PAG - John Berry', 'Physique Architect Gyms',
  'A gym, clinic or partner: PAG', 'A gym, clinic or partner: Pag gym!', 'John Berry at PAG is my Coach',
];
const contains = (needle) => realPagSpellings.filter(v => v.toLowerCase().includes(needle.toLowerCase()));
check('searching "PAG" finds every spelling of it', contains('PAG').length === realPagSpellings.length - 1,
  `found ${contains('PAG').length} of ${realPagSpellings.length}; the odd one out is the campaign name`);
check('and the campaign name is found on its own terms', contains('Physique').length === 1);
check('an exact-match drop-down alone would find only one of them',
  realPagSpellings.filter(v => v === 'PAG').length === 1,
  'Which is exactly why the screen has a contains box next to the drop-down.');

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
