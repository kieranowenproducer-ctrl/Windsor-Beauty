import { computeUpsellRecommendations } from '../src/lib/upsells';
import type { UpsellRuleRow } from '../src/lib/db';
import type { Product } from '../src/data/products';

function rule(partial: Partial<UpsellRuleRow>): UpsellRuleRow {
  return {
    id: Math.random(),
    trigger_handle: '',
    upsell_handle: '',
    priority: 1,
    custom_message: null,
    active: true,
    start_date: null,
    end_date: null,
    import_batch_id: 'test',
    created_at: new Date().toISOString(),
    ...partial,
  };
}

function product(slug: string, name: string, price: number, overrides: Partial<Product> = {}): Product {
  return {
    id: slug,
    name,
    slug,
    categories: ['Peptides'],
    shortDescription: name,
    fullDescription: name,
    purity: '99%',
    variants: [{ dosage: 'Standard', price }],
    inStock: true,
    ...overrides,
  } as Product;
}

const catalogue: Product[] = [
  product('retatrutide', 'Retatrutide', 49.99),
  product('bac-water-10ml', 'BAC Water 10ml', 9.99),
  product('insulin-syringes', 'Insulin Syringes', 4.99),
  product('alcohol-wipes', 'Alcohol Wipes', 2.99),
  product('hidden-product', 'Hidden Product', 5.99),
  product('out-of-stock-product', 'Out of Stock Product', 5.99),
  product('cjc-1295', 'CJC-1295', 39.99),
];

const today = '2026-06-21';

function section(title: string) { console.log(`\n=== ${title} ===`); }

section('Priority order + merge across multiple basket items');
{
  const rules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'retatrutide', upsell_handle: 'alcohol-wipes', priority: 3 }),
    rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml', priority: 1 }),
    rule({ trigger_handle: 'cjc-1295', upsell_handle: 'insulin-syringes', priority: 2 }),
  ];
  const recs = computeUpsellRecommendations({
    basketSlugs: ['retatrutide', 'cjc-1295'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today,
  });
  console.log(recs.map(r => `${r.slug} (priority order position)`));
  console.assert(recs.map(r => r.slug).join(',') === 'bac-water-10ml,insulin-syringes,alcohol-wipes', 'expected priority-sorted merge');
}

section('Active=FALSE rule is excluded');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml', active: false })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recs:', recs.length);
  console.assert(recs.length === 0, 'expected inactive rule to produce no recommendation');
}

section('Cannot recommend a product already in the basket');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml' })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide', 'bac-water-10ml'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recs:', recs.length);
  console.assert(recs.length === 0, 'expected basket item to be excluded from its own recommendations');
}

section('Hidden product excluded');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'hidden-product' })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide'], rules, catalogue, hiddenSlugs: new Set(['hidden-product']), stockMap: {}, today });
  console.log('recs:', recs.length);
  console.assert(recs.length === 0, 'expected hidden product to be excluded');
}

section('Out-of-stock product excluded');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'out-of-stock-product' })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide'], rules, catalogue, hiddenSlugs: new Set(), stockMap: { 'out-of-stock-product': 0 }, today });
  console.log('recs:', recs.length);
  console.assert(recs.length === 0, 'expected zero-stock product to be excluded');
}

section('Unknown handle (deleted/renamed product) excluded gracefully');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'no-longer-exists' })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recs:', recs.length);
  console.assert(recs.length === 0, 'expected unknown handle to be silently skipped, not throw');
}

section('Duplicate recommendation across two triggers — kept once at best priority');
{
  const rules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml', priority: 5 }),
    rule({ trigger_handle: 'cjc-1295', upsell_handle: 'bac-water-10ml', priority: 1 }),
  ];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide', 'cjc-1295'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recs:', recs.length, recs[0]?.slug);
  console.assert(recs.length === 1, 'expected exactly one recommendation, not a duplicate');
}

section('start_date/end_date window — outside window excluded, inside included');
{
  const rules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml', start_date: '2027-01-01' }), // future
    rule({ trigger_handle: 'cjc-1295', upsell_handle: 'insulin-syringes', start_date: '2026-01-01', end_date: '2026-12-31' }), // current
  ];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide', 'cjc-1295'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recs:', recs.map(r => r.slug));
  console.assert(recs.length === 1 && recs[0].slug === 'insulin-syringes', 'expected only the in-window rule to fire');
}

section('Custom message + price/variant pass through');
{
  const rules: UpsellRuleRow[] = [rule({ trigger_handle: 'retatrutide', upsell_handle: 'bac-water-10ml', custom_message: 'Frequently purchased together' })];
  const recs = computeUpsellRecommendations({ basketSlugs: ['retatrutide'], rules, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log(recs[0]);
  console.assert(recs[0]?.message === 'Frequently purchased together', 'expected custom message to pass through');
  console.assert(recs[0]?.price === 9.99, 'expected variant price to pass through');
  console.assert(recs[0]?.productId === 'bac-water-10ml', 'expected productId to be set');
}

console.log('\nDone — any failed assertion above would have logged "Assertion failed".');
