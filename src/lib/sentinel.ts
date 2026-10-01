// Live-Site Sentinel — health checks across every live property, run by
// /api/cron/sentinel. Results are recorded in the taskengine DB (sentinel_events)
// and reported by email via Resend. Checks are read-only GETs; the sentinel can
// never mutate a live site.
import { tsql, tasksConfigured } from './tasks/db';
import { sendEmail } from './email/send';

export interface CheckResult {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

const TIMEOUT_MS = 15000;

async function fetchStatus(url: string): Promise<{ status: number; ok: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'WindsorGlow-Sentinel/1.0' },
    });
    return { status: res.status, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

async function expectStatus(key: string, label: string, url: string, expected: number[]): Promise<CheckResult> {
  try {
    const { status } = await fetchStatus(url);
    const ok = expected.includes(status);
    return { key, label, ok, detail: ok ? `HTTP ${status}` : `HTTP ${status}, expected ${expected.join('/')}` };
  } catch (e) {
    return { key, label, ok: false, detail: e instanceof Error && e.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : 'Request failed (network/DNS)' };
  }
}

async function failedTaskEmails(): Promise<CheckResult> {
  const key = 'wg-task-emails';
  const label = 'Windsor Glow task emails (last 24h)';
  if (!tasksConfigured()) return { key, label, ok: true, detail: 'Task DB not configured here, skipped' };
  try {
    const rows = (await tsql()`
      SELECT count(*)::int AS failed FROM task_notifications
      WHERE status = 'failed' AND created_at > now() - interval '24 hours'
    `) as { failed: number }[];
    const failed = rows[0]?.failed ?? 0;
    return { key, label, ok: failed === 0, detail: failed === 0 ? 'No failed sends' : `${failed} failed send(s)` };
  } catch (e) {
    return { key, label, ok: false, detail: `Query failed: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

export async function runAllChecks(): Promise<CheckResult[]> {
  return Promise.all([
    expectStatus('wg-home', 'windsorglow.com homepage', 'https://www.windsorglow.com/', [200]),
    expectStatus('wg-catalogue', 'windsorglow.com product catalogue API', 'https://www.windsorglow.com/api/products/catalogue', [200]),
    expectStatus('wg-tracking', 'Windsor Glow visitor tracking', 'https://www.windsorglow.com/api/tracking-health', [200]),
    expectStatus('kj-login', 'kjguitarportal.com login page', 'https://www.kjguitarportal.com/login', [200]),
    // 401 means the reminder cron route is deployed AND still guarded by its secret.
    expectStatus('kj-cron', 'kjguitarportal.com reminder cron (guarded)', 'https://www.kjguitarportal.com/api/cron/reminders', [401]),
    expectStatus('wb-home', 'windsorbeauty.co.uk homepage', 'https://www.windsorbeauty.co.uk/', [200]),
    expectStatus('acadel-home', 'acadel.co.uk homepage', 'https://www.acadel.co.uk/', [200]),
    failedTaskEmails(),
  ]);
}

// --- Event log (taskengine DB, shared ops database) ------------------------

async function ensureEventsTable(): Promise<void> {
  await tsql()`
    CREATE TABLE IF NOT EXISTS sentinel_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      check_key text NOT NULL,
      ok boolean NOT NULL,
      detail text NOT NULL DEFAULT '',
      alerted boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
}

export async function recordResults(results: CheckResult[], alertedKeys: Set<string>): Promise<void> {
  if (!tasksConfigured()) return;
  await ensureEventsTable();
  for (const r of results) {
    await tsql()`
      INSERT INTO sentinel_events (check_key, ok, detail, alerted)
      VALUES (${r.key}, ${r.ok}, ${r.detail}, ${alertedKeys.has(r.key)})`;
  }
}

/** Failure keys already alerted in the last 6 hours — suppressed in check mode so a
 *  long outage doesn't email every run. Digest mode always reports everything. */
export async function recentlyAlertedKeys(): Promise<Set<string>> {
  if (!tasksConfigured()) return new Set();
  try {
    await ensureEventsTable();
    const rows = (await tsql()`
      SELECT DISTINCT check_key FROM sentinel_events
      WHERE alerted = true AND ok = false AND created_at > now() - interval '6 hours'
    `) as { check_key: string }[];
    return new Set(rows.map((r) => r.check_key));
  } catch {
    return new Set();
  }
}

// --- Email ------------------------------------------------------------------

export async function sendSentinelEmail(results: CheckResult[], mode: 'digest' | 'alert'): Promise<'sent' | 'skipped' | 'failed'> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SENTINEL_ALERT_EMAIL || 'kieranowenproducer@gmail.com';
  if (!apiKey) return 'skipped';

  const failures = results.filter((r) => !r.ok);
  const subject = failures.length > 0
    ? `URGENT: ${failures.length} check(s) failing across your live sites`
    : 'All live sites healthy — daily sentinel report';

  const row = (r: CheckResult) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:13px;color:#1c1917">${r.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:13px;font-weight:600;color:${r.ok ? '#047857' : '#b91c1c'}">${r.ok ? 'OK' : 'FAIL'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-size:12px;color:#78716c">${r.detail}</td>
    </tr>`;

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#b45309;margin:0 0 6px">Live-Site Sentinel</p>
    <h2 style="font-size:18px;color:#1c1917;margin:0 0 14px">${failures.length > 0 ? 'Something needs attention' : 'Everything is healthy'}</h2>
    <table style="border-collapse:collapse;width:100%;border:1px solid #e7e5e4;border-radius:12px">
      ${results.map(row).join('')}
    </table>
    <p style="font-size:11px;color:#a8a29e;margin-top:20px">
      ${mode === 'digest' ? 'Daily digest.' : 'Failure alert (repeat alerts for the same check are muted for 6 hours).'}
      Checked ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' })} UK time.
    </p>
  </div>`;

  try {
    const { error } = await sendEmail({
      from: 'Windsor Glow Sentinel <alerts@windsorglow.com>',
      to,
      subject,
      html,
    }, { internal: true }); /* Internal post, so no research-use line. */
    return error ? 'failed' : 'sent';
  } catch {
    return 'failed';
  }
}
