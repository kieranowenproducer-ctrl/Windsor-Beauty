// Prove the Orders and Invoices search finds an order from a customer AND a product together.
//
//   npm run test:admin-search
//
// Pure logic over made-up data, so no database and no network. Runs the real parseSearchTerms and
// matchesSearchTerms from src/lib/adminSearch.ts, and the real orderSearchText/sortOrders from the
// Orders screen.
//
// WHAT WENT WRONG, and what these checks exist to stop coming back: typing a customer and a
// product together into Orders found nothing. The box looked for that whole phrase inside one field at
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
  orderNumber: 'WB-1001',
  customerName: 'Amber Whitfield',
  email: 'amber@example.com',
  phone: '07700 900123',
  total: 120,
  items: [{ name: 'Hydra Veil Serum', variant: '30ml', price: 120, quantity: 1 }],
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
  orderNumber: 'WB-1002',
  customerName: 'Anne Doherty',
  email: 'anne@example.com',
  items: [{ name: 'Vita-C Cleanser', variant: '150ml', price: 60, quantity: 2 }],
  createdAt: '2026-09-02T09:00:00Z',
  total: 60,
  trackingNumber: null,
});
const amberSecond = order({
  orderNumber: 'WB-1003',
  customerName: 'Amber Whitfield',
  items: [{ name: 'Vita-C Cleanser', variant: '150ml', price: 60, quantity: 1 }],
  createdAt: '2026-09-10T09:00:00Z',
  total: 60,
});
const jose = order({
  orderNumber: 'WB-1004',
  customerName: 'José Márquez',
  email: 'jose@example.com',
  createdAt: '2026-07-01T09:00:00Z',
  total: 240,
});

// Two more products, for the "and" and "or" checks.
const roseOrder = order({
  orderNumber: 'WB-1005',
  customerName: 'Bev Hardy',
  email: 'bev@example.com',
  items: [{ name: 'Rose Night Cream', variant: '50ml', price: 300, quantity: 1 }],
  createdAt: '2026-09-12T09:00:00Z',
  total: 300,
});
const spfOrder = order({
  orderNumber: 'WB-1006',
  customerName: 'Carl Innes',
  email: 'carl@example.com',
  items: [{ name: 'Daily SPF-30', variant: '40ml', price: 80, quantity: 1 }],
  createdAt: '2026-09-13T09:00:00Z',
  total: 80,
});
// An order written down with a different spelling, which is what a word group is for.
const spellingOrder = order({
  orderNumber: 'WB-1007',
  customerName: 'Dina Patel',
  email: 'dina@example.com',
  items: [{ name: 'Silk Moisturizer', variant: '50ml', price: 200, quantity: 1 }],
  createdAt: '2026-09-14T09:00:00Z',
  total: 200,
});

const all = [amber, anne, amberSecond, jose, roseOrder, spfOrder, spellingOrder];
const findWith = (query, groups) => all
  .filter(o => matchesSearchGroups(orderSearchText(o), parseSearchGroups(query, groups)))
  .map(o => o.orderNumber);
// The shop's own list, which is what the real screens use.
const find = (query) => findWith(query, SEARCH_ALIAS_GROUPS);

console.log('\n=== Splitting up what was typed ===\n');
check('two plain words',            parseSearchTerms('Amber Hydra'),      ['amber', 'hydra']);
check('a dash between words',       parseSearchTerms('Amber- Hydra'),     ['amber', 'hydra']);
check('a plus between words',       parseSearchTerms('Anne + Vita'),      ['anne', 'vita']);
check('a plus with no spaces',      parseSearchTerms('Anne+Vita'),        ['anne', 'vita']);
check('a comma between words',      parseSearchTerms('Anne, Vita'),       ['anne', 'vita']);
check('a dash INSIDE a word stays', parseSearchTerms('VITA-C'),           ['vita-c']);
check('quotes keep a phrase whole', parseSearchTerms('"night cream"'),    ['night cream']);
check('an apostrophe is left be',   parseSearchTerms("O'Brien"),          ["o'brien"]);
check('an empty box means nothing', parseSearchTerms('   '),              []);
check('the same word twice is one', parseSearchTerms('serum serum'),      ['serum']);

console.log('\n=== A customer and a product together ===\n');
check('Amber Hydra finds Amber\'s serum order',  find('Amber Hydra'),  ['WB-1001']);
check('Amber- Hydra does the same',              find('Amber- Hydra'), ['WB-1001']);
check('Anne + Vita finds Anne\'s cleanser',      find('Anne + Vita'),  ['WB-1002']);
check('Amber Vita finds her OTHER order',        find('Amber Vita'),   ['WB-1003']);
check('Amber on its own finds both of hers',     find('Amber'),        ['WB-1001', 'WB-1003']);
check('Vita on its own finds both cleansers',    find('Vita'),         ['WB-1002', 'WB-1003']);
check('a word nobody has finds nothing',         find('Amber Balm'),   []);
check('an empty box hides nobody',               find('').length,      all.length);

