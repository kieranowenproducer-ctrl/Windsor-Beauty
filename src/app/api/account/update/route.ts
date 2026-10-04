import { customerProfileEdit } from '@/lib/customerProfileEdit';
import { after, NextResponse } from 'next/server';
import { setMarketingConsentByEmail, updateCustomerProfile, upsertMarketingContact } from '@/lib/db';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { createSecurityReviewCase } from '@/lib/db/securityReviews';

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const edit = customerProfileEdit(body && typeof body === 'object' ? body : {}, customer);
  if ('error' in edit) return NextResponse.json({ error: edit.error }, { status: 400 });
  const { marketingConsent } = edit.params;
  const updated = await updateCustomerProfile(customer.id, edit.params);
  if (!updated) {
    return NextResponse.json({ error: 'Could not update your details. Please try again.' }, { status: 500 });
  }

  if (marketingConsent !== customer.marketing_consent && marketingConsent) {
    await upsertMarketingContact({
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      customerId: updated.id,
      source: 'account',
    }).catch(() => {});
  } else if (marketingConsent !== customer.marketing_consent) {
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
