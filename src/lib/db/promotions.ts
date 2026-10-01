import { requireDb } from './client';
import type { DiscountScopeType } from '../discountCodes';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Promotions (homepage banner) ───────────────────────────────────────────

// 'percentage' promotions are the automatic, no-code price reduction that
// used to live in Discount Codes -> Automatic Sale Discounts (see the
// discount_percent/discount_scope_* fields below) — moved here because it's
// not a customer-entered code, it's an automatic visible offer, same family
// as the banner. 'code'/'informational' are the original manual types,
// unchanged.
export type PromotionType = 'code' | 'informational' | 'percentage';

export interface PromotionRow {
  id: number;
  title: string;
  description: string;
  button_text: string | null;
  button_link: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean;
  /** Optional discount code shown on /promotion alongside the offer details. */
  discount_code: string | null;
  /** Optional banner image (Vercel Blob URL) — kept as `image_urls[0]` for back-compat. */
  image_url: string | null;
  /** Ordered banner images shown as a carousel on /promotion. */
  image_urls: string[];
  /** 'code' promotions surface `discount_code`; 'informational' ones don't require a code at all. */
  promotion_type: PromotionType;
  /** Only meaningful when promotion_type === 'percentage'. Mirrors discount_codes' scope model exactly. */
  discount_percent: number | null;
  discount_scope_type: DiscountScopeType;
  discount_scope_categories: string[];
  discount_scope_product_slugs: string[];
  created_at: string;
  updated_at: string;
}

// Older rows (saved before the carousel existed) only have `image_url` set —
// fold it into `image_urls` so every caller can rely on the array alone.
function normalizePromotionRow(row: PromotionRow): PromotionRow {
  if (row.image_urls && row.image_urls.length > 0) return row;
  return { ...row, image_urls: row.image_url ? [row.image_url] : [] };
}

export async function listPromotions(): Promise<PromotionRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM promotions ORDER BY created_at DESC`;
  return (rows as PromotionRow[]).map(normalizePromotionRow);
}

// Active = enabled AND (no start date or already started) AND (no end date or
// not yet ended) — picks the most recently created if more than one matches.
export async function getActivePromotion(): Promise<PromotionRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM promotions
    WHERE active = true
      AND promotion_type != 'percentage'
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = (rows[0] as PromotionRow) ?? null;
  return row ? normalizePromotionRow(row) : null;
}

// The single automatic percentage-off promotion currently in effect, if any
// — same active/date-range rule as getActivePromotion, but scoped to
// promotion_type = 'percentage' and independent of whichever promotion (of
// any type) happens to be winning the homepage banner slot. At most one row
// can ever be active here — see deactivateOtherPercentagePromotions, called
// by the admin API whenever one is activated — so there's never a "which
// one wins" conflict to resolve when computing prices/badges.
export async function getActivePercentagePromotion(): Promise<PromotionRow | null> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM promotions
    WHERE active = true
      AND promotion_type = 'percentage'
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const row = (rows[0] as PromotionRow) ?? null;
  return row ? normalizePromotionRow(row) : null;
}

// Enforces "at most one active percentage promotion at a time" — called
// after activating one, to switch any others off rather than leaving the
// admin to wonder which one actually applies.
export async function deactivateOtherPercentagePromotions(excludeId: number): Promise<void> {
  const db = requireDb();
  await db`
    UPDATE promotions SET active = false, updated_at = now()
    WHERE promotion_type = 'percentage' AND id != ${excludeId} AND active = true
  `;
}

interface PromotionWriteParams {
  title: string;
  description: string;
  buttonText: string | null;
  buttonLink: string | null;
  startDate: Date | null;
  endDate: Date | null;
  active: boolean;
  discountCode: string | null;
  imageUrls: string[];
  promotionType: PromotionType;
  discountPercent: number | null;
  discountScopeType: DiscountScopeType;
  discountScopeCategories: string[];
  discountScopeProductSlugs: string[];
}

export async function createPromotion(params: PromotionWriteParams): Promise<PromotionRow | null> {
  const db = requireDb();
  const imageUrl = params.imageUrls[0] ?? null;
  const rows = await db`
    INSERT INTO promotions (
      title, description, button_text, button_link, start_date, end_date, active, discount_code,
      image_url, image_urls, promotion_type, discount_percent, discount_scope_type,
      discount_scope_categories, discount_scope_product_slugs
    )
    VALUES (
      ${params.title}, ${params.description}, ${params.buttonText}, ${params.buttonLink}, ${params.startDate}, ${params.endDate},
      ${params.active}, ${params.discountCode}, ${imageUrl}, ${JSON.stringify(params.imageUrls)}, ${params.promotionType},
      ${params.discountPercent}, ${params.discountScopeType}, ${JSON.stringify(params.discountScopeCategories)},
      ${JSON.stringify(params.discountScopeProductSlugs)}
    )
    RETURNING *
  `;
  const row = (rows[0] as PromotionRow) ?? null;
  return row ? normalizePromotionRow(row) : null;
}

export async function updatePromotion(id: number, params: PromotionWriteParams): Promise<PromotionRow | null> {
  const db = requireDb();
  const imageUrl = params.imageUrls[0] ?? null;
  const rows = await db`
    UPDATE promotions
    SET title = ${params.title}, description = ${params.description},
        button_text = ${params.buttonText}, button_link = ${params.buttonLink},
        start_date = ${params.startDate}, end_date = ${params.endDate},
        active = ${params.active}, discount_code = ${params.discountCode},
        image_url = ${imageUrl}, image_urls = ${JSON.stringify(params.imageUrls)},
        promotion_type = ${params.promotionType}, discount_percent = ${params.discountPercent},
        discount_scope_type = ${params.discountScopeType},
        discount_scope_categories = ${JSON.stringify(params.discountScopeCategories)},
        discount_scope_product_slugs = ${JSON.stringify(params.discountScopeProductSlugs)},
        updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const row = (rows[0] as PromotionRow) ?? null;
  return row ? normalizePromotionRow(row) : null;
}

