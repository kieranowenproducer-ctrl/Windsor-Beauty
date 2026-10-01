// Social Content Engine database client. SEPARATE `socialengine` database
// (same isolation pattern as the task engine): the live store DB is never
// touched by this module. All /api/admin/social routes are admin-gated by
// the existing middleware.
import { neon } from '@neondatabase/serverless';

let client: ReturnType<typeof neon> | null = null;

export function socialConfigured(): boolean {
  return Boolean(process.env.SOCIAL_DATABASE_URL);
}

export function ssql() {
  if (!client) {
    const url = process.env.SOCIAL_DATABASE_URL;
    if (!url) throw new Error('SOCIAL_DATABASE_URL is not configured');
    client = neon(url, { fetchOptions: { cache: 'no-store' } });
  }
  return client;
}

export const VIDEO_STATUSES = ['draft','ready_for_caption','caption_ready','compliance_review','approved','scheduled','posted','failed','archived'] as const;
export const POST_STATUSES = ['draft','awaiting_approval','approved','scheduled','posting_queued','posted','failed','cancelled'] as const;
export const CAPTION_STYLES = ['educational','short_viral','professional','curiosity_hook','myth_busting','yt_title','yt_description'] as const;

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', ready_for_caption: 'Ready for caption', caption_ready: 'Caption ready',
  compliance_review: 'Compliance review', approved: 'Approved', scheduled: 'Scheduled',
  posted: 'Posted', failed: 'Failed', archived: 'Archived',
  awaiting_approval: 'Awaiting approval', posting_queued: 'Posting queued', cancelled: 'Cancelled',
  review: 'In review', rejected: 'Rejected', unchecked: 'Unchecked', warnings: 'Warnings', clear: 'Clear', blocked: 'Blocked',
};

export const STYLE_LABEL: Record<string, string> = {
  educational: 'Educational', short_viral: 'Short viral', professional: 'Professional',
  curiosity_hook: 'Curiosity hook', myth_busting: 'Myth busting',
  yt_title: 'YouTube title', yt_description: 'YouTube description',
};

export async function logSocial(actor: string | null, action: string, entity: string, entityId: string | null, detail?: Record<string, unknown>) {
  await ssql()`
    INSERT INTO social_activity_log (actor, action, entity, entity_id, detail)
    VALUES (${actor}, ${action}, ${entity}, ${entityId}, ${detail ? JSON.stringify(detail) : null})`.catch(() => {});
}

// This host app is pinned to ONE brand — the only business coupling in the
// module. The standalone Kieran's Social Engine app (master plan Phase 2)
// mounts the same code with a brand SELECTOR instead of a pin.
export const BRAND_SLUG = 'windsor-glow';

let brandId: string | null = null;
export async function getBrandId(): Promise<string> {
  if (brandId) return brandId;
  const rows = await ssql()`SELECT id FROM social_brands WHERE slug = ${BRAND_SLUG}` as { id: string }[];
  if (!rows[0]) throw new Error(`Brand ${BRAND_SLUG} missing. Run scripts/social-engine-migrate-brands.mjs`);
  brandId = rows[0].id;
  return brandId;
}
