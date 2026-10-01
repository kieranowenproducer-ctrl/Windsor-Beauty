import { after, NextResponse } from 'next/server';
import { COMPLIANCE_CONFIRMATIONS_ERROR } from '@/lib/complianceConfirmations';
import {
  completePendingCustomer,
  createCustomer,
  createEmailVerificationToken,
  createLaunchSubscriber,
  findCustomerByEmail,
  findLaunchSubscriberByEmail,
  isDbConfigured,
  logSignupAttempt,
  upsertMarketingContact,
} from '@/lib/db';
import { hashPassword, EMAIL_VERIFICATION_TOKEN_DURATION_MS, generateSessionToken } from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';
import { ensureStoredSignupCode } from '@/lib/launchCodes';
import { glowCardDemoDesign } from '@/lib/glowCardDemo';
import { attachVisitToCustomer } from '@/lib/db/siteVisits';
import { reportAutomationFailure } from '@/lib/automationFailure';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';
import { recordIpActivity } from '@/lib/db/ipActivity';
import {
  cleanSocialProfile, isReferralSource, referralAllowsSocialProfile, referralChannel, referralNeedsDetail,
} from '@/lib/referralSources';

export const dynamic = 'force-dynamic';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{6,19}$/;

const ALREADY_MEMBER_MESSAGE =
  'This email is already registered. Please sign in to your account, or use "Forgot password" on the login page if you need to reset it.';
