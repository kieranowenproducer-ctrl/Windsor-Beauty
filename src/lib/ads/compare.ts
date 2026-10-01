import type { AdRow } from './meta';
import type { CampaignTillRow } from './store';

// How two ads are compared, in one place, so the cards, the chart and the
// verdict sentence can never disagree about who is ahead. Pure functions,
// safe on the server and in the browser.
//
// Two honesty rules, both borrowed from the thresholds computeSignals() in
// adviser.ts already uses: nothing is called a winner until both ads have a
// believable sample (20 clicks and 500 views each), and a difference under
// 15% is a tie. And cheapest is best for cost measures, highest for the rest.

export type Better = 'higher' | 'lower' | 'none';
export type MeasureFormat = 'money' | 'count' | 'percent' | 'decimal';

export interface Measure {
  key: string;
  label: string;
  hint: string;
  format: MeasureFormat;
  better: Better;
  /** The four that lead a card: spend, cost per click, click rate, comments. */
  lead?: boolean;
  source: 'meta' | 'ours';
  value: (ad: AdRow, till?: CampaignTillRow) => number | null;
}

export const MEASURES: Measure[] = [
  { key: 'spend', label: 'Spent', hint: 'what this ad cost', format: 'money', better: 'none', lead: true, source: 'meta', value: (a) => a.spendMinor },
  { key: 'cpc', label: 'Cost per click', hint: 'spend divided by clicks', format: 'money', better: 'lower', lead: true, source: 'meta', value: (a) => (a.clicks > 0 ? a.spendMinor / a.clicks : null) },
  { key: 'ctr', label: 'Click rate', hint: 'clicks per 100 views', format: 'percent', better: 'higher', lead: true, source: 'meta', value: (a) => (a.impressions > 0 ? (a.clicks / a.impressions) * 100 : null) },
  { key: 'comments', label: 'Comments', hint: 'left on the ad', format: 'count', better: 'higher', lead: true, source: 'meta', value: (a) => a.comments },
  { key: 'reach', label: 'People reached', hint: 'different people', format: 'count', better: 'higher', source: 'meta', value: (a) => a.reach },
  { key: 'impressions', label: 'Times shown', hint: 'every appearance', format: 'count', better: 'higher', source: 'meta', value: (a) => a.impressions },
  { key: 'frequency', label: 'Frequency', hint: 'times each person saw it', format: 'decimal', better: 'none', source: 'meta', value: (a) => (a.frequency > 0 ? a.frequency : null) },
  { key: 'clicks', label: 'Clicks', hint: 'anywhere on the ad', format: 'count', better: 'higher', source: 'meta', value: (a) => a.clicks },
  { key: 'linkClicks', label: 'Link clicks', hint: 'clicks that left for the site', format: 'count', better: 'higher', source: 'meta', value: (a) => a.linkClicks },
  { key: 'cpm', label: 'Cost per 1,000 views', hint: 'what showing it costs', format: 'money', better: 'lower', source: 'meta', value: (a) => (a.impressions > 0 ? (a.spendMinor / a.impressions) * 1000 : null) },
  { key: 'engagement', label: 'Engagement', hint: 'likes, saves, comments, plays', format: 'count', better: 'higher', source: 'meta', value: (a) => a.engagement },
  { key: 'landed', label: 'Landed on the site', hint: "by Meta's count", format: 'count', better: 'higher', source: 'meta', value: (a) => a.landingPageViews },
  { key: 'orders', label: 'Orders', hint: 'from our own records', format: 'count', better: 'higher', source: 'ours', value: (_a, t) => (t ? t.orders : 0) },
  { key: 'revenue', label: 'Sales', hint: 'from our own records', format: 'money', better: 'higher', source: 'ours', value: (_a, t) => (t ? t.revenue_minor : 0) },
];

export const MIN_CLICKS_TO_COMPARE = 20;
export const MIN_VIEWS_TO_COMPARE = 500;
export const MIN_DIFFERENCE = 0.15;

export function enoughToCompare(ads: AdRow[]): boolean {
  return ads.length >= 2
    && ads.every((a) => a.clicks >= MIN_CLICKS_TO_COMPARE && a.impressions >= MIN_VIEWS_TO_COMPARE);
}

/** The id of the ad ahead on this measure, or null when there is no honest winner. */
export function winnerOf(
  measure: Measure,
  ads: AdRow[],
  tillFor: (ad: AdRow) => CampaignTillRow | undefined,
): string | null {
  if (measure.better === 'none' || !enoughToCompare(ads)) return null;
  const vals = ads
    .map((a) => ({ id: a.id, v: measure.value(a, tillFor(a)) }))
    .filter((x): x is { id: string; v: number } => x.v !== null);
  if (vals.length < 2) return null;
  const sorted = [...vals].sort((x, y) => (measure.better === 'lower' ? x.v - y.v : y.v - x.v));
  const [best, next] = sorted;
  const base = Math.max(Math.abs(best.v), Math.abs(next.v));
  if (base === 0) return null;
  if (Math.abs(best.v - next.v) / base < MIN_DIFFERENCE) return null;
  return best.id;
}

