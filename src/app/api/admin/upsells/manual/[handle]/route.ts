import { NextResponse } from 'next/server';
import {
  deleteManualUpsellOverride,
  getHiddenProductSlugs,
  getManualUpsellOverride,
  getManualUpsellOverridesForTriggers,
  getProductStockMap,
  getUpsellRulesForTriggers,
  isDbConfigured,
  listCustomProducts,
  upsertManualUpsellOverride,
  type UpsellManualOverrideRow,
} from '@/lib/db';
import { mergeProducts, PRODUCTS } from '@/data/products';
import {
  buildCategoryFallbackRules,
  buildEffectiveRules,
  computeUpsellRecommendations,
  coveredTriggerSlugs,
  resolveUpsellHeading,
} from '@/lib/upsells';

export const dynamic = 'force-dynamic';

const MAX_MANUAL_UPSELLS = 8; // matches MAX_RECOMMENDATIONS in upsells.ts — anything beyond this never displays anyway
const MAX_HEADING_LENGTH = 80;

// GET returns both the raw saved override (if any — used to prefill the
// editor exactly as last saved, including any since-hidden handles so the
// admin can see and clean them up) and the current EFFECTIVE, fully-filtered
// recommendations for this trigger (used both as a live preview and, when no
// override exists yet, as a sensible starting point to prefill a brand new
// manual edit from rather than a blank list).
export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const [csvRules, manualOverrides, overridesMap, hiddenSlugList, stockMap] = await Promise.all([
      getUpsellRulesForTriggers([handle]),
      getManualUpsellOverridesForTriggers([handle]),
      listCustomProducts(),
      getHiddenProductSlugs(),
      getProductStockMap(),
    ]);
    const override: UpsellManualOverrideRow | null = manualOverrides.find(o => o.trigger_handle === handle) ?? null;

    const catalogue = mergeProducts(PRODUCTS, overridesMap);
    const hiddenSlugs = new Set(hiddenSlugList);
    const today = new Date().toISOString().slice(0, 10);

    const effectiveRules = buildEffectiveRules([handle], csvRules, manualOverrides);
    const fallbackRules = buildCategoryFallbackRules([handle], catalogue, coveredTriggerSlugs(csvRules, manualOverrides));
    const recommendations = computeUpsellRecommendations({
      basketSlugs: [handle],
      rules: [...effectiveRules, ...fallbackRules],
      catalogue, hiddenSlugs, stockMap, today,
    });
    const heading = resolveUpsellHeading(handle, manualOverrides, 'product');
    const basketHeading = resolveUpsellHeading(handle, manualOverrides, 'basket');

    return NextResponse.json({ override, effective: { recommendations, heading, basketHeading } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load this product\'s upsell data.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const rawHandles = Array.isArray(body.upsellHandles) ? body.upsellHandles : [];
  const headingInput = typeof body.heading === 'string' ? body.heading.trim() : '';
  const heading = headingInput ? headingInput.slice(0, MAX_HEADING_LENGTH) : null;
  const basketHeadingInput = typeof body.basketHeading === 'string' ? body.basketHeading.trim() : '';
  const basketHeading = basketHeadingInput ? basketHeadingInput.slice(0, MAX_HEADING_LENGTH) : null;

  let overridesMap;
  try {
    overridesMap = await listCustomProducts();
  } catch {
    overridesMap = {};
  }
  const catalogue = mergeProducts(PRODUCTS, overridesMap);
  const knownSlugs = new Set(catalogue.map(p => p.slug));

  if (!knownSlugs.has(handle)) {
    return NextResponse.json({ error: `"${handle}" does not match any product in the catalogue.` }, { status: 400 });
  }

  const seen = new Set<string>();
  const invalidHandles: string[] = [];
  const validHandles: string[] = [];
  for (const raw of rawHandles) {
    const h = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!h || h === handle || seen.has(h)) continue; // skip blanks, self-reference, and duplicates silently — not real errors
    seen.add(h);
    if (knownSlugs.has(h)) {
      validHandles.push(h);
    } else {
      invalidHandles.push(h);
    }
  }

  const truncated = validHandles.length > MAX_MANUAL_UPSELLS;
  const finalHandles = validHandles.slice(0, MAX_MANUAL_UPSELLS);

  try {
    await upsertManualUpsellOverride(handle, heading, basketHeading, finalHandles);
    const override = await getManualUpsellOverride(handle);
    return NextResponse.json({
      override,
      invalidHandles,
      truncated,
      ...(truncated ? { truncatedMessage: `Only the first ${MAX_MANUAL_UPSELLS} products were saved — at most ${MAX_MANUAL_UPSELLS} ever display.` } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not save this override.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    await deleteManualUpsellOverride(handle);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not clear this override.' },
      { status: 500 }
    );
  }
}
