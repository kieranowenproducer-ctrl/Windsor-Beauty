// The Revenue screen's from/to date range (task 620fed22).
//
//   npm run test:revenue-range
//
// Kieran, 22 September 2026: "Need a filter to sort out a time from and to."
//
// WHY THIS IS TESTED RATHER THAN EYEBALLED. A date range that is one day out still looks completely
// normal. The total is a plausible number, the chart is a plausible shape, and nothing anywhere says
// a day is missing. The two ways it goes wrong are both invisible:
//
//   1. 'YYYY-MM-DD' parsed by new Date() is midnight UTC, not midnight here. Through British Summer
//      Time that is 01:00 in London, so an order placed at 00:30 falls off the front of its own
//      month.
//   2. A range ending "15 September" that stops at the first second of the 15th loses that whole
//      day's takings.
//
// Both are checked below with dates built in LOCAL time, so these tests hold wherever the machine
// running them happens to be.
import {
  describeRange,
  endOfLocalDay,
  isBackwards,
  parseLocalDate,
  presetForRange,
  rangeForPreset,
  rangeFromQuery,
  rangeToQuery,
  toInputValue,
  withinRange,
} from '../src/lib/revenueRange.ts';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
}

// An order placed at a given LOCAL moment, in the shape the API returns.
const at = (y, m, d, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm).toISOString();

console.log('\n=== Reading a date out of the box ===\n');
check('a normal date parses', parseLocalDate('2026-09-01')?.getDate() === 1);
check('it is local midnight, not UTC midnight', parseLocalDate('2026-09-01')?.getHours() === 0);
check('the month is right', parseLocalDate('2026-09-01')?.getMonth() === 8);
check('an empty box is not a date', parseLocalDate('') === null);
check('rubbish is not a date', parseLocalDate('tomorrow') === null);
check('a half-typed date is not a date', parseLocalDate('2026-09') === null);
check('31 February is refused, not rolled into March', parseLocalDate('2026-02-31') === null);
check('month 13 is refused', parseLocalDate('2026-13-01') === null);
check('a real leap day is fine', parseLocalDate('2024-02-29')?.getDate() === 29);

console.log('\n=== The trap: the first half hour of the range ===\n');
// This is the one that costs money. Under the naive implementation this order is excluded in any
// timezone ahead of UTC, which includes the UK for seven months of the year.
check('an order at 00:30 on the FIRST day is inside the range',
  withinRange(at(2026, 9, 1, 0, 30), { from: '2026-09-01', to: '2026-09-15' }));
check('an order at 00:00 exactly on the first day is inside',
  withinRange(at(2026, 9, 1, 0, 0), { from: '2026-09-01', to: '2026-09-15' }));
check('an order at 23:30 the night BEFORE is outside',
  !withinRange(at(2026, 8, 31, 23, 30), { from: '2026-09-01', to: '2026-09-15' }));

console.log('\n=== The trap: the last day of the range counts in full ===\n');
check('an order at 09:00 on the last day is inside',
  withinRange(at(2026, 9, 15, 9, 0), { from: '2026-09-01', to: '2026-09-15' }));
check('an order at 23:59 on the last day is inside',
  withinRange(at(2026, 9, 15, 23, 59), { from: '2026-09-01', to: '2026-09-15' }));
check('an order at 00:10 the NEXT morning is outside',
  !withinRange(at(2026, 9, 16, 0, 10), { from: '2026-09-01', to: '2026-09-15' }));
check('the end of a day really is 23:59:59',
  endOfLocalDay(new Date(2026, 8, 15)).getHours() === 23
  && endOfLocalDay(new Date(2026, 8, 15)).getMinutes() === 59);

console.log('\n=== A single day, and open ends ===\n');
check('from and to on the same day catches that day',
  withinRange(at(2026, 9, 7, 14, 0), { from: '2026-09-07', to: '2026-09-07' }));
check('and not the day after',
  !withinRange(at(2026, 9, 8, 0, 1), { from: '2026-09-07', to: '2026-09-07' }));
check('no dates at all means everything', withinRange(at(2020, 1, 1), { from: '', to: '' }));
check('a from with no to runs to the future',
  withinRange(at(2030, 1, 1), { from: '2026-09-01', to: '' }));
check('a to with no from reaches back forever',
  withinRange(at(2001, 1, 1), { from: '', to: '2026-09-15' }));