export function formatMeasure(measure: Measure, v: number | null, currency: string): string {
  if (v === null) return 'n/a';
  switch (measure.format) {
    case 'money': {
      const amount = (v / 100).toFixed(2);
      return currency === 'GBP' || currency === '' ? `£${amount}` : `${currency} ${amount}`;
    }
    case 'percent': return `${v.toFixed(v < 10 ? 2 : 1)}%`;
    case 'decimal': return v.toFixed(2);
    case 'count': return Math.round(v).toLocaleString('en-GB');
  }
}

/** The two ads being compared: the A and B slots when set, else the two biggest running spenders. */
export function pickPair<T extends { id: string; running: boolean; spendMinor: number }>(
  ads: T[],
  slotOf: (id: string) => 'A' | 'B' | null | undefined,
): { a: T | null; b: T | null; bySlot: boolean } {
  const a = ads.find((x) => slotOf(x.id) === 'A') ?? null;
  const b = ads.find((x) => slotOf(x.id) === 'B') ?? null;
  if (a || b) return { a, b, bySlot: true };
  const running = ads.filter((x) => x.running).sort((x, y) => y.spendMinor - x.spendMinor);
  const pool = running.length >= 2 ? running : [...ads].sort((x, y) => y.spendMinor - x.spendMinor);
  return { a: pool[0] ?? null, b: pool[1] ?? null, bySlot: false };
}

/* ── The verdict: has one ad beaten the other yet? ───────────────────────── */

export interface Verdict {
  /** A plain sentence or two. Never a p-value. */
  text: string;
  /** True when the sample is big enough to believe. */
  solid: boolean;
  /** The ad that is ahead, when there is one. */
  winnerId: string | null;
}

export const CPC_DIFFERENCE_THAT_COUNTS = 0.3;

export interface VerdictAd {
  id: string;
  name: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  /** Orders from our own records, or null when they are not known (the weekly email). */
  orders: number | null;
}

export function verdictAdFrom(ad: AdRow, name: string, orders: number | null): VerdictAd {
  return { id: ad.id, name, spendMinor: ad.spendMinor, impressions: ad.impressions, clicks: ad.clicks, orders };
}

function pounds(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === 'GBP' || currency === '' ? `£${amount}` : `${currency} ${amount}`;
}

function ordersPhrase(n: number): string {
  return n === 1 ? '1 order' : `${n} orders`;
}

// One honest sentence about who is winning. Reuses the sample bars from
// enoughToCompare and the 30% cost-per-click gap computeSignals already treats
// as real. Always says the opposite when it applies: "too early to say".
export function compareVerdict(a: VerdictAd | null, b: VerdictAd | null, currency: string): Verdict {
  if (!a || !b) {
    const one = a ?? b;
    return {
      text: one
        ? `Only ${one.name} is in the comparison. Mark a second ad as ${a ? 'B' : 'A'} on its card and the verdict appears here.`
        : 'No ads to compare yet. Mark two ads as A and B on their cards.',
      solid: false,
      winnerId: null,
    };
  }
  const enough = a.clicks >= MIN_CLICKS_TO_COMPARE && b.clicks >= MIN_CLICKS_TO_COMPARE
    && a.impressions >= MIN_VIEWS_TO_COMPARE && b.impressions >= MIN_VIEWS_TO_COMPARE;
  if (!enough) {
    return {
      text: `Too early to say. ${a.name} has ${a.clicks} clicks and ${b.name} has ${b.clicks}. `
        + `A fair verdict needs at least ${MIN_CLICKS_TO_COMPARE} clicks and ${MIN_VIEWS_TO_COMPARE} views each. Keep going.`,
      solid: false,
      winnerId: null,
    };
  }

  const cpcA = a.spendMinor / a.clicks;
  const cpcB = b.spendMinor / b.clicks;
  const [cheap, dear] = cpcA <= cpcB ? [a, b] : [b, a];
  const cheapCpc = Math.min(cpcA, cpcB);
  const dearCpc = Math.max(cpcA, cpcB);
  const gap = dearCpc > 0 ? (dearCpc - cheapCpc) / dearCpc : 0;

  let orders = '';
  if (a.orders !== null && b.orders !== null) {
    orders = a.orders === 0 && b.orders === 0
      ? ' Neither has brought an order yet, from our own records.'
      : ` From our own records, ${a.name} has brought ${ordersPhrase(a.orders)} and ${b.name} ${ordersPhrase(b.orders)}.`;
  }

  if (gap >= CPC_DIFFERENCE_THAT_COUNTS) {
    const howMuch = gap >= 0.5 ? 'less than half' : 'about a third less than';
    return {
      text: `${cheap.name} is getting clicks for ${howMuch} what ${dear.name} pays `
        + `(${pounds(Math.round(cheapCpc), currency)} against ${pounds(Math.round(dearCpc), currency)} a click), `
        + `over ${cheap.clicks} and ${dear.clicks} clicks, which is enough to be believable.${orders}`,
      solid: true,
      winnerId: cheap.id,
    };
  }
  return {
    text: `Neck and neck on cost per click (${pounds(Math.round(cpcA), currency)} against ${pounds(Math.round(cpcB), currency)}). `
      + `Neither has beaten the other yet, over ${a.clicks} and ${b.clicks} clicks. Keep going.${orders}`,
    solid: true,
    winnerId: null,
  };
}

