import test from 'node:test';
import assert from 'node:assert/strict';
import { HAIR_BOTTLE_SLUGS, makeHairCareBundle, bundleCartItems, bundlesAvailableForCart } from '@/lib/hairCareBundle';
import { nonMemberPrice, memberSavingFor, priceForCustomer } from '@/lib/memberPricing';
import { resolveServerItemPrice } from '@/lib/orderPricing';
import { evaluateCartRules, parsePromotionRule, toRuleCartItems } from '@/lib/promotionRules';
const products = HAIR_BOTTLE_SLUGS.map((slug, i) => ({ id: String(100 + i), slug, name: i ? 'Conditioner' : 'Shampoo', categories: ['Hair & Scalp'], availability: 'available', variants: [{ dosage: '350ml', enabled: true, price: 18.99 }] }));
const stock = Object.fromEntries(products.map(p => [p.slug, { '350ml': 5 }]));
const rule = { id: 1, name: 'Haircare bundle', type: 'bundle', priority: -100, active: true, config: { items: products.map(p => ({ slug: p.slug, dosage: '350ml', quantity: 1 })), rewardType: 'bundle_price', bundlePrice: 34.99, storefrontImage: 'https://spccq4gx9wznklip.public.blob.vercel-storage.com/products/test.png' } };
const offer = () => makeHairCareBundle(products, [], stock, [rule]);
const map = new Map(products.map(p => [p.slug, p]));
test('guests and members pay exactly £18.99 per bottle; other products retain their existing pricing', () => {
  for (const p of products) for (const member of [false, true]) {
    assert.equal(priceForCustomer(18.99, member, p.slug), 18.99);
    assert.equal(resolveServerItemPrice({ slug: p.slug, variant: '350ml', price: 0.01, name: p.name, quantity: 1 }, map, member), 18.99);
  }
  assert.equal(nonMemberPrice(18.99, 'unrelated-product'), 25);
  assert.equal(memberSavingFor(products.map(p => ({ slug: p.slug, price: 18.99, quantity: 1 }))), 0);
});
test('a bundle adds exactly one real bottle of each, never a synthetic checkout product', () => {
  const b = offer(); assert.equal(b.stock, 5); assert.equal(b.separatePrice, 37.98); assert.equal(b.saving, 2.99);
  assert.deepEqual(bundleCartItems(b).map(i => [i.slug, i.variant, i.quantity, i.price]), products.map(p => [p.slug, '350ml', 1, 18.99]));
});
test('automatic checkout pricing handles singles, repeated pairs and unmatched bottles', () => {
  for (const [a, b, expected, discount] of [[1, 0, 18.99, 0], [0, 1, 18.99, 0], [1, 1, 34.99, 2.99], [2, 2, 69.98, 5.98], [2, 1, 53.98, 2.99], [5, 5, 174.95, 14.95]]) {
    const items = products.map((p, i) => ({ slug: p.slug, name: p.name, variant: '350ml', price: 18.99, quantity: i ? b : a })).filter(i => i.quantity);
    const result = evaluateCartRules(toRuleCartItems(items, map), [parsePromotionRule(rule)], map);
    assert.equal(result.ruleDiscountAmount, discount);
    assert.equal(Math.round((items.reduce((n, i) => n + i.price * i.quantity, 0) - result.ruleDiscountAmount) * 100) / 100, expected);
    assert.equal(result.freeItems.length, 0);
  }
});
test('stock depends on both physical bottles, including singles already in the basket', () => {
  assert.equal(bundlesAvailableForCart(offer(), [{ slug: products[0].slug, variant: '350ml', quantity: 5 }]), 0);
  const uneven = makeHairCareBundle(products, [], { [products[0].slug]: { '350ml': 5 }, [products[1].slug]: { '350ml': 2 } }, [rule]);
  assert.equal(bundlesAvailableForCart(uneven, [{ slug: products[0].slug, variant: '350ml', quantity: 2 }]), 2);
  assert.equal(makeHairCareBundle(products, [], { ...stock, [products[1].slug]: { '350ml': 0 } }, [rule]).stock, 0);
  assert.equal(makeHairCareBundle(products, [], {}, [rule]).stock, 0);
});
test('hidden, missing, disabled or inactive component offers cannot be purchased as a bundle', () => {
  assert.equal(makeHairCareBundle(products, [products[0].slug], stock, [rule]), null);
  assert.equal(makeHairCareBundle(products.slice(0, 1), [], stock, [rule]), null);
  assert.equal(makeHairCareBundle(products.map(p => ({ ...p, variants: p.variants.map(v => ({ ...v, enabled: false })) })), [], stock, [rule]), null);
  assert.equal(makeHairCareBundle(products, [], stock, [{ ...rule, active: false }]), null);
  assert.equal(makeHairCareBundle(products, [], stock, [{ ...rule, config: { ...rule.config, items: [...rule.config.items, rule.config.items[0]] } }]), null);
  assert.equal(makeHairCareBundle(products, [], stock, [{ ...rule, config: { ...rule.config, storefrontImage: 'https://unrelated.invalid/test.png' } }]), null);
  assert.equal(makeHairCareBundle(products.map(p => ({ ...p, availability: 'coming_soon' })), [], stock, [rule]).stock, 0);
});