check('an unreadable order date is not counted',
  !withinRange('not a date', { from: '', to: '' }));

console.log('\n=== The quick-pick buttons ===\n');
// A Tuesday in the middle of September, so nothing depends on being month-end.
const now = new Date(2026, 8, 22, 10, 0);
check('This Month starts on the 1st', rangeForPreset('this_month', now).from === '2026-09-01');
check('This Month ends today, not at month end', rangeForPreset('this_month', now).to === '2026-09-22');
check('Last Month is the whole of August', rangeForPreset('last_month', now).from === '2026-08-01'
  && rangeForPreset('last_month', now).to === '2026-08-31');
check('Last 30 Days counts today as one of the 30', rangeForPreset('last_30', now).from === '2026-08-24');
check('This Year starts on 1 January', rangeForPreset('this_year', now).from === '2026-01-01');
check('All Time has no dates', rangeForPreset('all', now).from === '' && rangeForPreset('all', now).to === '');

// Month lengths and the year boundary, which is where hand-rolled date maths usually falls over.
check('Last Month from 1 March gives all 28 days of February',
  rangeForPreset('last_month', new Date(2026, 2, 1)).to === '2026-02-28');
check('Last Month in a leap year gives 29',
  rangeForPreset('last_month', new Date(2024, 2, 10)).to === '2024-02-29');
check('Last Month in January is December of the year before',
  rangeForPreset('last_month', new Date(2026, 0, 9)).from === '2025-12-01'
  && rangeForPreset('last_month', new Date(2026, 0, 9)).to === '2025-12-31');
check('Last 30 Days crossing into the previous month works',
  rangeForPreset('last_30', new Date(2026, 8, 5)).from === '2026-08-07');

console.log('\n=== Which button lights up ===\n');
check('no dates lights All Time', presetForRange({ from: '', to: '' }, now) === 'all');
check('this month lights This Month', presetForRange(rangeForPreset('this_month', now), now) === 'this_month');
check('last month lights Last Month', presetForRange(rangeForPreset('last_month', now), now) === 'last_month');
check('anything else is custom', presetForRange({ from: '2026-09-03', to: '2026-09-09' }, now) === 'custom');

console.log('\n=== Dates the wrong way round ===\n');
check('backwards is spotted', isBackwards({ from: '2026-09-15', to: '2026-09-01' }));
check('the right way round is not', !isBackwards({ from: '2026-09-01', to: '2026-09-15' }));
check('the same day is not backwards', !isBackwards({ from: '2026-09-01', to: '2026-09-01' }));
check('a half-filled range is not backwards', !isBackwards({ from: '2026-09-01', to: '' }));

console.log('\n=== Saying it in words ===\n');
check('all time', describeRange({ from: '', to: '' }) === 'Everything, all time');
check('a span reads as a span',
  describeRange({ from: '2026-09-01', to: '2026-09-15' }) === '1 September 2026 to 15 September 2026',
  describeRange({ from: '2026-09-01', to: '2026-09-15' }));
check('one day reads as one day',
  describeRange({ from: '2026-09-07', to: '2026-09-07' }) === '7 September 2026');
check('an open end says onwards',
  describeRange({ from: '2026-09-01', to: '' }) === '1 September 2026 onwards');
check('an open start says up to',
  describeRange({ from: '', to: '2026-09-15' }) === 'Everything up to 15 September 2026');

console.log('\n=== Keeping it in the address bar ===\n');
check('a range becomes a query', rangeToQuery({ from: '2026-09-01', to: '2026-09-15' })
  === '?from=2026-09-01&to=2026-09-15');
check('all time has no query', rangeToQuery({ from: '', to: '' }) === '');
check('and comes back out again',
  rangeFromQuery('?from=2026-09-01&to=2026-09-15').from === '2026-09-01');
check('the old ?period=this_month link still works',
  rangeFromQuery('?period=this_month', now).from === '2026-09-01');
check('a nonsense date in the URL is ignored rather than obeyed',
  rangeFromQuery('?from=banana').from === '');
check('no query means all time', rangeFromQuery('').from === '' && rangeFromQuery('').to === '');

console.log('\n=== The box value round-trips ===\n');
check('a date turns back into its box value', toInputValue(new Date(2026, 8, 7)) === '2026-09-07');
check('single digits are padded', toInputValue(new Date(2026, 0, 5)) === '2026-01-05');

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
