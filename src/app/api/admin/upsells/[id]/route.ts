import { NextResponse } from 'next/server';
import { deleteUpsellRule, isDbConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid rule id.' }, { status: 400 });
  }

  try {
    const deleted = await deleteUpsellRule(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Rule not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete rule.' },
      { status: 500 }
    );
  }
}
