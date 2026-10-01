import { NextResponse } from 'next/server';
import { deletePromotionRule, isDbConfigured, updatePromotionRule } from '@/lib/db';
import { validateRuleConfig } from '@/lib/promotionRules';

export const dynamic = 'force-dynamic';

const VALID_TYPES = ['bogo', 'bundle', 'spend_threshold'];

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
    return NextResponse.json({ error: 'Invalid rule id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }

  const type = typeof body.type === 'string' ? body.type : '';
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid rule type.' }, { status: 400 });
  }

  const configError = validateRuleConfig(type, body.config);
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 400 });
  }

  const startDate = parseDate(body.startDate);
  const endDate = parseDate(body.endDate);
  if (startDate === undefined || endDate === undefined) {
    return NextResponse.json({ error: 'Please provide valid start and end dates.' }, { status: 400 });
  }

  const active = body.active !== false;
  const priority = typeof body.priority === 'number' && Number.isFinite(body.priority) ? body.priority : 0;

  try {
    const updated = await updatePromotionRule(id, { name, type, config: body.config, active, startDate, endDate, priority });
    if (!updated) {
      return NextResponse.json({ error: 'Promotion rule not found.' }, { status: 404 });
    }
    return NextResponse.json({ rule: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update promotion rule.' },
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
    return NextResponse.json({ error: 'Invalid rule id.' }, { status: 400 });
  }

  try {
    const deleted = await deletePromotionRule(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Promotion rule not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete promotion rule.' },
      { status: 500 }
    );
  }
}
