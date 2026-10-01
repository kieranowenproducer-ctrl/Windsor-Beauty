// Scheduled posts: list/create (GET/POST) and lifecycle actions (PATCH with
// body.action): approve | reject | cancel | reschedule | duplicate |
// publish_mock | import_metrics. Mock publishing exercises the provider
// abstraction end to end and stores fake post IDs/URLs.
import { NextRequest, NextResponse } from 'next/server';
import { ssql, logSocial, getBrandId } from '@/lib/social/db';
import { getProvider } from '@/lib/social/providers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const platform = p.get('platform');
  const status = p.get('status');
  const from = p.get('from');
  const to = p.get('to');
  const brandId = await getBrandId();
  const posts = await ssql()`
    SELECT sp.*, v.title AS video_title, v.thumbnail_url, v.compliance_status, v.duration_seconds,
           pl.name AS platform_name,
           c.caption, c.hook, c.hashtags, c.style AS caption_style, c.status AS caption_status,
           (SELECT warning_count FROM social_compliance_checks cc WHERE cc.caption_id = sp.caption_id ORDER BY checked_at DESC LIMIT 1) AS warning_count,
           (SELECT warnings FROM social_compliance_checks cc WHERE cc.caption_id = sp.caption_id ORDER BY checked_at DESC LIMIT 1) AS warnings
    FROM social_scheduled_posts sp
    JOIN social_videos v ON v.id = sp.video_id
    JOIN social_platforms pl ON pl.id = sp.platform_id
    LEFT JOIN social_caption_variants c ON c.id = sp.caption_id
    WHERE v.brand_id = ${brandId}
      AND (${platform}::text IS NULL OR sp.platform_id = ${platform})
      AND (${status}::text IS NULL OR sp.status = ${status})
      AND (${from}::timestamptz IS NULL OR sp.scheduled_at >= ${from}::timestamptz)
      AND (${to}::timestamptz IS NULL OR sp.scheduled_at <= ${to}::timestamptz)
    ORDER BY sp.scheduled_at`;
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const { videoId, caption_id: capRaw, captionId, scheduledAt } = b;
  const platforms: string[] = Array.isArray(b.platformIds) ? b.platformIds : [b.platformId].filter(Boolean);
  if (!videoId || platforms.length === 0 || !scheduledAt) {
    return NextResponse.json({ error: 'Video, at least one platform, and a date/time are required' }, { status: 400 });
  }
  const created: string[] = [];
  for (const platformId of platforms) {
    const [row] = await ssql()`
      INSERT INTO social_scheduled_posts (video_id, platform_id, caption_id, scheduled_at, timezone, status)
      VALUES (${videoId}, ${platformId}, ${captionId || capRaw || null}, ${scheduledAt}, ${b.timezone || 'Europe/London'}, 'awaiting_approval')
      RETURNING id` as { id: string }[];
    created.push(row.id);
    await logSocial('admin', 'post_scheduled_draft', 'scheduled_post', row.id, { platformId, scheduledAt });
  }
  await ssql()`UPDATE social_videos SET status = 'compliance_review' WHERE id = ${videoId} AND status IN ('draft','ready_for_caption','caption_ready')`;
  return NextResponse.json({ ok: true, ids: created });
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const id = String(b.id ?? '');
  const rows = await ssql()`
    SELECT sp.*, v.video_url, v.title AS video_title FROM social_scheduled_posts sp
    JOIN social_videos v ON v.id = sp.video_id WHERE sp.id = ${id}` as Record<string, unknown>[];
  const post = rows[0];
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  switch (b.action) {
    case 'approve': {
      await ssql()`UPDATE social_scheduled_posts SET status = 'scheduled', approval_note = ${b.note || null} WHERE id = ${id}`;
      await ssql()`UPDATE social_videos SET status = 'scheduled' WHERE id = ${post.video_id as string}`;
      await logSocial('admin', 'post_approved', 'scheduled_post', id);
      return NextResponse.json({ ok: true });
    }
    case 'reject': {
      await ssql()`UPDATE social_scheduled_posts SET status = 'draft', approval_note = ${b.note || 'Needs edits'} WHERE id = ${id}`;
      await logSocial('admin', 'post_rejected', 'scheduled_post', id, { note: b.note });
      return NextResponse.json({ ok: true });
    }
    case 'cancel': {
      await ssql()`UPDATE social_scheduled_posts SET status = 'cancelled' WHERE id = ${id}`;
      await logSocial('admin', 'post_cancelled', 'scheduled_post', id);
      return NextResponse.json({ ok: true });
    }
    case 'reschedule': {
      if (!b.scheduledAt) return NextResponse.json({ error: 'New date/time required' }, { status: 400 });
      await ssql()`UPDATE social_scheduled_posts SET scheduled_at = ${b.scheduledAt} WHERE id = ${id}`;
      await logSocial('admin', 'post_rescheduled', 'scheduled_post', id, { to: b.scheduledAt });
      return NextResponse.json({ ok: true });
    }
    case 'duplicate': {
      const [row] = await ssql()`
        INSERT INTO social_scheduled_posts (video_id, platform_id, caption_id, scheduled_at, timezone, status)
        VALUES (${post.video_id as string}, ${b.platformId || (post.platform_id as string)}, ${post.caption_id as string | null},
                ${b.scheduledAt || (post.scheduled_at as string)}, ${post.timezone as string}, 'awaiting_approval')
        RETURNING id` as { id: string }[];
      await logSocial('admin', 'post_duplicated', 'scheduled_post', row.id, { from: id });
      return NextResponse.json({ ok: true, id: row.id });
    }
    case 'publish_mock': {
      if (post.status !== 'scheduled' && post.status !== 'approved') {
        return NextResponse.json({ error: 'Only approved/scheduled posts can be published' }, { status: 400 });
      }
      const connRows = await ssql()`SELECT provider FROM social_api_connections WHERE platform_id = ${post.platform_id as string}` as { provider: string }[];
      const conn = connRows[0];
      const provider = getProvider(post.platform_id as string, conn?.provider ?? 'mock');
      await ssql()`UPDATE social_scheduled_posts SET status = 'posting_queued' WHERE id = ${id}`;
      const result = await provider.publishPost({
        platformId: post.platform_id as string, videoUrl: post.video_url as string | null,
        caption: '', hashtags: null, scheduledPostId: id,
      });
      if (result.ok) {
        await ssql()`UPDATE social_scheduled_posts SET status = 'posted', platform_post_id = ${result.platformPostId!},
                     post_url = ${result.postUrl!}, posted_at = NOW() WHERE id = ${id}`;
        await ssql()`UPDATE social_videos SET status = 'posted' WHERE id = ${post.video_id as string}`;
        await logSocial('admin', 'post_published_mock', 'scheduled_post', id, { postId: result.platformPostId });
      } else {
        await ssql()`UPDATE social_scheduled_posts SET status = 'failed', error_message = ${result.error!} WHERE id = ${id}`;
        await logSocial('admin', 'post_publish_failed', 'scheduled_post', id, { error: result.error });
      }
      return NextResponse.json(result.ok ? { ok: true, postUrl: result.postUrl } : { error: result.error }, result.ok ? undefined : { status: 502 });
    }
    case 'import_metrics': {
      if (!post.platform_post_id) return NextResponse.json({ error: 'Post has not been published yet' }, { status: 400 });
      const connRows = await ssql()`SELECT provider FROM social_api_connections WHERE platform_id = ${post.platform_id as string}` as { provider: string }[];
      const conn = connRows[0];
      const provider = getProvider(post.platform_id as string, conn?.provider ?? 'mock');
      const m = b.manual ?? await provider.fetchPostMetrics(post.platform_post_id as string);
      if (!m) return NextResponse.json({ error: 'No metrics available' }, { status: 502 });
      await ssql()`
        INSERT INTO social_post_metrics (scheduled_post_id, source, views, likes, comments, shares, saves, watch_time_seconds)
        VALUES (${id}, ${b.manual ? 'manual' : 'mock'}, ${m.views ?? 0}, ${m.likes ?? 0}, ${m.comments ?? 0},
                ${m.shares ?? 0}, ${m.saves ?? null}, ${m.watchTimeSeconds ?? m.watch_time_seconds ?? null})`;
      await logSocial('admin', 'metrics_imported', 'scheduled_post', id, { source: b.manual ? 'manual' : 'mock' });
      return NextResponse.json({ ok: true, metrics: m });
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
