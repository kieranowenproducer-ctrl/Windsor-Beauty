import { NextResponse } from 'next/server';
import {
  isDbConfigured,
  listMarketingContactsForAdmin,
  syncMarketingContactsFromCustomers,
} from '@/lib/db';
import { MARKETING_SENDER_OPTIONS, DEFAULT_MARKETING_SENDER } from '@/lib/email/marketingSender';

export const dynamic = 'force-dynamic';

// senderOptions travels with the contacts payload so the composer can show the
// real From addresses (which may come from env) without the client bundle
// hardcoding them (task 286b1863).
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({
      contacts: [],
      dbConfigured: false,
      senderOptions: MARKETING_SENDER_OPTIONS,
      defaultSender: DEFAULT_MARKETING_SENDER,
    });
  }

  // Bring anyone the marketing list is missing across from the customer list
  // before reading it (task 99476dc9), so opening this page is what puts the
  // two back in step. Admin-only route, and idempotent, so running it on every
  // load costs nothing once there is nothing left to copy.
  // Reported rather than swallowed: if this ever stops working, customers go
  // back to being invisible here, which is the exact fault this fixed. The
  // page says so out loud instead of quietly showing a short list again.
  const syncFailed = await syncMarketingContactsFromCustomers().then(() => false, () => true);

  const contacts = await listMarketingContactsForAdmin();
  return NextResponse.json({
    dbConfigured: true,
    syncFailed,
    senderOptions: MARKETING_SENDER_OPTIONS,
    defaultSender: DEFAULT_MARKETING_SENDER,
    contacts: contacts.map(c => ({
      id: c.id,
      email: c.email,
      firstName: c.first_name,
      lastName: c.last_name,
      phone: c.phone,
      customerId: c.customer_id,
      source: c.source,
      consent: c.consent,
      optedInAt: c.opted_in_at,
      unsubscribedAt: c.unsubscribed_at,
      createdAt: c.created_at,
      // A person who is on the customer list but has no marketing record at
      // all. Shown so the two pages hold the same people, but never tickable:
      // there is no consent and no unsubscribe link, so nothing can go to them.
      customerOnly: c.customer_only,
      orderCount: c.order_count,
    })),
  });
}
