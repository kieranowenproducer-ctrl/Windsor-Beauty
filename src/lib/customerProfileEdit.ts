import { normalisePhoneNumber, PHONE_ERROR } from './phoneNumber';
import { cleanSocialProfile } from './referralSources';

interface ExistingProfile {
  phone: string | null; address_country: string | null; marketing_consent: boolean;
  instagram_profile: string | null; facebook_profile: string | null;
  instagram_marketing_consent: boolean; facebook_marketing_consent: boolean; phone_marketing_consent: boolean;
}

/** A partial save cannot erase an omitted phone or change unrelated permissions. */
export function customerProfileEdit(body: Record<string, unknown>, current: ExistingProfile) {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
  if (has('phone') && typeof body.phone !== 'string') return { error: PHONE_ERROR } as const;
  const phone = has('phone') ? (String(body.phone).trim() ? normalisePhoneNumber(body.phone, current.address_country || 'GB') : null) : current.phone;
  if (has('phone') && String(body.phone).trim() && !phone) return { error: PHONE_ERROR } as const;
  const instagramProfile = has('instagramProfile') ? cleanSocialProfile(body.instagramProfile) : current.instagram_profile;
  const facebookProfile = has('facebookProfile') ? cleanSocialProfile(body.facebookProfile) : current.facebook_profile;
  if ((has('instagramProfile') && body.instagramProfile && !instagramProfile) || (has('facebookProfile') && body.facebookProfile && !facebookProfile)) return { error: 'Please enter a shorter social profile name.' } as const;
  return { params: {
    phone,
    marketingConsent: typeof body.marketingConsent === 'boolean' ? body.marketingConsent : current.marketing_consent,
    instagramProfile, facebookProfile,
    instagramMarketingConsent: current.instagram_marketing_consent,
    facebookMarketingConsent: current.facebook_marketing_consent,
    phoneMarketingConsent: typeof body.phoneMarketingConsent === 'boolean' ? body.phoneMarketingConsent : current.phone_marketing_consent,
  }} as const;
}
