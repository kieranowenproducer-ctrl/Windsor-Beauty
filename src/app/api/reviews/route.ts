import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { createReview, isDbConfigured, logAutomationFailure, listCustomProducts } from '@/lib/db';
import { clientIpOf, isFormRateLimited, logFormAttempt, RATE_LIMIT_MESSAGE } from '@/lib/db/formLimits';
import { mergeProducts, PRODUCTS, type Product } from '@/data/products';
import { sendReviewNotificationEmail } from '@/lib/reviewNotificationEmail';

export const dynamic = 'force-dynamic';

// The product's real name for the notification email, admin-added products
// included. Falls back to the slug rather than failing the send: a slightly
// uglier email beats no email.
async function productDisplayName(slug: string): Promise<string> {
  try {
    const overrides = await listCustomProducts().catch(() => ({} as Record<string, Product>));
    return mergeProducts(PRODUCTS, overrides).find((p) => p.slug === slug)?.name ?? slug;
  } catch {
    return slug;
  }
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Please log in to leave a review.' }, { status: 401 });
  }

  // Counted only for people who are logged in, so anonymous attempts that were
  // already turned away above never eat a real customer's allowance.
  const ip = clientIpOf(request);
  if (await isFormRateLimited('review', ip)) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  await logFormAttempt('review', ip);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Please provide a rating between 1 and 5.' }, { status: 400 });
  }

  const reviewBody = typeof body.body === 'string' ? body.body.trim() : '';
  if (!reviewBody) {
    return NextResponse.json({ error: 'Please write a review before submitting.' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() || null : null;
  const productSlug = typeof body.productSlug === 'string' ? body.productSlug.trim() || null : null;
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() || null : null;

  try {
    const created = await createReview({
      customerId: customer.id,
      customerName: (`${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim()) || customer.email.split('@')[0],
      rating,
      title,
      body: reviewBody,
      productSlug,
      imageUrl,
    });

    // Tell the team it is here. A review lands unapproved and shows to nobody
    // until someone acts on it, so it used to be able to sit for days waiting
    // for a person to happen to open the admin panel.
    //
    // Deliberately after the review is safely saved, and deliberately unable to
    // fail the request: a bad API key or a Resend outage must never cost a
    // customer the review they just wrote. A failure is written to the
    // automation failure log instead, which is what System Health reads.
    if (created) {
      try {
        const sent = await sendReviewNotificationEmail({
          reviewId: created.id,
          customerName: created.customer_name,
          customerEmail: customer.email,
          rating: created.rating,
          title: created.title,
          body: created.body,
          productName: productSlug ? await productDisplayName(productSlug) : null,
          imageUrl: created.image_url,
          createdAt: created.created_at,
        });
        if (!sent) {
          await logAutomationFailure('review_email', 'Review approval notification failed to send', {
            detail: `review #${created.id} - check RESEND_API_KEY and windsorbeauty.co.uk domain verification in Resend`,
          });
        }
      } catch (err) {
        await logAutomationFailure('review_email', 'Review approval notification threw', {
          detail: err,
        });
      }
    }

    return NextResponse.json({ review: created }, { status: 201 });
  } catch (err) {
    console.error('[reviews] Saving a review failed:', err);
    return NextResponse.json(
      { error: 'Your review could not be saved right now.' },
      { status: 500 }
    );
  }
}
