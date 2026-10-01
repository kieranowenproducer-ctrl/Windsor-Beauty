import { NextResponse } from 'next/server';
import { findDiscountSignupByEmail, listOrdersByCustomerId } from '@/lib/db';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { glowCardDemoDesign } from '@/lib/glowCardDemo';
import { affiliatesEnabled, getAffiliateCustomerCode, isAffiliateCustomer } from '@/lib/affiliates';

export async function GET(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  if (!customer) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const orders = await listOrdersByCustomerId(customer.id);
  const paidOrders = orders.filter(o => o.payment_confirmed_at !== null);
  const totalSpent = paidOrders
    .filter(o => !['cancelled', 'refunded'].includes(o.status))
    .reduce((sum, o) => sum + Number(o.total), 0);
  const demoDesign = glowCardDemoDesign(customer.email);
  const affiliateAvailable = affiliatesEnabled() && await isAffiliateCustomer(customer.id).catch(() => false);
  const rafDiscount = affiliatesEnabled() && customer.email_verified
    ? await getAffiliateCustomerCode(customer.id).catch(() => null)
    : null;
  // Raf's customers see their 10% first-order code beside their Raf code until it has been used,
  // so both live in one place in their account and not only in an email.
  const welcomeSignup = rafDiscount ? await findDiscountSignupByEmail(customer.email).catch(() => null) : null;
  const welcomeCode = welcomeSignup?.status === 'active' ? String(welcomeSignup.code) : null;
  const exampleOrders = demoDesign && orders.length === 0 ? [{
    orderNumber: 'DEMO-ORDER', items: [{ name: 'Example item', variant: 'Example', price: 65, quantity: 1 }],
    subtotal: 65, discountCode: null, discountAmount: 0, ruleDiscountAmount: 0,
    shippingLabel: 'Example delivery', shippingCost: 0, total: 65,
    status: 'delivered', shippingAddress: 'Example delivery address', trackingNumber: null,
    createdAt: new Date().toISOString(), paymentConfirmedAt: new Date().toISOString(),
  }] : null;

  return NextResponse.json({
    glowCardDemoDesign: demoDesign,
    exampleOrderHistory: Boolean(exampleOrders),
    affiliateAvailable,
    rafDiscount: rafDiscount ? { code: String(rafDiscount.code), expiresAt: new Date(String(rafDiscount.expires_at)).toISOString(), welcomeCode } : null,
    customer: {
      id: customer.id,
      email: customer.email,
      firstName: customer.first_name,
      lastName: customer.last_name,
      phone: customer.phone,
      marketingConsent: customer.marketing_consent,
      addressLine1: customer.address_line1,
      addressLine2: customer.address_line2,
      addressCity: customer.address_city,
      addressPostcode: customer.address_postcode,
      addressCountry: customer.address_country,
      instagramProfile: customer.instagram_profile,
      facebookProfile: customer.facebook_profile,
      instagramMarketingConsent: customer.instagram_marketing_consent,
      facebookMarketingConsent: customer.facebook_marketing_consent,
      phoneMarketingConsent: customer.phone_marketing_consent,
      referredBy: customer.referred_by,
      createdAt: customer.created_at,
      emailVerified: customer.email_verified,
    },
    stats: {
      orderCount: paidOrders.length,
      totalSpent,
    },
    orders: exampleOrders ?? orders.map(o => ({
      orderNumber: o.order_number,
      items: o.items,
      subtotal: Number(o.subtotal),
      discountCode: o.discount_code,
      discountAmount: Number(o.discount_amount),
      ruleDiscountAmount: Number(o.rule_discount_amount),
      shippingLabel: o.shipping_label,
      shippingCost: Number(o.shipping_cost),
      total: Number(o.total),
      status: o.status,
      shippingAddress: o.shipping_address,
      trackingNumber: o.tracking_number,
      createdAt: o.created_at,
      paymentConfirmedAt: o.payment_confirmed_at,
    })),
  });
}
