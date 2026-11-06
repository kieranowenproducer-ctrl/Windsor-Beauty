import { requireDb } from './client';
import type { ExternalRatingInput } from '../externalRatings';

export interface ExternalRatingRow {
  product_slug: string;
  source: ExternalRatingInput['source'];
  rating: number;
  rating_count: number;
  updated_at: string;
}

export async function listExternalRatings(): Promise<ExternalRatingRow[]> {
  const db = requireDb();
  return await db`SELECT * FROM external_product_ratings ORDER BY product_slug, source, rating DESC` as ExternalRatingRow[];
}

// Replace the bucket total, never increment it. Repeated saves cannot double count.
// Zero withdraws an entry while keeping it editable.
export async function saveExternalRating(input: ExternalRatingInput): Promise<ExternalRatingRow> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO external_product_ratings (product_slug, source, rating, rating_count)
    VALUES (${input.productSlug}, ${input.source}, ${input.rating}, ${input.count})
    ON CONFLICT (product_slug, source, rating) DO UPDATE
    SET rating_count = EXCLUDED.rating_count, updated_at = now()
    RETURNING *
  `;
  return rows[0] as ExternalRatingRow;
}

export async function getExternalRatingTotals(): Promise<Record<string, { points: number; count: number }>> {
  const db = requireDb();
  try {
    const rows = await db`
      SELECT product_slug, SUM(rating::bigint * rating_count)::text AS points,
        SUM(rating_count)::text AS count
      FROM external_product_ratings WHERE rating_count > 0 GROUP BY product_slug
    `;
    return Object.fromEntries(rows.map(row => [row.product_slug, { points: Number(row.points), count: Number(row.count) }]));
  } catch (error) {
    // Preserve existing website ratings until the additive schema is installed.
    if ((error as { code?: string }).code === '42P01') return {};
    throw error;
  }
}
