import { NextResponse } from 'next/server';
import { sendEmail as sendViaResend } from '@/lib/email/send';
import { recordCronRun } from '@/lib/cronHeartbeat';
import {
  fetchDeliveryIssues, fetchSnapshot, isMetaAdsConfigured, londonToday, shiftDays,
  type DailyRow,
} from '@/lib/ads/meta';
import {
  campaignTill, getCreativeLinks, readHistory, readSliceHistory, recentAlertKeys, recordAlerts,
  upsertDailyMetrics, upsertDailySlices, latestAdvice,
  type SnapshotMetricRow,
} from '@/lib/ads/store';
import { adDisplayName, type CreativeLink } from '@/lib/ads/labels';
import { compareChosen, pickChosen, type Verdict } from '@/lib/ads/compare';
import { computeSignals, writeAdvice, type Signal } from '@/lib/ads/adviser';

// The daily advertising job (3 Sept 2026, the "make it automated" build).
// One run, three duties:
//   1. SNAPSHOT - copy the last three days of Meta figures into our own
//      tables (three days, because Meta keeps settling recent numbers).
//   2. WATCHDOG - look for things worth an email today: a dead connection,
//      a rejected ad, a spend spike. Repeats are muted for three days.
//   3. REPORT - on Mondays (London time), send the plain-English weekly
//      email: what ran, what it cost, what changed, what to try next.
//
// Scheduled by vercel.json at 06:30 UTC. Protected by CRON_SECRET, the same
// bearer pattern as /api/cron/sentinel. Everything here is read-only against
// Meta; the only writes are to our own database and one email.
//
// ?mode=report forces the weekly report to send now (for testing and for
// "send me the report today"); ?mode=snapshot runs only the snapshot.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const REPORT_TO = () =>
  process.env.ADS_REPORT_EMAIL || process.env.SENTINEL_ALERT_EMAIL || 'kieranowenproducer@gmail.com';

function londonWeekday(): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long' }).format(new Date());
}

function money(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === 'GBP' || currency === '' ? `£${amount}` : `${currency} ${amount}`;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mode = new URL(request.url).searchParams.get('mode') ?? 'daily';

  if (!isMetaAdsConfigured()) {
    await recordCronRun('ads', 'skipped: Meta not configured');
    return NextResponse.json({ ok: true, skipped: 'Meta connection not configured' });
  }

  const summary: Record<string, unknown> = { mode };

  // 1. SNAPSHOT, with the connection check built in: if Meta cannot be read
  // at all, that IS the alert.
  let snapshotError: string | null = null;
  try {
    const today = londonToday();
    const window = { since: shiftDays(today, -2), until: today };
    const snap = await fetchSnapshot(window);

    const rows: SnapshotMetricRow[] = [];
    for (const d of snap.accountDaily) {
      rows.push({ date: d.date, level: 'account', entityId: snap.account.id, entityName: snap.account.name, ...pick(d) });
    }
    for (const c of snap.campaignDaily) {
      const info = snap.campaignInfo.get(c.id);
      rows.push({
        date: c.date, level: 'campaign', entityId: c.id, entityName: c.name,
        status: info?.status, objective: info?.objective, ...pick(c.row),
      });
    }
    for (const a of snap.adDaily) {
      rows.push({ date: a.date, level: 'ad', entityId: a.id, entityName: a.name, status: a.campaignName, ...pick(a.row) });
    }
    summary.metricRows = await upsertDailyMetrics(rows);
    summary.sliceRows = await upsertDailySlices(snap.sliceDaily.map((s) => ({
      date: s.date, dimension: s.dimension, label: s.label,
      spendMinor: s.spendMinor, impressions: s.impressions, clicks: s.clicks,
    })));
    summary.account = snap.account.name;
    if (!snap.account.active) snapshotError = 'account_inactive';
  } catch (e) {
    snapshotError = e instanceof Error ? e.message : 'Meta could not be read';
  }

  if (mode === 'snapshot') {
    await recordCronRun('ads', snapshotError ? `snapshot failed: ${snapshotError}` : 'snapshot ok');
    return NextResponse.json({ ok: !snapshotError, ...summary, error: snapshotError });
  }

  // 2. WATCHDOG.
  const alerts: { key: string; message: string }[] = [];
  if (snapshotError === 'account_inactive') {
    alerts.push({ key: 'account-inactive', message: 'The Windsor Glow ad account is not active. Ads cannot run until this is resolved in Meta Ads Manager.' });
  } else if (snapshotError) {
    // snapshotError already carries a plain-English cause and its fix (see
    // explainGraphError in lib/ads/meta.ts), so do not guess at one here.
    alerts.push({ key: 'connection-down', message: `The Meta connection failed today. ${snapshotError} Until it is fixed, the Ad Results page and this report cannot see the account.` });
  }

  try {
    for (const issue of await fetchDeliveryIssues()) {
      alerts.push({
        key: `ad-issue-${issue.adId}-${issue.effectiveStatus}`,
        message: issue.effectiveStatus === 'DISAPPROVED'
          ? `Meta has REJECTED the ad "${issue.adName}". It is not running. Open Ads Manager to read Meta's reason.`
          : `Meta has flagged the ad "${issue.adName}" with an issue. Open Ads Manager to see what it wants.`,
      });
    }
  } catch {
    // The connection alert above already covers a dead token.
  }

  const history = await readHistory('account', 30);
  if (history.length >= 8) {
    const yesterday = history[history.length - 1];
    const prior = history.slice(-8, -1);
    const avg = prior.reduce((t, r) => t + r.spend_minor, 0) / prior.length;
    if (yesterday.spend_minor > 10_00 && avg > 0 && yesterday.spend_minor > avg * 2) {
      alerts.push({
        key: `spend-spike-${yesterday.metric_date}`,
        message: `Yesterday's ad spend was ${money(yesterday.spend_minor, 'GBP')}, more than double the recent daily average of ${money(Math.round(avg), 'GBP')}. Worth a look in Ads Manager if that was not deliberate.`,
      });
    }
  }

  const muted = await recentAlertKeys(3);
  const newAlerts = alerts.filter((a) => !muted.has(a.key));
  summary.alerts = alerts.length;
  summary.sent = newAlerts.length;

  if (newAlerts.length > 0) {
    await recordAlerts(newAlerts);
    await sendEmail(
      `Your ads need attention: ${newAlerts.length === 1 ? '1 thing' : `${newAlerts.length} things`}`,
      `<p style="font-size:13px;color:#1c1917">The daily advertising check found:</p><ul>`
      + newAlerts.map((a) => `<li style="font-size:13px;color:#1c1917;margin-bottom:8px">${a.message}</li>`).join('')
      + `</ul><p style="font-size:11px;color:#a8a29e">Repeats of the same alert are muted for three days. Full figures: windsorglow.com/admin/ads</p>`,
    );
  }

  // 3. THE MONDAY REPORT (or on demand with ?mode=report).
  if (mode === 'report' || londonWeekday() === 'Monday') {
    const report = await buildWeeklyReport();
    await sendEmail(report.subject, report.html);
    summary.report = 'sent';
  }

  await recordCronRun('ads', snapshotError ? `ran with error: ${snapshotError}` : 'ok', snapshotError);
  return NextResponse.json({ ok: true, ...summary, error: snapshotError });
}

