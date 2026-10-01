import { NextResponse } from 'next/server';
import { recordCronRun } from '@/lib/cronHeartbeat';
import {
  createEmailVerificationToken,
  isDbConfigured,
  listCustomersNeedingVerificationReminder,
  markVerificationReminderSent,
} from '@/lib/db';
import {
  EMAIL_VERIFICATION_TOKEN_DURATION_MS,
  EMAIL_VERIFICATION_TOKEN_HOURS,
  generateSessionToken,
} from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';
import { bulkSend } from '@/lib/bulkSend';

export const dynamic = 'force-dynamic';
// Room for 25 paced sends; bulkSend's own budget below stops first, so the platform never
// kills this mid-run.
export const maxDuration = 60;

// GET /api/cron/verification-reminders — daily (vercel.json).
//
// The single automatic follow-up for accounts that registered but never
// verified: a fresh verification link (full window again) with "this is
// your reminder" copy. Abuse/duplication safety, in order of defence:
//   1. verification_reminder_sent_at — set after a successful send; a
//      customer can only ever receive ONE automatic reminder, checked in
//      SQL before anything is sent.
//   2. Age window — only accounts older than the initial verification
//      window (they had their full first chance) and younger than 14 days
//      (so enabling this feature never mass-emails an old backlog).
//   3. Batch cap — at most 25 sends per daily run.
//
// Protected by CRON_SECRET, same pattern as /api/cron/sentinel: Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` on scheduled invocations.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const candidates = await listCustomersNeedingVerificationReminder({
    minAgeHours: EMAIL_VERIFICATION_TOKEN_HOURS,
    maxAgeDays: 14,
    limit: 25,
  });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

  // Tokens are minted up front so a retried send re-uses the same link, and only the sends go
  // through bulkSend. Before 2026-08-03 this was a bare loop with no pacing and no retry: fast
  // enough to be throttled partway down, and one blip cost that customer their reminder for a
  // day for no reason.
  const deliveries = new Map<string, { customerId: number; name: string; verifyUrl: string }>();
  for (const customer of candidates) {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
    await createEmailVerificationToken({ customerId: customer.id, token, expiresAt });
    deliveries.set(customer.email, {
      customerId: customer.id,
      name: customer.first_name || customer.email.split('@')[0],
      verifyUrl: `${origin}/account/verify-email?token=${token}`,
    });
  }

  const result = await bulkSend(
    Array.from(deliveries.keys()),
    async (to) => {
      const d = deliveries.get(to)!;
      const sent = await deliverVerificationEmail({
        to,
        customerName: d.name,
        verifyUrl: d.verifyUrl,
        variant: 'reminder',
        source: 'daily_reminder',
      });
      // Only mark on success — a transient failure leaves the customer eligible for
      // tomorrow's run instead of silently losing their one reminder. The mark is guarded
      // separately: if the EMAIL went out, a database blip must not make bulkSend retry the
      // send, because that is exactly the double-email this helper exists to prevent.
      if (sent) {
        await markVerificationReminderSent(d.customerId).catch((err) =>
          console.error('[cron/verification-reminders] sent but could not mark', to, err));
      }
      return sent;
    },
    {
      budgetMs: 45_000,
      category: 'verification_email_bulk',
      label: 'The daily verification reminders',
      whatToDo: 'Nothing to press: anyone missed is still eligible and tomorrow\'s run tries '
        + 'again. If this keeps appearing day after day, the sending domain is the thing to check.',
    }
  );

  await recordCronRun('verification-reminders', `checked ${candidates.length}, sent ${result.sent.length}`);
  return NextResponse.json({
    checked: candidates.length,
    sent: result.sent.length,
    results: [
      ...result.sent.map((email) => ({ email, sent: true })),
      ...result.failed.map((email) => ({ email, sent: false })),
    ],
  });
}
