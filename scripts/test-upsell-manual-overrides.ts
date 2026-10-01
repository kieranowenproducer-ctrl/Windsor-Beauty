import { buildEffectiveRules, computeUpsellRecommendations, DEFAULT_UPSELL_HEADING, resolveUpsellHeading } from '../src/lib/upsells';
import type { UpsellManualOverrideRow, UpsellRuleRow } from '../src/lib/db';
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

function override(partial: Partial<UpsellManualOverrideRow>): UpsellManualOverrideRow {
  return {
    trigger_handle: '',
    heading: null,
    basket_heading: null,
    upsell_handles: [],
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

function product(slug: string, name: string, price: number, overrides: Partial<Product> = {}): Product {
  return {
    id: slug,
    name,
    slug,
    categories: ['Serums'],
    shortDescription: name,
    fullDescription: name,
    variants: [{ dosage: 'Standard', price }],
    inStock: true,
    ...overrides,
  } as Product;
}

const catalogue: Product[] = [
  product('hydra-veil-serum', 'Hydra Veil Serum', 49.99),
  product('gentle-cleanser', 'Gentle Cleanser', 9.99),
  product('day-cream', 'Day Cream', 4.99),
  product('cotton-pads', 'Cotton Pads', 2.99),
  product('night-balm', 'Night Balm', 39.99),
  product('hidden-product', 'Hidden Product', 5.99),
];

const today = '2026-06-21';

function section(title: string) { console.log(`\n=== ${title} ===`); }

section('Manual override fully replaces CSV rules for the same trigger');
{
  const csvRules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'hydra-veil-serum', upsell_handle: 'cotton-pads', priority: 1 }),
  ];
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', upsell_handles: ['gentle-cleanser', 'day-cream'] }),
  ];
  const effective = buildEffectiveRules(['hydra-veil-serum'], csvRules, manual);
  console.log('effective upsells:', effective.map(r => r.upsell_handle));
  console.assert(effective.length === 2, 'expected exactly the 2 manual rows, not the CSV row');
  console.assert(!effective.some(r => r.upsell_handle === 'cotton-pads'), 'expected CSV rule to be fully ignored once a manual override exists');
  console.assert(effective[0].upsell_handle === 'gentle-cleanser' && effective[0].priority === 1, 'expected manual array order to become priority order');
}

section('Manual override with an EMPTY array means "show nothing", not "fall back to CSV"');
{
  const csvRules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'hydra-veil-serum', upsell_handle: 'cotton-pads', priority: 1 }),
  ];
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', upsell_handles: [] }),
  ];
  const effective = buildEffectiveRules(['hydra-veil-serum'], csvRules, manual);
  console.log('effective upsells:', effective.length);
  console.assert(effective.length === 0, 'expected zero rules — an explicit empty override must not fall back to CSV');

  const recs = computeUpsellRecommendations({ basketSlugs: ['hydra-veil-serum'], rules: effective, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.assert(recs.length === 0, 'expected zero recommendations when manually overridden to empty');
}

section('No manual override — falls back to CSV rules unchanged');
{
  const csvRules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'hydra-veil-serum', upsell_handle: 'cotton-pads', priority: 1 }),
  ];
  const effective = buildEffectiveRules(['hydra-veil-serum'], csvRules, []);
  console.log('effective upsells:', effective.map(r => r.upsell_handle));
  console.assert(effective.length === 1 && effective[0].upsell_handle === 'cotton-pads', 'expected CSV rule to pass through untouched');
}

section('Mixed trigger set — one manual, one CSV-only, merged correctly');
{
  const csvRules: UpsellRuleRow[] = [
    rule({ trigger_handle: 'hydra-veil-serum', upsell_handle: 'cotton-pads', priority: 1 }),
    rule({ trigger_handle: 'night-balm', upsell_handle: 'gentle-cleanser', priority: 1 }),
  ];
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', upsell_handles: ['day-cream'] }),
  ];
  const effective = buildEffectiveRules(['hydra-veil-serum', 'night-balm'], csvRules, manual);
  const recs = computeUpsellRecommendations({ basketSlugs: ['hydra-veil-serum', 'night-balm'], rules: effective, catalogue, hiddenSlugs: new Set(), stockMap: {}, today });
  console.log('recommended slugs:', recs.map(r => r.slug));
  console.assert(recs.some(r => r.slug === 'day-cream'), 'expected the manual rule for hydra-veil-serum to fire');
  console.assert(recs.some(r => r.slug === 'gentle-cleanser'), 'expected the untouched CSV rule for night-balm to still fire');
  console.assert(!recs.some(r => r.slug === 'cotton-pads'), 'expected hydra-veil-serum\'s CSV rule to be fully suppressed by its manual override');
}

section('Manual override still respects hidden/out-of-stock filtering at compute time');
{
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', upsell_handles: ['hidden-product', 'gentle-cleanser'] }),
  ];
  const effective = buildEffectiveRules(['hydra-veil-serum'], [], manual);
  const recs = computeUpsellRecommendations({ basketSlugs: ['hydra-veil-serum'], rules: effective, catalogue, hiddenSlugs: new Set(['hidden-product']), stockMap: {}, today });
  console.log('recommended slugs:', recs.map(r => r.slug));
  console.assert(recs.length === 1 && recs[0].slug === 'gentle-cleanser', 'expected a manually-selected but hidden product to still be excluded at compute time');
}

section('Heading resolution — product-page context, fully product-specific (no site-wide tier)');
{
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', heading: 'Pairs well with' }),
    override({ trigger_handle: 'night-balm', heading: '   ' }), // blank after trim
  ];
  console.assert(resolveUpsellHeading('hydra-veil-serum', manual, 'product') === 'Pairs well with', 'expected the custom heading to be used');
  console.assert(resolveUpsellHeading('night-balm', manual, 'product') === DEFAULT_UPSELL_HEADING, 'expected a blank heading override to fall back to the hardcoded default');
  console.assert(resolveUpsellHeading('no-override-product', manual, 'product') === DEFAULT_UPSELL_HEADING, 'expected no-override product to use the hardcoded default');
  console.assert(resolveUpsellHeading(null, manual, 'product') === DEFAULT_UPSELL_HEADING, 'expected no primary slug to use the hardcoded default');
}

section('Heading resolution — basket-popup context is independent of the product-page heading');
{
  const manual: UpsellManualOverrideRow[] = [
    override({ trigger_handle: 'hydra-veil-serum', heading: 'Pairs well with', basket_heading: 'Add these too' }),
    override({ trigger_handle: 'night-balm', heading: 'Pairs well with' }), // no basket_heading set
  ];
  console.assert(resolveUpsellHeading('hydra-veil-serum', manual, 'basket') === 'Add these too', 'expected the basket-context heading to be used, distinct from the product-page heading');
  console.assert(resolveUpsellHeading('hydra-veil-serum', manual, 'product') === 'Pairs well with', 'expected the product-page heading to be unaffected by the basket heading');
  console.assert(resolveUpsellHeading('night-balm', manual, 'basket') === DEFAULT_UPSELL_HEADING, 'expected a product with only a page heading set to fall back to the hardcoded default in basket context');
  console.assert(resolveUpsellHeading(null, manual, 'basket') === DEFAULT_UPSELL_HEADING, 'expected no primary slug (no clear basket anchor) to use the hardcoded default');
}

console.log('\nDone — any failed assertion above would have logged "Assertion failed".');
