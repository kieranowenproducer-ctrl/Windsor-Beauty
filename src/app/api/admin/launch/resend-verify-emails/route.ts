import { NextResponse } from 'next/server';
import {
  createEmailVerificationToken,
  findCustomerByEmail,
  isDbConfigured,
  listLaunchSubscribersWithStatus,
} from '@/lib/db';
import { EMAIL_VERIFICATION_TOKEN_DURATION_MS, generateSessionToken } from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';
import { bulkSend } from '@/lib/bulkSend';

export const dynamic = 'force-dynamic';
// Long enough for a paced run over every subscriber, with bulkSend's own budget below set to
// stop first, so the platform never kills this mid-list.
export const maxDuration = 60;

// POST /api/admin/launch/resend-verify-emails
//
// Sends a fresh "Confirm your email" link to every coming-soon subscriber who
// does not yet have a discount code assigned — i.e. they never clicked the
// original verification link. Clicking the new link will mark their email
// verified and automatically generate + send their WGLOW10-XXXXXX code, via
// the existing /api/account/verify-email route.
//
// Skips subscribers whose customer account is already email-verified (they
// need a different fix) and subscribers with no customer account at all.
// Safe to call more than once — a new token is created each time, and any
// previous unused tokens remain valid until their 24-hour expiry.
export async function POST(_request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';

  // Target UNVERIFIED accounts, not "no code": codes are now generated and
  // stored at sign-up (and by the backfill button), so a missing code no
  // longer identifies who hasn't clicked their verification link.
  const subscribers = await listLaunchSubscribersWithStatus();
  const pending = subscribers.filter(s => s.has_account && !s.email_verified);

  let alreadyVerified = 0;
  let noAccount = 0;

  // Two passes on purpose. The database work (resolving accounts, minting tokens) is quick and
  // safe to do back to back; only the SENDS need pacing and retrying, so only the sends go
  // through bulkSend. Minting the token first also means a retried send re-uses the same link
  // rather than minting a second one per attempt.
  const deliveries = new Map<string, { name: string; verifyUrl: string }>();
  for (const sub of pending) {
    const customer = await findCustomerByEmail(sub.email).catch(() => null);
    if (!customer) {
      noAccount += 1;
      continue;
    }
    if (customer.email_verified) {
      alreadyVerified += 1;
      continue;
    }
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
    await createEmailVerificationToken({ customerId: customer.id, token, expiresAt });
    deliveries.set(customer.email, {
      name: customer.first_name || customer.email.split('@')[0],
      verifyUrl: `${siteUrl}/account/verify-email?token=${token}`,
    });
  }

  // Paced and retried, like every bulk send in this app. Before 2026-08-03 this was a bare
  // loop: fast enough to be throttled partway down the list, with each throttled address
  // reported as if it were a bad address. alertAdmin stays off per customer — one email per
  // failure would bury the person who pressed the button — and bulkSend files one summary
  // under its own category, because the per-customer records have already filled the
  // 'verification_email' mute window and a summary filed there would silence itself.
  const result = await bulkSend(
    Array.from(deliveries.keys()),
    (to) => {
      const d = deliveries.get(to)!;
      return deliverVerificationEmail({
        to,
        customerName: d.name,
        verifyUrl: d.verifyUrl,
        source: 'admin_resend',
        alertAdmin: false,
      });
    },
    {
      budgetMs: 45_000,
      category: 'verification_email_bulk',
      label: 'The verification email resend',
      whatToDo: 'Open System Health to see which addresses failed, then resend those individually from each customer page.',
    }
  );

  return NextResponse.json({
    sent: result.sent.length,
    alreadyVerified,
    noAccount,
    failed: result.failed.length,
    total: pending.length,
  });
}
