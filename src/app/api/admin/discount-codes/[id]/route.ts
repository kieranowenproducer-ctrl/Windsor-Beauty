import { NextResponse } from 'next/server';
import { isDbConfigured, setDiscountCodeActive, updateDiscountCode, deleteDiscountCode } from '@/lib/db';
import { roundMoney } from '@/lib/money';
import { parseDiscountTypeAndScope } from '@/lib/discountCodes';

export const dynamic = 'force-dynamic';

const CODE_PATTERN = /^[A-Z0-9-]{3,32}$/;

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid discount code id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Toggle-only request from the Activate/Deactivate button — { active: boolean } alone.
  if (typeof body.active === 'boolean' && body.code === undefined && body.percentage === undefined) {
    try {
      const updated = await setDiscountCodeActive(id, body.active);
      if (!updated) {
        return NextResponse.json({ error: 'Discount code not found.' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to update discount code.' },
        { status: 500 }
      );
    }
  }

  // Full edit from the edit form.
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { error: 'Codes must be 3-32 characters — letters, numbers, and hyphens only.' },
      { status: 400 }
    );
  }

  const parsedFields = parseDiscountTypeAndScope(body);
  if (parsedFields.error !== null) {
    return NextResponse.json({ error: parsedFields.error }, { status: parsedFields.status });
  }
  const { discountType, percentage, fixedAmount, scopeType, scopeCategories, scopeProductSlugs } = parsedFields;

  let expiresAt: Date | null = null;
  if (typeof body.expiresAt === 'string' && body.expiresAt.trim()) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'Please provide a valid expiry date.' }, { status: 400 });
    }
    expiresAt = parsed;
  }

  let usageLimit: number | null = null;
  if (body.usageLimit !== null && body.usageLimit !== undefined && body.usageLimit !== '') {
    const parsed = Number(body.usageLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return NextResponse.json({ error: 'Usage limit must be a whole number of at least 1.' }, { status: 400 });
    }
    usageLimit = parsed;
  }

  let minOrderValue: number | null = null;
  if (body.minOrderValue !== null && body.minOrderValue !== undefined && body.minOrderValue !== '') {
    const parsed = Number(body.minOrderValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return NextResponse.json({ error: 'Minimum order value must be a positive amount.' }, { status: 400 });
    }
    minOrderValue = roundMoney(parsed);
  }

  const active = body.active !== false;

  try {
    const updated = await updateDiscountCode(id, {
      code, discountType, percentage, fixedAmount, scopeType, scopeCategories, scopeProductSlugs,
      expiresAt, usageLimit, minOrderValue, active,
    });
    if (!updated) {
      return NextResponse.json({ error: 'Discount code not found.' }, { status: 404 });
    }
    return NextResponse.json({ code: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update discount code.';
    if (message.includes('duplicate key')) {
      return NextResponse.json({ error: 'A discount code with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid discount code id.' }, { status: 400 });
  }

  try {
    const deleted = await deleteDiscountCode(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Discount code not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete discount code.' },
      { status: 500 }
    );
  }
}
