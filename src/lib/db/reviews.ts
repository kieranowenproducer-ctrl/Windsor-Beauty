import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-07-05 (see db/client.ts).

// ─── Reviews ──────────────────────────────────────────────────────────────

export type ReviewStatus = 'pending' | 'approved' | 'hidden' | 'rejected';

export interface ReviewRow {
  id: number;
  customer_id: number | null;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
  status: ReviewStatus;
  product_slug: string | null;
  image_url: string | null;
  admin_reply: string | null;
  admin_reply_created_at: string | null;
  admin_reply_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listReviews(params?: { status?: ReviewStatus; limit?: number }): Promise<ReviewRow[]> {
  const db = requireDb();
  const limit = params?.limit ?? 200;
  if (params?.status) {
    const rows = await db`
      SELECT * FROM reviews WHERE status = ${params.status} ORDER BY created_at DESC LIMIT ${limit}
    `;
    return rows as ReviewRow[];
  }
  const rows = await db`SELECT * FROM reviews ORDER BY created_at DESC LIMIT ${limit}`;
  return rows as ReviewRow[];
}

// How many reviews are sitting unapproved. Read by the admin sidebar badge and
// the dashboard banner, so a review that arrived overnight is visible on sight
// instead of only to whoever thinks to open the Reviews page.
export async function countPendingReviews(): Promise<number> {
  const db = requireDb();
  const [row] = await db`SELECT COUNT(*)::int AS count FROM reviews WHERE status = 'pending'`;
  return Number((row as { count?: number } | undefined)?.count ?? 0);
}

export async function listApprovedReviews(limit = 50): Promise<ReviewRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM reviews WHERE status = 'approved' ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as ReviewRow[];
}

// Public API variant: includes aggregated product_slugs for each review so
// public review cards can show clickable product tags.
export interface ReviewRowPublic extends ReviewRow {
  product_slugs: string[];
}

export async function listApprovedReviewsPublic(limit = 50): Promise<ReviewRowPublic[]> {
  const db = requireDb();
  const rows = await db`
    SELECT r.*,
      COALESCE(array_agg(l.product_slug ORDER BY l.product_slug) FILTER (WHERE l.product_slug IS NOT NULL), '{}') AS product_slugs
    FROM reviews r
    LEFT JOIN review_product_links l ON l.review_id = r.id
    WHERE r.status = 'approved'
    GROUP BY r.id
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `;
  return rows as ReviewRowPublic[];
}

// Admin edit of review content fields. Fetches the current row first so
// only supplied fields overwrite — unset params keep their existing value.
export async function updateReview(
  id: number,
  params: {
    customer_name?: string;
    rating?: number;
    title?: string | null;
    body?: string;
    created_at?: string;
  }
): Promise<ReviewRow | null> {
  const db = requireDb();
  const current = await db`SELECT * FROM reviews WHERE id = ${id}`;
  if (current.length === 0) return null;
  const cur = current[0] as ReviewRow;

  const customer_name = params.customer_name ?? cur.customer_name;
  const rating = params.rating ?? cur.rating;
  const title = 'title' in params ? (params.title ?? null) : cur.title;
  const body = params.body ?? cur.body;
  const created_at = params.created_at ? new Date(params.created_at).toISOString() : cur.created_at;

  const rows = await db`
    UPDATE reviews SET
      customer_name = ${customer_name},
      rating = ${rating},
      title = ${title},
      body = ${body},
      created_at = ${created_at},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as ReviewRow) ?? null;
}

export async function createReview(params: {
  customerId: number | null;
  customerName: string;
  rating: number;
  title: string | null;
  body: string;
  productSlug: string | null;
  imageUrl?: string | null;
}): Promise<ReviewRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO reviews (customer_id, customer_name, rating, title, body, product_slug, image_url)
    VALUES (${params.customerId}, ${params.customerName}, ${params.rating}, ${params.title}, ${params.body}, ${params.productSlug}, ${params.imageUrl ?? null})
    RETURNING *
  `;
  const review = (rows[0] as ReviewRow) ?? null;

  // A review submitted directly on a product page also displays on that
  // product page (in addition to the main /reviews page, which lists all
  // approved reviews regardless of mapping).
  if (review && params.productSlug) {
    await db`
      INSERT INTO review_product_links (review_id, product_slug)
      VALUES (${review.id}, ${params.productSlug})
      ON CONFLICT (review_id, product_slug) DO NOTHING
    `;
  }

  return review;
}

