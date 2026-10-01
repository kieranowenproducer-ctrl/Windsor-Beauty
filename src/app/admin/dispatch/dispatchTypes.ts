import { londonDateString } from '@/lib/date';

// Moved out of page.tsx unchanged: the dispatch types, the status tables, the
// date helpers and the tracking-file parsers. Only the word `export` was added.

export type DispatchOrderStatus = 'paid' | 'awaiting_dispatch' | 'processing' | 'exported' | 'dispatched' | 'delivered';
export type RoyalMailLabelStatus = 'none' | 'created' | 'pending_postage' | 'error';

export interface RMOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  status: DispatchOrderStatus;
  paymentMethod: string | null;
  total: number;
  shippingLabel: string;
  shippingCountry: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  royalMailOrderId: string | null;
  royalMailLabelStatus: RoyalMailLabelStatus | null;
  royalMailLabelError: string | null;
  parcelWeightGrams: number | null;
  parcelPackageFormat: string | null;
  shippingEmailSentAt: string | null;
  createdAt: string;
}

export interface RoyalMailStats {
  lastLabelCreatedAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  lastErrorOrderNumber: string | null;
}

export interface ShippingSettings {
  defaultItemWeightGrams: number;
  packagingWeightGrams: number;
  safetyMarginGrams: number;
  defaultPackageFormat: string;
  defaultService: string;
  internationalEnabled: boolean;
  defaultOriginCountry: string;
  ukStandardRate: number;
  internationalRate: number;
}

// Orders whose payment is confirmed but which haven't been dispatched yet —
// these are the ones that need a Royal Mail label and/or tracking email.
export const DISPATCH_READY_STATUSES: DispatchOrderStatus[] = ['paid', 'awaiting_dispatch', 'processing', 'exported'];

export const DISPATCH_STATUS_LABELS: Record<DispatchOrderStatus, string> = {
  paid: 'Paid',
  awaiting_dispatch: 'Awaiting Dispatch',
  processing: 'Processing',
  exported: 'Exported',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
};

export const DISPATCH_STATUS_STYLES: Record<DispatchOrderStatus, string> = {
  paid: 'bg-blue-50 text-blue-600',
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  processing: 'bg-purple-50 text-purple-600',
  exported: 'bg-indigo-50 text-indigo-600',
  dispatched: 'bg-gold-50 text-gold-700',
  delivered: 'bg-green-50 text-green-600',
};

export interface ExportOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  shippingLabel: string;
  total: number;
  createdAt: string;
}

export interface ExportGroup {
  date: string;
  orders: ExportOrder[];
}

export interface TrackOrder {
  orderNumber: string;
  customerName: string;
  email: string;
  shippingLabel: string;
  total: number;
  exportedAt: string | null;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function dateLabel(iso: string): string {
  const today = londonDateString(new Date());
  const yesterday = londonDateString(new Date(Date.now() - 864e5));
  if (iso === today) return 'Today';
  if (iso === yesterday) return 'Yesterday';
  return formatDate(iso + 'T00:00:00');
}

// ── Smart tracking parser ──────────────────────────────────────────────────────
// Accepts any text content (Click & Drop CSV export, or plain copied text).
// Returns a map of { WB-ORDERNUM → TRACKING_NUMBER }.
//
// Strategy 1 — header-based CSV: looks for a column matching "order ref / id"
//   and another matching "tracking / barcode", then pairs them row-by-row.
// Strategy 2 — pattern scan: regardless of format, finds any line that contains
//   both a WB-XXXXX pattern and a Royal Mail tracking pattern.

export const WB_PATTERN = /\b(WB-[A-Z0-9]{4,})\b/i;
// Royal Mail Tracked 24/48: e.g. TT123456789GB (2 letters + 8-9 digits + 2 letters)
// International: e.g. RD123456789GB
export const RM_TRACKING_PATTERN = /\b([A-Z]{2}\d{7,9}[A-Z]{2})\b/i;

export function parseCSVRow(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseTrackingContent(content: string): { matches: Record<string, string>; strategy: string } {
  const lines = content.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { matches: {}, strategy: 'none' };

  // Strategy 1: header-based CSV
  const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const orderCol = headers.findIndex(h =>
    /orderref|orderreference|orderid|ordernumber|reference|ref/.test(h)
  );
  const trackingCol = headers.findIndex(h =>
    /trackingnumber|tracking|barcode|trackingref/.test(h)
  );

  if (orderCol >= 0 && trackingCol >= 0) {
    const matches: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const cells = parseCSVRow(lines[i]);
      const orderNum = cells[orderCol]?.trim().toUpperCase();
      const tracking = cells[trackingCol]?.trim().toUpperCase();
      if (orderNum?.match(WB_PATTERN) && tracking?.match(RM_TRACKING_PATTERN)) {
        matches[orderNum] = tracking;
      }
    }
    if (Object.keys(matches).length > 0) {
      return { matches, strategy: 'Click & Drop CSV column match' };
    }
  }

  // Strategy 2: pattern scan — works on any format including plain copied text
  const matches: Record<string, string> = {};
  for (const line of lines) {
    const wgMatch = line.match(WB_PATTERN);
    const trackMatch = line.match(RM_TRACKING_PATTERN);
    if (wgMatch && trackMatch) {
      matches[wgMatch[1].toUpperCase()] = trackMatch[1].toUpperCase();
    }
  }
  if (Object.keys(matches).length > 0) {
    return { matches, strategy: 'pattern scan' };
  }

  return { matches: {}, strategy: 'none' };
}

