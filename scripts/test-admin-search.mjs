// Prove the Orders and Invoices search finds an order from a customer AND a product together.
//
//   npm run test:admin-search
//
// Pure logic over made-up data, so no database and no network. Runs the real parseSearchTerms and
// matchesSearchTerms from src/lib/adminSearch.ts, and the real orderSearchText/sortOrders from the
// Orders screen.
//
// WHAT WENT WRONG, and what these checks exist to stop coming back (Kieran, 2026-09-24): typing
// "Amber Reta" into Orders found nothing. The box looked for that whole phrase inside one field at
// a time, and it never looked at the products at all, so an order that was sitting right there
// came back empty. The rule now is that every word has to be SOMEWHERE on the order, and the words
// can be in different places.
import { parseSearchTerms, parseSearchGroups, matchesSearchGroups } from '../src/lib/adminSearch.ts';
import { SEARCH_ALIAS_GROUPS } from '../src/lib/searchAliases.ts';
import { orderSearchText, sortOrders, orderDayInUk } from '../src/app/admin/orders/orderTypes.ts';

let passed = 0;
let failed = 0;

function check(name, got, expected) {
  const same = JSON.stringify(got) === JSON.stringify(expected);
  if (same) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}\n             expected ${JSON.stringify(expected)}\n             got      ${JSON.stringify(got)}`); }
}

// One order per customer, written the way the real list holds them.
const order = (over = {}) => ({
  orderNumber: 'WG-1001',
  customerName: 'Amber Whitfield',
  email: 'amber@example.com',
  phone: '07700 900123',
  total: 120,
  items: [{ name: 'Omnimorph Pen', variant: 'Retatrutide 10mg', price: 120, quantity: 1 }],
  status: 'delivered',
  createdAt: '2026-08-14T10:00:00Z',
  discountCode: null,
  shippingAddress: '12 Peascod Street, Windsor, SL4 1DU',
  shippingLabel: 'Royal Mail Tracked 24',
  shippingCountry: 'United Kingdom',
  trackingNumber: 'AB123456789GB',
  paymentMethod: 'fena',
  qrCampaignName: null,
  qrPartnerName: null,
  adminNotes: null,
  invoiceSubject: null,
  ...over,
});

const amber = order();
const anne = order({
  orderNumber: 'WG-1002',
  customerName: 'Anne Doherty',
  email: 'anne@example.com',
  items: [{ name: 'MOTS-C', variant: '10mg vial', price: 60, quantity: 2 }],
  createdAt: '2026-09-02T09:00:00Z',
  total: 60,
  trackingNumber: null,
});
const amberSecond = order({
  orderNumber: 'WG-1003',
  customerName: 'Amber Whitfield',
  items: [{ name: 'MOTS-C', variant: '10mg vial', price: 60, quantity: 1 }],
  createdAt: '2026-09-10T09:00:00Z',
  total: 60,
});
const jose = order({
  orderNumber: 'WG-1004',
  customerName: 'José Márquez',
  email: 'jose@example.com',
  createdAt: '2026-07-01T09:00:00Z',
  total: 240,
});

// The two products that came back empty on 25 September, written down the way the real orders are.
const hghOrder = order({
  orderNumber: 'WG-1005',
  customerName: 'Bev Hardy',
  email: 'bev@example.com',
  items: [{ name: 'HGH (191 AA )- Human Growth Hormone', variant: '100IU', price: 300, quantity: 1 }],
  createdAt: '2026-09-12T09:00:00Z',
  total: 300,
});
const aodOrder = order({
  orderNumber: 'WG-1006',
  customerName: 'Carl Innes',
  email: 'carl@example.com',
  items: [{ name: 'AOD-9604', variant: '5mg', price: 80, quantity: 1 }],
  createdAt: '2026-09-13T09:00:00Z',
  total: 80,
});
// An order written down in shorthand, which is what breaks searching for the full product name.
const shorthandOrder = order({
  orderNumber: 'WG-1007',
  customerName: 'Dina Patel',
  email: 'dina@example.com',
  items: [{ name: 'Reta 30mg / Tirez 30mg', variant: '30mg', price: 200, quantity: 1 }],
  createdAt: '2026-09-14T09:00:00Z',
  total: 200,
});

const all = [amber, anne, amberSecond, jose, hghOrder, aodOrder, shorthandOrder];
const find = (query) => all
  .filter(o => matchesSearchGroups(orderSearchText(o), parseSearchGroups(query, SEARCH_ALIAS_GROUPS)))
  .map(o => o.orderNumber);

console.log('\n=== Splitting up what was typed ===\n');
check('two plain words',            parseSearchTerms('Amber Reta'),       ['amber', 'reta']);
check('a dash between words',       parseSearchTerms('Amber- Reta'),      ['amber', 'reta']);
check('a plus between words',       parseSearchTerms('Anne + Mots'),      ['anne', 'mots']);
check('a plus with no spaces',      parseSearchTerms('Anne+Mots'),        ['anne', 'mots']);
check('a comma between words',      parseSearchTerms('Anne, Mots'),       ['anne', 'mots']);
check('a dash INSIDE a word stays', parseSearchTerms('MOTS-C'),           ['mots-c']);
check('quotes keep a phrase whole', parseSearchTerms('"omnimorph pen"'),  ['omnimorph pen']);
check('an apostrophe is left be',   parseSearchTerms("O'Brien"),          ["o'brien"]);
check('an empty box means nothing', parseSearchTerms('   '),              []);
check('the same word twice is one', parseSearchTerms('reta reta'),        ['reta']);

console.log('\n=== The complaint itself ===\n');
check('Amber Reta finds Amber\'s Reta order',   find('Amber Reta'),   ['WG-1001']);
check('Amber- Reta does the same',              find('Amber- Reta'),  ['WG-1001']);
check('Anne + Mots finds Anne\'s MOTS-C',       find('Anne + Mots'),  ['WG-1002']);
check('Amber Mots finds her OTHER order',       find('Amber Mots'),   ['WG-1003']);
check('Amber on its own finds both of hers',    find('Amber'),        ['WG-1001', 'WG-1003']);
check('Mots on its own finds both MOTS-C',      find('Mots'),         ['WG-1002', 'WG-1003']);
check('a word nobody has finds nothing',        find('Amber Tirz'),   []);
check('an empty box hides nobody',              find('').length,      all.length);

console.log('\n=== Forgiving how it was typed ===\n');
check('case does not matter',            find('AMBER reta'),         ['WG-1001']);
check('motsc finds MOTS-C',              find('anne motsc'),         ['WG-1002']);
check('mots c finds MOTS-C',             find('anne mots c'),        ['WG-1002']);
check('jose finds José',            find('jose'),               ['WG-1004']);
check('an accent typed finds it too',    find('Márquez'),       ['WG-1004']);
check('a stray plus on its own is fine', find('+ amber'),            ['WG-1001', 'WG-1003']);

console.log('\n=== Searching the rest of the order, not just the name ===\n');
check('by order number',      find('WG-1002'),                  ['WG-1002']);
check('by email',             find('anne@example.com'),         ['WG-1002']);
check('by postcode',          find('SL4 1DU amber'),            ['WG-1001', 'WG-1003']);
check('by tracking number',   find('AB123456789GB').length,     6);
check('by status word',       find('anne delivered'),           ['WG-1002']);
check('the money is NOT searched (240 is a total, not text)', find('240'), []);

console.log('\n=== Putting the list in an order ===\n');
const four = [amber, anne, amberSecond, jose];
const numbers = (sort) => sortOrders(four, sort).map(o => o.orderNumber);
check('newest first',         numbers('newest'),      ['WG-1003', 'WG-1002', 'WG-1001', 'WG-1004']);
check('oldest first',         numbers('oldest'),      ['WG-1004', 'WG-1001', 'WG-1002', 'WG-1003']);
check('name A to Z',          numbers('name_az'),     ['WG-1003', 'WG-1001', 'WG-1002', 'WG-1004']);
check('name Z to A',          numbers('name_za'),     ['WG-1004', 'WG-1002', 'WG-1003', 'WG-1001']);
check('biggest total first',  numbers('total_high'),  ['WG-1004', 'WG-1001', 'WG-1003', 'WG-1002']);
check('smallest total first', numbers('total_low'),   ['WG-1003', 'WG-1002', 'WG-1001', 'WG-1004']);
check('sorting never changes the list it was handed', four.map(o => o.orderNumber), ['WG-1001', 'WG-1002', 'WG-1003', 'WG-1004']);
// Two orders from the same customer must not swap places at random on a name sort.
check('a tie falls back to newest first', sortOrders([amber, amberSecond], 'name_az').map(o => o.orderNumber), ['WG-1003', 'WG-1001']);

console.log('\n=== Between one day and another ===\n');
const between = (from, to) => four.filter(o => {
  const day = orderDayInUk(o);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}).map(o => o.orderNumber);
check('a full range',              between('2026-08-01', '2026-09-05'), ['WG-1001', 'WG-1002']);
check('from only',                 between('2026-09-01', ''),           ['WG-1002', 'WG-1003']);
check('to only',                   between('', '2026-07-31'),           ['WG-1004']);
check('both ends are included',    between('2026-08-14', '2026-08-14'), ['WG-1001']);
check('a day is read in UK time',  orderDayInUk(amber),                 '2026-08-14');

console.log('\n=== The 25 September complaint: hgh and aod ===\n');
check('hgh finds the HGH order',            find('hgh'),          ['WG-1005']);
check('aod finds the AOD order',            find('aod'),          ['WG-1006']);
check('aod-9604 typed in full works too',   find('AOD-9604'),     ['WG-1006']);
// "and" is how a person joins two words out loud. It must never be searched for as a word.
check('"hgh and aod" means "hgh aod"',      find('hgh and aod'),  find('hgh aod'));
check('...and neither order has both',      find('hgh and aod'),  []);
// Which is why "or" exists: it is what he actually meant.
check('"hgh or aod" finds both',            find('hgh or aod'),   ['WG-1005', 'WG-1006']);
check('"and" on its own is still searched', parseSearchTerms('and'), ['and']);
check('a stray "or" at the end is ignored', find('hgh or'),       ['WG-1005']);

console.log('\n=== Short names, both directions ===\n');
check('reta finds Retatrutide',                  find('reta').includes('WG-1001'), true);
check('retatrutide finds an order saying Reta',  find('retatrutide').includes('WG-1007'), true);
check('...and still finds the full name',        find('retatrutide').includes('WG-1001'), true);
check('tirez is understood as Tirzepatide',      find('tirzepatide'), ['WG-1007']);
check('hgh finds it written as Growth Hormone',  find('somatropin'), ['WG-1005']);
check('a customer AND a short name together',    find('Dina reta'), ['WG-1007']);
// Jose's order carries Retatrutide too, so the quoted search rightly finds both. What it must NOT
// find is WG-1007, the one written down only as "Reta 30mg".
check('quotes turn short names OFF',             find('"retatrutide"'), ['WG-1001', 'WG-1004']);
check('a word with no short name is unchanged',  find('Hardy'), ['WG-1005']);

console.log('\n=== The short-name list itself ===\n');
check('it was built from the terminology list and is not empty', SEARCH_ALIAS_GROUPS.length > 15, true);
check('every group has at least two ways to say it', SEARCH_ALIAS_GROUPS.every(g => g.length >= 2), true);
check('nothing in it is one or two letters', SEARCH_ALIAS_GROUPS.every(g => g.every(w => w.length >= 3)), true);
check('it is all lower case', SEARCH_ALIAS_GROUPS.every(g => g.every(w => w === w.toLowerCase())), true);

console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
