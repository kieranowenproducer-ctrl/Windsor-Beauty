import { NextResponse } from 'next/server';
import {
  addReviewProductLink,
  createReview,
  isDbConfigured,
  listReviews,
  updateReviewStatus,
  type ReviewStatus,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ReviewStatus[] = ['pending', 'approved', 'hidden', 'rejected'];

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ reviews: [] });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status');
  const status = statusParam && (VALID_STATUSES as string[]).includes(statusParam) ? (statusParam as ReviewStatus) : undefined;

  try {
    const reviews = await listReviews({ status });
    return NextResponse.json({ reviews });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load reviews.' },
      { status: 500 }
    );
  }
}

// Admin adds a review by hand (task 28e2cc5b): bulk buyers resell to people
// with no accounts here, and those people's reviews still deserve the page.
// Reached only through the admin cookie wall (middleware guards /api/admin/*).
//
// The review is saved with no customer attached and published IMMEDIATELY —
// the pending queue exists so a human can vet strangers' words before they
// show, and here the human wrote them. No notification email for the same
// reason. Validation mirrors the customer submission route exactly.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  if (!customerName) {
    return NextResponse.json({ error: 'Please enter the reviewer’s name.' }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Please provide a rating between 1 and 5.' }, { status: 400 });
  }

  const reviewBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!reviewBody) {
    return NextResponse.json({ error: 'Please write the review text.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() || null : null;
  const productSlugs: string[] = Array.isArray(body.productSlugs)
    ? body.productSlugs.filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];

  try {
    const created = await createReview({
      customerId: null,
      customerName,
      rating,
      title,
      body: reviewBody,
      productSlug: productSlugs[0] ?? null,
      imageUrl: null,
    });
    if (!created) {
      return NextResponse.json({ error: 'Failed to save the review.' }, { status: 500 });
    }
    for (const slug of productSlugs.slice(1)) {
      await addReviewProductLink(created.id, slug);
    }
    const review = await updateReviewStatus(created.id, 'approved');
    return NextResponse.json({ review: review ?? created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save the review.' },
      { status: 500 }
    );
  }
}
