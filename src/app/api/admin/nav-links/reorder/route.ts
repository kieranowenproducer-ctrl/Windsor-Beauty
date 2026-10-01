import { NextResponse } from 'next/server';
import { isDbConfigured, setAdminNavLinkOrder } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Body: { ids: number[] } — the full list of nav link ids in their new order.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => Number.isInteger(id)) : null;
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: 'Provide { ids: number[] }.' }, { status: 400 });
  }

  try {
    await setAdminNavLinkOrder(ids);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reorder nav links.' },
      { status: 500 }
    );
  }
}
