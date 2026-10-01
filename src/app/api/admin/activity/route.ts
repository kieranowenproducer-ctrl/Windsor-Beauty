import { NextResponse } from 'next/server';
import {
  CLEARABLE_ORDER_STATUSES,
  isDbConfigured,
  listCustomers,
  listOrdersForActivity,
  listOpenAutomationFailures,
} from '@/lib/db';
import { buildTrackingUrl } from '@/lib/royalMail';

export const dynamic = 'force-dynamic';

// GET /api/admin/activity
//
// One merged, time-sorted feed for the dashboard: orders as they come in
// (carrying their live payment status, since that IS the payment update),
// new customer registrations with their details, and anything that went
// wrong AND has not been dealt with yet. The dashboard shows these as one
// at-a-glance list with expandable rows, so the page that is already open is
// the page that says what happened.
//
// Problems that have been ticked off are deliberately absent: they are history,
// they are kept on System Health under "Already Dealt With", and leaving them
// here meant a fault fixed days ago still filled the first screen in red.
//
// A paid order is stamped with the real confirmation time. An unpaid row uses
// the attempt time and is described by the screen as a payment attempt, never
// as a completed order.

export type ActivityEvent =
  | {
      type: 'order';
      at: string;
      paymentConfirmedAt: string | null;
      orderNumber: string;
      customerName: string;
      email: string;
      total: string;
      status: string;
      /** True only for the finished red ones the dashboard may clear (task 535c24f9). */
      clearable: boolean;
      itemCount: number;
      /**
       * WHAT was bought, not just how many (task 1b153158).
       *
       * The order's items were already being read here to count them, and then thrown away, so
       * opening a row told you "1 item" and never which one. Kieran asked for the product. This
       * costs no extra query: it is the same rows, kept instead of discarded.
       *
       * Capped, because this feed carries twenty orders at once and one bulk order should not be
       * able to swell the response for all of them. `itemCount` above stays the true total, so
       * the screen can say how many were left off.
       */
      items: { name: string; variant: string | null; quantity: number; price: number }[];
      paymentMethod: string | null;
      // Royal Mail, carried on the event itself (task 02195f04). Reading a
      // tracking number used to mean four screens: the row, "Open order", the
      // orders list, the order, then a scroll. The number the parcel is under
      // is the single most-asked question about a recent order, so it travels
      // with the order the moment the feed loads.
      trackingNumber: string | null;
      trackingUrl: string | null;
      royalMailLabelStatus: string;
      fulfilmentType: string;
    }
  | {
      type: 'customer';
      at: string;
      customerId: number;
      name: string;
      email: string;
      phone: string | null;
      emailVerified: boolean;
      marketingConsent: boolean;
    }
  | {
      type: 'issue';
      at: string;
      /**
       * The database row behind this entry (task f95367d6).
       *
       * The feed used to describe a fault without saying which one it was, so
       * the dashboard could show a red row and still have no way to clear it.
       * Carrying the id is what lets the Delete button on that row remove
       * exactly the entry the operator is looking at.
       */
      id: number;
      category: string;
      message: string;
      orderNumber: string | null;
    };

function displayName(first: string | null, last: string | null, email: string): string {
  const name = `${first ?? ''} ${last ?? ''}`.trim();
  return name || email;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ events: [] });
  }

  try {
    const [orders, customers, failures] = await Promise.all([
      // Minus any finished order whose line has been cleared off this list
      // (task 535c24f9). The Orders screen still shows every one of them.
      listOrdersForActivity(20),
      listCustomers(20),
      // Only what still needs somebody. Anything ticked off as dealt with lives
      // on System Health under "Already Dealt With" (task f95367d6).
      listOpenAutomationFailures(15),
    ]);

    const events: ActivityEvent[] = [];

    for (const o of orders) {
      const orderItems = Array.isArray(o.items) ? o.items : [];
      const items = orderItems.length;
      const trackingNumber = o.tracking_number?.trim() || null;
      events.push({
        type: 'order',
        at: o.payment_confirmed_at ?? o.created_at,
        paymentConfirmedAt: o.payment_confirmed_at,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        email: o.email,
        total: String(o.total),
        status: o.status,
        // Decided here rather than in the browser, from the same list the SQL
        // enforces, so the button can never appear on a row the server refuses.
        clearable: CLEARABLE_ORDER_STATUSES.includes(o.status as (typeof CLEARABLE_ORDER_STATUSES)[number]),
        itemCount: items,
        // Six is plenty for a glance; the screen says "and N more" past that.
        items: orderItems.slice(0, 6).map((it) => ({
          name: String(it?.name ?? '').trim() || 'Unnamed item',
          // Real orders carry an empty variant ("Pens customised"), so keep the
          // difference between "no size recorded" and one we simply have not read.
          variant: String(it?.variant ?? '').trim() || null,
          quantity: Number(it?.quantity ?? 0),
          price: Number(it?.price ?? 0),
        })),
        paymentMethod: o.payment_method ?? null,
        trackingNumber,
        // Prefer the URL Click & Drop handed back; fall back to the public
        // tracking page built from the number, exactly as the order detail
        // screen does, so the two screens can never point at different places.
        trackingUrl: trackingNumber ? (o.tracking_url || buildTrackingUrl(trackingNumber)) : null,
        royalMailLabelStatus: o.royal_mail_label_status ?? 'none',
        fulfilmentType: o.fulfilment_type ?? 'royal_mail',
      });
    }

    for (const c of customers) {
      events.push({
        type: 'customer',
        at: c.created_at,
        customerId: c.id,
        name: displayName(c.first_name, c.last_name, c.email),
        email: c.email,
        phone: c.phone,
        emailVerified: c.email_verified,
        marketingConsent: c.marketing_consent,
      });
    }

    for (const f of failures) {
      events.push({
        type: 'issue',
        at: f.created_at,
        id: f.id,
        category: f.category,
        message: f.message,
        orderNumber: f.order_number,
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return NextResponse.json({ events: events.slice(0, 25) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load activity.' },
      { status: 500 }
    );
  }
}
