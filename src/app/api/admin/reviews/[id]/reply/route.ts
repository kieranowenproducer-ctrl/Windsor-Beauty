import { NextResponse } from 'next/server';
import { deleteReviewReply, isDbConfigured, setReviewReply } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const reply = typeof body?.reply === 'string' ? body.reply.trim() : '';
  if (!reply) {
    return NextResponse.json({ error: 'Reply text is required.' }, { status: 400 });
  }

  try {
    const updated = await setReviewReply(id, reply);
    if (!updated) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    return NextResponse.json({ review: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save reply.' },
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
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  try {
    const updated = await deleteReviewReply(id);
    if (!updated) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    return NextResponse.json({ review: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete reply.' },
      { status: 500 }
    );
  }
}
