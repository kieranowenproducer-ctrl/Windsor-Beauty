// Virality scoring + rule-based recommendations. The weights are a plain
// editable object by design — tune them as real data arrives. Structured so
// an AI-driven scorer can replace scoreFor() later without touching callers.

export const VIRALITY_WEIGHTS = {
  views: 0.30,          // reach
  engagementRate: 0.30, // (likes+comments+shares+saves)/views
  shareRate: 0.20,      // shares/views — the strongest virality signal
  saveRate: 0.10,       // saves/views — intent signal
  watchDepth: 0.10,     // watchTime/(views*duration) when available
};

export interface MetricRow {
  views: number; likes: number; comments: number; shares: number;
  saves: number | null; watch_time_seconds: number | null;
  duration_seconds?: number | null;
}

export function engagementRate(m: MetricRow): number {
  if (!m.views) return 0;
  return (m.likes + m.comments + m.shares + (m.saves ?? 0)) / m.views;
}

export function viralityScore(m: MetricRow): number {
  if (!m.views) return 0;
  const er = engagementRate(m);
  const shareRate = m.shares / m.views;
  const saveRate = (m.saves ?? 0) / m.views;
  const watchDepth = m.watch_time_seconds && m.duration_seconds
    ? Math.min(1, m.watch_time_seconds / (m.views * m.duration_seconds)) : 0;
  // Views normalised on a soft log scale: 100k views ~ 1.0
  const viewsNorm = Math.min(1, Math.log10(Math.max(1, m.views)) / 5);
  const w = VIRALITY_WEIGHTS;
  const score =
    viewsNorm * w.views +
    Math.min(1, er * 10) * w.engagementRate +   // 10% ER = ceiling
    Math.min(1, shareRate * 50) * w.shareRate + // 2% share rate = ceiling
    Math.min(1, saveRate * 50) * w.saveRate +
    watchDepth * w.watchDepth;
  return Math.round(score * 100);
}
