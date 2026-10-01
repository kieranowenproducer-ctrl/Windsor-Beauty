import { neon } from '@neondatabase/serverless';
import { reportAutomationFailure } from '@/lib/automationFailure';

/**
 * Have sign-ups stopped?
 *
 * If registration broke tomorrow, the website would look perfectly fine. Nothing would go red,
 * no email would fail, and the only symptom would be that new customers quietly stopped
 * appearing. That is the kind of fault that gets found weeks later by accident.
 *
 * Windsor Glow has been taking roughly one new account a day since it opened on 29 July. A full
 * week of complete silence is therefore a signal rather than a quiet patch, and is worth one
 * email. The check deliberately requires that there WERE sign-ups before, so a brand new site,
 * or one that has genuinely never had any, never nags.
 */

const SILENT_DAYS = 7;

export async function checkSignupsHaveNotStopped(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  try {
    const sql = neon(url, { fetchOptions: { cache: 'no-store' } });
    const [row] = (await sql`
      SELECT
        count(*) FILTER (WHERE created_at > now() - interval '7 days')::int  AS last_week,
        count(*) FILTER (WHERE created_at > now() - interval '28 days')::int AS last_month,
        max(created_at) AS most_recent
      FROM customers`) as { last_week: number; last_month: number; most_recent: string | null }[];

    if (!row) return;
    // Silent for a week, but demonstrably alive in the month before it. Both halves matter: the
    // second is what stops this firing on a site that simply has no customers yet.
    if (row.last_week === 0 && row.last_month > 0) {
      const since = row.most_recent
        ? new Date(row.most_recent).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'long' })
        : 'a while ago';
      await reportAutomationFailure(
        'signups_stopped',
        `No new customer accounts for ${SILENT_DAYS} days. The last one was ${since}, and there were ${row.last_month} in the month before that.`,
        {
          alertAdmin: true,
          whatToDo: 'Try creating an account yourself at windsorglow.com/account/register. If that works, sign-ups are fine and this is just a quiet week.',
        }
      );
    }
  } catch (err) {
    console.error('[signupWatch] check failed:', err);
  }
}