console.log('\n=== Forgiving how it was typed ===\n');
check('case does not matter',            find('AMBER hydra'),        ['WB-1001']);
check('vitac finds Vita-C',              find('anne vitac'),         ['WB-1002']);
check('vita c finds Vita-C',             find('anne vita c'),        ['WB-1002']);
check('jose finds Jos\u00e9',            find('jose'),               ['WB-1004']);
check('an accent typed finds it too',    find('M\u00e1rquez'),       ['WB-1004']);
check('a stray plus on its own is fine', find('+ amber'),            ['WB-1001', 'WB-1003']);

console.log('\n=== Searching the rest of the order, not just the name ===\n');
check('by order number',      find('WB-1002'),                  ['WB-1002']);
check('by email',             find('anne@example.com'),         ['WB-1002']);
check('by postcode',          find('SL4 1DU amber'),            ['WB-1001', 'WB-1003']);
check('by tracking number',   find('AB123456789GB').length,     6);
check('by status word',       find('anne delivered'),           ['WB-1002']);
check('the money is NOT searched (240 is a total, not text)', find('240'), []);

console.log('\n=== Putting the list in an order ===\n');
const four = [amber, anne, amberSecond, jose];
const numbers = (sort) => sortOrders(four, sort).map(o => o.orderNumber);
check('newest first',         numbers('newest'),      ['WB-1003', 'WB-1002', 'WB-1001', 'WB-1004']);
check('oldest first',         numbers('oldest'),      ['WB-1004', 'WB-1001', 'WB-1002', 'WB-1003']);
check('name A to Z',          numbers('name_az'),     ['WB-1003', 'WB-1001', 'WB-1002', 'WB-1004']);
check('name Z to A',          numbers('name_za'),     ['WB-1004', 'WB-1002', 'WB-1003', 'WB-1001']);
check('biggest total first',  numbers('total_high'),  ['WB-1004', 'WB-1001', 'WB-1003', 'WB-1002']);
check('smallest total first', numbers('total_low'),   ['WB-1003', 'WB-1002', 'WB-1001', 'WB-1004']);
check('sorting never changes the list it was handed', four.map(o => o.orderNumber), ['WB-1001', 'WB-1002', 'WB-1003', 'WB-1004']);
// Two orders from the same customer must not swap places at random on a name sort.
check('a tie falls back to newest first', sortOrders([amber, amberSecond], 'name_az').map(o => o.orderNumber), ['WB-1003', 'WB-1001']);

console.log('\n=== Between one day and another ===\n');
const between = (from, to) => four.filter(o => {
  const day = orderDayInUk(o);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}).map(o => o.orderNumber);
check('a full range',              between('2026-08-01', '2026-09-05'), ['WB-1001', 'WB-1002']);
check('from only',                 between('2026-09-01', ''),           ['WB-1002', 'WB-1003']);
check('to only',                   between('', '2026-07-31'),           ['WB-1004']);
check('both ends are included',    between('2026-08-14', '2026-08-14'), ['WB-1001']);
check('a day is read in UK time',  orderDayInUk(amber),                 '2026-08-14');

console.log('\n=== "and" and "or" ===\n');
check('rose finds the night cream order',   find('rose'),         ['WB-1005']);
check('spf finds the SPF order',            find('spf'),          ['WB-1006']);
check('SPF-30 typed in full works too',     find('SPF-30'),       ['WB-1006']);
// "and" is how a person joins two words out loud. It must never be searched for as a word.
check('"rose and spf" means "rose spf"',    find('rose and spf'), find('rose spf'));
check('...and neither order has both',      find('rose and spf'), []);
// Which is why "or" exists: it is what the person actually meant.
check('"rose or spf" finds both',           find('rose or spf'),  ['WB-1005', 'WB-1006']);
check('"and" on its own is still searched', parseSearchTerms('and'), ['and']);
check('a stray "or" at the end is ignored', find('rose or'),      ['WB-1005']);

console.log('\n=== Words that mean the same thing ===\n');
// The shop's own list is empty, so search is by the plain words typed. The feature itself still
// works for any list it is handed, which is what the made-up group below proves.
const SPELLINGS = [['moisturiser', 'moisturizer']];
check('with no list, only the spelling typed is found',  find('moisturiser'), []);
check('with a list, either spelling finds the order',    findWith('moisturiser', SPELLINGS), ['WB-1007']);
check('...and the spelling on the order still works',    findWith('moisturizer', SPELLINGS), ['WB-1007']);
check('a customer AND a listed word together',           findWith('Dina moisturiser', SPELLINGS), ['WB-1007']);
check('quotes turn the list OFF',                        findWith('"moisturiser"', SPELLINGS), []);
check('a word that is on no list is unchanged',          findWith('Hardy', SPELLINGS), ['WB-1005']);

console.log('\n=== The shop\'s own list ===\n');
check('it is a list', Array.isArray(SEARCH_ALIAS_GROUPS), true);
check('every group has at least two ways to say it', SEARCH_ALIAS_GROUPS.every(g => g.length >= 2), true);
check('nothing in it is one or two letters', SEARCH_ALIAS_GROUPS.every(g => g.every(w => w.length >= 3)), true);
check('it is all lower case', SEARCH_ALIAS_GROUPS.every(g => g.every(w => w === w.toLowerCase())), true);

console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'}: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
