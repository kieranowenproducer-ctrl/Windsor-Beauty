import { neon } from '@neondatabase/serverless';

/**
 * Did the scheduled jobs actually run?
 *
 * Nothing watched this. Four jobs run every day (Royal Mail sync, the site sentinel, verification
 * reminders, concierge retention) and if any of them silently stopped, the website would carry on
 * looking perfectly healthy. The only symptom of a dead reminder cron is customers who never get
 * chased, which nobody would connect back to a cron for weeks.
 *
 * Each job now stamps a row when it finishes. System Health shows the last time each one checked
 * in and says so in red when one is overdue.
 */

export const SCHEDULED_JOBS = [
  { job: 'royal-mail-sync', label: 'Royal Mail tracking sync', schedule: 'Daily at 06:00' },
  { job: 'sentinel', label: 'Live site health check', schedule: 'Daily at 07:00' },
  { job: 'verification-reminders', label: 'Verification reminders', schedule: 'Daily at 09:00' },
  { job: 'concierge-retention', label: 'Concierge data retention', schedule: 'Daily at 03:30' },
] as const;

/**
 * Every job here is daily, so 36 hours allows a late run and a clock difference without crying
 * wolf, while still catching a job that has genuinely stopped.
 */
export const OVERDUE_AFTER_HOURS = 36;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return neon(url, { fetchOptions: { cache: 'no-store' } });
}

/** Never throws: a job must not fail because its heartbeat could not be written. */
export async function recordCronRun(job: string, result: string, error?: string | null): Promise<void> {
  try {
    const sql = db();
    if (!sql) return;
    await sql`
      INSERT INTO cron_runs (job, last_run_at, last_result, last_error)
      VALUES (${job}, now(), ${result}, ${error ?? null})
      ON CONFLICT (job) DO UPDATE
        SET last_run_at = now(), last_result = ${result}, last_error = ${error ?? null}
    `;
  } catch (err) {
    console.error(`[cronHeartbeat] could not record a run for "${job}":`, err);
  }
}

export interface CronRunStatus {
  job: string;
  label: string;
  schedule: string;
  lastRunAt: string | null;
  lastResult: string | null;
  lastError: string | null;
  overdue: boolean;
}

export async function listCronRunStatus(): Promise<CronRunStatus[]> {
  let rows: { job: string; last_run_at: string; last_result: string | null; last_error: string | null }[] = [];
  try {
    const sql = db();
    if (sql) {
      rows = (await sql`SELECT job, last_run_at, last_result, last_error FROM cron_runs`) as typeof rows;
    }
  } catch {
    // Table not created yet (the schema setup has not been run since deploying). Everything then
    // reads as "never run", which is honest rather than misleading.
  }

  const byJob = new Map(rows.map(r => [r.job, r]));
  const cutoff = Date.now() - OVERDUE_AFTER_HOURS * 60 * 60 * 1000;

  return SCHEDULED_JOBS.map(({ job, label, schedule }) => {
    const row = byJob.get(job);
    const lastRunAt = row?.last_run_at ?? null;
    return {
      job,
      label,
      schedule,
      lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
      lastResult: row?.last_result ?? null,
      lastError: row?.last_error ?? null,
      // Never having run is only "overdue" once the table exists, otherwise every fresh deploy
      // would light up red until the next morning. An absent row with no siblings means the
      // feature is simply new.
      overdue: lastRunAt ? new Date(lastRunAt).getTime() < cutoff : rows.length > 0,
    };
  });
}
