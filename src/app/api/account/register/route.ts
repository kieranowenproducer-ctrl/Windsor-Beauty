import { verifyPassword } from '@/lib/auth';
import { normalisePhoneNumber, PHONE_ERROR } from '@/lib/phoneNumber';
import { after, NextResponse } from 'next/server';
import { COMPLIANCE_CONFIRMATIONS_ERROR } from '@/lib/complianceConfirmations';
import {
  completePendingCustomer,
  createCustomer,
  createCustomerSession,
  createEmailVerificationToken,
  findCustomerByEmail,
  getQrCampaignBySlug,
  isDbConfigured,
  logSignupAttempt,
  upsertMarketingContact,
} from '@/lib/db';
import { recordMemberLogin } from '@/lib/db/memberLogins';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';
import { glowCardDemoDesign } from '@/lib/glowCardDemo';
import { attachVisitToCustomer } from '@/lib/db/siteVisits';
import {
  CUSTOMER_SESSION_COOKIE,
  CUSTOMER_SESSION_DURATION_MS,
  EMAIL_VERIFICATION_TOKEN_DURATION_MS,
  generateSessionToken,
  hashPassword,
} from '@/lib/auth';
import { deliverVerificationEmail } from '@/lib/verificationDelivery';
import { reportAutomationFailure } from '@/lib/automationFailure';
import {
  cleanSocialProfile, isReferralSource, referralAllowsSocialProfile, referralChannel, referralNeedsDetail,
} from '@/lib/referralSources';
import {
  findReferrerByCode, normaliseReferralCode, recordMemberReferral, referralsEnabled,
} from '@/lib/memberReferrals';
import { glowCardLoyaltyEnabled } from '@/lib/glowCardLoyalty';
import { affiliatesEnabled, createAffiliateReferralFromInvitation, findAffiliateInvitation } from '@/lib/affiliates';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { error: 'Account creation is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }

  const ip = getClientIp(request);
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (glowCardDemoDesign(email)) return NextResponse.json({ error: 'This email address is reserved.' }, { status: 400 });
  const password = typeof body?.password === 'string' ? body.password : '';
  const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : '';
  const phone = normalisePhoneNumber(body?.phone, body?.addressCountry) || '';
  const referredBy = typeof body?.referredBy === 'string' ? body.referredBy.trim() : '';
  const socialProfile = cleanSocialProfile(body?.socialProfile);
  const instagramProfile = cleanSocialProfile(body?.instagramProfile);
  const facebookProfile = cleanSocialProfile(body?.facebookProfile);
  const suppliedReferralCode = typeof body?.referralCode === 'string' ? body.referralCode.trim() : '';
  const suppliedAffiliateInvite = typeof body?.affiliateInvite === 'string' ? body.affiliateInvite.trim() : '';
  const addressLine1 = typeof body?.addressLine1 === 'string' ? body.addressLine1.trim() : '';
  const addressLine2 = typeof body?.addressLine2 === 'string' ? body.addressLine2.trim() : '';
  const addressCity = typeof body?.addressCity === 'string' ? body.addressCity.trim() : '';
  const addressPostcode = typeof body?.addressPostcode === 'string' ? body.addressPostcode.trim() : '';
  const addressCountry = typeof body?.addressCountry === 'string' && body.addressCountry.trim() ? body.addressCountry.trim() : 'GB';
  const marketingConsent = body?.marketingConsent === true;
  // Mandatory sign-up confirmations (task 3933725e). Re-checked here, not just
  // in the form: a disabled button is a courtesy, this is the actual gate.
  const termsAccepted = body?.termsAccepted === true;
  const visitId = typeof body?.visit_id === 'string' ? body.visit_id.trim().slice(0, 100) : null;

  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'Please enter your first and last name.' }, { status: 400 });
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (!phone) {
    return NextResponse.json({ error: PHONE_ERROR }, { status: 400 });
  }
  if (!addressLine1 || !addressCity || !addressPostcode) {
    return NextResponse.json({ error: 'Please enter your full address, including postcode.' }, { status: 400 });
  }
  /* WHERE THEY HEARD ABOUT US (task 38962e15). The form now offers a list rather than a typing
   * box, and this is where that is actually enforced: a disabled option is a courtesy, the route
   * is the gate, exactly as the confirmations above are re-checked here.
   *
   * It accepts the channel on its own, or the channel followed by a detail, which is what the
   * follow-up box produces. Anything else is refused, because one hand-typed "insta" is all it
   * takes to start the counting problem this change exists to fix. */
  if (!isReferralSource(referralChannel(referredBy) ?? '')) {
    return NextResponse.json(
      { error: 'Please tell us where you heard about Windsor Beauty.' },
      { status: 400 }
    );
  }
  if (referralNeedsDetail(referredBy.split(':')[0].trim()) && !referredBy.includes(':')) {
    return NextResponse.json(
      { error: 'Please add a little more detail about where you heard about us.' },
      { status: 400 }
    );
  }
  if (typeof body?.socialProfile === 'string' && body.socialProfile.trim() && !socialProfile) {
    return NextResponse.json({ error: 'Please enter a shorter social profile name.' }, { status: 400 });
  }
  if (typeof body?.instagramProfile === 'string' && body.instagramProfile.trim() && !instagramProfile) {
    return NextResponse.json({ error: 'Please enter a shorter Instagram profile name.' }, { status: 400 });
  }
  if (typeof body?.facebookProfile === 'string' && body.facebookProfile.trim() && !facebookProfile) {
    return NextResponse.json({ error: 'Please enter a shorter Facebook profile name.' }, { status: 400 });
  }
  if (socialProfile && !referralAllowsSocialProfile(referralChannel(referredBy) ?? '')) {
    return NextResponse.json({ error: 'A social profile can only be added for Instagram or Facebook.' }, { status: 400 });
  }
  let memberReferrerId: number | null = null;
  let validAffiliateInvite = false;
  if (suppliedReferralCode && suppliedAffiliateInvite) {
    return NextResponse.json({ error: 'Use one invitation at a time. Raf invitations cannot be combined with member referral links.' }, { status: 400 });
  }
  if (suppliedReferralCode) {
    if (!referralsEnabled() && !glowCardLoyaltyEnabled()) {
      return NextResponse.json({ error: 'Member referrals are not available yet.' }, { status: 400 });
    }
    const referralCode = normaliseReferralCode(suppliedReferralCode);
    memberReferrerId = referralCode ? await findReferrerByCode(referralCode).catch(() => null) : null;
    if (!memberReferrerId) {
      return NextResponse.json({ error: 'That member referral code is not valid. Please check it and try again.' }, { status: 400 });
    }
  }
  if (referralChannel(referredBy) === 'RAF affiliate') {
    if (!affiliatesEnabled()) return NextResponse.json({ error: 'Raf affiliate registration is not open yet.' }, { status: 400 });
    const invitation = await findAffiliateInvitation(suppliedAffiliateInvite, email).catch(() => null);
    validAffiliateInvite = Boolean(invitation);
    if (!validAffiliateInvite) {
      return NextResponse.json({ error: 'This private Raf invitation is invalid, expired or for a different email address. Ask Raf for a new link.' }, { status: 400 });
    }
  } else if (suppliedAffiliateInvite) {
    return NextResponse.json({ error: 'Use Raf’s invitation link to join as his referral.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Your password must be at least 8 characters long.' }, { status: 400 });
  }
  if (!termsAccepted) {
    return NextResponse.json(
      { error: COMPLIANCE_CONFIRMATIONS_ERROR },
      { status: 400 }
    );
  }

  // Read QR campaign attribution from the wb_ref cookie (set when a customer
  // scans a QR code). This mirrors the same lookup pattern used in place-order.
  // Attribution is first-touch at account creation and is never overwritten.
  let qrCampaignId: number | null = null;
  let qrCampaignSlug: string | null = null;
  let qrCampaignName: string | null = null;
  let qrCampaignType: string | null = null;
  let qrPartnerName: string | null = null;

  try {
    const refSlug = request.headers.get('cookie')
      ?.split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('wb_ref='))
      ?.slice('wb_ref='.length) ?? null;

    if (refSlug) {
      const campaign = await getQrCampaignBySlug(refSlug);
      if (campaign && campaign.status === 'active') {
        qrCampaignId = campaign.id;
        qrCampaignSlug = campaign.slug;
        qrCampaignName = campaign.name;
        qrCampaignType = campaign.campaign_type;
        qrPartnerName = campaign.partner_name;
      }
    }
  } catch {
    // Attribution failure must never block registration
  }

  try {
    const existing = await findCustomerByEmail(email);
    if (existing?.account_status === 'pending_password' && (!existing.password_hash || !verifyPassword(password, existing.password_hash))) {
      return NextResponse.json({ error: 'Please use Forgot password to confirm your email and set a password before completing registration.', redirect: '/account/forgot-password' }, { status: 403 });
    }
    if (existing && existing.account_status !== 'pending_password') {
      return NextResponse.json(
        { error: 'This email is already registered. Please log in, or use "Forgot password" if you need to reset it.' },
        { status: 409 }
      );
    }

    // Logged once per attempt that gets this far (i.e. passed validation and
    // isn't an obvious duplicate-email rejection) — counts toward the
    // per-IP signup rate limit regardless of whether account creation
    // itself succeeds below.
    await logSignupAttempt(ip).catch(() => {});

    // A lock-page lead (account_status='pending_password') already has a real
    // customers row — completing full registration with the same email
    // activates that row in place instead of inserting a duplicate.
    const customer = existing
      ? await completePendingCustomer(existing.id, {
          passwordHash: hashPassword(password),
          firstName,
          lastName,
          phone,
          marketingConsent,
          referredBy,
          socialProfile,
          instagramProfile,
          facebookProfile,
          addressLine1,
          addressLine2: addressLine2 || null,
          addressCity,
          addressPostcode,
          addressCountry,
        })
      : await createCustomer({
          email,
          passwordHash: hashPassword(password),
          firstName,
          lastName,
          phone,
          marketingConsent,
          referredBy,
          socialProfile,
          instagramProfile,
          facebookProfile,
          addressLine1,
          addressLine2: addressLine2 || null,
          addressCity,
          addressPostcode,
          addressCountry,
          qrCampaignId,
          qrCampaignSlug,
          qrCampaignName,
          qrCampaignType,
          qrPartnerName,
        });

    if (!customer) {
      return NextResponse.json({ error: 'We could not create your account. Please try again shortly.' }, { status: 500 });
    }

    let referralWarning = false;
    if (memberReferrerId) {
      const attributed = await recordMemberReferral(memberReferrerId, customer.id).catch(() => false);
      referralWarning = !attributed;
    }
    if (validAffiliateInvite) {
      const attributed = await createAffiliateReferralFromInvitation(suppliedAffiliateInvite, email, customer.id).catch(() => null);
      referralWarning = referralWarning || !attributed;
      if (!attributed) {
        await reportAutomationFailure('affiliate_referral', 'A private Raf invitation was not linked to a new account.', {
          subject: email,
          alertAdmin: true,
          whatToDo: 'Open the new member and Affiliate control, then repair the referral before this customer orders.',
        });
      }
    }

    const journeyAttached = await attachVisitToCustomer({ visitId, customerId: customer.id, request });
    if (visitId && !journeyAttached) {
      await reportAutomationFailure('visitor_tracking', 'A new member journey could not be attached to their account.', {
        alertAdmin: true,
        subject: email,
        whatToDo: 'Open Visitor Demand and check the tracking health warning.',
      });
    }

    if (marketingConsent) {
      await upsertMarketingContact({
        email,
        firstName,
        lastName,
        phone,
        customerId: customer.id,
        source: 'registration',
      }).catch(() => {});
    }

    // The 10% membership discount is never issued here — only once the
    // customer verifies their email (see /api/account/verify-email). This
    // closes the "sign up with a fake email to farm a code" path: a code is
    // worthless until someone proves they actually control the inbox.
    // Skipped entirely for an already-verified account completing a pending
    // lock-page lead (account_status was already grandfathered verified by
    // ensureSchema's backfill, or they verified earlier in this same flow).
    let verificationEmailSent = false;
    if (!customer.email_verified) {
      const verifyToken = generateSessionToken();
      const verifyExpiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_DURATION_MS);
      await createEmailVerificationToken({ customerId: customer.id, token: verifyToken, expiresAt: verifyExpiresAt });

      const origin = new URL(request.url).origin;
      const verifyUrl = `${origin}/account/verify-email?token=${verifyToken}`;
      // Retries once, and records + alerts if it still will not send, so a
      // customer never again silently ends up without their code.
      verificationEmailSent = await deliverVerificationEmail({
        to: email,
        customerName: firstName,
        verifyUrl,
        source: 'registration',
      });
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_DURATION_MS);
    await createCustomerSession({ customerId: customer.id, token, expiresAt });
    // Security review runs only after the account and its connection log exist. It is deliberately
    // detached from the response: a failed review must never delay or refuse a registration.
    after(async () => {
      await recordMemberLogin({
        customerId: customer.id,
        name: `${firstName} ${lastName}`,
        email,
        method: 'register',
        request,
      });
      await createSecurityReviewCase({ customerId: customer.id, sourceEvent: 'registration', ipAddress: ip });
    });

    const response = NextResponse.json({
      success: true,
      redirect: '/account',
      emailVerified: customer.email_verified,
      verificationEmailSent,
      referralWarning,
    });
    response.cookies.set(CUSTOMER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });
    return response;
  } catch (err) {
    /* Registration breaking is close to the worst thing that can happen quietly: the site looks
     * completely normal and the only symptom is that new customers stop appearing, which nobody
     * notices for weeks. Alerted, not just logged. */
    await reportAutomationFailure('registration', `Somebody could not create an account (${email}).`, {
      subject: email,
      detail: err,
      alertAdmin: true,
      whatToDo: 'Try creating an account yourself at windsorbeauty.is/account/register. If it fails, sign-ups are down for everyone.',
    });
    return NextResponse.json({ error: 'Something went wrong while creating your account. Please try again shortly.' }, { status: 500 });
  }
}
