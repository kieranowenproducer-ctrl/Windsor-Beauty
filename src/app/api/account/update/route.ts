import { after, NextResponse } from 'next/server';
import { setMarketingConsentByEmail, updateCustomerProfile, upsertMarketingContact } from '@/lib/db';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';
import { cleanSocialProfile } from '@/lib/referralSources';

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const phone = typeof body?.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;
  const marketingConsent = body?.marketingConsent === true;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body ?? {}, key);
  const instagramProfile = has('instagramProfile') ? cleanSocialProfile(body.instagramProfile) : customer.instagram_profile;
  const facebookProfile = has('facebookProfile') ? cleanSocialProfile(body.facebookProfile) : customer.facebook_profile;
  if ((typeof body?.instagramProfile === 'string' && body.instagramProfile.trim() && !instagramProfile)
    || (typeof body?.facebookProfile === 'string' && body.facebookProfile.trim() && !facebookProfile)) {
    return NextResponse.json({ error: 'Please enter a shorter social profile name.' }, { status: 400 });
  }

  const updated = await updateCustomerProfile(customer.id, {
    phone,
    marketingConsent,
    instagramProfile,
    facebookProfile,
    instagramMarketingConsent: has('instagramMarketingConsent') ? body.instagramMarketingConsent === true : customer.instagram_marketing_consent,
    facebookMarketingConsent: has('facebookMarketingConsent') ? body.facebookMarketingConsent === true : customer.facebook_marketing_consent,
    phoneMarketingConsent: has('phoneMarketingConsent') ? body.phoneMarketingConsent === true : customer.phone_marketing_consent,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Could not update your details. Please try again.' }, { status: 500 });
  }

  if (marketingConsent) {
    await upsertMarketingContact({
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      customerId: updated.id,
      source: 'account',
    }).catch(() => {});
  } else {
    await setMarketingConsentByEmail(updated.email, false).catch(() => {});
  }

  // A changed phone can create new identity evidence. Review it after saving and
  // never make the profile update depend on the review service.
  after(() => createSecurityReviewCase({ customerId: updated.id, sourceEvent: 'profile_update' }));

  return NextResponse.json({
    success: true,
    customer: {
      id: updated.id,
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      marketingConsent: updated.marketing_consent,
      instagramProfile: updated.instagram_profile,
      facebookProfile: updated.facebook_profile,
      instagramMarketingConsent: updated.instagram_marketing_consent,
      facebookMarketingConsent: updated.facebook_marketing_consent,
      phoneMarketingConsent: updated.phone_marketing_consent,
      createdAt: updated.created_at,
    },
  });
}
