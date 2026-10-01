// Moved out of page.tsx unchanged: the customer types, the empty draft, the
// status chip tables and the small formatting helpers. Only `export` was added.

export interface Customer {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  marketingConsent: boolean;
  referredBy: string | null;
  socialProfile: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
  membershipStatus: string;
  accountStatus: string;
  // Shut out by an admin (task 9cd55f28). Not null means banned.
  bannedAt?: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  discountCode: string | null;
  discountCodeIssuedAt: string | null;
  discountCodeStatus: 'active' | 'used' | null;
  openingOfferReview: {
    customer_id: number;
    status: 'clear' | 'review' | 'approved';
    reasons: string[];
    matched_customer_ids: number[];
    checked_at: string;
    reviewed_at: string | null;
  } | null;
  qrCampaignId: number | null;
  qrCampaignSlug: string | null;
  qrCampaignName: string | null;
  qrCampaignType: string | null;
  qrPartnerName: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  createdAt: string;
}

// Every field on a customer record that a human can legitimately correct.
// Deliberately excluded: the discount code, the qr_campaign_* first-touch
// attribution (permanent by design), join date, account status and password.
export interface CustomerDraft {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  referredBy: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressPostcode: string;
  addressCountry: string;
  marketingConsent: boolean;
}

export const emptyDraft: CustomerDraft = {
  firstName: '', lastName: '', email: '', phone: '', referredBy: '',
  addressLine1: '', addressLine2: '', addressCity: '', addressPostcode: '',
  addressCountry: '', marketingConsent: false,
};

export const editInput =
  'border border-stone-200 focus:border-gold-400 outline-none px-2 py-1.5 text-xs text-stone-700 bg-white transition-colors disabled:opacity-50';

export function draftFromCustomer(c: Customer): CustomerDraft {
  return {
    firstName: c.firstName ?? '',
    lastName: c.lastName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    referredBy: c.referredBy ?? '',
    addressLine1: c.addressLine1 ?? '',
    addressLine2: c.addressLine2 ?? '',
    addressCity: c.addressCity ?? '',
    addressPostcode: c.addressPostcode ?? '',
    addressCountry: c.addressCountry ?? '',
    marketingConsent: c.marketingConsent,
  };
}

export function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

// A pending-password lead (lock-page signup) has no name yet — fall back to
// the email rather than ever rendering literal "null" in the admin UI.
export function customerDisplayName(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return name || c.email;
}

export type SortField = 'name' | 'totalSpent' | 'orderCount' | 'lastOrder' | 'joined';
export type SortDir = 'asc' | 'desc';

export interface CustomerOrder {
  order_number: string;
  total: string;
  status: string;
  created_at: string;
  payment_confirmed_at: string | null;
}

// A customer who has never clicked their verification link — served by
// /api/admin/customers/unverified for the resend box at the top of the page.
export interface UnverifiedCustomer {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  account_status: string;
  created_at: string;
  last_sent_at: string | null;
  times_sent: number;
  last_failure_at: string | null;
  last_failure_message: string | null;
  /**
   * Where they came from (task c61b59f4). Named as the database names them, because these rows
   * come straight off the query untouched, unlike `Customer` above which is mapped to camelCase
   * on the way through. Reading them in the card goes through `cameFrom`, the one shared rule.
   */
  referred_by: string | null;
  qr_campaign_name: string | null;
  qr_campaign_type: string | null;
}

export const STATUS_CHIP: Record<string, string> = {
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  exported:          'bg-sky-50 text-sky-600',
  dispatched:        'bg-gold-50 text-gold-700',
  delivered:         'bg-green-50 text-green-600',
  paid:              'bg-blue-50 text-blue-600',
  awaiting_payment:  'bg-orange-50 text-orange-600',
  payment_failed:    'bg-red-50 text-red-400',
  cancelled:         'bg-red-50 text-red-500',
};

export const STATUS_LABEL_MAP: Record<string, string> = {
  pending:           'Pending',
  awaiting_payment:  'Awaiting Payment',
  paid:              'Paid',
  awaiting_dispatch: 'Awaiting Dispatch',
  processing:        'Awaiting Dispatch',
  exported:          'Exported',
  dispatched:        'Dispatched',
  delivered:         'Delivered',
  payment_failed:    'Payment Failed',
  payment_cancelled: 'Payment Cancelled',
  cancelled:         'Cancelled',
};

