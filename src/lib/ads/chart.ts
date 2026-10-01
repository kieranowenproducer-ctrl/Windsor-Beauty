// Chart arithmetic shared by the day-by-day chart and the two-ad comparison
// chart. Pure functions, safe in the browser. Each one carries a hard-won
// correctness rule from the first line chart (4 Sept 2026):
//
// - niceScale: axis steps are 1, 2 or 5 of a power of ten, so labels read as
//   money rather than as arithmetic.
// - smoothPath: monotone cubic (Fritsch-Carlson) smoothing, chosen because it
//   cannot overshoot a data point. A plain curve bulges above a peak and draws
//   a number that never happened.
// - fillMissingDays: Meta returns no row at all for a day nothing ran on. A
//   line joined straight across those days would draw spend on days that had
//   none, so the gaps are filled with real zeros first.
//
// Per-click costs stay null on zero-click days (see metricValue in the page):
// the line must break there rather than dive to the floor and read as free.

export interface DailyLike {
  date: string;
  spendMinor: number;
  impressions: number;
  reach: number;
  clicks: number;
  videoViews: number;
  purchases: number;
  purchaseValueMinor: number;
}

export function niceScale(max: number, want = 4): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / want;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) ticks.push(v);
  return { top, ticks };
}

export function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  const n = pts.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  m.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) { m[i] = (3 / h) * a * slope[i]; m[i + 1] = (3 / h) * b * slope[i]; }
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (m[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (m[i + 1] * dx[i]) / 3;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

export function fillMissingDays<T extends DailyLike>(rows: T[], blank: (date: string) => T): T[] {
  if (rows.length < 2) return rows;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(sorted.map((r) => [r.date, r]));
  const out: T[] = [];
  const last = Date.parse(sorted[sorted.length - 1].date + 'T12:00:00Z');
  for (let t = Date.parse(sorted[0].date + 'T12:00:00Z'); t <= last; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? blank(date));
  }
  return out;
}

/** Runs of consecutive points that have a number, so a null breaks the line. */
export function segmentsOf(points: ({ x: number; y: number } | null)[]): { x: number; y: number }[][] {
  const segments: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const pt of points) {
    if (pt) { run.push(pt); } else if (run.length) { segments.push(run); run = []; }
  }
  if (run.length) segments.push(run);
  return segments;
}

/** Every day from since to until inclusive, with a blank row wherever nothing ran. */
export function fillDays<T extends { date: string }>(rows: T[], since: string, until: string, blank: (date: string) => T): T[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: T[] = [];
  const last = Date.parse(until + 'T12:00:00Z');
  for (let t = Date.parse(since + 'T12:00:00Z'); t <= last; t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    out.push(byDate.get(date) ?? blank(date));
  }
  return out;
}
