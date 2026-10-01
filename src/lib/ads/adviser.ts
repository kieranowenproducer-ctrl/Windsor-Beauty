import Anthropic from '@anthropic-ai/sdk';
import type { CampaignRow, DailyRow, DeliveryIssue } from './meta';
import type { CampaignTillRow, SliceHistoryRow } from './store';
import { adviceSpentTodayMinor, saveAdvice } from './store';
import type { Verdict } from './compare';

// The adviser: reads the advertising history and says what the numbers mean
// and what to try next, in plain English.
//
// Two layers, deliberately. computeSignals() is arithmetic - every line it
// produces is simply true of the data, with sample-size honesty built in (a
// difference measured on a handful of clicks is labelled early, not sold as a
// lesson). writeAdvice() then asks Claude to turn those signals into advice,
// and is bound by two hard rules in its instructions: it must respect the
// Meta advertising compliance rulebook (docs/META_ADVERTISING_COMPLIANCE.md),
// and it must never invent a number that is not in the signals.
//
// AI spend here is pennies, and is still capped and written down: each call
// records its cost on the advice row (ad_advice.cost_minor), the page shows
// it, and ADS_AI_DAILY_CAP_PENCE (default 50, £0.50 a day) is a runaway stop.
// The shared ai_costs module is byte-compared with the Social Engine's copy,
// so this file keeps its books in its own table rather than editing it.

export interface Signal {
  kind: 'fact' | 'warning' | 'note';
  text: string;
  /** false = the sample is small; shown as "early days" on screen. */
  solid: boolean;
}

interface SignalInput {
  daily: DailyRow[];                 // account level, most recent last
  slices: SliceHistoryRow[];         // summed over the same window
  campaigns: CampaignRow[];
  till: CampaignTillRow[];
  deliveryIssues: DeliveryIssue[];
  currency: string;
  /** Ad against ad, from compareVerdict(); the same sentence the page shows. */
  verdict?: Verdict | null;
}

function money(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === 'GBP' || currency === '' ? `£${amount}` : `${currency} ${amount}`;
}

function sum<T>(rows: T[], f: (r: T) => number): number {
  return rows.reduce((t, r) => t + f(r), 0);
}