export async function deletePromotion(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM promotions WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ─── Promotion rules (automatic BOGO/bundle/spend-threshold) ──────────────

export interface PromotionRuleRow {
  id: number;
  name: string;
  type: string;
  config: unknown;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  created_at: string;
  updated_at: string;
}

export async function listPromotionRules(): Promise<PromotionRuleRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM promotion_rules ORDER BY priority ASC, id ASC`;
  return rows as PromotionRuleRow[];
}

// Active = enabled AND (no start date or already started) AND (no end date or
// not yet ended) — returns all matches, ordered for evaluation (lower
// priority runs first, ties broken by id).
export async function listActivePromotionRules(): Promise<PromotionRuleRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM promotion_rules
    WHERE active = true
      AND (start_date IS NULL OR start_date <= now())
      AND (end_date IS NULL OR end_date >= now())
    ORDER BY priority ASC, id ASC
  `;
  return rows as PromotionRuleRow[];
}

export async function getPromotionRule(id: number): Promise<PromotionRuleRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM promotion_rules WHERE id = ${id}`;
  return (rows[0] as PromotionRuleRow) ?? null;
}

export async function createPromotionRule(params: {
  name: string;
  type: string;
  config: unknown;
  active: boolean;
  startDate: Date | null;
  endDate: Date | null;
  priority: number;
}): Promise<PromotionRuleRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO promotion_rules (name, type, config, active, start_date, end_date, priority)
    VALUES (${params.name}, ${params.type}, ${JSON.stringify(params.config)}, ${params.active}, ${params.startDate}, ${params.endDate}, ${params.priority})
    RETURNING *
  `;
  return (rows[0] as PromotionRuleRow) ?? null;
}

export async function updatePromotionRule(id: number, params: {
  name: string;
  type: string;
  config: unknown;
  active: boolean;
  startDate: Date | null;
  endDate: Date | null;
  priority: number;
}): Promise<PromotionRuleRow | null> {
  const db = requireDb();
  const rows = await db`
    UPDATE promotion_rules
    SET name = ${params.name}, type = ${params.type}, config = ${JSON.stringify(params.config)},
        active = ${params.active}, start_date = ${params.startDate}, end_date = ${params.endDate},
        priority = ${params.priority}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as PromotionRuleRow) ?? null;
}

export async function deletePromotionRule(id: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM promotion_rules WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
