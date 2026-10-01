import { NextResponse } from 'next/server';
import { isDbConfigured, listLaunchSubscribersWithStatus } from '@/lib/db';
import { ensureStoredSignupCode } from '@/lib/launchCodes';

export const dynamic = 'force-dynamic';

// POST /api/admin/launch/generate-codes
//
// Backfill: gives every coming-soon subscriber who is still missing a 10%
// code a generated, STORED code (customers.discount_code +
// launch_subscribers.discount_code + a discount_signups row). Nothing is
// emailed to anyone — this only makes the list launch-ready so the launch
// email and the verification welcome email can both use the stored code.
// Idempotent: subscribers who already have a code are skipped, and
// discount_signups' UNIQUE email constraint means a code can never be
// double-issued to the same address.
export async function POST() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const subscribers = await listLaunchSubscribersWithStatus();
  const missing = subscribers.filter(s => !s.discount_code);

  let generated = 0;
  let alreadyRedeemed = 0;
  let failed = 0;

  for (const sub of missing) {
    try {
      const code = await ensureStoredSignupCode(sub.email);
      if (code) generated += 1;
      else alreadyRedeemed += 1; // had a used/redeemed signup row — nothing to store
    } catch {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: missing.length,
    generated,
    alreadyRedeemed,
    failed,
    alreadyHadCodes: subscribers.length - missing.length,
  });
}
