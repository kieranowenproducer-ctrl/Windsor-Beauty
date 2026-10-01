import { NextResponse } from 'next/server';
import { getRoyalMailDispatchStats, isDbConfigured, listAllOrders } from '@/lib/db';
import { isRoyalMailConfigured, isRoyalMailLiveMode } from '@/lib/royalMail';
import { SEARCH_ALIAS_GROUPS } from '@/lib/searchAliases';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ orders: [], dbConfigured: false, royalMailConfigured: isRoyalMailConfigured(), royalMailLiveMode: isRoyalMailLiveMode() });
  }

  const [orders, royalMailStats] = await Promise.all([
    listAllOrders(),
    getRoyalMailDispatchStats().catch(() => null),
  ]);
  return NextResponse.json({
    dbConfigured: true,
    royalMailConfigured: isRoyalMailConfigured(),
    royalMailLiveMode: isRoyalMailLiveMode(),
    royalMailStats,
    // The product short names, so typing "Reta" finds Retatrutide and the other way round. Sent
    // with the orders rather than built into the page: the list is PEARL's, and PEARL's terminology
    // file is 60KB of records and sources that has no business being downloaded by a browser.
    searchAliases: SEARCH_ALIAS_GROUPS,
    orders: orders.map(o => ({
      orderNumber: o.order_number,
      email: o.email,
      customerName: o.customer_name,
      items: o.items,
      subtotal: Number(o.subtotal),
      discountCode: o.discount_code,
      discountAmount: Number(o.discount_amount),
      ruleDiscountAmount: Number(o.rule_discount_amount),
      appliedRules: o.applied_rules ?? [],
      shippingLabel: o.shipping_label,
      shippingCost: Number(o.shipping_cost),
      paypalFee: Number(o.paypal_fee),
      total: Number(o.total),
      status: o.status,
      paymentMethod: o.payment_method,
      shippingAddress: o.shipping_address,
      shippingCountry: o.shipping_country,
      phone: o.phone,
      trackingNumber: o.tracking_number,
      trackingUrl: o.tracking_url,
      createdAt: o.created_at,
      paymentConfirmedAt: o.payment_confirmed_at,
      // What Royal Mail last told us (task d912f632). Never a delivery status: they do not give one.
      royalMailPrintedOn: o.royal_mail_printed_on ?? null,
      royalMailShippedOn: o.royal_mail_shipped_on ?? null,
      royalMailCheckedAt: o.royal_mail_checked_at ?? null,
      // For the Archived orders folder (task 831a4461). deliveredAt is null on every order
      // delivered before the shop started recording it, which is why the rule has fallbacks.
      deliveredAt: o.delivered_at ?? null,
      archivedAt: o.archived_at ?? null,
      dispatchedAt: o.dispatched_at ?? null,
      royalMailOrderId: o.royal_mail_order_id,
      royalMailLabelStatus: o.royal_mail_label_status,
      royalMailLabelError: o.royal_mail_label_error,
      parcelWeightGrams: o.parcel_weight_grams,
      parcelPackageFormat: o.parcel_package_format,
      packagingWeightGrams: o.packaging_weight_grams,
      shippingEmailSentAt: o.shipping_email_sent_at,
      adminNotes: o.admin_notes,
      qrCampaignSlug: o.qr_campaign_slug,
      qrCampaignName: o.qr_campaign_name,
      qrCampaignType: o.qr_campaign_type,
      qrPartnerName: o.qr_partner_name,
      invoiceId: o.invoice_id,
      fulfilmentType: o.fulfilment_type,
      // How the order reached the account it is attached to (task e0858a61). A customer_id on
      // its own never proved anybody was signed in, and that is what could not be answered
      // about order WG-63U39T.
      accountLink: o.account_link,
      checkoutConfirmations: o.checkout_confirmations ?? null,
      // Invoice notes carried through for admin transparency (task e6e75b32):
      // what was typed in the invoice's "Message to customer" (and both notes
      // boxes) is visible on the order itself. Admin-only; nothing customer-facing.
      invoiceSubject: o.invoice_subject,
      invoiceMessage: o.invoice_message,
      invoiceInternalNotes: o.invoice_internal_notes,
      invoiceCustomerNotes: o.invoice_customer_notes,
    })),
  });
}
