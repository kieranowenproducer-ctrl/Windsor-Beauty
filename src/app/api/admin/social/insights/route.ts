// Overview stats, analytics aggregates, and rule-based recommendations.
// ?mode=overview | analytics | recommendations
import { NextRequest, NextResponse } from 'next/server';
import { ssql, socialConfigured, getBrandId } from '@/lib/social/db';
import { viralityScore, engagementRate, type MetricRow } from '@/lib/social/virality';

export const dynamic = 'force-dynamic';

async function latestMetricsPerPost(brandId: string) {
  return await ssql()`
    SELECT DISTINCT ON (m.scheduled_post_id)
      m.*, sp.platform_id, sp.scheduled_at, sp.posted_at, sp.video_id,
      v.title, v.category, v.topic, v.duration_seconds,
      c.style AS caption_style, c.hook, c.hashtags
    FROM social_post_metrics m
    JOIN social_scheduled_posts sp ON sp.id = m.scheduled_post_id
    JOIN social_videos v ON v.id = sp.video_id
    LEFT JOIN social_caption_variants c ON c.id = sp.caption_id
    WHERE v.brand_id = ${brandId}
    ORDER BY m.scheduled_post_id, m.captured_at DESC` as (MetricRow & Record<string, unknown>)[];
}

export async function GET(req: NextRequest) {
  if (!socialConfigured()) return NextResponse.json({ configured: false });
  const mode = req.nextUrl.searchParams.get('mode') ?? 'overview';
  const brandId = await getBrandId();

  if (mode === 'overview') {
    const [counts] = await ssql()`
      SELECT
        (SELECT COUNT(*)::int FROM social_videos WHERE status <> 'archived' AND brand_id = ${brandId}) AS total_videos,
        (SELECT COUNT(*)::int FROM social_scheduled_posts WHERE scheduled_at::date = CURRENT_DATE AND status IN ('approved','scheduled','posting_queued')) AS scheduled_today,
        (SELECT COUNT(*)::int FROM social_scheduled_posts WHERE scheduled_at >= date_trunc('week', NOW()) AND scheduled_at < date_trunc('week', NOW()) + interval '7 days' AND status IN ('approved','scheduled','posting_queued','posted')) AS scheduled_week,
        (SELECT COUNT(*)::int FROM social_scheduled_posts WHERE posted_at::date = CURRENT_DATE) AS posted_today,
        (SELECT COUNT(*)::int FROM social_scheduled_posts WHERE status = 'awaiting_approval') AS awaiting_approval,
        (SELECT COUNT(*)::int FROM social_scheduled_posts WHERE status = 'failed') AS failed
    ` as Record<string, number>[];
    const upcoming = await ssql()`
      SELECT sp.id, sp.scheduled_at, sp.status, v.title, pl.name AS platform_name
      FROM social_scheduled_posts sp JOIN social_videos v ON v.id = sp.video_id
      JOIN social_platforms pl ON pl.id = sp.platform_id
      WHERE sp.scheduled_at >= NOW() AND sp.status IN ('awaiting_approval','approved','scheduled')
      ORDER BY sp.scheduled_at LIMIT 8`;
    const recent = await ssql()`
      SELECT sp.id, sp.posted_at, sp.post_url, v.title, pl.name AS platform_name
      FROM social_scheduled_posts sp JOIN social_videos v ON v.id = sp.video_id
      JOIN social_platforms pl ON pl.id = sp.platform_id
      WHERE sp.status = 'posted' ORDER BY sp.posted_at DESC NULLS LAST LIMIT 8`;
    const metrics = await latestMetricsPerPost(brandId);
    const totalViews = metrics.reduce((s, m) => s + (m.views ?? 0), 0);
    const avgEngagement = metrics.length
      ? metrics.reduce((s, m) => s + engagementRate(m), 0) / metrics.length : 0;
    const byPlatform = new Map<string, number>();
    for (const m of metrics) byPlatform.set(m.platform_id as string, (byPlatform.get(m.platform_id as string) ?? 0) + viralityScore(m));
    const bestPlatform = Array.from(byPlatform.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topVideo = metrics.map((m) => ({ title: m.title as string, score: viralityScore(m) }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
    // posting trend: posts per day, last 14 days
    const trend = await ssql()`
      SELECT posted_at::date AS day, COUNT(*)::int AS posts FROM social_scheduled_posts
      WHERE posted_at >= NOW() - interval '14 days' GROUP BY 1 ORDER BY 1`;
    return NextResponse.json({ configured: true, counts, upcoming, recent, totalViews, avgEngagement, bestPlatform, topVideo, trend });
  }

  const metrics = await latestMetricsPerPost(brandId);
  const scored = metrics.map((m) => ({
    title: m.title as string, platform: m.platform_id as string,
    views: m.views ?? 0, engagement: engagementRate(m), score: viralityScore(m),
    captionStyle: (m.caption_style as string) ?? null, category: (m.category as string) ?? null,
    topic: (m.topic as string) ?? null, hashtags: (m.hashtags as string) ?? null,
    postedAt: m.posted_at as string | null, duration: (m.duration_seconds as number) ?? null,
    videoId: m.video_id as string,
  }));

  if (mode === 'analytics') {
    const byPlatform: Record<string, { posts: number; views: number; engagement: number; score: number }> = {};
    for (const s of scored) {
      const p = (byPlatform[s.platform] ??= { posts: 0, views: 0, engagement: 0, score: 0 });
      p.posts += 1; p.views += s.views; p.engagement += s.engagement; p.score += s.score;
    }
    for (const p of Object.values(byPlatform)) { p.engagement /= p.posts || 1; p.score /= p.posts || 1; }
    const top = [...scored].sort((a, b) => b.score - a.score).slice(0, 10);
    const bottom = [...scored].sort((a, b) => a.score - b.score).slice(0, 10);
    const byStyle: Record<string, { posts: number; avgScore: number }> = {};
    for (const s of scored.filter((x) => x.captionStyle)) {
      const st = (byStyle[s.captionStyle!] ??= { posts: 0, avgScore: 0 });
      st.avgScore = (st.avgScore * st.posts + s.score) / (st.posts + 1); st.posts += 1;
    }
    const byTopic: Record<string, { posts: number; avgScore: number }> = {};
    for (const s of scored.filter((x) => x.category)) {
      const t = (byTopic[s.category!] ??= { posts: 0, avgScore: 0 });
      t.avgScore = (t.avgScore * t.posts + s.score) / (t.posts + 1); t.posts += 1;
    }
    const [sched] = await ssql()`
      SELECT COUNT(*) FILTER (WHERE status IN ('scheduled','approved'))::int AS scheduled,
             COUNT(*) FILTER (WHERE status = 'posted')::int AS posted,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM social_scheduled_posts` as Record<string, number>[];
    return NextResponse.json({ configured: true, byPlatform, top, bottom, byStyle, byTopic, sched, sample: scored.length });
  }

  // recommendations: simple rules over the scored set
  const recs: { kind: string; recommendation: string; evidence: string }[] = [];
  const posted = scored.filter((s) => s.postedAt);
  if (posted.length < 3) {
    recs.push({ kind: 'data', recommendation: 'Not enough posted data yet. Publish and import metrics for at least 3 posts per platform to unlock meaningful patterns.', evidence: `${posted.length} posts with metrics so far` });
  } else {
    const byHour: Record<number, { n: number; avg: number }> = {};
    const byDay: Record<string, { n: number; avg: number }> = {};
    for (const s of posted) {
      const d = new Date(s.postedAt!);
      const h = d.getHours(); const day = d.toLocaleDateString('en-GB', { weekday: 'long' });
      const hb = (byHour[h] ??= { n: 0, avg: 0 }); hb.avg = (hb.avg * hb.n + s.score) / (hb.n + 1); hb.n += 1;
      const db = (byDay[day] ??= { n: 0, avg: 0 }); db.avg = (db.avg * db.n + s.score) / (db.n + 1); db.n += 1;
    }
    const bestHour = Object.entries(byHour).sort((a, b) => b[1].avg - a[1].avg)[0];
    const bestDay = Object.entries(byDay).sort((a, b) => b[1].avg - a[1].avg)[0];
    if (bestHour) recs.push({ kind: 'timing', recommendation: `Best posting hour so far: around ${bestHour[0]}:00.`, evidence: `avg virality ${bestHour[1].avg.toFixed(0)} across ${bestHour[1].n} posts` });
    if (bestDay) recs.push({ kind: 'timing', recommendation: `Best posting day so far: ${bestDay[0]}.`, evidence: `avg virality ${bestDay[1].avg.toFixed(0)} across ${bestDay[1].n} posts` });
    const styles = Object.entries(groupAvg(posted, (s) => s.captionStyle)).sort((a, b) => b[1].avg - a[1].avg);
    if (styles[0]) recs.push({ kind: 'caption', recommendation: `Caption style performing best: ${styles[0][0].replace('_', ' ')}.`, evidence: `avg virality ${styles[0][1].avg.toFixed(0)} (${styles[0][1].n} posts)` });
    const cats = Object.entries(groupAvg(posted, (s) => s.category)).sort((a, b) => b[1].avg - a[1].avg);
    if (cats[0]) recs.push({ kind: 'topic', recommendation: `Strongest topic/category: ${cats[0][0]}.`, evidence: `avg virality ${cats[0][1].avg.toFixed(0)} (${cats[0][1].n} posts)` });
    if (cats.length > 1) recs.push({ kind: 'topic', recommendation: `Weakest topic so far: ${cats[cats.length - 1][0]}. Consider fewer of these or a new angle.`, evidence: `avg virality ${cats[cats.length - 1][1].avg.toFixed(0)}` });
    const plats = Object.entries(groupAvg(posted, (s) => s.platform)).sort((a, b) => b[1].avg - a[1].avg);
    if (plats[0]) recs.push({ kind: 'platform', recommendation: `${plats[0][0]} is your strongest platform right now. Prioritise it in the schedule.`, evidence: `avg virality ${plats[0][1].avg.toFixed(0)} (${plats[0][1].n} posts)` });
    const repurpose = [...posted].sort((a, b) => b.score - a.score).slice(0, 3).filter((s) => s.score >= 40);
    for (const r of repurpose) recs.push({ kind: 'repurpose', recommendation: `"${r.title}" performed well. Re-cut or re-post it on the platforms it has not been tried on.`, evidence: `virality ${r.score} on ${r.platform}` });
  }
  return NextResponse.json({ configured: true, recommendations: recs, sample: posted.length });
}

function groupAvg<T>(items: T[], key: (t: T) => string | null): Record<string, { n: number; avg: number }> {
  const out: Record<string, { n: number; avg: number }> = {};
  for (const it of items) {
    const k = key(it); if (!k) continue;
    const g = (out[k] ??= { n: 0, avg: 0 });
    const score = (it as { score: number }).score;
    g.avg = (g.avg * g.n + score) / (g.n + 1); g.n += 1;
  }
  return out;
}
