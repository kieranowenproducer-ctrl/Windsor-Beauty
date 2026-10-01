import { NextResponse } from 'next/server';
import { isDbConfigured, deleteLaunchSubscriber } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid subscriber ID.' }, { status: 400 });
  }

  const deleted = await deleteLaunchSubscriber(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Subscriber not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
