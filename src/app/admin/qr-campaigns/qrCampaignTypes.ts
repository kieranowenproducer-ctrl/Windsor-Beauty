// Moved out of page.tsx unchanged: the campaign types, the destination presets,
// the campaign-type list and the small URL/date helpers. Only `export` was added.

export type CampaignStatus = 'active' | 'paused' | 'archived';
export type Tab = 'overview' | 'campaigns';
export type DetailTab = 'overview' | 'people' | 'print';

export interface Campaign {
  id: number;
  name: string;
  slug: string;
  status: CampaignStatus;
  partner_name: string | null;
  campaign_type: string | null;
  destination_url: string;
  discount_code: string | null;
  notes: string | null;
  start_date: string | null;
  end_date: string | null;
  bespoke_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  campaign_id: number;
  /** People only. Link previews and robots are left out (task 522d09f1). */
  total_scans: number;
  /** How many were left out, so the figure above can be checked rather than trusted. */
  bot_scans?: number;
  unique_visitors: number;
  total_signups: number;
  total_orders: number;
  total_revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  revenue_per_scan: number;
  revenue_per_signup: number;
  avg_customer_ltv: number;
  repeat_purchase_rate: number;
}

export interface TimePoint {
  date: string;
  count?: number;
  orders?: number;
  revenue?: number;
}

export interface CampaignMember {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  created_at: string;
  order_count: number;
  lifetime_spend: number;
  last_order_at: string | null;
}

export interface CampaignGuest {
  email: string;
  customer_name: string;
  order_count: number;
  total_spend: number;
  first_order_at: string;
  last_order_at: string;
}

export const DESTINATION_PRESETS = [
  { label: 'Homepage', value: 'https://www.windsorbeauty.is/' },
  { label: 'Shop - All Products', value: 'https://www.windsorbeauty.is/shop' },
  { label: 'Special Offers', value: 'https://www.windsorbeauty.is/promotion' },
  { label: 'Customer Reviews', value: 'https://www.windsorbeauty.is/reviews' },
  { label: 'Contact', value: 'https://www.windsorbeauty.is/contact' },
  { label: 'Custom URL...', value: 'custom' },
];

export const DEFAULT_DESTINATION = 'https://www.windsorbeauty.is/';

export function detectPreset(url: string): string {
  const match = DESTINATION_PRESETS.find(p => p.value !== 'custom' && p.value === url);
  return match ? match.value : 'custom';
}

export const CAMPAIGN_TYPES = [
  { value: 'gym', label: 'Salon or Spa' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'leaflet', label: 'Leaflet' },
  { value: 'partner', label: 'Partner' },
  { value: 'social', label: 'Social Media' },
  { value: 'event', label: 'Event' },
  { value: 'other', label: 'Other' },
];

export const STATUS_STYLES: Record<CampaignStatus, string> = {
  active: 'bg-green-50 text-green-600',
  paused: 'bg-yellow-50 text-yellow-600',
  archived: 'bg-stone-50 text-stone-400',
};

export const EMPTY_FORM = {
  name: '',
  status: 'active' as CampaignStatus,
  partner_name: '',
  campaign_type: '',
  destination_url: DEFAULT_DESTINATION,
  discount_code: '',
  notes: '',
  start_date: '',
  end_date: '',
  bespoke_title: '',
};

export function getTrackingUrl(slug: string): string {
  if (typeof window === 'undefined') return `/r/${slug}`;
  return `${window.location.origin}/r/${slug}`;
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
