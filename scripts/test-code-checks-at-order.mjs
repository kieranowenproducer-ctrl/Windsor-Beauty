// Placing an order must refuse a staff-made code that is switched off, out of date or used up,
// exactly as the basket does (Samuel, 27 Sep 2026). Until then only the basket checked, so a
// request sent straight to place-order could spend, for example, a partner's one-use shop credit twice.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { staffCodeRefusal } from '../src/lib/discountCodes.ts';

const now = Date.parse('2026-09-27T12:00:00Z');
const code = (over) => ({ active: true, expires_at: null, usage_limit: null, times_redeemed: 0, ...over });

assert.equal(staffCodeRefusal(code({}), now), null, 'a live code with no limits can be spent');
assert.equal(staffCodeRefusal(code({ active: false }), now), 'That code is no longer active.');
assert.equal(staffCodeRefusal(code({ expires_at: '2026-09-27T11:59:59Z' }), now), 'That code has expired.');
assert.equal(staffCodeRefusal(code({ expires_at: '2026-09-28T00:00:00Z' }), now), null, 'a code still in date can be spent');
// a partner's shop credit: RAF-CREDIT-..., one use.
assert.equal(staffCodeRefusal(code({ usage_limit: 1, times_redeemed: 0 }), now), null, 'unused one-use shop credit can be spent once');
assert.equal(staffCodeRefusal(code({ usage_limit: 1, times_redeemed: 1 }), now), 'That code has reached its usage limit.', 'used shop credit is refused');
// A personal RAF5 code: no usage limit, but it expires and staff can switch it off.
assert.equal(staffCodeRefusal(code({ usage_limit: null, times_redeemed: 40, expires_at: '2027-03-28T00:00:00Z' }), now), null, 'a RAF5 code stays reusable by its owner until it expires');
assert.equal(staffCodeRefusal(code({ usage_limit: null, active: false }), now), 'That code is no longer active.', 'a switched-off RAF5 code is refused');
// Values as the database driver returns them (strings) are handled too.
assert.equal(staffCodeRefusal(code({ usage_limit: '3', times_redeemed: '3' }), now), 'That code has reached its usage limit.');

const route = await readFile(new URL('../src/app/api/checkout/place-order/route.ts', import.meta.url), 'utf8');
const refusalAt = route.indexOf('staffCodeRefusal(adminCode)');
assert.ok(refusalAt > 0, 'place-order must check staff codes with staffCodeRefusal');
assert.ok(refusalAt < route.indexOf('orderCommitted = true'), 'the check must run before the order is created');

console.log('Code checks at order passed: switched-off, expired and used-up codes are refused when the order is placed.');
