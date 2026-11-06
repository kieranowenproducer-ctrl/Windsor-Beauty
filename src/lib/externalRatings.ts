export const RATING_SOURCES = ['Telegram', 'Instagram', 'Facebook', 'WhatsApp', 'Other'] as const;
export type RatingSource = typeof RATING_SOURCES[number];
export interface ExternalRatingInput { productSlug: string; source: RatingSource; rating: number; count: number }
export interface RatingSummary { average: number; count: number }

export function parseExternalRating(value: unknown): ExternalRatingInput | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.productSlug !== 'string' || !v.productSlug.trim()) return null;
  if (!RATING_SOURCES.includes(v.source as RatingSource)) return null;
  if (typeof v.rating !== 'number' || !Number.isInteger(v.rating) || v.rating < 1 || v.rating > 5) return null;
  if (typeof v.count !== 'number' || !Number.isInteger(v.count) || v.count < 0 || v.count > 1000000) return null;
  return { productSlug: v.productSlug.trim(), source: v.source as RatingSource, rating: v.rating, count: v.count };
}

export function combineRatingTotals(website: { points: number; count: number }, external: { points: number; count: number }): RatingSummary {
  const count = website.count + external.count;
  return { average: count ? (website.points + external.points) / count : 0, count };
}