export async function updateReviewStatus(id: number, status: ReviewStatus): Promise<ReviewRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE reviews SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING *
  `;
  return (rows[0] as ReviewRow) ?? null;
}

// Hard delete — genuinely removes the row (review_product_links cascade-
// delete with it). Returns the deleted row's image_url so the caller can
// also remove the file from Blob storage; null means nothing was deleted
// (already gone) rather than "deleted but had no photo".
export async function deleteReview(id: number): Promise<{ deleted: boolean; imageUrl: string | null }> {
  const db = requireDb();
  const rows = await db`DELETE FROM reviews WHERE id = ${id} RETURNING image_url`;
  if (rows.length === 0) return { deleted: false, imageUrl: null };
  return { deleted: true, imageUrl: (rows[0] as { image_url: string | null }).image_url };
}

export async function setReviewReply(id: number, reply: string): Promise<ReviewRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE reviews
    SET admin_reply = ${reply},
        admin_reply_created_at = COALESCE(admin_reply_created_at, now()),
        admin_reply_updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as ReviewRow) ?? null;
}

export async function deleteReviewReply(id: number): Promise<ReviewRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE reviews
    SET admin_reply = NULL, admin_reply_created_at = NULL, admin_reply_updated_at = NULL
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as ReviewRow) ?? null;
}

// ─── Review-product mapping ──────────────────────────────────────────────────
// Lets admins show a review on additional product pages (or remove a
// product-submitted review from its product page) without ever duplicating
// or deleting the underlying review row.

export async function listReviewProductLinks(reviewId: number): Promise<string[]> {
  const db = requireDb();
  const rows = await db`
    SELECT product_slug FROM review_product_links WHERE review_id = ${reviewId} ORDER BY product_slug
  `;
  return (rows as { product_slug: string }[]).map(r => r.product_slug);
}

export async function addReviewProductLink(reviewId: number, productSlug: string): Promise<string[]> {
  const db = requireDb();
  await db`
    INSERT INTO review_product_links (review_id, product_slug)
    VALUES (${reviewId}, ${productSlug})
    ON CONFLICT (review_id, product_slug) DO NOTHING
  `;
  return listReviewProductLinks(reviewId);
}

export async function removeReviewProductLink(reviewId: number, productSlug: string): Promise<string[]> {
  const db = requireDb();
  await db`DELETE FROM review_product_links WHERE review_id = ${reviewId} AND product_slug = ${productSlug}`;
  return listReviewProductLinks(reviewId);
}

export async function listApprovedReviewsForProduct(productSlug: string, limit = 50): Promise<ReviewRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT r.* FROM reviews r
    JOIN review_product_links l ON l.review_id = r.id
    WHERE l.product_slug = ${productSlug} AND r.status = 'approved'
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `;
  return rows as ReviewRow[];
}

// Site-wide rating across every approved review, for the trusted-rating badge
// on the homepage. Deliberately its own COUNT/AVG query rather than an average
// of whatever reviews a page happens to have loaded: the homepage only holds
// the ten best-rated, so averaging those would quietly overstate the score once
// there are more than ten reviews.
export async function getApprovedReviewSummary(): Promise<{ average: number; count: number }> {
  const db = requireDb();
  const [row] = await db`
    SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric AS average
    FROM reviews WHERE status = 'approved'
  `;
  const r = row as { count?: number; average?: string } | undefined;
  return { average: Number(r?.average ?? 0), count: Number(r?.count ?? 0) };
}

// Average rating + review count per product, for the star ratings shown on
// product cards across the storefront (shop grid, homepage, New In, related
// products) without loading every review's full text.
export async function getReviewStatsForProducts(): Promise<Record<string, { average: number; count: number }>> {
  const db = requireDb();
  const rows = await db`
    SELECT l.product_slug,
      AVG(r.rating)::numeric AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews r
    JOIN review_product_links l ON l.review_id = r.id
    WHERE r.status = 'approved'
    GROUP BY l.product_slug
  `;
  const map: Record<string, { average: number; count: number }> = {};
  for (const row of rows as { product_slug: string; avg_rating: string; review_count: number }[]) {
    map[row.product_slug] = { average: Number(row.avg_rating), count: row.review_count };
  }
  return map;
}

