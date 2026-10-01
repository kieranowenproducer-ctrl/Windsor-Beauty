import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { deleteReview, isDbConfigured, updateReview, updateReviewStatus, type ReviewStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ReviewStatus[] = ['pending', 'approved', 'hidden', 'rejected'];

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !(VALID_STATUSES as string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  try {
    const updated = await updateReviewStatus(id, body.status as ReviewStatus);
    if (!updated) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    return NextResponse.json({ review: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update review.' },
      { status: 500 }
    );
  }
}

// PUT /api/admin/reviews/[id] — edit review content (name, rating, title, body, date)
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
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const updates: Parameters<typeof updateReview>[1] = {};

  if (typeof body.customer_name === 'string' && body.customer_name.trim()) {
    updates.customer_name = body.customer_name.trim();
  }
  if (typeof body.rating === 'number' && body.rating >= 1 && body.rating <= 5 && Number.isInteger(body.rating)) {
    updates.rating = body.rating;
  }
  if ('title' in body) {
    updates.title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  }
  if (typeof body.body === 'string' && body.body.trim()) {
    updates.body = body.body.trim();
  }
  if (typeof body.created_at === 'string' && body.created_at) {
    const d = new Date(body.created_at);
    if (!isNaN(d.getTime())) updates.created_at = d.toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  try {
    const updated = await updateReview(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    return NextResponse.json({ review: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update review.' },
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
    const { deleted, imageUrl } = await deleteReview(id);
    if (!deleted) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }

    // Best-effort — the review row is already gone either way. A failed
    // blob delete just leaves an orphaned file in storage, not a broken
    // review, so it's logged rather than turned into a 500 for the admin.
    if (imageUrl) {
      await del(imageUrl).catch(err => console.error('[admin/reviews] Failed to delete review image from Blob:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete review.' },
      { status: 500 }
    );
  }
}