const CREATED_MESSAGE =
  'Your Windsor Beauty member account has been created. Check your email to verify your address - once verified, your unique 10% discount code will be sent to you and you will be able to log in straight away.';

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { status: 'error', message: 'Sign-up is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);

  const email      = typeof body?.email      === 'string' ? body.email.trim().toLowerCase() : '';
  if (glowCardDemoDesign(email)) return NextResponse.json({ status: 'error', message: 'This email address is reserved.' }, { status: 400 });
  const firstName  = typeof body?.firstName  === 'string' ? body.firstName.trim()           : '';
  const lastName   = typeof body?.lastName   === 'string' ? body.lastName.trim()            : '';
  const phone      = typeof body?.phone      === 'string' ? body.phone.trim()               : '';
  const referredBy = typeof body?.referredBy === 'string' ? body.referredBy.trim()          : '';
  const socialProfile = cleanSocialProfile(body?.socialProfile);
  const password   = typeof body?.password   === 'string' ? body.password                   : '';
  const addressLine1   = typeof body?.addressLine1   === 'string' ? body.addressLine1.trim()   : '';
  const addressLine2   = typeof body?.addressLine2   === 'string' ? body.addressLine2.trim()   : '';
  const addressCity    = typeof body?.addressCity    === 'string' ? body.addressCity.trim()    : '';
  const addressPostcode= typeof body?.addressPostcode=== 'string' ? body.addressPostcode.trim(): '';
  const addressCountry = typeof body?.addressCountry === 'string' ? body.addressCountry.trim() : 'GB';
  const marketingConsent = body?.marketingConsent === true;
  // Mandatory sign-up confirmations (task 3933725e). This route creates a full
  // member account, so it enforces the same gate as /api/account/register.
  const termsAccepted = body?.termsAccepted === true;
  const visitId = typeof body?.visit_id === 'string' ? body.visit_id.trim().slice(0, 100) : null;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { status: 'error', message: 'Please enter a valid email address.' },
      { status: 400 }
    );
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { status: 'error', message: 'Please enter your first and last name.' },
      { status: 400 }
    );
  }
  if (!PHONE_PATTERN.test(phone)) {
    return NextResponse.json(
      { status: 'error', message: 'Please enter a valid mobile number.' },
      { status: 400 }
    );
  }
  if (!addressLine1 || !addressCity || !addressPostcode) {
    return NextResponse.json(
      { status: 'error', message: 'Please enter your full address, including postcode.' },
      { status: 400 }
    );
  }
  /* THE SAME GATE AS /api/account/register (task 38962e15). This route creates a full member
   * account from the coming-soon page using the SAME form component, so a rule enforced in one
   * and not the other is a hole that opens the moment the pre-launch wall comes down again. */
  if (!isReferralSource(referralChannel(referredBy) ?? '')) {
    return NextResponse.json(
      { status: 'error', message: 'Please tell us where you heard about Windsor Beauty.' },
      { status: 400 }
    );
  }
  if (referralNeedsDetail(referredBy.split(':')[0].trim()) && !referredBy.includes(':')) {
    return NextResponse.json(
      { status: 'error', message: 'Please add a little more detail about where you heard about us.' },
      { status: 400 }
    );
  }
  if (typeof body?.socialProfile === 'string' && body.socialProfile.trim() && !socialProfile) {
    return NextResponse.json({ status: 'error', message: 'Please enter a shorter social profile name.' }, { status: 400 });
  }
  if (socialProfile && !referralAllowsSocialProfile(referralChannel(referredBy) ?? '')) {
    return NextResponse.json({ status: 'error', message: 'A social profile can only be added for Instagram or Facebook.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { status: 'error', message: 'Your password must be at least 8 characters long.' },
      { status: 400 }
    );
  }
  if (!termsAccepted) {
    return NextResponse.json(
      { status: 'error', message: COMPLIANCE_CONFIRMATIONS_ERROR },
      { status: 400 }
    );
  }

  try {
    // Pre-launch sign-ups create a full active member account immediately,
    // plus a launch_subscribers row so they receive the launch email when
    // Kieran sends it from the admin panel. The account has a real password
    // and all fields — identical to registering through /account/register.
    // The 10% discount code is NOT issued here — only once the customer
    // verifies their email (see /api/account/verify-email). For an
    // already-verified existing account (grandfathered by ensureSchema's
    // backfill, or verified earlier), this no-ops harmlessly below.
    let customerId: number | null = null;
    let customerEmailVerified = false;
    let accountAlreadyActive = false;
    const existingCustomer = await findCustomerByEmail(email);

    if (existingCustomer) {
      if (existingCustomer.account_status === 'pending_password') {
        // Legacy passwordless lead from before passwords were collected —
        // activate in place with the full set of fields now supplied.
        const activated = await completePendingCustomer(existingCustomer.id, {
          passwordHash: hashPassword(password),
          firstName,
          lastName,
          phone,
          referredBy,
          socialProfile,
          marketingConsent,
          addressLine1,
          addressLine2: addressLine2 || null,
          addressCity,
          addressPostcode,
          addressCountry,
        });
        customerId = activated?.id ?? existingCustomer.id;
        customerEmailVerified = activated?.email_verified ?? existingCustomer.email_verified;
      } else {
        accountAlreadyActive = true;
        customerId = existingCustomer.id;
      }
    } else {
      await logSignupAttempt(ip).catch(() => {});
      const newCustomer = await createCustomer({
        email,
        passwordHash: hashPassword(password),
        firstName,
        lastName,
        phone,
        marketingConsent,
        referredBy,
        socialProfile,
        addressLine1,
        addressLine2: addressLine2 || null,
        addressCity,
        addressPostcode,
        addressCountry,
        accountStatus: 'active',
      });
      customerId = newCustomer?.id ?? null;
      customerEmailVerified = newCustomer?.email_verified ?? false;
    }

    // launch_subscribers is the list the admin "Send Launch Email" button
    // reads from — maintained independently of customer account state.
    const existingSubscriber = await findLaunchSubscriberByEmail(email);
    if (!existingSubscriber) {
      await createLaunchSubscriber(email);
    }

    // Generate and STORE the 10% code right away so the admin panel shows
    // every sign-up as launch-ready. It is not emailed here — the welcome
    // email with the code still only goes out when they verify their email
    // (/api/account/verify-email finds this stored code and reuses it).
    if (!accountAlreadyActive) {
      await ensureStoredSignupCode(email, { marketingConsent, customerId }).catch(() => {});
    }

    if (!accountAlreadyActive && customerId && !customerEmailVerified) {
      const verifyToken = generateSessionToken();
      const verifyExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
      await createEmailVerificationToken({ customerId, token: verifyToken, expiresAt: verifyExpiresAt });

      const origin = new URL(request.url).origin;
      const verifyUrl = `${origin}/account/verify-email?token=${verifyToken}`;
      await deliverVerificationEmail({
        to: email,
        customerName: firstName,
        verifyUrl,
        source: 'coming_soon_signup',
      });
    }

    if (!accountAlreadyActive && customerId) {
      const journeyAttached = await attachVisitToCustomer({ visitId, customerId, request });
      if (visitId && !journeyAttached) {
        await reportAutomationFailure('visitor_tracking', 'A launch sign-up journey could not be attached to their account.', {
          alertAdmin: true,
          subject: email,
          whatToDo: 'Open Visitor Demand and check the tracking health warning.',
        });
      }
      // Advisory only. A shared network or matching detail is reviewed after the
      // account exists and cannot change this route's successful response.
      after(async () => {
        await recordIpActivity({
          event: 'register', request, customerId, name: `${firstName} ${lastName}`, email,
          detail: 'Member account created from the launch signup route',
        });
        await createSecurityReviewCase({ customerId, sourceEvent: 'registration', ipAddress: ip });
      });
    }

    if (marketingConsent) {
      // The name they gave goes on the contact too (task 99476dc9). It was in
      // hand here and simply not passed, which is why every pre-launch signup
      // showed on the Email Marketing page as a bare address with no name.
      await upsertMarketingContact({
        email, firstName, lastName, phone, customerId, source: 'pre_launch_signup',
      }).catch(() => {});
    }

    if (accountAlreadyActive) {
      return NextResponse.json({ status: 'existing', message: ALREADY_MEMBER_MESSAGE });
    }

    return NextResponse.json({ status: 'created', message: CREATED_MESSAGE });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Something went wrong. Please try again shortly.' },
      { status: 500 }
    );
  }
}
