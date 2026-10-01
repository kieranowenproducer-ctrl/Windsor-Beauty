import { NextResponse } from 'next/server';
import {
  findCustomerById,
  findEmailVerificationTokenAny,
  findValidEmailVerificationToken,
  isDbConfigured,
  logAutomationFailure,
  markCustomerEmailVerified,
  markEmailVerificationTokenUsed,
} from '@/lib/db';
import { ensureMemberDiscountCode } from '@/lib/memberDiscountCode';
import { sendMembershipWelcomeEmail } from '@/lib/membershipWelcomeEmail';
import { affiliatesEnabled, getAffiliateCustomerCode } from '@/lib/affiliates';

export const dynamic = 'force-dynamic';

// POST /api/account/verify-email
// Body: { token: string }
//
// Confirms email ownership and is the ONLY place the 10% signup discount
// code is ever issued — see ensureSchema's email_verified backfill comment
// and verifyEmailEmail.ts for the rest of the flow. Idempotent: re-clicking
// an already-used link (or a link for an already-verified account) returns
// success without re-issuing a second code.
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Verification is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'This verification link is invalid. Please request a new one.' }, { status: 400 });
  }

  try {
    const tokenRow = await findValidEmailVerificationToken(token);
    if (!tokenRow) {
      // Re-clicked link? A USED token whose customer is already verified is
      // a success, not an error — email scanners prefetch these links and
      // customers re-open the email; neither should ever see "invalid or
      // expired" after a verification that actually worked (found in the
      // 2026-07-07 end-to-end audit).
      const usedRow = await findEmailVerificationTokenAny(token);
      if (usedRow?.used_at) {
        const owner = await findCustomerById(usedRow.customer_id);
        if (owner?.email_verified) {
          return NextResponse.json({ success: true, alreadyVerified: true });
        }
      }
      return NextResponse.json(
        { error: 'This verification link is invalid or has expired. Please request a new one from your account.' },
        { status: 400 }
      );
    }

    const customer = await findCustomerById(tokenRow.customer_id);
    if (!customer) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    await markEmailVerificationTokenUsed(token);

    const alreadyVerified = customer.email_verified;
    if (!alreadyVerified) {
      await markCustomerEmailVerified(customer.id);
    }

    // Issue (or reuse) the 10% code now that the email is confirmed real.
    // Reuse-or-create semantics match the pre-verification flow this
    // replaces: discount_signups.email is UNIQUE, so an email that already
    // has a row (e.g. redeemed via a different path) is never double-issued.
    // Extracted to src/lib/memberDiscountCode.ts so the admin resend issues codes the same way.
    // Behaviour here is unchanged: reuse if there is one, create at most one if there is not.
    const discountCode = await ensureMemberDiscountCode(customer);
    const rafDiscount = affiliatesEnabled() ? await getAffiliateCustomerCode(customer.id).catch(() => null) : null;

    // Only email the code on the actual first verification — re-visiting an
    // old link (or a second tab) must not re-send it.
    if (!alreadyVerified && discountCode) {
      await sendMembershipWelcomeEmail({
        to: customer.email,
        customerName: customer.first_name || customer.email.split('@')[0],
        discountCode,
        rafCode: rafDiscount ? String(rafDiscount.code) : undefined,
      }).catch(err =>
        logAutomationFailure('customer_email', 'Membership welcome email failed to send after verification', { detail: err, orderNumber: null })
      );
    }

    return NextResponse.json({ success: true, alreadyVerified });
  } catch {
    return NextResponse.json({ error: 'Something went wrong while verifying your email. Please try again shortly.' }, { status: 500 });
  }
}
