import { NextResponse } from 'next/server';
import { deactivateOtherPercentagePromotions, deletePromotion, isDbConfigured, updatePromotion, type PromotionType } from '@/lib/db';
import { isValidButtonLink } from '@/lib/promotionRoutes';
import { parseDiscountTypeAndScope, type DiscountScopeType } from '@/lib/discountCodes';

export const dynamic = 'force-dynamic';

const MAX_PROMOTION_IMAGES = 8;

function parseImageUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map(v => v.trim())
    .slice(0, MAX_PROMOTION_IMAGES);
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid promotion id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!title || !description) {
    return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 });
  }

  const buttonText = typeof body.buttonText === 'string' ? body.buttonText.trim() || null : null;
  const buttonLink = typeof body.buttonLink === 'string' ? body.buttonLink.trim() || null : null;
  const imageUrls = parseImageUrls(body.imageUrls);
  const promotionType: PromotionType =
    body.promotionType === 'code' ? 'code' : body.promotionType === 'percentage' ? 'percentage' : 'informational';

  if (!isValidButtonLink(buttonLink)) {
    return NextResponse.json(
      { error: 'Button link must be a site path starting with "/" (e.g. /shop) or a full https:// URL.' },
      { status: 400 }
    );
  }

  let discountCode: string | null = null;
  let discountPercent: number | null = null;
  let discountScopeType: DiscountScopeType = 'all';
  let discountScopeCategories: string[] = [];
  let discountScopeProductSlugs: string[] = [];

  if (promotionType === 'code') {
    discountCode = typeof body.discountCode === 'string' ? body.discountCode.trim().toUpperCase() || null : null;
    if (!discountCode) {
      return NextResponse.json({ error: 'A code promotion needs a discount code.' }, { status: 400 });
    }
  } else if (promotionType === 'percentage') {
    const parsedScope = parseDiscountTypeAndScope({ ...body, discountType: 'percentage' });
    if (parsedScope.error !== null) {
      return NextResponse.json({ error: parsedScope.error }, { status: parsedScope.status });
    }
    discountPercent = parsedScope.percentage;
    discountScopeType = parsedScope.scopeType as DiscountScopeType;
    discountScopeCategories = parsedScope.scopeCategories;
    discountScopeProductSlugs = parsedScope.scopeProductSlugs;
  }

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  if (startDate === undefined || endDate === undefined) {
    return NextResponse.json({ error: 'Please provide valid start and end dates.' }, { status: 400 });
  }

  const active = body.active !== false;

  try {
    const updated = await updatePromotion(id, {
      title, description, buttonText, buttonLink, startDate, endDate, active, discountCode, imageUrls, promotionType,
      discountPercent, discountScopeType, discountScopeCategories, discountScopeProductSlugs,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }
    if (promotionType === 'percentage' && active) {
      await deactivateOtherPercentagePromotions(id);
    }
    return NextResponse.json({ promotion: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update promotion.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid promotion id.' }, { status: 400 });
  }

  try {
    const deleted = await deletePromotion(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Promotion not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete promotion.' },
      { status: 500 }
    );
  }
}