/* ── Several ads at once ─────────────────────────────────────────────────── */

/** The ads being compared: the lettered ones in letter order, else the two biggest spenders. */
export function pickChosen<T extends { id: string; running: boolean; spendMinor: number }>(
  ads: T[],
  slotOf: (id: string) => string | null | undefined,
): { chosen: T[]; bySlot: boolean } {
  const lettered = ads
    .filter((x) => slotOf(x.id))
    .sort((x, y) => String(slotOf(x.id)).localeCompare(String(slotOf(y.id))));
  if (lettered.length) return { chosen: lettered, bySlot: true };
  const running = ads.filter((x) => x.running).sort((x, y) => y.spendMinor - x.spendMinor);
  const pool = running.length >= 2 ? running : [...ads].sort((x, y) => y.spendMinor - x.spendMinor);
  return { chosen: pool.slice(0, 2), bySlot: false };
}

function listNames(list: VerdictAd[]): string {
  const names = list.map((a) => a.name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// The verdict for any number of ads. Two ads keep the pairwise wording; more
// than two names the cheapest and the dearest click among those with enough
// sample, says who sits between, and who is still too early to judge.
export function compareChosen(ads: VerdictAd[], currency: string): Verdict {
  if (ads.length <= 2) return compareVerdict(ads[0] ?? null, ads[1] ?? null, currency);
  const enough = (a: VerdictAd) => a.clicks >= MIN_CLICKS_TO_COMPARE && a.impressions >= MIN_VIEWS_TO_COMPARE;
  const ready = ads.filter(enough);
  const early = ads.filter((a) => !enough(a));
  if (ready.length < 2) {
    return {
      text: `Too early to say. Only ${ready.length} of the ${ads.length} ads ${ready.length === 1 ? 'has' : 'have'} enough clicks yet `
        + `(${MIN_CLICKS_TO_COMPARE} clicks and ${MIN_VIEWS_TO_COMPARE} views each). Keep going.`,
      solid: false,
      winnerId: null,
    };
  }
  const byCpc = [...ready].sort((a, b) => a.spendMinor / a.clicks - b.spendMinor / b.clicks);
  const cheap = byCpc[0];
  const dear = byCpc[byCpc.length - 1];
  const cheapCpc = cheap.spendMinor / cheap.clicks;
  const dearCpc = dear.spendMinor / dear.clicks;
  const gap = dearCpc > 0 ? (dearCpc - cheapCpc) / dearCpc : 0;
  const between = byCpc.slice(1, -1);

  let text: string;
  if (gap >= CPC_DIFFERENCE_THAT_COUNTS) {
    const howMuch = gap >= 0.5 ? 'less than half the price' : 'about a third cheaper';
    text = `Of the ${ads.length} ads you are comparing, ${cheap.name} gets the cheapest clicks `
      + `(${pounds(Math.round(cheapCpc), currency)} against ${pounds(Math.round(dearCpc), currency)} for ${dear.name}, ${howMuch}), `
      + 'over enough clicks to believe.';
  } else {
    text = `Of the ${ads.length} ads you are comparing, none has beaten the rest yet: the cheapest click is ${cheap.name} at `
      + `${pounds(Math.round(cheapCpc), currency)} and the dearest ${dear.name} at ${pounds(Math.round(dearCpc), currency)}, too close to call. Keep going.`;
  }
  if (between.length) text += ` ${listNames(between)} ${between.length === 1 ? 'sits' : 'sit'} between them.`;
  if (early.length) text += ` ${listNames(early)} ${early.length === 1 ? 'does' : 'do'} not have enough clicks yet.`;
  if (ads.every((a) => a.orders !== null)) {
    text += ads.every((a) => a.orders === 0)
      ? ' None has brought an order yet, from our own records.'
      : ` Orders from our own records: ${ads.map((a) => `${a.name} ${a.orders}`).join(', ')}.`;
  }
  return { text, solid: true, winnerId: gap >= CPC_DIFFERENCE_THAT_COUNTS ? cheap.id : null };
}