export function computeSignals(input: SignalInput): Signal[] {
  const { daily, slices, campaigns, till, deliveryIssues, currency } = input;
  const signals: Signal[] = [];

  const spend = sum(daily, (r) => r.spendMinor);
  const impressions = sum(daily, (r) => r.impressions);
  const clicks = sum(daily, (r) => r.clicks);

  for (const issue of deliveryIssues) {
    signals.push({
      kind: 'warning', solid: true,
      text: issue.effectiveStatus === 'DISAPPROVED'
        ? `Meta has rejected the ad "${issue.adName}". It is not running. Open it in Ads Manager to see Meta's reason and appeal or replace it.`
        : `Meta has flagged the ad "${issue.adName}" with an issue. Open it in Ads Manager to see what it wants.`,
    });
  }

  // Ad against ad: the experiment's own verdict, worded once in compare.ts so
  // the page, this list, the adviser and the Monday email all say the same.
  if (input.verdict) {
    signals.push({
      kind: input.verdict.winnerId ? 'fact' : 'note',
      solid: input.verdict.solid,
      text: `Ad against ad: ${input.verdict.text}`,
    });
  }

  // Our own till speaks even when the connected ad account is silent: a
  // tagged link from anywhere (another ad account, a QR poster, an email)
  // still lands in the visit log, and 40 real visitors are worth a line.
  const tillSignals = tillToSignals(till, campaigns, currency);

  if (impressions === 0) {
    signals.push({
      kind: 'note', solid: true,
      text: campaigns.length === 0
        ? 'No ads have run from this ad account yet, so there is nothing to learn from. The first campaign is what starts the learning.'
        : 'Nothing ran in this period, so there are no new lessons in the numbers.',
    });
    signals.push(...tillSignals);
    return signals;
  }

  // Spend pace and the learning-threshold honesty line.
  const days = daily.length;
  const weeklySpend = days > 0 ? (spend / days) * 7 : 0;
  signals.push({
    kind: 'fact', solid: true,
    text: `Spend is running at about ${money(Math.round(weeklySpend), currency)} a week`
      + ` (${money(spend, currency)} over the last ${days} days, ${clicks.toLocaleString('en-GB')} clicks).`,
  });
  if (weeklySpend > 0 && weeklySpend < 100_00) {
    signals.push({
      kind: 'note', solid: true,
      text: 'At this spend level Meta cannot finish its own learning (it wants roughly 50 results per ad set per week). Treat any difference below as a hint to test again, not a verdict.',
    });
  }

  // Cost per click, this week against the week before.
  if (days >= 14) {
    const week = daily.slice(-7);
    const prior = daily.slice(-14, -7);
    const wClicks = sum(week, (r) => r.clicks);
    const pClicks = sum(prior, (r) => r.clicks);
    if (wClicks >= 20 && pClicks >= 20) {
      const wCpc = sum(week, (r) => r.spendMinor) / wClicks;
      const pCpc = sum(prior, (r) => r.spendMinor) / pClicks;
      if (pCpc > 0 && Math.abs(wCpc - pCpc) / pCpc >= 0.3) {
        const dearer = wCpc > pCpc;
        signals.push({
          kind: dearer ? 'warning' : 'fact', solid: true,
          text: `A click cost ${money(Math.round(wCpc), currency)} this week against ${money(Math.round(pCpc), currency)} the week before, `
            + (dearer ? 'a real rise. Rising click costs usually mean the audience is tiring of the ad.' : 'a real improvement.'),
        });
      }
    }
  }

  // Ad fatigue, roughly: how often the same person saw an ad this week.
  const week = daily.slice(-7);
  const weekImpressions = sum(week, (r) => r.impressions);
  const weekBestReach = Math.max(0, ...week.map((r) => r.reach));
  if (weekBestReach >= 200 && weekImpressions / weekBestReach > 5) {
    signals.push({
      kind: 'warning', solid: false,
      text: 'The same people are seeing the ads over and over (rough estimate from this week\'s figures). Results usually fade when that happens; fresh creative or a wider audience fixes it.',
    });
  }

  // Placements: compare cost per click where both sides have a real sample.
  const placements = slices.filter((s) => s.dimension === 'placement' && s.impressions >= 500 && s.clicks >= 10);
  if (placements.length >= 2) {
    const withCpc = placements
      .map((p) => ({ label: p.label, cpc: p.spend_minor / p.clicks }))
      .sort((a, b) => a.cpc - b.cpc);
    const best = withCpc[0];
    const worst = withCpc[withCpc.length - 1];
    if (worst.cpc > best.cpc * 1.5) {
      signals.push({
        kind: 'fact', solid: true,
        text: `Clicks from ${best.label} cost ${money(Math.round(best.cpc), currency)} against ${money(Math.round(worst.cpc), currency)} from ${worst.label}.`,
      });
    }
  } else if (slices.some((s) => s.dimension === 'placement')) {
    signals.push({
      kind: 'note', solid: false,
      text: 'Too few clicks so far to fairly compare where the ads ran. That comparison unlocks itself as spend accumulates.',
    });
  }

  // Who is actually clicking.
  const demos = slices.filter((s) => s.dimension === 'agegender' && s.impressions >= 300);
  if (demos.length >= 2 && clicks >= 30) {
    const byRate = demos
      .map((d) => ({ label: d.label, rate: d.clicks / d.impressions, clicks: d.clicks }))
      .filter((d) => d.clicks >= 5)
      .sort((a, b) => b.rate - a.rate);
    if (byRate.length > 0) {
      signals.push({
        kind: 'fact', solid: clicks >= 100,
        text: `The people most likely to click were ${byRate[0].label} (${(byRate[0].rate * 100).toFixed(1)} clicks per 100 views).`,
      });
    }
  }

  // Our own till: what the tagged links actually brought.
  signals.push(...tillSignals);

  return signals;
}

function tillToSignals(till: CampaignTillRow[], campaigns: CampaignRow[], currency: string): Signal[] {
  const out: Signal[] = [];
  for (const t of till.slice(0, 5)) {
    const name = campaigns.find((c) => c.id === t.utm_campaign)?.name
      ?? (/^\d{10,}$/.test(t.utm_campaign)
        ? `an ad campaign outside this ad account (tag ${t.utm_campaign})`
        : `the link tag "${t.utm_campaign}"`);
    const Name = name.charAt(0).toUpperCase() + name.slice(1);
    if (t.orders > 0) {
      out.push({
        kind: 'fact', solid: true,
        text: `Our own records credit ${name} with ${t.orders === 1 ? '1 order' : `${t.orders} orders`} worth ${money(t.revenue_minor, currency)} (${t.visits} tagged visits). An address is a household, not a person, so read this as a fair guide.`,
      });
    } else if (t.visits >= 30) {
      out.push({
        kind: 'fact', solid: true,
        text: `${Name} brought ${t.visits} visits from ${t.people} different addresses, and no orders yet.`,
      });
    }
  }
  return out;
}

