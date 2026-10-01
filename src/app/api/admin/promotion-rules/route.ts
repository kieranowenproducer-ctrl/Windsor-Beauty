import { NextResponse } from 'next/server';
import { createPromotionRule, isDbConfigured, listPromotionRules } from '@/lib/db';
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

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ rules: [] });
  }

  try {
    const rules = await listPromotionRules();
    return NextResponse.json({ rules });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load promotion rules.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
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
    const created = await createPromotionRule({ name, type, config: body.config, active, startDate, endDate, priority });
    return NextResponse.json({ rule: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create promotion rule.' },
      { status: 500 }
    );
  }
}
