import { NextResponse } from 'next/server';
import { isDbConfigured, listCustomersWithStats } from '@/lib/db';
import { listOpeningOfferReviews } from '@/lib/db/openingOfferProtection';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ customers: [], dbConfigured: false });
  }

  const [customers, offerReviews] = await Promise.all([
    listCustomersWithStats(),
    listOpeningOfferReviews().catch(() => []),
  ]);
  const offerReviewByCustomer = new Map(offerReviews.map(row => [row.customer_id, row]));
  return NextResponse.json({
    dbConfigured: true,
    customers: customers.map(c => ({
      id: c.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      marketingConsent: c.marketing_consent,
      referredBy: c.referred_by,
      socialProfile: c.social_profile,
      addressLine1: c.address_line1,
      addressLine2: c.address_line2,
      addressCity: c.address_city,
      addressPostcode: c.address_postcode,
      addressCountry: c.address_country,
      membershipStatus: c.membership_status,
      accountStatus: c.account_status,
      // Shut out of the shop by an admin (task 9cd55f28). Carried into the list so a banned
      // account is obvious here, not only on its own page.
      bannedAt: c.banned_at ?? null,
      emailVerified: c.email_verified,
      emailVerifiedAt: c.email_verified_at,
      discountCode: c.discount_code,
      discountCodeIssuedAt: c.discount_code_issued_at,
      discountCodeStatus: c.discount_signup_status,
      openingOfferReview: offerReviewByCustomer.get(c.id) ?? null,
      qrCampaignId: c.qr_campaign_id,
      qrCampaignSlug: c.qr_campaign_slug,
      qrCampaignName: c.qr_campaign_name,
      qrCampaignType: c.qr_campaign_type,
      qrPartnerName: c.qr_partner_name,
      orderCount: c.order_count,
      totalSpent: Number(c.total_spent),
      lastOrderAt: c.last_order_at,
      createdAt: c.created_at,
    })),
  });
}