/* ── The written advice ──────────────────────────────────────────────────── */

export const ADS_AI_MODEL = 'claude-opus-5';

export function adsAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function adsAiDailyCapMinor(): number {
  const raw = Number(process.env.ADS_AI_DAILY_CAP_PENCE);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 50;
}

// Rough token pricing for the cost written on the advice row: Claude Opus 5 at
// $5 in / $25 out per million tokens, taken to pence at a deliberately
// unfavourable $1 = 85p so the books err high, never low.
function costMinorFor(inputTokens: number, outputTokens: number): number {
  const usd = (inputTokens * 5 + outputTokens * 25) / 1_000_000;
  return Math.max(1, Math.ceil(usd * 85));
}

const ADVISER_SYSTEM = `You are the advertising adviser inside the Windsor Glow admin panel, writing for a non-technical shop owner in the UK.

You are given a list of SIGNALS: statements computed from the shop's own Meta advertising data. Some are marked early (small sample). Your job is to turn them into short, plain-English advice on what to do next time.

Hard rules, none negotiable:
1. Use ONLY the numbers in the signals. Never invent, estimate or extrapolate a figure.
2. A signal marked early is a hint. Say so. Never present it as a conclusion.
3. Compliance is stricter than Meta's review, because UK medicines law applies. Windsor Glow sells research peptides, so any advice you give must fit these rules: ads may never name a product, a compound, or a drug class (not even "GLP-1"); never describe an effect on a person, weight loss, muscle gain, or a health outcome; never suggest testimonials, reviews, or before/after material; never point an ad at a product page. Lawful angles are: brand awareness, the company's quality/testing story, curiosity, and pointing at a blog article or brand page. If a signal tempts a non-compliant tactic, do not suggest it and do not explain what it would have been.
4. Plain English. Short sentences. No jargon, no em dashes. Address the reader as "you".
5. Be honest when there is little to learn. "Run it another week before changing anything" is good advice.

Answer with 3 to 6 short bullet points, each one action or one observation, nothing else. No heading, no preamble.`;

export interface AdviceResult {
  advice: string | null;
  reason?: string;
  costMinor?: number;
}

export async function writeAdvice(signals: Signal[], periodLabel: string): Promise<AdviceResult> {
  if (!adsAiConfigured()) {
    return { advice: null, reason: 'The AI key is not set on this site, so written advice is unavailable. The signals above are computed without AI and unaffected.' };
  }
  const spent = await adviceSpentTodayMinor();
  const cap = adsAiDailyCapMinor();
  if (spent >= cap) {
    return { advice: null, reason: `The adviser has reached its daily spending stop (${cap}p). It resets tomorrow.` };
  }
  if (signals.length === 0) {
    return { advice: null, reason: 'There are no signals to advise on yet.' };
  }

  const user = `Period: ${periodLabel}\n\nSignals:\n` + signals
    .map((s) => `- [${s.kind}${s.solid ? '' : ', early'}] ${s.text}`)
    .join('\n');

  const client = new Anthropic();
  const response = await client.messages.create({
    model: ADS_AI_MODEL,
    max_tokens: 1_000,
    output_config: { effort: 'medium' },
    system: ADVISER_SYSTEM,
    messages: [{ role: 'user', content: user }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') {
    return { advice: null, reason: 'The AI declined to write advice for this data.' };
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!text) return { advice: null, reason: 'The AI returned nothing usable.' };

  const costMinor = costMinorFor(response.usage.input_tokens, response.usage.output_tokens);
  // Advice that was written and paid for is returned even if the bookkeeping
  // insert fails (e.g. a read-only local database). The cap under-counts in
  // that rare case, which is why it is a runaway stop and not an account.
  try {
    await saveAdvice({ signals, advice: text, model: ADS_AI_MODEL, costMinor });
  } catch (e) {
    console.error('[ads adviser] advice written but not recorded:', e);
  }
  return { advice: text, costMinor };
}
