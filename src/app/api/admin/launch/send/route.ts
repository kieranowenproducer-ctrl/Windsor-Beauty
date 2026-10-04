import { NextResponse } from 'next/server';
import {
  createDiscountSignup,
  findCustomerByEmail,
  findDiscountSignupByEmail,
  isDbConfigured,
  listLaunchSubscribers,
  recordMarketingCampaign,
  setLaunchSubscriberDiscountCode,
} from '@/lib/db';
import { generateSignupDiscountCode } from '@/lib/discountCodes';
import { LAUNCH_EMAIL_SUBJECT, sendLaunchEmail } from '@/lib/launchEmail';
import { resolveMarketingSender } from '@/lib/email/marketingSender';
import { bulkSend } from '@/lib/bulkSend';

// Resolves the discount code to send a given subscriber: their already-
// persisted code if they have one, otherwise lazily issues one now (covers
// historical signups from before discount issuance existed, or before the
// email-verification requirement existed — both are grandfathered verified
// by ensureSchema's backfill, see db.ts). A subscriber with NO code yet who
// signed up after that cutoff is genuinely unverified — they get their code
// the moment they click their verification link (see
// /api/account/verify-email), not from this lazy path, so it's skipped here
// rather than handing out a code to an unconfirmed email address.
async function resolveSubscriberDiscountCode(email: string, existingCode: string | null): Promise<string | null> {
  if (existingCode) return existingCode;

  const customer = await findCustomerByEmail(email).catch(() => null);
  if (customer && !customer.email_verified) return null;

  let discountCode: string | null = null;
  const existingSignup = await findDiscountSignupByEmail(email).catch(() => null);
  if (existingSignup) {
    if (existingSignup.status === 'active') discountCode = existingSignup.code;
  } else {
    for (let attempt = 0; attempt < 5 && !discountCode; attempt += 1) {
      const created = await createDiscountSignup({
        email,
        code: generateSignupDiscountCode(),
        marketingConsent: false,
      }).catch(() => null);
      if (created) discountCode = created.code;
    }
  }
  if (discountCode) {
    await setLaunchSubscriberDiscountCode(email, discountCode).catch(() => {});
  }
  return discountCode;
}

export const dynamic = 'force-dynamic';
// The send budget below is 240 seconds; this keeps the platform from killing the function
// before bulkSend can return. A send that dies unrecorded is how a list gets emailed twice.
export const maxDuration = 300;

// Deliberately repeatable — every press sends to the current full list of
// launch_subscribers again. There is no "already sent" flag on the table,
// since Kieran will press this once to test with his own email, then again
// later once real signups have come in. Each press is logged as its own row
// in marketing_campaigns (the existing send-history table) so repeats are
// still visible and auditable, exactly like a normal marketing campaign.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  // Test mode: { testTo: "you@example.com" } sends ONE copy of the real
  // launch email to that address with a [TEST] subject prefix and a sample
  // code — no subscribers are touched, nothing is logged as a campaign.
  // This is the safe dry run before pressing the real button.
  const body = await request.json().catch(() => null);
  // From address for this send, chosen on the dashboard (task 286b1863).
  // Missing or unrecognised = the unmonitored no-reply default.
  const sender = resolveMarketingSender(body?.sender);
  const testTo = typeof body?.testTo === 'string' ? body.testTo.trim() : '';
  if (testTo) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
      return NextResponse.json({ error: 'Enter a valid email address for the test send.' }, { status: 400 });
    }
    const sent = await sendLaunchEmail(testTo, 'WGLOW10-SAMPLE', { subjectPrefix: '[TEST] ', sender: sender.key }).catch(() => false);
    return sent
      ? NextResponse.json({ success: true, test: true, to: testTo, sender: sender.key, sentFrom: sender.address })
      : NextResponse.json({ error: 'Test send failed - check RESEND_API_KEY_BEAUTY_IS.' }, { status: 502 });
  }

  const subscribers = await listLaunchSubscribers();
  if (!subscribers.length) {
    return NextResponse.json({ error: 'There are no launch subscribers to send to yet.' }, { status: 400 });
  }

  // Paced and retried, same as the announcement send. See src/lib/bulkSend.ts.
  const codeByEmail = new Map(subscribers.map(s => [s.email, s.discount_code]));
  const result = await bulkSend(
    subscribers.map(s => s.email),
    async to => {
      const discountCode = await resolveSubscriberDiscountCode(to, codeByEmail.get(to) ?? null).catch(() => codeByEmail.get(to) ?? null);
      return sendLaunchEmail(to, discountCode, { sender: sender.key });
    },
    { budgetMs: 240_000, label: 'The launch email' }
  );
  const successCount = result.sent.length;
  const failureCount = result.failed.length;

  const campaign = await recordMarketingCampaign({
    subject: LAUNCH_EMAIL_SUBJECT,
    bodyHtml: '<p>Launch announcement email. See src/lib/launchEmail.ts for the template.</p>',
    recipientCount: successCount + failureCount,
    successCount,
    failureCount,
  }).catch(() => null);

  return NextResponse.json({
    success: true,
    recipientCount: successCount + failureCount,
    successCount,
    failureCount,
    stoppedEarly: result.stoppedEarly,
    campaignId: campaign?.id ?? null,
    sender: sender.key,
    sentFrom: sender.address,
  });
}
