import { NextRequest, NextResponse } from 'next/server';
import { ssql, socialConfigured, logSocial, getBrandId, VIDEO_STATUSES } from '@/lib/social/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!socialConfigured()) return NextResponse.json({ configured: false, videos: [], platforms: [] });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const status = req.nextUrl.searchParams.get('status');
  const brandId = await getBrandId();
  const [videos, platforms] = await Promise.all([
    ssql()`
      SELECT v.*,
        (SELECT COUNT(*)::int FROM social_caption_variants c WHERE c.video_id = v.id) AS caption_count,
        (SELECT COUNT(*)::int FROM social_scheduled_posts p WHERE p.video_id = v.id AND p.status NOT IN ('cancelled')) AS post_count,
        (SELECT COUNT(*)::int FROM social_scheduled_posts p WHERE p.video_id = v.id AND p.status = 'posted') AS posted_count
      FROM social_videos v
      WHERE v.brand_id = ${brandId}
        AND (${q} = '' OR v.title ILIKE ${'%' + q + '%'} OR v.topic ILIKE ${'%' + q + '%'})
        AND (${status}::text IS NULL OR v.status = ${status})
      ORDER BY v.created_at DESC`,
    ssql()`SELECT p.*, c.provider, c.connected FROM social_platforms p
           LEFT JOIN social_api_connections c ON c.platform_id = p.id ORDER BY p.name`,
  ]);
  return NextResponse.json({ configured: true, videos, platforms });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'A title is required' }, { status: 400 });
  const status = VIDEO_STATUSES.includes(b.status) ? b.status : 'draft';
  const brandId = await getBrandId();
  const [v] = await ssql()`
    INSERT INTO social_videos (brand_id, title, description, video_url, thumbnail_url, category, topic, duration_seconds, notes, status, uploaded_by, source, source_ref)
    VALUES (${brandId}, ${title}, ${b.description || null}, ${b.videoUrl || null}, ${b.thumbnailUrl || null},
            ${b.category || null}, ${b.topic || null}, ${b.durationSeconds || null}, ${b.notes || null}, ${status}, 'admin',
            ${b.source || 'upload'}, ${b.sourceRef || null})
    RETURNING id` as { id: string }[];
  await logSocial('admin', 'video_registered', 'video', v.id, { title });
  return NextResponse.json({ ok: true, id: v.id });
}