function pick(d: DailyRow) {
  return {
    spendMinor: d.spendMinor, impressions: d.impressions, reach: d.reach, clicks: d.clicks,
    videoViews: d.videoViews, purchases: d.purchases, purchaseValueMinor: d.purchaseValueMinor,
  };
}

async function buildWeeklyReport(): Promise<{ subject: string; html: string }> {
  const currency = 'GBP';
  const history = await readHistory('account', 14);
  const week = history.slice(-7);
  const prior = history.slice(0, Math.max(0, history.length - 7));

  const tally = (rows: typeof history) => ({
    spend: rows.reduce((t, r) => t + r.spend_minor, 0),
    impressions: rows.reduce((t, r) => t + r.impressions, 0),
    clicks: rows.reduce((t, r) => t + r.clicks, 0),
    purchases: rows.reduce((t, r) => t + r.purchases, 0),
  });
  const w = tally(week);
  const p = tally(prior);

  const adHistory = await readHistory('ad', 7);
  // Ads are named the way the person named them on the page (A or B, the
  // experiment note, the film), falling back to Meta's automatic name.
  const links = await getCreativeLinks().catch((): Record<string, CreativeLink> => ({}));
  const perAd = new Map<string, { id: string; name: string; spend: number; clicks: number; impressions: number }>();
  for (const r of adHistory) {
    const cur = perAd.get(r.entity_id) ?? { id: r.entity_id, name: adDisplayName(links[r.entity_id], r.entity_name ?? 'Untitled ad'), spend: 0, clicks: 0, impressions: 0 };
    cur.spend += r.spend_minor;
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    perAd.set(r.entity_id, cur);
  }
  const ads = Array.from(perAd.values()).filter((a) => a.spend > 0);
  const byCpc = ads.filter((a) => a.clicks >= 5).sort((a, b) => a.spend / a.clicks - b.spend / b.clicks);

  // Ad against ad, the same ads and the same words as the page: the ticked
  // (lettered) ads when any, otherwise the week's two biggest spenders. Orders
  // per ad are not in the stored history, so that part is left out.
  let verdict: Verdict | null = null;
  if (ads.length >= 2) {
    const { chosen } = pickChosen(ads.map((x) => ({ ...x, running: true, spendMinor: x.spend })), (id) => links[id]?.slot);
    verdict = compareChosen(chosen.map((x) => ({ id: x.id, name: x.name, spendMinor: x.spend, impressions: x.impressions, clicks: x.clicks, orders: null })), currency);
  }

  // The adviser's contribution: signals from the stored history, then the
  // one automatic AI write of the week.
  const dailyRows: DailyRow[] = history.map((r) => ({
    date: r.metric_date, spendMinor: r.spend_minor, impressions: r.impressions, reach: r.reach,
    clicks: r.clicks, videoViews: r.video_views, purchases: r.purchases, purchaseValueMinor: r.purchase_value_minor,
  }));
  let signals: Signal[] = [];
  let adviceText: string | null = null;
  try {
    signals = computeSignals({
      daily: dailyRows,
      slices: await readSliceHistory(28),
      campaigns: [],
      till: await campaignTill(28),
      deliveryIssues: [],
      currency,
      verdict,
    });
    if (w.impressions > 0) {
      adviceText = (await writeAdvice(signals, 'the last 7 days')).advice;
    }
    if (!adviceText) adviceText = (await latestAdvice())?.advice ?? null;
  } catch {
    // A report with no advice section is still a report.
  }

  const line = (label: string, now: number, before: number, fmt: (n: number) => string) => {
    const change = before > 0 ? Math.round(((now - before) / before) * 100) : null;
    const arrow = change === null || Math.abs(change) < 5 ? '' : change > 0 ? ` (up ${change}%)` : ` (down ${Math.abs(change)}%)`;
    return `<tr><td style="padding:6px 12px;font-size:13px;color:#78716c">${label}</td>`
      + `<td style="padding:6px 12px;font-size:13px;font-weight:600;color:#1c1917">${fmt(now)}${arrow}</td></tr>`;
  };

  const quiet = w.impressions === 0;
  const subject = quiet
    ? 'Your weekly ads report: nothing ran last week'
    : `Your weekly ads report: ${money(w.spend, currency)} spent, ${w.clicks.toLocaleString('en-GB')} clicks`;

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b45309;margin:0 0 6px">Windsor Glow Ads</p>
    <h2 style="font-size:18px;color:#1c1917;margin:0 0 14px">${quiet ? 'Nothing ran last week' : 'The week in numbers'}</h2>
    ${quiet
      ? '<p style="font-size:13px;color:#1c1917">No ads ran from the Windsor Glow ad account in the last 7 days, so there is nothing to report. When a campaign runs, this email fills in on its own.</p>'
      : `<table style="border-collapse:collapse;width:100%;border:1px solid #e7e5e4">
          ${line('Money spent', w.spend, p.spend, (n) => money(n, currency))}
          ${line('Times shown', w.impressions, p.impressions, (n) => n.toLocaleString('en-GB'))}
          ${line('Clicks', w.clicks, p.clicks, (n) => n.toLocaleString('en-GB'))}
          ${line('Purchases', w.purchases, p.purchases, (n) => n.toLocaleString('en-GB'))}
        </table>
        ${byCpc.length > 0
          ? `<p style="font-size:13px;color:#1c1917;margin-top:14px">Best value ad: <strong>${byCpc[0].name}</strong>`
            + ` (${money(Math.round(byCpc[0].spend / byCpc[0].clicks), currency)} a click).`
            + (byCpc.length > 1 ? ` Dearest: <strong>${byCpc[byCpc.length - 1].name}</strong> (${money(Math.round(byCpc[byCpc.length - 1].spend / byCpc[byCpc.length - 1].clicks), currency)} a click).` : '')
            + '</p>'
          : ''}
        ${verdict
          ? `<p style="font-size:13px;color:#1c1917;margin-top:10px"><strong>Ad against ad:</strong> ${verdict.text}${verdict.solid ? '' : ' <span style="color:#a8a29e">(early days)</span>'}</p>`
          : ''}`}
    ${signals.length > 0
      ? `<h3 style="font-size:14px;color:#1c1917;margin:18px 0 6px">What the numbers say</h3><ul style="margin:0;padding-left:18px">`
        + signals.map((s) => `<li style="font-size:13px;color:#1c1917;margin-bottom:6px">${s.text}${s.solid ? '' : ' <span style="color:#a8a29e">(early days)</span>'}</li>`).join('')
        + '</ul>'
      : ''}
    ${adviceText
      ? `<h3 style="font-size:14px;color:#1c1917;margin:18px 0 6px">Worth trying next</h3><p style="font-size:13px;color:#1c1917;white-space:pre-line">${adviceText}</p>`
      : ''}
    <p style="font-size:11px;color:#a8a29e;margin-top:20px">
      Automatic weekly report, sent every Monday. The live figures are always at windsorglow.com/admin/ads.
    </p>
  </div>`;

  return { subject, html };
}

async function sendEmail(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await sendViaResend({
      from: 'Windsor Glow Ads <alerts@windsorglow.com>',
      to: REPORT_TO(),
      subject,
      html,
    }, { internal: true }); /* The ad-spend report, to us. Internal post, so no research-use line. */
  } catch (e) {
    console.error('[cron/ads] email failed:', e);
  }
}
