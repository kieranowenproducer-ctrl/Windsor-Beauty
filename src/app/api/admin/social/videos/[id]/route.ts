import { NextRequest, NextResponse } from 'next/server';
import { ssql, logSocial, VIDEO_STATUSES, CAPTION_STYLES } from '@/lib/social/db';
import { checkCompliance } from '@/lib/social/compliance';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const rows = await ssql()`SELECT * FROM social_videos WHERE id = ${params.id}` as Record<string, unknown>[];
  if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [captions, posts, metrics, activity] = await Promise.all([
    ssql()`SELECT * FROM social_caption_variants WHERE video_id = ${params.id} ORDER BY created_at`,
    ssql()`SELECT sp.*, p.name AS platform_name FROM social_scheduled_posts sp
           JOIN social_platforms p ON p.id = sp.platform_id
           WHERE sp.video_id = ${params.id} ORDER BY sp.scheduled_at`,
    ssql()`SELECT m.*, sp.platform_id FROM social_post_metrics m
           JOIN social_scheduled_posts sp ON sp.id = m.scheduled_post_id
           WHERE sp.video_id = ${params.id} ORDER BY m.captured_at DESC`,
    ssql()`SELECT action, detail, created_at FROM social_activity_log
           WHERE entity_id = ${params.id} ORDER BY created_at DESC LIMIT 20`,
  ]);
  return NextResponse.json({ video: rows[0], captions, posts, metrics, activity });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const rows = await ssql()`SELECT * FROM social_videos WHERE id = ${params.id}` as Record<string, unknown>[];
  const video = rows[0];
  if (!video) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json().catch(() => ({}));

  // Caption create/update: compliance runs on every save
  if (b.action === 'caption_save') {
    if (!CAPTION_STYLES.includes(b.style)) return NextResponse.json({ error: 'Unknown caption style' }, { status: 400 });
    const text = `${b.hook ?? ''}\n${b.caption ?? ''}\n${b.hashtags ?? ''}`;
    const warnings = checkCompliance(text);
    let captionId = b.captionId as string | undefined;
    if (captionId) {
      await ssql()`
        UPDATE social_caption_variants SET caption = ${b.caption ?? ''}, hook = ${b.hook || null},
          hashtags = ${b.hashtags || null}, disclaimer = ${b.disclaimer || null}, tone = ${b.tone || null},
          cta_style = ${b.ctaStyle || null}, platform_id = ${b.platformId || null}, style = ${b.style},
          notes = ${b.notes || null}, status = 'draft', updated_at = NOW()
        WHERE id = ${captionId} AND video_id = ${params.id}`;
    } else {
      const [c] = await ssql()`
        INSERT INTO social_caption_variants (video_id, platform_id, style, caption, hook, hashtags, disclaimer, tone, cta_style, notes)
        VALUES (${params.id}, ${b.platformId || null}, ${b.style}, ${b.caption ?? ''}, ${b.hook || null},
                ${b.hashtags || null}, ${b.disclaimer || null}, ${b.tone || null}, ${b.ctaStyle || null}, ${b.notes || null})
        RETURNING id` as { id: string }[];
      captionId = c.id;
    }
    await ssql()`INSERT INTO social_compliance_checks (video_id, caption_id, warnings, warning_count)
                 VALUES (${params.id}, ${captionId}, ${JSON.stringify(warnings)}, ${warnings.length})`;
    await ssql()`UPDATE social_videos SET compliance_status = ${warnings.length ? 'warnings' : 'clear'} WHERE id = ${params.id}`;
    await logSocial('admin', 'caption_saved', 'video', params.id, { captionId, warnings: warnings.length });
    if (warnings.length) await logSocial('admin', 'compliance_warnings', 'caption', captionId, { count: warnings.length });
    return NextResponse.json({ ok: true, captionId, warnings });
  }

  if (b.action === 'caption_status') {
    if (!['approved', 'rejected', 'review', 'draft'].includes(b.status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 });
    await ssql()`UPDATE social_caption_variants SET status = ${b.status}, updated_at = NOW()
                 WHERE id = ${String(b.captionId)} AND video_id = ${params.id}`;
    await logSocial('admin', `caption_${b.status}`, 'caption', String(b.captionId));
    return NextResponse.json({ ok: true });
  }

  // Plain field/status updates
  const fields = ['title', 'description', 'video_url', 'thumbnail_url', 'category', 'topic', 'notes'] as const;
  const updated: Record<string, unknown> = {};
  for (const f of fields) if (f in b || camel(f) in b) updated[f] = (b[f] ?? b[camel(f)]) || null;
  if (b.status && VIDEO_STATUSES.includes(b.status)) updated.status = b.status;
  if (b.durationSeconds !== undefined) updated.duration_seconds = b.durationSeconds || null;
  if (Object.keys(updated).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  await ssql()`
    UPDATE social_videos SET
      title = ${(updated.title as string) ?? video.title}, description = ${'description' in updated ? (updated.description as string | null) : (video.description as string | null)},
      video_url = ${'video_url' in updated ? (updated.video_url as string | null) : (video.video_url as string | null)},
      thumbnail_url = ${'thumbnail_url' in updated ? (updated.thumbnail_url as string | null) : (video.thumbnail_url as string | null)},
      category = ${'category' in updated ? (updated.category as string | null) : (video.category as string | null)},
      topic = ${'topic' in updated ? (updated.topic as string | null) : (video.topic as string | null)},
      notes = ${'notes' in updated ? (updated.notes as string | null) : (video.notes as string | null)},
      status = ${(updated.status as string) ?? video.status},
      duration_seconds = ${'duration_seconds' in updated ? (updated.duration_seconds as number | null) : (video.duration_seconds as number | null)}
    WHERE id = ${params.id}`;
  await logSocial('admin', 'video_edited', 'video', params.id, updated);
  return NextResponse.json({ ok: true });
}

function camel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}
