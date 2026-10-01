// Proves the "being a member has saved you" figure (Samuel, 25 Sept 2026)
// equals what a guest would really pay minus what a member really pays, using
// the same price calculation the checkout charges with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memberSavingFor, nonMemberPrice, priceForCustomer } from '@/lib/memberPricing';

test('Samuel\'s example: Retatrutide at £65 for members saves £20', () => {
  assert.equal(nonMemberPrice(65), 85);
  assert.equal(memberSavingFor([{ price: 65, quantity: 1 }]), 20);
});

test('pence prices and quantities add up to the penny', () => {
  // Bac water 3ml £4.99 member, £10 guest; Cagrilintide £40 member, £50 guest.
  const basket = [{ price: 4.99, quantity: 2 }, { price: 40, quantity: 1 }];
  assert.equal(memberSavingFor(basket), 20.02);
});

test('the saving always equals the guest total minus the member total', () => {
  const basket = [{ price: 65, quantity: 1 }, { price: 90, quantity: 3 }, { price: 10, quantity: 2 }, { price: 4.99, quantity: 1 }];
  const pence = (n) => Math.round(n * 100);
  const guest = basket.reduce((t, i) => t + pence(priceForCustomer(i.price, false)) * i.quantity, 0);
  const member = basket.reduce((t, i) => t + pence(priceForCustomer(i.price, true)) * i.quantity, 0);
  assert.equal(pence(memberSavingFor(basket)), guest - member);
});

test('an empty basket saves nothing', () => {
  assert.equal(memberSavingFor([]), 0);
});
